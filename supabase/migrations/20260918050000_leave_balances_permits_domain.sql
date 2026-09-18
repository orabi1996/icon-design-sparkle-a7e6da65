-- ============================================================================
-- PROMPT 5: Leaves, Leave Balances Ledger & Permits Domain
-- Migration: 20260918050000_leave_balances_permits_domain.sql
--
-- Features:
-- 1. Versioned Leave Policies (paid/unpaid, accrual, carry-forward, negative balance, calendar behavior).
-- 2. Official public/national holidays catalog for working calendar calculations.
-- 3. Authoritative Double-Entry Leave Ledger (opening, accrual, reservation, consumption, reversal, adjustment).
-- 4. Authoritative Leave Requests Domain linked to central workflow.
-- 5. Strict Server-Side Overlap Detection and Working Calendar Day Calculation.
-- 6. Hourly Permit Policies and Permit Requests Domain.
-- 7. Zero Destructive Deletion & Immutable Ledger Triggers.
-- 8. Multi-Tenant RLS Enforcement & Zero Anon Access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Leave Policies (leave_policies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  paid boolean NOT NULL DEFAULT true,
  unit text NOT NULL DEFAULT 'days' CHECK (unit IN ('days', 'hours')),
  accrual_method text NOT NULL DEFAULT 'annual_frontloaded' CHECK (accrual_method IN ('annual_frontloaded', 'monthly_accrual', 'prorated_service', 'none')),
  annual_entitlement numeric(6,2) NOT NULL DEFAULT 21 CHECK (annual_entitlement >= 0),
  carry_forward boolean NOT NULL DEFAULT true,
  max_carry numeric(6,2) DEFAULT 10,
  expiry_months integer DEFAULT 12,
  negative_balance_policy text NOT NULL DEFAULT 'forbidden' CHECK (negative_balance_policy IN ('forbidden', 'warn_allow', 'allow_up_to_limit')),
  max_negative_balance numeric(6,2) DEFAULT 0,
  attachment_requirement text NOT NULL DEFAULT 'never' CHECK (attachment_requirement IN ('never', 'always', 'if_exceeds_days')),
  attachment_exceeds_days integer DEFAULT 2,
  min_duration integer NOT NULL DEFAULT 1 CHECK (min_duration >= 1),
  max_duration integer,
  notice_days_required integer NOT NULL DEFAULT 0,
  count_weekends boolean NOT NULL DEFAULT false,
  count_holidays boolean NOT NULL DEFAULT false,
  probation_behavior text NOT NULL DEFAULT 'forbidden' CHECK (probation_behavior IN ('forbidden', 'allowed', 'unpaid_only')),
  gender_eligibility text NOT NULL DEFAULT 'all' CHECK (gender_eligibility IN ('all', 'male_only', 'female_only')),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT leave_policies_company_code_uniq UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS leave_policies_tenant_idx ON public.leave_policies (tenant_id);
CREATE INDEX IF NOT EXISTS leave_policies_active_idx ON public.leave_policies (active);

-- ----------------------------------------------------------------------------
-- 2. Official Holidays (official_holidays)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.official_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  from_date date NOT NULL,
  to_date date NOT NULL,
  days integer NOT NULL CHECK (days >= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT official_holidays_date_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS official_holidays_tenant_idx ON public.official_holidays (tenant_id);
CREATE INDEX IF NOT EXISTS official_holidays_dates_idx ON public.official_holidays (from_date, to_date);

-- ----------------------------------------------------------------------------
-- 3. Authoritative Double-Entry Leave Ledger (leave_ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  leave_policy_id uuid NOT NULL REFERENCES public.leave_policies(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'opening',
    'accrual',
    'reservation',
    'consumption',
    'reversal',
    'adjustment',
    'expiry',
    'carry_forward'
  )),
  amount numeric(10,2) NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'leave_request',
    'permit_request',
    'manual_adjustment',
    'year_end',
    'accrual_cron',
    'migration'
  )),
  source_id text NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  idempotency_key text NOT NULL UNIQUE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_ledger_employee_idx ON public.leave_ledger (employee_id, leave_policy_id);
CREATE INDEX IF NOT EXISTS leave_ledger_tenant_idx ON public.leave_ledger (tenant_id);
CREATE INDEX IF NOT EXISTS leave_ledger_effective_idx ON public.leave_ledger (effective_date);

-- ----------------------------------------------------------------------------
-- 4. Authoritative Leave Requests Domain (leave_requests_domain)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests_domain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  request_number bigint NOT NULL UNIQUE DEFAULT nextval('public.approval_request_number_seq'),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  leave_policy_id uuid NOT NULL REFERENCES public.leave_policies(id) ON DELETE RESTRICT,
  workflow_instance_id uuid REFERENCES public.wf_request_instances(id) ON DELETE SET NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  total_calendar_days integer NOT NULL CHECK (total_calendar_days >= 1),
  deductible_days numeric(6,2) NOT NULL CHECK (deductible_days >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  attachment_url text,
  notes text,
  rejection_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT leave_requests_domain_dates_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS leave_requests_domain_emp_idx ON public.leave_requests_domain (employee_id, from_date, to_date);
CREATE INDEX IF NOT EXISTS leave_requests_domain_status_idx ON public.leave_requests_domain (status);
CREATE INDEX IF NOT EXISTS leave_requests_domain_tenant_idx ON public.leave_requests_domain (tenant_id);

-- ----------------------------------------------------------------------------
-- 5. Permit Policies (permit_policies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  max_hours_per_month numeric(5,2) NOT NULL DEFAULT 4 CHECK (max_hours_per_month > 0),
  max_times_per_month integer NOT NULL DEFAULT 2 CHECK (max_times_per_month > 0),
  requires_attachment boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT permit_policies_company_code_uniq UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS permit_policies_tenant_idx ON public.permit_policies (tenant_id);

-- ----------------------------------------------------------------------------
-- 6. Permit Requests Domain (permit_requests_domain)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_requests_domain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  request_number bigint NOT NULL UNIQUE DEFAULT nextval('public.approval_request_number_seq'),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  permit_policy_id uuid NOT NULL REFERENCES public.permit_policies(id) ON DELETE RESTRICT,
  workflow_instance_id uuid REFERENCES public.wf_request_instances(id) ON DELETE SET NULL,
  permit_date date NOT NULL,
  from_time time NOT NULL,
  to_time time NOT NULL,
  duration_hours numeric(4,2) NOT NULL CHECK (duration_hours > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  reason text NOT NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT permit_requests_domain_time_check CHECK (to_time > from_time)
);

CREATE INDEX IF NOT EXISTS permit_requests_domain_emp_idx ON public.permit_requests_domain (employee_id, permit_date);
CREATE INDEX IF NOT EXISTS permit_requests_domain_status_idx ON public.permit_requests_domain (status);

-- ----------------------------------------------------------------------------
-- 7. Immutability Trigger on leave_ledger (No UPDATE or DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_leave_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit violation: Records in leave_ledger are strictly immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_leave_ledger_tampering ON public.leave_ledger;
CREATE TRIGGER trg_prevent_leave_ledger_tampering
  BEFORE UPDATE OR DELETE ON public.leave_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_leave_ledger_tampering();

-- Standard updated_at triggers
DROP TRIGGER IF EXISTS set_leave_policies_updated_at ON public.leave_policies;
CREATE TRIGGER set_leave_policies_updated_at
  BEFORE UPDATE ON public.leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_leave_requests_domain_updated_at ON public.leave_requests_domain;
CREATE TRIGGER set_leave_requests_domain_updated_at
  BEFORE UPDATE ON public.leave_requests_domain
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Stored Procedure: Overlap Detection
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_leave_overlap(
  p_employee_id uuid,
  p_from_date date,
  p_to_date date,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_overlap_count integer;
BEGIN
  SELECT count(*) INTO v_overlap_count
  FROM public.leave_requests_domain
  WHERE employee_id = p_employee_id
    AND status IN ('pending', 'approved')
    AND (p_exclude_id IS NULL OR id <> p_exclude_id)
    AND (
      (from_date <= p_to_date AND to_date >= p_from_date)
    );

  RETURN v_overlap_count > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Stored Procedure: Leave Balance Computation from Ledger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_leave_balance(
  p_employee_id uuid,
  p_leave_policy_id uuid
)
RETURNS TABLE (
  current_balance numeric(10,2),
  reserved_balance numeric(10,2),
  available_balance numeric(10,2)
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current numeric(10,2) := 0;
  v_reserved numeric(10,2) := 0;
BEGIN
  -- Sum all committed ledger transactions
  SELECT COALESCE(sum(amount), 0) INTO v_current
  FROM public.leave_ledger
  WHERE employee_id = p_employee_id
    AND leave_policy_id = p_leave_policy_id
    AND transaction_type IN ('opening', 'accrual', 'consumption', 'reversal', 'adjustment', 'expiry', 'carry_forward');

  -- Sum reservation transactions (reservations are recorded as negative amounts)
  SELECT COALESCE(sum(abs(amount)), 0) INTO v_reserved
  FROM public.leave_ledger
  WHERE employee_id = p_employee_id
    AND leave_policy_id = p_leave_policy_id
    AND transaction_type = 'reservation';

  current_balance := v_current;
  reserved_balance := v_reserved;
  available_balance := v_current - v_reserved;

  RETURN NEXT;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Stored Procedure: Working Calendar Deductible Day Calculator
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_leave_days(
  p_from_date date,
  p_to_date date,
  p_count_weekends boolean DEFAULT false,
  p_count_holidays boolean DEFAULT false,
  p_company_id uuid DEFAULT NULL
)
RETURNS numeric(6,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_curr date;
  v_day_of_week integer;
  v_is_holiday boolean;
  v_total numeric(6,2) := 0;
BEGIN
  v_curr := p_from_date;
  WHILE v_curr <= p_to_date LOOP
    -- In PostgreSQL, EXTRACT(DOW) returns 0 for Sunday, 5 for Friday, 6 for Saturday
    v_day_of_week := EXTRACT(DOW FROM v_curr);

    -- Check official holidays if not counted
    IF NOT p_count_holidays THEN
      SELECT EXISTS (
        SELECT 1 FROM public.official_holidays
        WHERE active = true
          AND (p_company_id IS NULL OR company_id = p_company_id)
          AND v_curr BETWEEN from_date AND to_date
      ) INTO v_is_holiday;
    ELSE
      v_is_holiday := false;
    END IF;

    -- Evaluate whether to count this day
    IF v_is_holiday THEN
      -- Holiday excluded
      NULL;
    ELSIF NOT p_count_weekends AND v_day_of_week IN (5, 6) THEN
      -- Weekend excluded (Friday=5, Saturday=6)
      NULL;
    ELSE
      v_total := v_total + 1;
    END IF;

    v_curr := v_curr + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Stored Procedure: Atomic Leave Request State Machine
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_leave_request_transition(
  p_request_id uuid,
  p_new_status text, -- 'pending', 'approved', 'rejected', 'cancelled'
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req public.leave_requests_domain%ROWTYPE;
  v_policy public.leave_policies%ROWTYPE;
  v_balance RECORD;
  v_idemp_key text;
  v_now timestamptz := now();
BEGIN
  -- 1. Lock request row for update
  SELECT * INTO v_req
  FROM public.leave_requests_domain
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  SELECT * INTO v_policy
  FROM public.leave_policies
  WHERE id = v_req.leave_policy_id;

  -- 2. State transition: draft -> pending (Submit & Reserve)
  IF p_new_status = 'pending' AND v_req.status = 'draft' THEN
    -- Check overlap
    IF public.check_leave_overlap(v_req.employee_id, v_req.from_date, v_req.to_date, v_req.id) THEN
      RAISE EXCEPTION 'Leave overlap violation: Employee already has an active or pending leave for these dates';
    END IF;

    -- Check balance
    SELECT * INTO v_balance FROM public.get_employee_leave_balance(v_req.employee_id, v_req.leave_policy_id);

    IF v_policy.negative_balance_policy = 'forbidden' AND (v_balance.available_balance < v_req.deductible_days) THEN
      RAISE EXCEPTION 'Insufficient leave balance: Available is %, requested is %', v_balance.available_balance, v_req.deductible_days;
    END IF;

    -- Reserve in ledger
    v_idemp_key := 'reserve_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'reservation', -v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'حجز رصيد للطلب قيد الاعتماد'
    );

    UPDATE public.leave_requests_domain
    SET status = 'pending', updated_at = v_now
    WHERE id = v_req.id;

    RETURN jsonb_build_object('ok', true, 'status', 'pending');
  END IF;

  -- 3. State transition: pending -> approved (Commit Consumption)
  IF p_new_status = 'approved' AND v_req.status = 'pending' THEN
    -- Release reservation
    v_idemp_key := 'rel_reserve_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'reversal', v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'فك حجز الرصيد تمهيداً للخصم المعتمد'
    );

    -- Commit consumption
    v_idemp_key := 'consume_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'consumption', -v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'خصم رصيد الإجازة بعد الاعتماد النهائي'
    );

    UPDATE public.leave_requests_domain
    SET status = 'approved', approved_at = v_now, updated_at = v_now
    WHERE id = v_req.id;

    -- Enqueue integration event for Attendance & Roster
    v_idemp_key := 'leave_approved_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.wf_outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id, idempotency_key, payload
    ) VALUES (
      v_req.tenant_id, 'leave_approved_attendance_sync', 'leave_request', v_req.id::text, v_idemp_key,
      jsonb_build_object(
        'request_id', v_req.id,
        'employee_id', v_req.employee_id,
        'from_date', v_req.from_date,
        'to_date', v_req.to_date,
        'deductible_days', v_req.deductible_days,
        'policy_code', v_policy.code,
        'paid', v_policy.paid
      )
    );

    RETURN jsonb_build_object('ok', true, 'status', 'approved');
  END IF;

  -- 4. State transition: pending -> rejected (Release Reservation)
  IF p_new_status = 'rejected' AND v_req.status = 'pending' THEN
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
      RAISE EXCEPTION 'Rejection reason is strictly required when rejecting leave';
    END IF;

    -- Reverse reservation
    v_idemp_key := 'rev_reserve_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'reversal', v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'إلغاء حجز الرصيد لرفض الطلب: ' || p_reason
    );

    UPDATE public.leave_requests_domain
    SET status = 'rejected', rejection_reason = p_reason, rejected_at = v_now, updated_at = v_now
    WHERE id = v_req.id;

    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  -- 5. State transition: approved -> cancelled (Reverse Consumption)
  IF p_new_status = 'cancelled' AND v_req.status = 'approved' THEN
    v_idemp_key := 'rev_consume_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'reversal', v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'استعادة الرصيد المستهلك لإلغاء الإجازة المعتمدة'
    );

    UPDATE public.leave_requests_domain
    SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    WHERE id = v_req.id;

    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;

  -- 6. State transition: pending -> cancelled (Reverse Reservation)
  IF p_new_status = 'cancelled' AND v_req.status = 'pending' THEN
    v_idemp_key := 'can_reserve_' || v_req.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.leave_ledger (
      tenant_id, company_id, employee_id, leave_policy_id,
      transaction_type, amount, source_type, source_id,
      effective_date, idempotency_key, actor_user_id, reason
    ) VALUES (
      v_req.tenant_id, v_req.company_id, v_req.employee_id, v_req.leave_policy_id,
      'reversal', v_req.deductible_days, 'leave_request', v_req.id::text,
      v_req.from_date, v_idemp_key, p_actor_user_id, 'إلغاء حجز الرصيد لإلغاء الطلب من قبل الموظف'
    );

    UPDATE public.leave_requests_domain
    SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    WHERE id = v_req.id;

    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;

  RAISE EXCEPTION 'Invalid state transition from "%" to "%"', v_req.status, p_new_status;
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. Additive Bridging on Legacy Tables
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'domain_request_id'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD COLUMN domain_request_id uuid REFERENCES public.leave_requests_domain(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_permits' AND column_name = 'domain_request_id'
  ) THEN
    ALTER TABLE public.employee_permits
      ADD COLUMN domain_request_id uuid REFERENCES public.permit_requests_domain(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 13. Multi-Tenant Row Level Security Policies & Zero Anon Access
-- ----------------------------------------------------------------------------
ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_requests_domain ENABLE ROW LEVEL SECURITY;

-- Revoke anonymous access
REVOKE ALL ON public.leave_policies FROM anon, public;
REVOKE ALL ON public.official_holidays FROM anon, public;
REVOKE ALL ON public.leave_ledger FROM anon, public;
REVOKE ALL ON public.leave_requests_domain FROM anon, public;
REVOKE ALL ON public.permit_policies FROM anon, public;
REVOKE ALL ON public.permit_requests_domain FROM anon, public;

-- Grant authenticated and service role access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_policies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_holidays TO authenticated, service_role;
GRANT SELECT, INSERT ON public.leave_ledger TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests_domain TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_policies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_requests_domain TO authenticated, service_role;

-- RLS Policies
DROP POLICY IF EXISTS leave_policies_sel ON public.leave_policies;
CREATE POLICY leave_policies_sel ON public.leave_policies
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS leave_policies_mgmt ON public.leave_policies;
CREATE POLICY leave_policies_mgmt ON public.leave_policies
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS official_holidays_sel ON public.official_holidays;
CREATE POLICY official_holidays_sel ON public.official_holidays
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS official_holidays_mgmt ON public.official_holidays;
CREATE POLICY official_holidays_mgmt ON public.official_holidays
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS leave_ledger_sel ON public.leave_ledger;
CREATE POLICY leave_ledger_sel ON public.leave_ledger
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS leave_ledger_ins ON public.leave_ledger;
CREATE POLICY leave_ledger_ins ON public.leave_ledger
  FOR INSERT TO authenticated WITH CHECK (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS leave_req_domain_sel ON public.leave_requests_domain;
CREATE POLICY leave_req_domain_sel ON public.leave_requests_domain
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS leave_req_domain_mgmt ON public.leave_requests_domain;
CREATE POLICY leave_req_domain_mgmt ON public.leave_requests_domain
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS permit_policies_sel ON public.permit_policies;
CREATE POLICY permit_policies_sel ON public.permit_policies
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS permit_policies_mgmt ON public.permit_policies;
CREATE POLICY permit_policies_mgmt ON public.permit_policies
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS permit_req_domain_sel ON public.permit_requests_domain;
CREATE POLICY permit_req_domain_sel ON public.permit_requests_domain
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS permit_req_domain_mgmt ON public.permit_requests_domain;
CREATE POLICY permit_req_domain_mgmt ON public.permit_requests_domain
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));
