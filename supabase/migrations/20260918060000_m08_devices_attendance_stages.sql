-- Migration: 20260918060000_m08_devices_attendance_stages.sql
-- M08 Stage Separation: Devices, Device Ingestion Contract, Matched Punches, Attendance Results, Exceptions, Locked Approved Attendance & Payroll Delivery Contract.

BEGIN;

-- 1. Devices Registry
CREATE TABLE IF NOT EXISTS public.m08_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  serial_number text NOT NULL,
  name text NOT NULL,
  site_code text NOT NULL,
  device_type text NOT NULL DEFAULT 'biometric',
  brand text,
  model text,
  ip_address text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'quarantined')),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_m08_devices_lookup ON public.m08_devices(company_id, site_code, status);

-- 2. Device Events Ingestion Contract (Raw Ingestion Queue with Strict Deduplication & Quarantine)
CREATE TABLE IF NOT EXISTS public.m08_device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  device_id uuid REFERENCES public.m08_devices(id),
  device_serial text NOT NULL,
  site_code text,
  external_event_id text NOT NULL,
  employee_raw_id text NOT NULL,
  employee_id uuid REFERENCES public.employees(id),
  event_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  punch_kind text NOT NULL DEFAULT 'unknown' CHECK (punch_kind IN ('in', 'out', 'break_start', 'break_end', 'unknown')),
  mapping_status text NOT NULL DEFAULT 'mapped' CHECK (mapping_status IN ('mapped', 'unknown_employee', 'unknown_device', 'unknown_site', 'quarantined')),
  quarantine_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_to_aggregate boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, device_serial, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_m08_device_events_emp ON public.m08_device_events(company_id, employee_id, event_at);
CREATE INDEX IF NOT EXISTS idx_m08_device_events_status ON public.m08_device_events(company_id, mapping_status, ingested_to_aggregate);

-- Raw device events are immutable: prevent modifications or deletion
CREATE TRIGGER m08_device_events_immutable
BEFORE UPDATE OR DELETE ON public.m08_device_events
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();

-- 3. Attendance Results Stage (Calculated Attendance Records)
CREATE TABLE IF NOT EXISTS public.m08_attendance_results (
  id text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  assignment_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  planned_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer,
  late_minutes integer NOT NULL DEFAULT 0,
  early_departure_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  approved_overtime_minutes integer NOT NULL DEFAULT 0,
  missing_minutes integer NOT NULL DEFAULT 0,
  presence_minutes integer NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'reviewed', 'approved', 'reopened', 'locked')),
  approval_actor uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approval_reason text,
  calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_m08_att_results_emp ON public.m08_attendance_results(company_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_m08_att_results_approval ON public.m08_attendance_results(company_id, approval_status, work_date);

-- 4. Attendance Exceptions Stage
CREATE TABLE IF NOT EXISTS public.m08_attendance_exceptions (
  id text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('missing_check_in', 'missing_check_out', 'unverified_site', 'late', 'early_departure', 'overtime_unapproved', 'unscheduled', 'unknown_punch')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'exception', 'blocker')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'corrected', 'waived')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_m08_att_exceptions_emp ON public.m08_attendance_exceptions(company_id, employee_id, status);

-- 5. Approved Attendance Stage (Locked and Immutable)
CREATE TABLE IF NOT EXISTS public.m08_approved_attendance (
  id text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  result_id text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  approved_minutes integer NOT NULL DEFAULT 0,
  approved_overtime_minutes integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT true,
  locked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_m08_approved_att_emp ON public.m08_approved_attendance(company_id, employee_id, work_date);

-- Locked approved attendance is immutable: prevent direct UPDATE or DELETE
CREATE TRIGGER m08_approved_att_immutable
BEFORE UPDATE OR DELETE ON public.m08_approved_attendance
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();

-- 6. Payroll Deliveries Stage (Receiver Contract with Idempotency)
CREATE TABLE IF NOT EXISTS public.m08_payroll_deliveries (
  delivery_id text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  period_id text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  work_date date NOT NULL,
  approved_minutes integer NOT NULL DEFAULT 0,
  approved_overtime_minutes integer NOT NULL DEFAULT 0,
  source_revision bigint NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'accepted', 'rejected')),
  receiver_reference text,
  response_at timestamptz,
  response_reason text,
  quantities jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id, delivery_id),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_m08_payroll_deliv_period ON public.m08_payroll_deliveries(company_id, period_id, status);

-- 7. Security & Permissions (RLS)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['m08_devices', 'm08_device_events', 'm08_attendance_results', 'm08_attendance_exceptions', 'm08_approved_attendance', 'm08_payroll_deliveries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END $$;

-- 8. Stored Procedure: Ingest Device Event with Quarantine & Deduplication
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
  v_employee record;
  v_mapping_status text := 'mapped';
  v_quarantine_reason text := NULL;
  v_event_id uuid;
BEGIN
  -- 1. Check if device exists and is active
  SELECT * INTO v_device FROM public.m08_devices
  WHERE company_id = p_company_id AND serial_number = p_device_serial;

  IF NOT FOUND THEN
    v_mapping_status := 'unknown_device';
    v_quarantine_reason := 'جهاز البصمة غير مسجل في النظام';
  ELSIF v_device.status <> 'active' THEN
    v_mapping_status := 'quarantined';
    v_quarantine_reason := 'حالة الجهاز غير نشطة (' || v_device.status || ')';
  END IF;

  -- 2. Resolve employee mapping by emp_no or raw id
  IF v_mapping_status = 'mapped' THEN
    SELECT id, emp_no, branch, department INTO v_employee FROM public.employees
    WHERE emp_no = p_employee_raw_id;

    IF NOT FOUND THEN
      v_mapping_status := 'unknown_employee';
      v_quarantine_reason := 'رقم الموظف غير مطابق لأي موظف نشط في النظام (' || p_employee_raw_id || ')';
    END IF;
  END IF;

  -- 3. Check site code validity if provided
  IF v_mapping_status = 'mapped' AND p_site_code IS NOT NULL AND v_device.site_code IS NOT NULL THEN
    IF p_site_code <> v_device.site_code THEN
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
    v_device.id,
    p_device_serial,
    COALESCE(p_site_code, v_device.site_code),
    p_external_event_id,
    p_employee_raw_id,
    v_employee.id,
    p_event_at,
    p_punch_kind,
    v_mapping_status,
    v_quarantine_reason,
    p_payload
  )
  ON CONFLICT (company_id, device_serial, external_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  -- Update device last_sync_at
  IF v_device.id IS NOT NULL THEN
    UPDATE public.m08_devices SET last_sync_at = now(), updated_at = now() WHERE id = v_device.id;
  END IF;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'message', 'تم استلام الحدث مسبقاً (معرف متكرر)');
  ELSIF v_mapping_status <> 'mapped' THEN
    RETURN jsonb_build_object('status', 'quarantined', 'event_id', v_event_id, 'reason', v_quarantine_reason);
  ELSE
    RETURN jsonb_build_object('status', 'accepted', 'event_id', v_event_id, 'employee_id', v_employee.id);
  END IF;
END;
$$;

COMMIT;