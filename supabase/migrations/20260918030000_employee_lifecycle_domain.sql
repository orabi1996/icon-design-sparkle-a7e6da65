-- ============================================================================
-- Migration: 20260918030000_employee_lifecycle_domain.sql
-- Description: PROMPT 3 — Employee Master Domain, Lifecycle States,
-- Sensitive Data Protection, Zero Destructive Deletion, and Historical Ledger
-- ============================================================================

BEGIN;

-- 1. Extend Employees Table with Multi-Tenant & Lifecycle Tracking Fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'probation', 'suspended', 'terminated', 'resigned', 'on_leave')),
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS termination_reason text,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_start date,
  ADD COLUMN IF NOT EXISTS suspension_end date,
  ADD COLUMN IF NOT EXISTS probation_end date,
  ADD COLUMN IF NOT EXISTS is_sensitive_masked boolean NOT NULL DEFAULT true;

-- 2. Foreign Key from Employees to Company Profile with Tenant Scoping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_company_tenant_fk'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_company_tenant_fk
      FOREIGN KEY (company_id, tenant_id)
      REFERENCES public.hr_company_profiles(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Composite Indexes and Unique Constraints
CREATE INDEX IF NOT EXISTS employees_tenant_company_idx
  ON public.employees (tenant_id, company_id);

CREATE INDEX IF NOT EXISTS employees_lifecycle_status_idx
  ON public.employees (company_id, employment_status);

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_emp_no_idx
  ON public.employees (company_id, emp_no)
  WHERE company_id IS NOT NULL;

-- 4. Backfill Existing Employees with Default Workspace (if applicable)
DO $$
DECLARE
  v_default_tenant_id uuid;
  v_default_company_id uuid;
BEGIN
  SELECT id INTO v_default_tenant_id FROM public.hr_tenants ORDER BY created_at ASC LIMIT 1;
  IF v_default_tenant_id IS NOT NULL THEN
    SELECT id INTO v_default_company_id
    FROM public.hr_company_profiles
    WHERE tenant_id = v_default_tenant_id
    ORDER BY created_at ASC LIMIT 1;

    IF v_default_company_id IS NOT NULL THEN
      UPDATE public.employees
      SET tenant_id = v_default_tenant_id,
          company_id = v_default_company_id
      WHERE tenant_id IS NULL OR company_id IS NULL;
    END IF;
  END IF;
END $$;

-- 5. Immutable Employee Lifecycle Transitions Table
CREATE TABLE IF NOT EXISTS public.employee_lifecycle_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  from_status text NOT NULL,
  to_status text NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS employee_transitions_emp_idx
  ON public.employee_lifecycle_transitions (employee_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS employee_transitions_tenant_idx
  ON public.employee_lifecycle_transitions (tenant_id, company_id);

-- 6. Trigger: Strict Zero Hard Deletion of Employees
CREATE OR REPLACE FUNCTION public.prevent_employee_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'يحظر النظام المؤسسي الحذف النهائي لسجلات الموظفين للحفاظ على سلامة التاريخ الوظيفي ومسيرات الرواتب. يرجى إنهاء الخدمة أو التعطيل بدلاً من الحذف.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_employee_hard_delete ON public.employees;
CREATE TRIGGER trg_prevent_employee_hard_delete
  BEFORE DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_hard_delete();

-- 7. Trigger: Auto-record Job, Position, Department, Branch and Salary Changes in Historical Ledger
CREATE OR REPLACE FUNCTION public.track_employee_historical_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment_type text := 'salary_adjustment';
  v_changed boolean := false;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF (OLD.branch_id IS DISTINCT FROM NEW.branch_id) THEN
    v_assignment_type := 'transfer';
    v_changed := true;
  ELSIF (OLD.department_id IS DISTINCT FROM NEW.department_id) THEN
    v_assignment_type := 'transfer';
    v_changed := true;
  ELSIF (OLD.job_id IS DISTINCT FROM NEW.job_id OR OLD.position_id IS DISTINCT FROM NEW.position_id) THEN
    v_assignment_type := 'promotion';
    v_changed := true;
  ELSIF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary OR OLD.allowances IS DISTINCT FROM NEW.allowances) THEN
    v_assignment_type := 'salary_adjustment';
    v_changed := true;
  ELSIF (OLD.employment_status IS DISTINCT FROM NEW.employment_status) THEN
    v_assignment_type := CASE
      WHEN NEW.employment_status = 'terminated' THEN 'termination'
      WHEN NEW.employment_status = 'resigned' THEN 'resignation'
      ELSE 'status_change'
    END;
    v_changed := true;
  END IF;

  IF v_changed THEN
    INSERT INTO public.org_historical_assignments (
      tenant_id,
      company_id,
      employee_id,
      assignment_type,
      branch_id,
      department_id,
      job_id,
      position_id,
      basic_salary,
      allowances,
      effective_date,
      reason,
      metadata,
      created_by
    ) VALUES (
      NEW.tenant_id,
      NEW.company_id,
      NEW.id,
      v_assignment_type,
      NEW.branch_id,
      NEW.department_id,
      NEW.job_id,
      NEW.position_id,
      NEW.basic_salary,
      NEW.allowances,
      CURRENT_DATE,
      COALESCE(NEW.termination_reason, NEW.suspension_reason, 'تحديث البيانات الوظيفية والمالية للموظف'),
      jsonb_build_object(
        'prev_status', OLD.employment_status,
        'new_status', NEW.employment_status,
        'prev_basic_salary', OLD.basic_salary,
        'new_basic_salary', NEW.basic_salary,
        'prev_branch_id', OLD.branch_id,
        'new_branch_id', NEW.branch_id,
        'prev_department_id', OLD.department_id,
        'new_department_id', NEW.department_id
      ),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_employee_historical_assignment ON public.employees;
CREATE TRIGGER trg_track_employee_historical_assignment
  AFTER UPDATE OF branch_id, department_id, job_id, position_id, basic_salary, allowances, employment_status ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.track_employee_historical_assignment();

-- 8. RPC: Transition Employee Lifecycle Status
CREATE OR REPLACE FUNCTION public.transition_employee_lifecycle_status(
  p_tenant_id uuid,
  p_company_id uuid,
  p_employee_id uuid,
  p_target_status text,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_effective_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_emp RECORD;
  v_from_status text;
BEGIN
  IF NOT (public.is_permissions_admin() OR public.hr_can_manage_tenant(p_tenant_id)) THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل الحالة التشغيلية للموظف';
  END IF;

  SELECT * INTO v_emp
  FROM public.employees
  WHERE id = p_employee_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الموظف غير موجود ضمن المنشأة المحددة';
  END IF;

  v_from_status := COALESCE(v_emp.employment_status, 'active');

  UPDATE public.employees
  SET employment_status = p_target_status,
      status = CASE
        WHEN p_target_status = 'active' THEN 'نشط'
        WHEN p_target_status = 'probation' THEN 'تحت التجربة'
        WHEN p_target_status = 'suspended' THEN 'موقوف'
        WHEN p_target_status = 'on_leave' THEN 'في إجازة'
        WHEN p_target_status = 'terminated' THEN 'منتهي الخدمة'
        WHEN p_target_status = 'resigned' THEN 'مستقيل'
        ELSE p_target_status
      END,
      termination_date = CASE WHEN p_target_status IN ('terminated', 'resigned') THEN p_effective_date ELSE termination_date END,
      termination_reason = CASE WHEN p_target_status IN ('terminated', 'resigned') THEN p_reason ELSE termination_reason END,
      suspension_start = CASE WHEN p_target_status = 'suspended' THEN p_effective_date ELSE suspension_start END,
      suspension_reason = CASE WHEN p_target_status = 'suspended' THEN p_reason ELSE suspension_reason END,
      updated_at = now()
  WHERE id = p_employee_id;

  INSERT INTO public.employee_lifecycle_transitions (
    tenant_id,
    company_id,
    employee_id,
    from_status,
    to_status,
    effective_date,
    reason,
    notes,
    actor_id
  ) VALUES (
    p_tenant_id,
    p_company_id,
    p_employee_id,
    v_from_status,
    p_target_status,
    p_effective_date,
    p_reason,
    p_notes,
    v_actor
  );

  RETURN jsonb_build_object(
    'success', true,
    'employeeId', p_employee_id,
    'fromStatus', v_from_status,
    'toStatus', p_target_status,
    'effectiveDate', p_effective_date
  );
END;
$$;

-- 9. RLS on employee_lifecycle_transitions and hardening of employees
REVOKE ALL ON TABLE public.employee_lifecycle_transitions FROM anon, PUBLIC;
ALTER TABLE public.employee_lifecycle_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_lifecycle_transitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_transitions_read ON public.employee_lifecycle_transitions;
CREATE POLICY employee_transitions_read ON public.employee_lifecycle_transitions
FOR SELECT TO authenticated
USING (public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS employee_transitions_write ON public.employee_lifecycle_transitions;
CREATE POLICY employee_transitions_write ON public.employee_lifecycle_transitions
FOR ALL TO authenticated
USING (public.hr_can_manage_tenant(tenant_id))
WITH CHECK (public.hr_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE ON public.employee_lifecycle_transitions TO authenticated;
GRANT ALL ON public.employee_lifecycle_transitions TO service_role;

REVOKE ALL ON FUNCTION public.transition_employee_lifecycle_status(uuid, uuid, uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_employee_lifecycle_status(uuid, uuid, uuid, text, text, text, date) TO authenticated, service_role;

COMMIT;
