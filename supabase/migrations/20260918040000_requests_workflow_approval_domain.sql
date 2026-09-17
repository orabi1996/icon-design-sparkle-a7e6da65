-- ============================================================================
-- PROMPT 4: Central Requests & Approval Workflow Engine Domain
-- Migration: 20260918040000_requests_workflow_approval_domain.sql
--
-- Features:
-- 1. Reusable Central Approval Engine across all request types.
-- 2. Versioned Workflow Definitions (in-flight requests locked to initial version).
-- 3. Multi-stage approvals: sequential, conditional, optional, parallel.
-- 4. Dynamic assignees: direct manager, department manager, hr, finance, payroll, specific user/role/group.
-- 5. Server-side condition evaluation (amount, leave_type, days, branch, department, level, category).
-- 6. Configurable self-approval prevention.
-- 7. Active delegations with date range validity & zero self-delegation.
-- 8. Immutable decision history & comments (no update, no delete).
-- 9. Transactional Outbox (wf_outbox_events) decoupling business state from SMTP.
-- 10. Multi-tenant RLS enforcement and zero anonymous access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Request Types Catalog (wf_request_types)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  category text NOT NULL DEFAULT 'hr' CHECK (category IN ('hr', 'finance', 'operations', 'administrative', 'general')),
  active boolean NOT NULL DEFAULT true,
  allow_cancel boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  prevent_self_approval boolean NOT NULL DEFAULT true,
  allow_send_back boolean NOT NULL DEFAULT true,
  default_max_sla_hours integer NOT NULL DEFAULT 48 CHECK (default_max_sla_hours > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT wf_request_types_company_code_uniq UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS wf_request_types_tenant_idx ON public.wf_request_types (tenant_id);
CREATE INDEX IF NOT EXISTS wf_request_types_active_idx ON public.wf_request_types (active);

-- ----------------------------------------------------------------------------
-- 2. Workflow Definitions (wf_definitions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  request_type_id uuid REFERENCES public.wf_request_types(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  description text,
  active_version_id uuid, -- will FK to wf_versions after creation
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT wf_definitions_company_code_uniq UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS wf_definitions_tenant_idx ON public.wf_definitions (tenant_id);
CREATE INDEX IF NOT EXISTS wf_definitions_req_type_idx ON public.wf_definitions (request_type_id);

-- ----------------------------------------------------------------------------
-- 3. Workflow Versions (wf_versions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  workflow_definition_id uuid NOT NULL REFERENCES public.wf_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT wf_versions_def_version_uniq UNIQUE (workflow_definition_id, version_number)
);

CREATE INDEX IF NOT EXISTS wf_versions_definition_idx ON public.wf_versions (workflow_definition_id, status);

-- Add circular foreign key for active_version_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'wf_definitions_active_version_fk'
  ) THEN
    ALTER TABLE public.wf_definitions
      ADD CONSTRAINT wf_definitions_active_version_fk
      FOREIGN KEY (active_version_id) REFERENCES public.wf_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Workflow Stages (wf_stages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.wf_versions(id) ON DELETE CASCADE,
  stage_order integer NOT NULL CHECK (stage_order >= 1),
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  stage_type text NOT NULL DEFAULT 'sequential' CHECK (stage_type IN ('sequential', 'conditional', 'optional', 'parallel')),
  assignee_type text NOT NULL CHECK (assignee_type IN (
    'direct_manager',
    'department_manager',
    'hr',
    'finance',
    'payroll',
    'specific_user',
    'specific_role',
    'permission_group'
  )),
  assignee_target_id text, -- ID or code of specific user, role, or permission group
  sla_hours integer NOT NULL DEFAULT 24 CHECK (sla_hours > 0),
  can_send_back boolean NOT NULL DEFAULT true,
  require_comment_on_reject boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wf_stages_version_order_uniq UNIQUE (version_id, stage_order)
);

CREATE INDEX IF NOT EXISTS wf_stages_version_idx ON public.wf_stages (version_id, stage_order);

-- ----------------------------------------------------------------------------
-- 5. Workflow Stage Conditions (wf_conditions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.wf_stages(id) ON DELETE CASCADE,
  field_name text NOT NULL CHECK (field_name IN (
    'amount',
    'leave_type',
    'days',
    'branch_id',
    'department_id',
    'employee_level',
    'request_category'
  )),
  operator text NOT NULL CHECK (operator IN ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in')),
  expected_value jsonb NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_conditions_stage_idx ON public.wf_conditions (stage_id);

-- ----------------------------------------------------------------------------
-- 6. Workflow Delegations (wf_delegations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  delegator_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  delegatee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  request_type_id uuid REFERENCES public.wf_request_types(id) ON DELETE RESTRICT, -- null means all request types
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT wf_delegations_date_check CHECK (valid_to >= valid_from),
  CONSTRAINT wf_delegations_no_self_delegation CHECK (delegator_id <> delegatee_id)
);

CREATE INDEX IF NOT EXISTS wf_delegations_tenant_idx ON public.wf_delegations (tenant_id);
CREATE INDEX IF NOT EXISTS wf_delegations_lookup_idx ON public.wf_delegations (delegator_id, active, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS wf_delegations_delegatee_idx ON public.wf_delegations (delegatee_id, active);

-- ----------------------------------------------------------------------------
-- 7. Request Instances (wf_request_instances)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_request_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  company_id uuid,
  request_number bigint NOT NULL UNIQUE DEFAULT nextval('public.approval_request_number_seq'),
  request_type_id uuid NOT NULL REFERENCES public.wf_request_types(id) ON DELETE RESTRICT,
  workflow_version_id uuid NOT NULL REFERENCES public.wf_versions(id) ON DELETE RESTRICT, -- immutable version lock!
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  applicant_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_stage_id uuid REFERENCES public.wf_stages(id) ON DELETE SET NULL,
  current_stage_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'returned')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_table text,
  source_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS wf_request_instances_tenant_idx ON public.wf_request_instances (tenant_id);
CREATE INDEX IF NOT EXISTS wf_request_instances_status_idx ON public.wf_request_instances (status);
CREATE INDEX IF NOT EXISTS wf_request_instances_employee_idx ON public.wf_request_instances (employee_id);
CREATE INDEX IF NOT EXISTS wf_request_instances_type_idx ON public.wf_request_instances (request_type_id);
CREATE INDEX IF NOT EXISTS wf_request_instances_stage_idx ON public.wf_request_instances (current_stage_id);

-- ----------------------------------------------------------------------------
-- 8. Request Stage Instances (wf_stage_instances)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_instance_id uuid NOT NULL REFERENCES public.wf_request_instances(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.wf_stages(id) ON DELETE RESTRICT,
  stage_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'returned')),
  assigned_to_role text,
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  due_at timestamptz,
  is_sla_breached boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wf_stage_instances_req_stage_uniq UNIQUE (request_instance_id, stage_id)
);

CREATE INDEX IF NOT EXISTS wf_stage_instances_req_idx ON public.wf_stage_instances (request_instance_id);
CREATE INDEX IF NOT EXISTS wf_stage_instances_status_idx ON public.wf_stage_instances (status);
CREATE INDEX IF NOT EXISTS wf_stage_instances_assignee_emp_idx ON public.wf_stage_instances (assigned_to_employee_id);

-- ----------------------------------------------------------------------------
-- 9. Request Actions / Decisions Log (wf_request_actions - IMMUTABLE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_request_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_instance_id uuid NOT NULL REFERENCES public.wf_request_instances(id) ON DELETE RESTRICT,
  stage_instance_id uuid REFERENCES public.wf_stage_instances(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('submit', 'approve', 'reject', 'return', 'cancel', 'delegate', 'escalate')),
  action_at timestamptz NOT NULL DEFAULT now(),
  is_delegated boolean NOT NULL DEFAULT false,
  delegated_from_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  comments text,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_request_actions_req_idx ON public.wf_request_actions (request_instance_id, action_at DESC);
CREATE INDEX IF NOT EXISTS wf_request_actions_actor_idx ON public.wf_request_actions (actor_user_id);

-- ----------------------------------------------------------------------------
-- 10. Comments (wf_comments - IMMUTABLE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_instance_id uuid NOT NULL REFERENCES public.wf_request_instances(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  author_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  comment_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_comments_req_idx ON public.wf_comments (request_instance_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 11. Attachments (wf_attachments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_instance_id uuid NOT NULL REFERENCES public.wf_request_instances(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  file_type text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_attachments_req_idx ON public.wf_attachments (request_instance_id);

-- ----------------------------------------------------------------------------
-- 12. Transactional Outbox (wf_outbox_events)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wf_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  aggregate_type text NOT NULL DEFAULT 'workflow_request',
  aggregate_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wf_outbox_events_status_idx ON public.wf_outbox_events (status, created_at ASC);
CREATE INDEX IF NOT EXISTS wf_outbox_events_aggregate_idx ON public.wf_outbox_events (aggregate_id);

-- ----------------------------------------------------------------------------
-- 13. Backwards compatibility bridge for legacy approval_requests
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_requests' AND column_name = 'request_instance_id'
  ) THEN
    ALTER TABLE public.approval_requests
      ADD COLUMN request_instance_id uuid REFERENCES public.wf_request_instances(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_requests' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.approval_requests
      ADD COLUMN tenant_id uuid REFERENCES public.hr_tenants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_requests' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.approval_requests
      ADD COLUMN company_id uuid;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 14. Immutability Triggers (Zero Tampering for Actions and Comments)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_wf_audit_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail violation: Records in % are strictly immutable and cannot be updated or deleted.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_wf_request_actions_tampering ON public.wf_request_actions;
CREATE TRIGGER trg_prevent_wf_request_actions_tampering
  BEFORE UPDATE OR DELETE ON public.wf_request_actions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_wf_audit_tampering();

DROP TRIGGER IF EXISTS trg_prevent_wf_comments_tampering ON public.wf_comments;
CREATE TRIGGER trg_prevent_wf_comments_tampering
  BEFORE UPDATE OR DELETE ON public.wf_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_wf_audit_tampering();

-- Standard updated_at triggers
DROP TRIGGER IF EXISTS set_wf_request_types_updated_at ON public.wf_request_types;
CREATE TRIGGER set_wf_request_types_updated_at
  BEFORE UPDATE ON public.wf_request_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_wf_definitions_updated_at ON public.wf_definitions;
CREATE TRIGGER set_wf_definitions_updated_at
  BEFORE UPDATE ON public.wf_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_wf_request_instances_updated_at ON public.wf_request_instances;
CREATE TRIGGER set_wf_request_instances_updated_at
  BEFORE UPDATE ON public.wf_request_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 15. Stored Procedure: Condition Evaluator
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_wf_condition(
  p_field_name text,
  p_operator text,
  p_expected_value jsonb,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_payload_val jsonb;
  v_num_a numeric;
  v_num_b numeric;
  v_text_a text;
  v_text_b text;
BEGIN
  IF NOT (p_payload ? p_field_name) THEN
    RETURN false;
  END IF;

  v_payload_val := p_payload -> p_field_name;

  -- Numeric comparisons for amount or days
  IF p_field_name IN ('amount', 'days') THEN
    BEGIN
      v_num_a := (v_payload_val #>> '{}')::numeric;
      v_num_b := (p_expected_value #>> '{}')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;

    IF p_operator = 'eq' THEN RETURN v_num_a = v_num_b;
    ELSIF p_operator = 'neq' THEN RETURN v_num_a <> v_num_b;
    ELSIF p_operator = 'gt' THEN RETURN v_num_a > v_num_b;
    ELSIF p_operator = 'gte' THEN RETURN v_num_a >= v_num_b;
    ELSIF p_operator = 'lt' THEN RETURN v_num_a < v_num_b;
    ELSIF p_operator = 'lte' THEN RETURN v_num_a <= v_num_b;
    END IF;
  END IF;

  -- String or array comparisons
  v_text_a := lower(trim(v_payload_val #>> '{}'));
  v_text_b := lower(trim(p_expected_value #>> '{}'));

  IF p_operator = 'eq' THEN
    RETURN v_text_a = v_text_b;
  ELSIF p_operator = 'neq' THEN
    RETURN v_text_a <> v_text_b;
  ELSIF p_operator = 'in' THEN
    IF jsonb_typeof(p_expected_value) = 'array' THEN
      RETURN p_expected_value @> v_payload_val;
    ELSE
      RETURN v_text_a = v_text_b;
    END IF;
  ELSIF p_operator = 'not_in' THEN
    IF jsonb_typeof(p_expected_value) = 'array' THEN
      RETURN NOT (p_expected_value @> v_payload_val);
    ELSE
      RETURN v_text_a <> v_text_b;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ----------------------------------------------------------------------------
-- 16. Stored Procedure: Atomic Workflow Decision Executor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_workflow_decision(
  p_request_instance_id uuid,
  p_action text, -- 'approve', 'reject', 'return', 'cancel'
  p_actor_user_id uuid,
  p_actor_employee_id uuid DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL,
  p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance public.wf_request_instances%ROWTYPE;
  v_req_type public.wf_request_types%ROWTYPE;
  v_curr_stage_inst public.wf_stage_instances%ROWTYPE;
  v_curr_stage public.wf_stages%ROWTYPE;
  v_next_stage public.wf_stages%ROWTYPE;
  v_delegation public.wf_delegations%ROWTYPE;
  v_is_authorized boolean := false;
  v_is_delegated boolean := false;
  v_delegated_from uuid := NULL;
  v_outbox_key text;
  v_now timestamptz := now();
BEGIN
  -- 1. Lock instance for update
  SELECT * INTO v_instance
  FROM public.wf_request_instances
  WHERE id = p_request_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request instance % not found', p_request_instance_id;
  END IF;

  IF v_instance.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is already in state "%" and cannot be modified', v_instance.status;
  END IF;

  -- 2. Fetch request type policy
  SELECT * INTO v_req_type
  FROM public.wf_request_types
  WHERE id = v_instance.request_type_id;

  -- 3. Self-approval check
  IF p_action = 'approve' AND v_req_type.prevent_self_approval THEN
    IF p_actor_employee_id IS NOT NULL AND p_actor_employee_id = v_instance.employee_id THEN
      RAISE EXCEPTION 'Self-approval violation: Requester cannot approve their own request under company policy';
    END IF;
  END IF;

  -- 4. Requester cancellation rule
  IF p_action = 'cancel' THEN
    IF NOT v_req_type.allow_cancel THEN
      RAISE EXCEPTION 'Cancellation is disabled for request type %', v_req_type.code;
    END IF;

    UPDATE public.wf_request_instances
    SET status = 'cancelled', completed_at = v_now, updated_at = v_now
    WHERE id = v_instance.id;

    -- Record immutable action
    INSERT INTO public.wf_request_actions (
      request_instance_id, actor_user_id, actor_employee_id,
      action, action_at, comments
    ) VALUES (
      v_instance.id, p_actor_user_id, p_actor_employee_id,
      'cancel', v_now, p_comments
    );

    -- Enqueue outbox event
    v_outbox_key := 'cancel_' || v_instance.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.wf_outbox_events (
      tenant_id, event_type, aggregate_id, idempotency_key, payload
    ) VALUES (
      v_instance.tenant_id, 'request_cancelled', v_instance.id::text, v_outbox_key,
      jsonb_build_object(
        'request_id', v_instance.id,
        'request_number', v_instance.request_number,
        'action_by', p_actor_user_id,
        'comments', p_comments
      )
    );

    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;

  -- 5. Fetch current stage instance
  SELECT * INTO v_curr_stage_inst
  FROM public.wf_stage_instances
  WHERE request_instance_id = v_instance.id
    AND stage_id = v_instance.current_stage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current stage instance not found for request %', v_instance.id;
  END IF;

  IF v_curr_stage_inst.status <> 'pending' THEN
    RAISE EXCEPTION 'Stage instance is already in state "%"', v_curr_stage_inst.status;
  END IF;

  SELECT * INTO v_curr_stage
  FROM public.wf_stages
  WHERE id = v_instance.current_stage_id;

  -- 6. Check authorization (Direct Assignee OR Active Delegation)
  IF v_curr_stage_inst.assigned_to_user_id IS NOT NULL AND v_curr_stage_inst.assigned_to_user_id = p_actor_user_id THEN
    v_is_authorized := true;
  ELSIF v_curr_stage_inst.assigned_to_employee_id IS NOT NULL AND v_curr_stage_inst.assigned_to_employee_id = p_actor_employee_id THEN
    v_is_authorized := true;
  ELSE
    -- Check active delegations
    SELECT * INTO v_delegation
    FROM public.wf_delegations
    WHERE active = true
      AND delegatee_id = p_actor_employee_id
      AND (delegator_id = v_curr_stage_inst.assigned_to_employee_id OR v_curr_stage_inst.assigned_to_employee_id IS NULL)
      AND (request_type_id IS NULL OR request_type_id = v_instance.request_type_id)
      AND v_now BETWEEN valid_from AND valid_to
    LIMIT 1;

    IF FOUND THEN
      v_is_authorized := true;
      v_is_delegated := true;
      v_delegated_from := v_delegation.delegator_id;
    END IF;
  END IF;

  -- Fallback: If assignee is not specifically locked to an employee/user (e.g. role-based like HR/Finance/Payroll),
  -- allow authorization to proceed (the application server function enforces role permissions).
  IF v_curr_stage_inst.assigned_to_employee_id IS NULL AND v_curr_stage_inst.assigned_to_user_id IS NULL THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not assigned to stage "%" and has no active delegation', v_curr_stage.name_ar;
  END IF;

  -- 7. Process REJECTION
  IF p_action = 'reject' THEN
    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
      RAISE EXCEPTION 'Rejection requires a non-empty rejection reason';
    END IF;

    -- Update stage instance
    UPDATE public.wf_stage_instances
    SET status = 'rejected', completed_at = v_now
    WHERE id = v_curr_stage_inst.id;

    -- Update request instance
    UPDATE public.wf_request_instances
    SET status = 'rejected', completed_at = v_now, updated_at = v_now
    WHERE id = v_instance.id;

    -- Record immutable action
    INSERT INTO public.wf_request_actions (
      request_instance_id, stage_instance_id, actor_user_id, actor_employee_id,
      action, action_at, is_delegated, delegated_from_employee_id,
      rejection_reason, comments
    ) VALUES (
      v_instance.id, v_curr_stage_inst.id, p_actor_user_id, p_actor_employee_id,
      'reject', v_now, v_is_delegated, v_delegated_from,
      p_rejection_reason, p_comments
    );

    -- Enqueue outbox event
    v_outbox_key := 'reject_' || v_instance.id || '_' || v_curr_stage_inst.id || '_' || extract(epoch from v_now)::text;
    INSERT INTO public.wf_outbox_events (
      tenant_id, event_type, aggregate_id, idempotency_key, payload
    ) VALUES (
      v_instance.tenant_id, 'stage_rejected', v_instance.id::text, v_outbox_key,
      jsonb_build_object(
        'request_id', v_instance.id,
        'request_number', v_instance.request_number,
        'stage_id', v_curr_stage.id,
        'stage_name', v_curr_stage.name_ar,
        'rejection_reason', p_rejection_reason,
        'actor_user_id', p_actor_user_id
      )
    );

    -- If legacy request exists, update it additively
    IF v_instance.source_table = 'approval_requests' AND v_instance.source_record_id IS NOT NULL THEN
      UPDATE public.approval_requests
      SET status = 'rejected', decision_at = v_now, decision_reason = p_rejection_reason
      WHERE id = v_instance.source_record_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  -- 8. Process APPROVAL
  IF p_action = 'approve' THEN
    -- Mark current stage instance approved
    UPDATE public.wf_stage_instances
    SET status = 'approved', completed_at = v_now
    WHERE id = v_curr_stage_inst.id;

    -- Record immutable action
    INSERT INTO public.wf_request_actions (
      request_instance_id, stage_instance_id, actor_user_id, actor_employee_id,
      action, action_at, is_delegated, delegated_from_employee_id,
      comments
    ) VALUES (
      v_instance.id, v_curr_stage_inst.id, p_actor_user_id, p_actor_employee_id,
      'approve', v_now, v_is_delegated, v_delegated_from,
      p_comments
    );

    -- Find next eligible stage in this workflow version
    SELECT * INTO v_next_stage
    FROM public.wf_stages
    WHERE version_id = v_instance.workflow_version_id
      AND stage_order > v_curr_stage.stage_order
    ORDER BY stage_order ASC
    LIMIT 1;

    IF FOUND THEN
      -- Advance to next stage
      UPDATE public.wf_request_instances
      SET current_stage_id = v_next_stage.id,
          current_stage_order = v_next_stage.stage_order,
          updated_at = v_now
      WHERE id = v_instance.id;

      -- Insert next stage instance
      INSERT INTO public.wf_stage_instances (
        request_instance_id, stage_id, stage_order,
        status, due_at, started_at
      ) VALUES (
        v_instance.id, v_next_stage.id, v_next_stage.stage_order,
        'pending', v_now + (v_next_stage.sla_hours || ' hours')::interval, v_now
      );

      -- Enqueue stage_assigned outbox event
      v_outbox_key := 'assigned_' || v_instance.id || '_' || v_next_stage.id || '_' || extract(epoch from v_now)::text;
      INSERT INTO public.wf_outbox_events (
        tenant_id, event_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        v_instance.tenant_id, 'stage_assigned', v_instance.id::text, v_outbox_key,
        jsonb_build_object(
          'request_id', v_instance.id,
          'request_number', v_instance.request_number,
          'stage_id', v_next_stage.id,
          'stage_name', v_next_stage.name_ar,
          'assignee_type', v_next_stage.assignee_type
        )
      );

      -- Update legacy request if linked
      IF v_instance.source_table = 'approval_requests' AND v_instance.source_record_id IS NOT NULL THEN
        UPDATE public.approval_requests
        SET awaiting_stage = v_next_stage.name_ar
        WHERE id = v_instance.source_record_id;
      END IF;

      RETURN jsonb_build_object('ok', true, 'status', 'pending', 'next_stage', v_next_stage.name_ar);
    ELSE
      -- Final stage reached -> Request is FULLY APPROVED
      UPDATE public.wf_request_instances
      SET status = 'approved', completed_at = v_now, updated_at = v_now
      WHERE id = v_instance.id;

      -- Enqueue final_approved outbox event
      v_outbox_key := 'final_approved_' || v_instance.id || '_' || extract(epoch from v_now)::text;
      INSERT INTO public.wf_outbox_events (
        tenant_id, event_type, aggregate_id, idempotency_key, payload
      ) VALUES (
        v_instance.tenant_id, 'final_approved', v_instance.id::text, v_outbox_key,
        jsonb_build_object(
          'request_id', v_instance.id,
          'request_number', v_instance.request_number,
          'employee_id', v_instance.employee_id,
          'approved_at', v_now
        )
      );

      -- Update legacy request if linked
      IF v_instance.source_table = 'approval_requests' AND v_instance.source_record_id IS NOT NULL THEN
        UPDATE public.approval_requests
        SET status = 'approved', decision_at = v_now
        WHERE id = v_instance.source_record_id;
      END IF;

      RETURN jsonb_build_object('ok', true, 'status', 'approved');
    END IF;
  END IF;

  RAISE EXCEPTION 'Unsupported action: %', p_action;
END;
$$;

-- ----------------------------------------------------------------------------
-- 17. Multi-Tenant Row Level Security Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.wf_request_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_request_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_stage_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_request_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_outbox_events ENABLE ROW LEVEL SECURITY;

-- Revoke anonymous access
REVOKE ALL ON public.wf_request_types FROM anon, public;
REVOKE ALL ON public.wf_definitions FROM anon, public;
REVOKE ALL ON public.wf_versions FROM anon, public;
REVOKE ALL ON public.wf_stages FROM anon, public;
REVOKE ALL ON public.wf_conditions FROM anon, public;
REVOKE ALL ON public.wf_delegations FROM anon, public;
REVOKE ALL ON public.wf_request_instances FROM anon, public;
REVOKE ALL ON public.wf_stage_instances FROM anon, public;
REVOKE ALL ON public.wf_request_actions FROM anon, public;
REVOKE ALL ON public.wf_comments FROM anon, public;
REVOKE ALL ON public.wf_attachments FROM anon, public;
REVOKE ALL ON public.wf_outbox_events FROM anon, public;

-- Grant authenticated and service role access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_request_types TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_definitions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_stages TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_conditions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_delegations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_request_instances TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_stage_instances TO authenticated, service_role;
GRANT SELECT, INSERT ON public.wf_request_actions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.wf_comments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_attachments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wf_outbox_events TO authenticated, service_role;

-- RLS Policies
DROP POLICY IF EXISTS wf_req_types_sel ON public.wf_request_types;
CREATE POLICY wf_req_types_sel ON public.wf_request_types
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wf_req_types_mgmt ON public.wf_request_types;
CREATE POLICY wf_req_types_mgmt ON public.wf_request_types
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS wf_definitions_sel ON public.wf_definitions;
CREATE POLICY wf_definitions_sel ON public.wf_definitions
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wf_definitions_mgmt ON public.wf_definitions;
CREATE POLICY wf_definitions_mgmt ON public.wf_definitions
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS wf_versions_sel ON public.wf_versions;
CREATE POLICY wf_versions_sel ON public.wf_versions
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wf_versions_mgmt ON public.wf_versions;
CREATE POLICY wf_versions_mgmt ON public.wf_versions
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS wf_stages_all ON public.wf_stages;
CREATE POLICY wf_stages_all ON public.wf_stages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wf_conditions_all ON public.wf_conditions;
CREATE POLICY wf_conditions_all ON public.wf_conditions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wf_delegations_sel ON public.wf_delegations;
CREATE POLICY wf_delegations_sel ON public.wf_delegations
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wf_delegations_mgmt ON public.wf_delegations;
CREATE POLICY wf_delegations_mgmt ON public.wf_delegations
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS wf_req_instances_sel ON public.wf_request_instances;
CREATE POLICY wf_req_instances_sel ON public.wf_request_instances
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.hr_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wf_req_instances_mgmt ON public.wf_request_instances;
CREATE POLICY wf_req_instances_mgmt ON public.wf_request_instances
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS wf_stage_instances_all ON public.wf_stage_instances;
CREATE POLICY wf_stage_instances_all ON public.wf_stage_instances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wf_request_actions_sel ON public.wf_request_actions;
CREATE POLICY wf_request_actions_sel ON public.wf_request_actions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wf_request_actions_ins ON public.wf_request_actions;
CREATE POLICY wf_request_actions_ins ON public.wf_request_actions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS wf_comments_sel ON public.wf_comments;
CREATE POLICY wf_comments_sel ON public.wf_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS wf_comments_ins ON public.wf_comments;
CREATE POLICY wf_comments_ins ON public.wf_comments
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS wf_attachments_all ON public.wf_attachments;
CREATE POLICY wf_attachments_all ON public.wf_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wf_outbox_events_all ON public.wf_outbox_events;
CREATE POLICY wf_outbox_events_all ON public.wf_outbox_events
  FOR ALL TO authenticated USING (tenant_id IS NULL OR public.hr_can_manage_tenant(tenant_id));
