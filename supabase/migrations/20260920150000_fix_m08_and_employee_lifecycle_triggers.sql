-- Migration: 20260920150000_fix_m08_and_employee_lifecycle_triggers.sql
-- Description: Corrects M08 biometric device ingestion unassigned record bug,
--              aligns employee lifecycle historical assignment trigger to actual org_historical_assignments schema,
--              and configures RLS policies for M08 attendance and device tables.

BEGIN;

-- 1. Fix track_employee_historical_assignment trigger function
-- Aligns inserted columns with public.org_historical_assignments:
-- (tenant_id, company_id, employee_id, branch_id, department_id, job_id, position_id, effective_from, assignment_reason, is_current, created_by)
CREATE OR REPLACE FUNCTION public.track_employee_historical_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment_type text := 'salary_adjustment';
  v_changed boolean := false;
  v_job_id uuid;
  v_branch_id uuid;
  v_department_id uuid;
  v_actor uuid := auth.uid();
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
    v_job_id := COALESCE(NEW.job_id, OLD.job_id);
    v_branch_id := COALESCE(NEW.branch_id, OLD.branch_id);
    v_department_id := COALESCE(NEW.department_id, OLD.department_id);

    -- If mandatory foreign keys are present, record historical assignment
    IF v_job_id IS NOT NULL AND v_branch_id IS NOT NULL AND v_department_id IS NOT NULL THEN
      -- Mark existing current assignments as historical
      UPDATE public.org_historical_assignments
      SET is_current = false, effective_to = CURRENT_DATE
      WHERE employee_id = NEW.id AND is_current = true;

      INSERT INTO public.org_historical_assignments (
        tenant_id,
        company_id,
        employee_id,
        branch_id,
        department_id,
        job_id,
        position_id,
        effective_from,
        assignment_reason,
        is_current,
        created_by
      ) VALUES (
        NEW.tenant_id,
        NEW.company_id,
        NEW.id,
        v_branch_id,
        v_department_id,
        v_job_id,
        NEW.position_id,
        CURRENT_DATE,
        COALESCE(NEW.termination_reason, NEW.suspension_reason, 'تحديث البيانات الوظيفية للموظف (' || v_assignment_type || ')'),
        true,
        COALESCE(v_actor, 'a1111111-1111-1111-1111-111111111111'::uuid)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Fix m08_ingest_device_event function
-- Ensures unassigned record exceptions do not occur when device is unknown or unmapped
CREATE OR REPLACE FUNCTION public.m08_ingest_device_event(
  p_company_id uuid,
  p_device_serial text,
  p_external_event_id text,
  p_employee_raw_id text,
  p_event_at timestamptz,
  p_punch_kind text DEFAULT 'unknown',
  p_site_code text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device record;
  v_employee_id uuid := NULL;
  v_mapping_status text := 'mapped';
  v_quarantine_reason text := NULL;
  v_event_id uuid;
  v_device_id uuid := NULL;
  v_device_site_code text := NULL;
BEGIN
  -- 1. Check if device exists and is active
  SELECT id, site_code, status INTO v_device FROM public.m08_devices
  WHERE company_id = p_company_id AND serial_number = p_device_serial;

  IF NOT FOUND THEN
    v_mapping_status := 'unknown_device';
    v_quarantine_reason := 'جهاز البصمة غير مسجل في النظام';
  ELSIF v_device.status <> 'active' THEN
    v_mapping_status := 'quarantined';
    v_quarantine_reason := 'حالة الجهاز غير نشطة (' || v_device.status || ')';
  ELSE
    v_device_id := v_device.id;
    v_device_site_code := v_device.site_code;
  END IF;

  -- 2. Resolve employee mapping by emp_no or raw id
  IF v_mapping_status = 'mapped' THEN
    SELECT id INTO v_employee_id FROM public.employees
    WHERE emp_no = p_employee_raw_id;

    IF NOT FOUND THEN
      v_mapping_status := 'unknown_employee';
      v_quarantine_reason := 'رقم الموظف غير مطابق لأي موظف نشط في النظام (' || p_employee_raw_id || ')';
    END IF;
  END IF;

  -- 3. Check site code validity if provided
  IF v_mapping_status = 'mapped' AND p_site_code IS NOT NULL AND v_device_site_code IS NOT NULL THEN
    IF p_site_code <> v_device_site_code THEN
      v_mapping_status := 'unknown_site';
      v_quarantine_reason := 'موقع البصمة غير مطابق لموقع الجهاز المسجل';
    END IF;
  END IF;

  -- 4. Insert into device events (idempotent ON CONFLICT DO NOTHING)
  INSERT INTO public.m08_device_events (
    company_id,
    device_id,
    device_serial,
    site_code,
    external_event_id,
    employee_raw_id,
    employee_id,
    event_at,
    punch_kind,
    mapping_status,
    quarantine_reason,
    payload
  ) VALUES (
    p_company_id,
    v_device_id,
    p_device_serial,
    COALESCE(p_site_code, v_device_site_code),
    p_external_event_id,
    p_employee_raw_id,
    v_employee_id,
    p_event_at,
    p_punch_kind,
    v_mapping_status,
    v_quarantine_reason,
    p_payload
  )
  ON CONFLICT (company_id, device_serial, external_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  -- Update device last_sync_at
  IF v_device_id IS NOT NULL THEN
    UPDATE public.m08_devices SET last_sync_at = now(), updated_at = now() WHERE id = v_device_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'mapping_status', v_mapping_status,
    'quarantine_reason', v_quarantine_reason
  );
END;
$$;

-- 3. RLS Policies for m08 tables
DROP POLICY IF EXISTS m08_devices_policy ON public.m08_devices;
CREATE POLICY m08_devices_policy ON public.m08_devices
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'read')
  OR public.can_access_resource('/biometrics', 'read')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'create')
  OR public.can_access_resource('/biometrics', 'create')
);

DROP POLICY IF EXISTS m08_device_events_select_policy ON public.m08_device_events;
CREATE POLICY m08_device_events_select_policy ON public.m08_device_events
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'read')
  OR public.can_access_resource('/biometrics', 'read')
  OR (employee_id IS NOT NULL AND employee_id = (SELECT e.id FROM public.employees e WHERE e.emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid())))
);

DROP POLICY IF EXISTS m08_device_events_insert_policy ON public.m08_device_events;
CREATE POLICY m08_device_events_insert_policy ON public.m08_device_events
FOR INSERT TO authenticated
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'create')
  OR public.can_access_resource('/biometrics', 'create')
);

DROP POLICY IF EXISTS m08_device_events_update_policy ON public.m08_device_events;
CREATE POLICY m08_device_events_update_policy ON public.m08_device_events
FOR UPDATE TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'update')
);

DROP POLICY IF EXISTS m08_attendance_results_policy ON public.m08_attendance_results;
CREATE POLICY m08_attendance_results_policy ON public.m08_attendance_results
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'read')
  OR (employee_id = (SELECT e.id FROM public.employees e WHERE e.emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid())))
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'update')
  OR public.can_access_resource('/attendance', 'create')
);

DROP POLICY IF EXISTS m08_attendance_exceptions_policy ON public.m08_attendance_exceptions;
CREATE POLICY m08_attendance_exceptions_policy ON public.m08_attendance_exceptions
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'read')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'update')
);

-- 4. Record migration in supabase_migrations
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260920150000')
ON CONFLICT (version) DO NOTHING;

COMMIT;
