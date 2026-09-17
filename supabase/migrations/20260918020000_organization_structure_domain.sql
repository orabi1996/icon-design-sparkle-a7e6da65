-- ============================================================================
-- Migration: 20260918020000_organization_structure_domain.sql
-- Description: PROMPT 2 — True Organization Domain & Tenant-Isolated Hierarchy
-- Creates branches, sectors, departments, cost centers, locations, jobs, positions,
-- cycle-prevention triggers, historical assignments, and legacy reconciliation RPC.
-- ============================================================================

BEGIN;

-- 1. Branches (الفروع)
CREATE TABLE IF NOT EXISTS public.org_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  city text,
  district text,
  phone text,
  email text,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_branches_tenant_idx ON public.org_branches(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS org_branches_active_idx ON public.org_branches(company_id, active);

-- 2. Sectors (القطاعات)
CREATE TABLE IF NOT EXISTS public.org_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  head_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_sectors_tenant_idx ON public.org_sectors(tenant_id, company_id);

-- 3. Cost Centers (مراكز التكلفة)
CREATE TABLE IF NOT EXISTS public.org_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  parent_id uuid REFERENCES public.org_cost_centers(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_cost_centers_tenant_idx ON public.org_cost_centers(tenant_id, company_id);

-- 4. Departments (الأقسام الرئيسية والفرعية وفرق العمل)
CREATE TABLE IF NOT EXISTS public.org_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  branch_id uuid REFERENCES public.org_branches(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.org_sectors(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES public.org_departments(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.org_cost_centers(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'department' CHECK (level IN ('main_department', 'department', 'section', 'team')),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_departments_tenant_idx ON public.org_departments(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS org_departments_parent_idx ON public.org_departments(parent_id);
CREATE INDEX IF NOT EXISTS org_departments_branch_idx ON public.org_departments(branch_id);

-- 5. Work Locations (مواقع العمل الجغرافية)
CREATE TABLE IF NOT EXISTS public.org_work_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  branch_id uuid REFERENCES public.org_branches(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  radius_meters integer NOT NULL DEFAULT 100 CHECK (radius_meters > 0),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_work_locations_tenant_idx ON public.org_work_locations(tenant_id, company_id);

-- 6. Job Levels (المستويات والسلالم الوظيفية)
CREATE TABLE IF NOT EXISTS public.org_job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  level_number integer NOT NULL CHECK (level_number > 0),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name_ar text NOT NULL CHECK (length(btrim(name_ar)) BETWEEN 1 AND 200),
  name_en text,
  min_salary numeric(12, 2) NOT NULL DEFAULT 0 CHECK (min_salary >= 0),
  max_salary numeric(12, 2) NOT NULL DEFAULT 0 CHECK (max_salary >= min_salary),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

-- 7. Jobs (المسميات والتوصيفات الوظيفية)
CREATE TABLE IF NOT EXISTS public.org_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  level_id uuid REFERENCES public.org_job_levels(id) ON DELETE SET NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  title_ar text NOT NULL CHECK (length(btrim(title_ar)) BETWEEN 1 AND 200),
  title_en text,
  description text,
  requirements text,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_jobs_tenant_idx ON public.org_jobs(tenant_id, company_id);

-- 8. Positions (المناصب وشواغر الهيكل)
CREATE TABLE IF NOT EXISTS public.org_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.org_jobs(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.org_departments(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.org_branches(id) ON DELETE RESTRICT,
  reports_to_position_id uuid REFERENCES public.org_positions(id) ON DELETE RESTRICT,
  position_code text NOT NULL CHECK (length(btrim(position_code)) BETWEEN 1 AND 50),
  title_ar text NOT NULL CHECK (length(btrim(title_ar)) BETWEEN 1 AND 200),
  title_en text,
  is_vacant boolean NOT NULL DEFAULT true,
  max_headcount integer NOT NULL DEFAULT 1 CHECK (max_headcount > 0),
  current_headcount integer NOT NULL DEFAULT 0 CHECK (current_headcount >= 0),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (company_id, position_code),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_positions_tenant_idx ON public.org_positions(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS org_positions_dept_idx ON public.org_positions(department_id);

-- 9. Historical Employee Assignments (تاريخ التعيينات والتنقلات التنظيمية)
CREATE TABLE IF NOT EXISTS public.org_historical_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.org_branches(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.org_departments(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.org_jobs(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES public.org_positions(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES public.org_cost_centers(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  is_current boolean NOT NULL DEFAULT true,
  assignment_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS org_hist_emp_idx ON public.org_historical_assignments(employee_id, is_current);

-- 10. Circular Hierarchy Prevention Trigger for Departments
CREATE OR REPLACE FUNCTION public.check_org_department_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cur uuid;
  v_visited uuid[] := ARRAY[NEW.id];
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'لا يمكن للقسم أن يكون تابعاً لنفسه مباشرة';
  END IF;

  v_cur := NEW.parent_id;
  WHILE v_cur IS NOT NULL LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '22000',
        MESSAGE = 'تم اكتشاف تبعية دائرية غير صالحة في الهيكل التنظيمي للأقسام';
    END IF;

    IF v_cur = ANY(v_visited) THEN
      RAISE EXCEPTION USING ERRCODE = '22000',
        MESSAGE = 'تم اكتشاف حلقة مغلقة في تتابع الأقسام';
    END IF;

    v_visited := array_append(v_visited, v_cur);
    SELECT parent_id INTO v_cur FROM public.org_departments WHERE id = v_cur;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_department_cycle ON public.org_departments;
CREATE TRIGGER trg_org_department_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.org_departments
  FOR EACH ROW EXECUTE FUNCTION public.check_org_department_cycle();

-- Circular Hierarchy Prevention Trigger for Cost Centers
CREATE OR REPLACE FUNCTION public.check_org_cost_center_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cur uuid;
  v_visited uuid[] := ARRAY[NEW.id];
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION USING ERRCODE = '22000',
      MESSAGE = 'لا يمكن لمركز التكلفة أن يكون تابعاً لنفسه مباشرة';
  END IF;

  v_cur := NEW.parent_id;
  WHILE v_cur IS NOT NULL LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '22000',
        MESSAGE = 'تم اكتشاف تبعية دائرية غير صالحة في مراكز التكلفة';
    END IF;

    IF v_cur = ANY(v_visited) THEN
      RAISE EXCEPTION USING ERRCODE = '22000',
        MESSAGE = 'تم اكتشاف حلقة مغلقة في تتابع مراكز التكلفة';
    END IF;

    v_visited := array_append(v_visited, v_cur);
    SELECT parent_id INTO v_cur FROM public.org_cost_centers WHERE id = v_cur;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_cost_center_cycle ON public.org_cost_centers;
CREATE TRIGGER trg_org_cost_center_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.org_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.check_org_cost_center_cycle();

-- 11. Add Authoritative Foreign Keys to Employees (Additive, Non-destructive)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.org_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.org_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.org_positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_branch_id_idx ON public.employees(branch_id);
CREATE INDEX IF NOT EXISTS employees_department_id_idx ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS employees_job_id_idx ON public.employees(job_id);
CREATE INDEX IF NOT EXISTS employees_position_id_idx ON public.employees(position_id);

-- 12. Enable and Force RLS with Tenant Isolation on all Org Tables
DO $$
DECLARE
  t text;
  org_tables text[] := ARRAY[
    'org_branches', 'org_sectors', 'org_cost_centers', 'org_departments',
    'org_work_locations', 'org_job_levels', 'org_jobs', 'org_positions',
    'org_historical_assignments'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);

    -- Tenant-scoped read
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_read ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_tenant_read ON public.%I FOR SELECT TO authenticated USING (
      public.hr_is_tenant_member(tenant_id)
    );', t, t);

    -- Tenant-manager scoped write
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_tenant_write ON public.%I FOR ALL TO authenticated USING (
      public.hr_can_manage_tenant(tenant_id)
    ) WITH CHECK (
      public.hr_can_manage_tenant(tenant_id)
    );', t, t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END $$;

-- 13. Legacy Reconciliation RPC
CREATE OR REPLACE FUNCTION public.reconcile_legacy_org_entities(
  p_tenant_id uuid,
  p_company_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_matched_branches integer := 0;
  v_ambiguous_branches integer := 0;
  v_unmatched_branches integer := 0;
  v_matched_depts integer := 0;
  v_ambiguous_depts integer := 0;
  v_unmatched_depts integer := 0;
  r RECORD;
  v_cand_id uuid;
  v_cand_count integer;
BEGIN
  -- Verify permission
  IF NOT public.hr_can_manage_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'غير مصرح لك بإجراء مطابقة الهيكل التنظيمي للشركة';
  END IF;

  -- Reconcile Branches
  FOR r IN (
    SELECT DISTINCT btrim(branch) AS branch_text
    FROM public.employees
    WHERE branch IS NOT NULL AND btrim(branch) <> ''
  ) LOOP
    SELECT count(*), min(id) INTO v_cand_count, v_cand_id
    FROM public.org_branches
    WHERE company_id = p_company_id
      AND (btrim(name_ar) = r.branch_text OR btrim(name_en) ILIKE r.branch_text);

    IF v_cand_count = 1 THEN
      v_matched_branches := v_matched_branches + 1;
      IF NOT p_dry_run THEN
        UPDATE public.employees
        SET branch_id = v_cand_id
        WHERE branch_id IS NULL AND btrim(branch) = r.branch_text;
      END IF;
    ELSIF v_cand_count > 1 THEN
      v_ambiguous_branches := v_ambiguous_branches + 1;
    ELSE
      v_unmatched_branches := v_unmatched_branches + 1;
    END IF;
  END LOOP;

  -- Reconcile Departments
  FOR r IN (
    SELECT DISTINCT btrim(department) AS dept_text
    FROM public.employees
    WHERE department IS NOT NULL AND btrim(department) <> ''
  ) LOOP
    SELECT count(*), min(id) INTO v_cand_count, v_cand_id
    FROM public.org_departments
    WHERE company_id = p_company_id
      AND (btrim(name_ar) = r.dept_text OR btrim(name_en) ILIKE r.dept_text);

    IF v_cand_count = 1 THEN
      v_matched_depts := v_matched_depts + 1;
      IF NOT p_dry_run THEN
        UPDATE public.employees
        SET department_id = v_cand_id
        WHERE department_id IS NULL AND btrim(department) = r.dept_text;
      END IF;
    ELSIF v_cand_count > 1 THEN
      v_ambiguous_depts := v_ambiguous_depts + 1;
    ELSE
      v_unmatched_depts := v_unmatched_depts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dryRun', p_dry_run,
    'branches', jsonb_build_object(
      'matched', v_matched_branches,
      'ambiguous', v_ambiguous_branches,
      'unmatched', v_unmatched_branches
    ),
    'departments', jsonb_build_object(
      'matched', v_matched_depts,
      'ambiguous', v_ambiguous_depts,
      'unmatched', v_unmatched_depts
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_legacy_org_entities(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_legacy_org_entities(uuid, uuid, boolean) TO authenticated, service_role;

COMMIT;
