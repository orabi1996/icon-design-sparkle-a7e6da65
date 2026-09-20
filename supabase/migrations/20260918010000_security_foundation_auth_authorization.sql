-- ============================================================================
-- Migration: 20260918010000_security_foundation_auth_authorization.sql
-- Description: PROMPT 1 — Security Foundation, Authentication & Centralized Authorization
-- Enforces zero anonymous access, purges permissive demo policies, enforces RLS,
-- creates immutable security audit log, and implements granular permission checks.
-- ============================================================================

BEGIN;

-- 1. Create security audit log table (سجل التدقيق الأمني غير القابل للتعديل)
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN (
      'login',
      'login_failed',
      'user_created',
      'role_changed',
      'permission_changed',
      'group_changed',
      'account_disabled',
      'sensitive_config_changed',
      'unauthorized_access'
    )
  ),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE SET NULL,
  resource text,
  action text,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'forbidden')),
  ip_address text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS security_audit_logs_created_at_idx ON public.security_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_logs_user_idx ON public.security_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS security_audit_logs_event_type_idx ON public.security_audit_logs (event_type);
CREATE INDEX IF NOT EXISTS security_audit_logs_status_idx ON public.security_audit_logs (status);

-- Immutable security audit log trigger (منع التعديل أو الحذف نهائياً)
CREATE OR REPLACE FUNCTION public.reject_security_audit_modification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = 'سجل التدقيق الأمني غير قابل للتعديل أو الحذف نهائيًا';
END;
$$;

DROP TRIGGER IF EXISTS security_audit_logs_immutable ON public.security_audit_logs;
CREATE TRIGGER security_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.reject_security_audit_modification();

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs FORCE ROW LEVEL SECURITY;

-- Only admins can read security audit logs.
DROP POLICY IF EXISTS security_audit_logs_admin_read ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_read
  ON public.security_audit_logs FOR SELECT TO authenticated
  USING (public.is_permissions_admin());

-- RPC to record security audit entries safely
CREATE OR REPLACE FUNCTION public.record_security_audit(
  p_event_type text,
  p_status text,
  p_resource text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_tenant_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid := COALESCE(p_user_id, auth.uid());
  v_email text := p_actor_email;
BEGIN
  IF v_email IS NULL AND v_user IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  END IF;

  INSERT INTO public.security_audit_logs (
    event_type,
    user_id,
    actor_email,
    tenant_id,
    resource,
    action,
    status,
    details
  ) VALUES (
    p_event_type,
    v_user,
    v_email,
    p_tenant_id,
    p_resource,
    p_action,
    p_status,
    p_details
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_audit(text, text, text, text, jsonb, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_security_audit(text, text, text, text, jsonb, uuid, text, uuid) TO authenticated, service_role;

-- 2. Revoke ALL permissions on all HRMS tables from anon and PUBLIC
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'account_links', 'announcements', 'app_settings', 'attendance_records',
    'basic_lookups', 'deductions', 'departments', 'employees',
    'employee_correspondence', 'employee_deductions', 'employee_documents',
    'employee_entitlements', 'employee_eos_provisions', 'employee_permits',
    'employee_relatives', 'end_of_service_requests', 'entitlements',
    'eos_provision_postings', 'fingerprint_records', 'inquiries',
    'leave_requests', 'loans', 'payroll_runs', 'permission_features',
    'permission_group_members', 'permission_groups', 'permission_rules',
    'permission_scopes', 'regulation_rules', 'requests',
    'task_categories', 'task_creator_permissions', 'task_priorities',
    'task_receiver_permissions', 'task_statuses', 'tasks', 'user_roles',
    'work_shift_groups', 'approval_requests', 'email_logs', 'email_templates',
    'security_audit_logs', 'profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC;', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;

-- 3. Drop all permissive demo_open_* and auth_only_* policies on sensitive tables
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'demo_open_%'
        OR policyname LIKE 'auth_only_%'
        OR policyname = 'email_logs_all'
        OR policyname = 'email_templates_all'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 4. Central Permission Checking Helper
CREATE OR REPLACE FUNCTION public.can_access_resource(
  p_resource_key text,
  p_action text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_has_rule boolean := false;
  v_has_feature boolean := false;
  v_keys text[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin has full unrestricted access
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN true;
  END IF;

  -- Build candidate resource keys with standard aliases
  v_keys := ARRAY[p_resource_key];
  CASE p_resource_key
    WHEN 'employees' THEN v_keys := v_keys || ARRAY['/staff', '/staff/index'];
    WHEN '/staff' THEN v_keys := v_keys || ARRAY['employees', '/staff/index'];
    WHEN 'leave_requests' THEN v_keys := v_keys || ARRAY['/leaves', 'leaves'];
    WHEN '/leaves' THEN v_keys := v_keys || ARRAY['leave_requests', 'leaves'];
    WHEN 'loans' THEN v_keys := v_keys || ARRAY['/loans'];
    WHEN '/loans' THEN v_keys := v_keys || ARRAY['loans'];
    WHEN 'attendance_records' THEN v_keys := v_keys || ARRAY['/attendance', 'attendance'];
    WHEN '/attendance' THEN v_keys := v_keys || ARRAY['attendance_records', 'attendance'];
    WHEN 'payroll_runs' THEN v_keys := v_keys || ARRAY['/payroll', 'payroll'];
    WHEN '/payroll' THEN v_keys := v_keys || ARRAY['payroll_runs', 'payroll'];
    WHEN 'employee_permits' THEN v_keys := v_keys || ARRAY['/permits', 'permits'];
    WHEN '/permits' THEN v_keys := v_keys || ARRAY['employee_permits', 'permits'];
    WHEN 'inquiries' THEN v_keys := v_keys || ARRAY['/inquiries'];
    WHEN '/inquiries' THEN v_keys := v_keys || ARRAY['inquiries'];
    WHEN 'app_settings' THEN v_keys := v_keys || ARRAY['/settings/general', 'settings'];
    WHEN '/settings/general' THEN v_keys := v_keys || ARRAY['app_settings', 'settings'];
    ELSE NULL;
  END CASE;

  -- Check rule-based permissions across active groups
  SELECT EXISTS (
    SELECT 1
    FROM public.permission_group_members m
    JOIN public.permission_groups g ON g.id = m.group_id AND g.is_active
    JOIN public.permission_rules r ON r.group_id = g.id AND r.is_enabled
    WHERE m.user_id = v_user_id
      AND r.resource_key = ANY(v_keys)
      AND CASE p_action
        WHEN 'create' THEN r.can_create
        WHEN 'update' THEN r.can_update
        WHEN 'delete' THEN r.can_delete
        ELSE r.can_read
      END
  ) INTO v_has_rule;

  IF v_has_rule THEN
    RETURN true;
  END IF;

  -- Check feature-based permissions (for granular actions like email.settings.read, etc.)
  SELECT EXISTS (
    SELECT 1
    FROM public.permission_group_members m
    JOIN public.permission_groups g ON g.id = m.group_id AND g.is_active
    JOIN public.permission_features f ON f.group_id = g.id AND f.is_allowed
    WHERE m.user_id = v_user_id
      AND f.feature_key = p_resource_key
  ) INTO v_has_feature;

  RETURN v_has_feature;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_resource(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_resource(text, text) TO authenticated, service_role;

-- 5. Granular RLS Policies on Core Tables

-- EMPLOYEES & RELATED SENSITIVE RECORDS
DROP POLICY IF EXISTS employees_select_policy ON public.employees;
CREATE POLICY employees_select_policy ON public.employees
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/staff', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS employees_insert_policy ON public.employees;
CREATE POLICY employees_insert_policy ON public.employees
FOR INSERT TO authenticated
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/staff/add', 'create')
  OR public.can_access_resource('/staff', 'create')
);

DROP POLICY IF EXISTS employees_update_policy ON public.employees;
CREATE POLICY employees_update_policy ON public.employees
FOR UPDATE TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/staff/update', 'update')
  OR public.can_access_resource('/staff', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/staff/update', 'update')
  OR public.can_access_resource('/staff', 'update')
);

DROP POLICY IF EXISTS employees_delete_policy ON public.employees;
CREATE POLICY employees_delete_policy ON public.employees
FOR DELETE TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/staff', 'delete')
);

-- EMPLOYEE RELATIVES / DOCUMENTS / ENTITLEMENTS / DEDUCTIONS
DO $$
DECLARE
  t text;
  child_tables text[] := ARRAY['employee_relatives', 'employee_documents', 'employee_entitlements', 'employee_deductions'];
BEGIN
  FOREACH t IN ARRAY child_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_select_policy ON public.%I;', t, t);
      EXECUTE format('CREATE POLICY %I_select_policy ON public.%I FOR SELECT TO authenticated USING (
        public.is_permissions_admin()
        OR public.can_access_resource(''/staff'', ''read'')
        OR (employee_id IS NOT NULL AND employee_id IN (
          SELECT e.id FROM public.employees e
          JOIN public.profiles p ON p.emp_no = e.emp_no
          WHERE p.id = auth.uid()
        ))
      );', t, t);

      EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON public.%I;', t, t);
      EXECUTE format('CREATE POLICY %I_write_policy ON public.%I FOR ALL TO authenticated USING (
        public.is_permissions_admin()
        OR public.can_access_resource(''/staff'', ''update'')
      ) WITH CHECK (
        public.is_permissions_admin()
        OR public.can_access_resource(''/staff'', ''update'')
      );', t, t);
    END IF;
  END LOOP;
END $$;

-- LEAVE REQUESTS
DROP POLICY IF EXISTS leave_requests_select_policy ON public.leave_requests;
CREATE POLICY leave_requests_select_policy ON public.leave_requests
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/leaves', 'read')
  OR (employee_id IS NOT NULL AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
);

DROP POLICY IF EXISTS leave_requests_insert_policy ON public.leave_requests;
CREATE POLICY leave_requests_insert_policy ON public.leave_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/leaves', 'create')
  OR (employee_id IS NOT NULL AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
);

DROP POLICY IF EXISTS leave_requests_update_policy ON public.leave_requests;
CREATE POLICY leave_requests_update_policy ON public.leave_requests
FOR UPDATE TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/leaves', 'update')
  OR (employee_id IS NOT NULL AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ) AND status = 'pending')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/leaves', 'update')
  OR (employee_id IS NOT NULL AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ) AND status = 'pending')
);

DROP POLICY IF EXISTS leave_requests_delete_policy ON public.leave_requests;
CREATE POLICY leave_requests_delete_policy ON public.leave_requests
FOR DELETE TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/leaves', 'delete')
);

-- LOANS
DROP POLICY IF EXISTS loans_select_policy ON public.loans;
CREATE POLICY loans_select_policy ON public.loans
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/loans', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS loans_write_policy ON public.loans;
CREATE POLICY loans_write_policy ON public.loans
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/loans', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/loans', 'update')
);

-- ATTENDANCE RECORDS & FINGERPRINT RECORDS
DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'read')
  OR (employee_id IS NOT NULL AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
);

DROP POLICY IF EXISTS attendance_write_policy ON public.attendance_records;
CREATE POLICY attendance_write_policy ON public.attendance_records
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/attendance', 'update')
);

-- PAYROLL RUNS
DROP POLICY IF EXISTS payroll_select_policy ON public.payroll_runs;
CREATE POLICY payroll_select_policy ON public.payroll_runs
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/payroll', 'read')
);

DROP POLICY IF EXISTS payroll_write_policy ON public.payroll_runs;
CREATE POLICY payroll_write_policy ON public.payroll_runs
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/payroll', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/payroll', 'update')
);

-- INQUIRIES
DROP POLICY IF EXISTS inquiries_select_policy ON public.inquiries;
CREATE POLICY inquiries_select_policy ON public.inquiries
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/inquiries', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS inquiries_write_policy ON public.inquiries;
CREATE POLICY inquiries_write_policy ON public.inquiries
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/inquiries', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/inquiries', 'update')
);

-- PERMITS
DROP POLICY IF EXISTS permits_select_policy ON public.employee_permits;
CREATE POLICY permits_select_policy ON public.employee_permits
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/permits', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS permits_write_policy ON public.employee_permits;
CREATE POLICY permits_write_policy ON public.employee_permits
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/permits', 'update')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/permits', 'update')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

-- END OF SERVICE REQUESTS
DROP POLICY IF EXISTS eos_select_policy ON public.end_of_service_requests;
CREATE POLICY eos_select_policy ON public.end_of_service_requests
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/end-of-service-requests', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
);

DROP POLICY IF EXISTS eos_write_policy ON public.end_of_service_requests;
CREATE POLICY eos_write_policy ON public.end_of_service_requests
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/end-of-service-requests', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/end-of-service-requests', 'update')
);

-- APP SETTINGS
DROP POLICY IF EXISTS app_settings_select_policy ON public.app_settings;
CREATE POLICY app_settings_select_policy ON public.app_settings
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/settings/general', 'read')
  OR public.can_access_resource('email.settings.read', 'read')
);

DROP POLICY IF EXISTS app_settings_write_policy ON public.app_settings;
CREATE POLICY app_settings_write_policy ON public.app_settings
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/settings/general', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/settings/general', 'update')
);

-- EMAIL LOGS & EMAIL TEMPLATES
DROP POLICY IF EXISTS email_logs_select_policy ON public.email_logs;
CREATE POLICY email_logs_select_policy ON public.email_logs
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('email.logs.read', 'read')
  OR public.can_access_resource('/settings/general', 'read')
);

DROP POLICY IF EXISTS email_logs_write_policy ON public.email_logs;
CREATE POLICY email_logs_write_policy ON public.email_logs
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('email.logs.resend', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('email.logs.resend', 'update')
);

DROP POLICY IF EXISTS email_templates_select_policy ON public.email_templates;
CREATE POLICY email_templates_select_policy ON public.email_templates
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('email.templates.read', 'read')
  OR public.can_access_resource('/settings/general', 'read')
);

DROP POLICY IF EXISTS email_templates_write_policy ON public.email_templates;
CREATE POLICY email_templates_write_policy ON public.email_templates
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('email.templates.update', 'update')
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('email.templates.update', 'update')
);

-- REFERENCE LOOKUP TABLES (read-only for all authenticated users, write restricted to admin/config)
DO $$
DECLARE
  t text;
  lookup_tables text[] := ARRAY[
    'departments', 'basic_lookups', 'work_shift_groups', 'regulation_rules',
    'announcements', 'account_links', 'task_categories', 'task_priorities',
    'task_statuses', 'task_creator_permissions', 'task_receiver_permissions',
    'entitlements', 'deductions'
  ];
BEGIN
  FOREACH t IN ARRAY lookup_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I;', t, t);
      EXECUTE format('CREATE POLICY %I_select_auth ON public.%I FOR SELECT TO authenticated USING (true);', t, t);

      EXECUTE format('DROP POLICY IF EXISTS %I_write_admin ON public.%I;', t, t);
      EXECUTE format('CREATE POLICY %I_write_admin ON public.%I FOR ALL TO authenticated USING (
        public.is_permissions_admin()
      ) WITH CHECK (
        public.is_permissions_admin()
      );', t, t);
    END IF;
  END LOOP;
END $$;

-- APPROVAL REQUESTS & TASKS
DROP POLICY IF EXISTS approval_requests_select_policy ON public.approval_requests;
CREATE POLICY approval_requests_select_policy ON public.approval_requests
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/approval-requests', 'read')
  OR (emp_no IS NOT NULL AND emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid()))
  OR (created_by = auth.uid())
);

DROP POLICY IF EXISTS approval_requests_write_policy ON public.approval_requests;
CREATE POLICY approval_requests_write_policy ON public.approval_requests
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/approval-requests', 'update')
  OR (created_by = auth.uid())
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/approval-requests', 'update')
  OR (created_by = auth.uid())
);

DROP POLICY IF EXISTS tasks_select_policy ON public.tasks;
CREATE POLICY tasks_select_policy ON public.tasks
FOR SELECT TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/tasks/permissions', 'read')
  OR (created_by = auth.uid())
  OR (assignee_employee_id IS NOT NULL AND assignee_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
  OR (creator_employee_id IS NOT NULL AND creator_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
);

DROP POLICY IF EXISTS tasks_write_policy ON public.tasks;
CREATE POLICY tasks_write_policy ON public.tasks
FOR ALL TO authenticated
USING (
  public.is_permissions_admin()
  OR public.can_access_resource('/tasks/permissions', 'update')
  OR (created_by = auth.uid())
  OR (assignee_employee_id IS NOT NULL AND assignee_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
  OR (creator_employee_id IS NOT NULL AND creator_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
)
WITH CHECK (
  public.is_permissions_admin()
  OR public.can_access_resource('/tasks/permissions', 'update')
  OR (created_by = auth.uid())
  OR (assignee_employee_id IS NOT NULL AND assignee_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
  OR (creator_employee_id IS NOT NULL AND creator_employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.profiles p ON p.emp_no = e.emp_no
    WHERE p.id = auth.uid()
  ))
);

-- 6. Seed Email Permissions in permission_features
INSERT INTO public.permission_features (group_id, feature_category, feature_key, feature_name, is_allowed)
SELECT g.id, 'admin_forms', f.key, f.name, (g.name = 'Admin')
FROM public.permission_groups g
CROSS JOIN (
  VALUES
    ('email.settings.read', 'عرض إعدادات البريد'),
    ('email.settings.update', 'تعديل إعدادات البريد'),
    ('email.test', 'اختبار الاتصال وإرسال رسائل تجريبية'),
    ('email.templates.read', 'عرض قوالب البريد'),
    ('email.templates.update', 'تعديل قوالب البريد'),
    ('email.logs.read', 'عرض سجلات البريد'),
    ('email.logs.resend', 'إعادة إرسال البريد'),
    ('email.dispatch', 'إرسال إشعارات سير العمل البريدية')
) AS f(key, name)
ON CONFLICT (group_id, feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name;

COMMIT;
