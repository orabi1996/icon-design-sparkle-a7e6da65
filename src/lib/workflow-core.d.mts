export type WfStageType = 'sequential' | 'conditional' | 'optional' | 'parallel';

export type WfAssigneeType =
  | 'direct_manager'
  | 'department_manager'
  | 'hr'
  | 'finance'
  | 'payroll'
  | 'specific_user'
  | 'specific_role'
  | 'permission_group';

export type WfAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'return'
  | 'cancel'
  | 'delegate'
  | 'escalate';

export type WfStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'returned'
  | 'skipped';

export interface WfCondition {
  field_name: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in';
  expected_value: unknown;
  is_mandatory?: boolean | undefined;
}

export interface WfStage {
  id: string;
  version_id?: string | undefined;
  stage_order: number;
  code: string;
  name_ar: string;
  name_en?: string | null | undefined;
  stage_type: WfStageType;
  assignee_type: WfAssigneeType;
  assignee_target_id?: string | null | undefined;
  sla_hours: number;
  can_send_back?: boolean | undefined;
  require_comment_on_reject?: boolean | undefined;
  conditions?: WfCondition[] | undefined;
}

export interface WfDelegation {
  id?: string | undefined;
  delegator_id: string;
  delegatee_id: string;
  request_type_id?: string | null | undefined;
  valid_from: string | Date;
  valid_to: string | Date;
  active?: boolean | undefined;
  reason?: string | null | undefined;
}

export interface WfStageInstance {
  id: string;
  request_instance_id: string;
  stage_id: string;
  stage_order: number;
  status: WfStatus;
  assigned_to_role?: string | null | undefined;
  assigned_to_user_id?: string | null | undefined;
  assigned_to_employee_id?: string | null | undefined;
  request_type_id?: string | null | undefined;
  due_at?: string | null | undefined;
  is_sla_breached?: boolean | undefined;
  started_at: string;
  completed_at?: string | null | undefined;
}

export interface WfRequestInstance {
  id: string;
  tenant_id?: string | null | undefined;
  company_id?: string | null | undefined;
  request_number: number;
  request_type_id: string;
  workflow_version_id: string;
  employee_id: string;
  applicant_user_id?: string | null | undefined;
  title: string;
  details?: string | null | undefined;
  request_payload: Record<string, unknown>;
  current_stage_id?: string | null | undefined;
  current_stage_order: number;
  status: WfStatus;
  submitted_at: string;
  completed_at?: string | null | undefined;
  source_table?: string | null | undefined;
  source_record_id?: string | null | undefined;
}

export interface WfActor {
  user_id?: string | null | undefined;
  employee_id?: string | null | undefined;
  roles?: string[] | undefined;
}

export interface WfOutboxEvent {
  event_type: string;
  aggregate_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
}

export declare function normalizeText(value: unknown): string;

export declare function evaluateCondition(
  condition: WfCondition,
  payload: Record<string, unknown>
): boolean;

export declare function isStageEligible(
  stage: { stage_type?: string | undefined } | null | undefined,
  conditions: WfCondition[] | null | undefined,
  payload: Record<string, unknown>
): boolean;

export declare function checkSelfApproval(
  applicantEmployeeId: string | null | undefined,
  actorEmployeeId: string | null | undefined,
  preventSelfApproval?: boolean | undefined
): { allowed: boolean; reason?: string | undefined };

export declare function isAuthorizedApprover(
  stageInstance: {
    assigned_to_user_id?: string | null | undefined;
    assigned_to_employee_id?: string | null | undefined;
    request_type_id?: string | null | undefined;
  } | null | undefined,
  actor: WfActor | null | undefined,
  delegations?: WfDelegation[] | undefined,
  currentDate?: Date | string | undefined
): {
  authorized: boolean;
  isDelegated: boolean;
  delegatedFrom?: string | undefined;
  reason?: string | undefined;
};

export declare function calculateStageSla(
  startedAt: string | Date,
  slaHours: number,
  asOfDate?: Date | string | undefined
): { dueAt: Date; isBreached: boolean; hoursRemaining: number };

export declare function generateOutboxDeduplicationKey(
  aggregateId: string,
  eventType: string,
  stageIdOrTimestamp: string | number
): string;

export declare function validateDecisionPayload(
  action: string,
  rejectionReason?: string | null | undefined,
  comments?: string | null | undefined
): { valid: boolean; error?: string | undefined };

export declare function advanceWorkflowState(params: {
  requestInstance: WfRequestInstance;
  currentStage: WfStage;
  allStages?: WfStage[] | undefined;
  action: WfAction;
  actor: WfActor;
  rejectionReason?: string | undefined;
  comments?: string | undefined;
  preventSelfApproval?: boolean | undefined;
  now?: Date | undefined;
}): {
  ok: boolean;
  error?: string | undefined;
  nextStatus?: string | undefined;
  nextStage?: WfStage | null | undefined;
  outboxEvent?: WfOutboxEvent | undefined;
  actionRecord?: Record<string, unknown> | undefined;
};
