/**
 * Central Requests & Approval Workflow Engine Domain Core
 * Pure ESM business logic running in Node and Browser environments.
 */

export const WF_STAGE_TYPES = Object.freeze(['sequential', 'conditional', 'optional', 'parallel']);

export const WF_ASSIGNEE_TYPES = Object.freeze([
  'direct_manager',
  'department_manager',
  'hr',
  'finance',
  'payroll',
  'specific_user',
  'specific_role',
  'permission_group',
]);

export const WF_ACTIONS = Object.freeze([
  'submit',
  'approve',
  'reject',
  'return',
  'cancel',
  'delegate',
  'escalate',
]);

export const WF_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'returned',
  'skipped',
]);

/**
 * Normalizes text for case-insensitive and whitespace-trimmed comparison
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Evaluates a single workflow condition against a request payload
 * @param {{ field_name: string; operator: string; expected_value: unknown }} condition
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
export function evaluateCondition(condition, payload) {
  if (!condition || !payload || typeof condition !== 'object' || typeof payload !== 'object') {
    return false;
  }

  const { field_name, operator, expected_value } = condition;
  if (!field_name || !operator) return false;

  const actualValue = payload[field_name];
  if (actualValue === undefined || actualValue === null) {
    return false;
  }

  // Numeric comparisons
  if (field_name === 'amount' || field_name === 'days') {
    const numActual = Number(actualValue);
    const numExpected = Number(expected_value);
    if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;

    switch (operator) {
      case 'eq': return numActual === numExpected;
      case 'neq': return numActual !== numExpected;
      case 'gt': return numActual > numExpected;
      case 'gte': return numActual >= numExpected;
      case 'lt': return numActual < numExpected;
      case 'lte': return numActual <= numExpected;
      default: return false;
    }
  }

  // String / array comparisons
  const textActual = normalizeText(actualValue);
  const textExpected = normalizeText(expected_value);

  switch (operator) {
    case 'eq':
      return textActual === textExpected;
    case 'neq':
      return textActual !== textExpected;
    case 'in': {
      if (Array.isArray(expected_value)) {
        return expected_value.some((item) => normalizeText(item) === textActual);
      }
      return textActual === textExpected;
    }
    case 'not_in': {
      if (Array.isArray(expected_value)) {
        return !expected_value.some((item) => normalizeText(item) === textActual);
      }
      return textActual !== textExpected;
    }
    default:
      return false;
  }
}

/**
 * Evaluates whether a workflow stage is eligible to execute given its conditions and the request payload
 * @param {{ stage_type?: string }} stage
 * @param {Array<{ field_name: string; operator: string; expected_value: unknown; is_mandatory?: boolean }>} conditions
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
export function isStageEligible(stage, conditions, payload) {
  if (!stage) return false;
  if (stage.stage_type !== 'conditional') return true;
  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  // All mandatory conditions must pass
  return conditions.every((cond) => {
    if (cond.is_mandatory === false) return true;
    return evaluateCondition(cond, payload);
  });
}

/**
 * Checks if self-approval is forbidden and violated
 * @param {string | null | undefined} applicantEmployeeId
 * @param {string | null | undefined} actorEmployeeId
 * @param {boolean} preventSelfApproval
 * @returns {{ allowed: boolean; reason?: string }}
 */
export function checkSelfApproval(applicantEmployeeId, actorEmployeeId, preventSelfApproval = true) {
  if (!preventSelfApproval) {
    return { allowed: true };
  }

  if (applicantEmployeeId && actorEmployeeId && applicantEmployeeId === actorEmployeeId) {
    return {
      allowed: false,
      reason: 'Self-approval violation: Requester cannot approve their own request',
    };
  }

  return { allowed: true };
}

/**
 * Validates whether an actor has authorization to act on a stage (directly or via active delegation)
 * @param {{ assigned_to_user_id?: string | null; assigned_to_employee_id?: string | null; request_type_id?: string | null }} stageInstance
 * @param {{ user_id?: string | null; employee_id?: string | null; roles?: string[] }} actor
 * @param {Array<{ active?: boolean; delegatee_id: string; delegator_id: string; request_type_id?: string | null; valid_from: string | Date; valid_to: string | Date }>} delegations
 * @param {Date | string} [currentDate]
 * @returns {{ authorized: boolean; isDelegated: boolean; delegatedFrom?: string; reason?: string }}
 */
export function isAuthorizedApprover(stageInstance, actor, delegations = [], currentDate = new Date()) {
  if (!stageInstance || !actor) {
    return { authorized: false, isDelegated: false, reason: 'Invalid parameters' };
  }

  const now = new Date(currentDate);

  // 1. Direct match on user ID
  if (stageInstance.assigned_to_user_id && actor.user_id && stageInstance.assigned_to_user_id === actor.user_id) {
    return { authorized: true, isDelegated: false };
  }

  // 2. Direct match on employee ID
  if (stageInstance.assigned_to_employee_id && actor.employee_id && stageInstance.assigned_to_employee_id === actor.employee_id) {
    return { authorized: true, isDelegated: false };
  }

  // 3. Check active delegations
  if (actor.employee_id && Array.isArray(delegations) && delegations.length > 0) {
    const validDelegation = delegations.find((d) => {
      if (d.active === false) return false;
      if (d.delegatee_id !== actor.employee_id) return false;

      // Delegator check: must match assigned employee if assigned
      if (stageInstance.assigned_to_employee_id && d.delegator_id !== stageInstance.assigned_to_employee_id) {
        return false;
      }

      // Request type check
      if (d.request_type_id && stageInstance.request_type_id && d.request_type_id !== stageInstance.request_type_id) {
        return false;
      }

      // Date validity check
      const from = new Date(d.valid_from);
      const to = new Date(d.valid_to);
      return now >= from && now <= to;
    });

    if (validDelegation) {
      return {
        authorized: true,
        isDelegated: true,
        delegatedFrom: validDelegation.delegator_id,
      };
    }
  }

  // 4. Role-based fallback: If not assigned to specific employee/user, authorization falls back to permission checks
  if (!stageInstance.assigned_to_user_id && !stageInstance.assigned_to_employee_id) {
    return { authorized: true, isDelegated: false };
  }

  return {
    authorized: false,
    isDelegated: false,
    reason: 'Caller is not the assigned approver and holds no active delegation',
  };
}

/**
 * Calculates SLA due timestamp and breach status
 * @param {string | Date} startedAt
 * @param {number} slaHours
 * @param {Date | string} [asOfDate]
 * @returns {{ dueAt: Date; isBreached: boolean; hoursRemaining: number }}
 */
export function calculateStageSla(startedAt, slaHours, asOfDate = new Date()) {
  const start = new Date(startedAt);
  const now = new Date(asOfDate);
  const slaMs = (slaHours || 24) * 60 * 60 * 1000;
  const dueAt = new Date(start.getTime() + slaMs);

  const diffMs = dueAt.getTime() - now.getTime();
  const hoursRemaining = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
  const isBreached = diffMs < 0;

  return { dueAt, isBreached, hoursRemaining };
}

/**
 * Generates an idempotent deduplication key for transactional outbox events
 * @param {string} aggregateId
 * @param {string} eventType
 * @param {string | number} stageIdOrTimestamp
 * @returns {string}
 */
export function generateOutboxDeduplicationKey(aggregateId, eventType, stageIdOrTimestamp) {
  return `${eventType}:${aggregateId}:${stageIdOrTimestamp}`;
}

/**
 * Validates a workflow decision request payload
 * @param {string} action
 * @param {string | null | undefined} rejectionReason
 * @param {string | null | undefined} comments
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateDecisionPayload(action, rejectionReason, comments) {
  if (!WF_ACTIONS.includes(action)) {
    return { valid: false, error: `Invalid action "${action}". Must be one of: ${WF_ACTIONS.join(', ')}` };
  }

  if (action === 'reject') {
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return { valid: false, error: 'Rejection reason is strictly required when rejecting a request' };
    }
  }

  return { valid: true };
}

/**
 * Pure state machine transition for workflow request approvals
 * @param {object} params
 * @param {any} params.requestInstance
 * @param {any} params.currentStage
 * @param {any[]} params.allStages
 * @param {string} params.action
 * @param {any} params.actor
 * @param {string} [params.rejectionReason]
 * @param {string} [params.comments]
 * @param {boolean} [params.preventSelfApproval]
 * @param {Date} [params.now]
 * @returns {{ ok: boolean; error?: string; nextStatus?: string; nextStage?: any; outboxEvent?: any; actionRecord?: any }}
 */
export function advanceWorkflowState({
  requestInstance,
  currentStage,
  allStages = [],
  action,
  actor,
  rejectionReason,
  comments,
  preventSelfApproval = true,
  now = new Date(),
}) {
  const validation = validateDecisionPayload(action, rejectionReason, comments);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  if (requestInstance.status !== 'pending') {
    return { ok: false, error: `Request is already in state "${requestInstance.status}" and cannot be modified` };
  }

  if (action === 'cancel') {
    return {
      ok: true,
      nextStatus: 'cancelled',
      nextStage: null,
      actionRecord: {
        request_instance_id: requestInstance.id,
        action: 'cancel',
        action_at: now.toISOString(),
        actor_user_id: actor.user_id,
        actor_employee_id: actor.employee_id,
        comments,
      },
      outboxEvent: {
        event_type: 'request_cancelled',
        aggregate_id: String(requestInstance.id),
        idempotency_key: generateOutboxDeduplicationKey(requestInstance.id, 'request_cancelled', now.getTime()),
        payload: {
          request_id: requestInstance.id,
          request_number: requestInstance.request_number,
          actor_id: actor.user_id,
          comments,
        },
      },
    };
  }

  if (action === 'approve') {
    const selfCheck = checkSelfApproval(requestInstance.employee_id, actor.employee_id, preventSelfApproval);
    if (!selfCheck.allowed) {
      return { ok: false, error: selfCheck.reason };
    }

    // Find next eligible stage
    const currentOrder = currentStage.stage_order;
    const sorted = [...allStages].sort((a, b) => a.stage_order - b.stage_order);
    const nextStages = sorted.filter((s) => s.stage_order > currentOrder);

    let nextEligible = null;
    for (const stage of nextStages) {
      if (isStageEligible(stage, stage.conditions || [], requestInstance.request_payload || {})) {
        nextEligible = stage;
        break;
      }
    }

    if (nextEligible) {
      return {
        ok: true,
        nextStatus: 'pending',
        nextStage: nextEligible,
        actionRecord: {
          request_instance_id: requestInstance.id,
          stage_instance_id: currentStage.id,
          action: 'approve',
          action_at: now.toISOString(),
          actor_user_id: actor.user_id,
          actor_employee_id: actor.employee_id,
          comments,
        },
        outboxEvent: {
          event_type: 'stage_assigned',
          aggregate_id: String(requestInstance.id),
          idempotency_key: generateOutboxDeduplicationKey(requestInstance.id, 'stage_assigned', nextEligible.id),
          payload: {
            request_id: requestInstance.id,
            request_number: requestInstance.request_number,
            stage_id: nextEligible.id,
            stage_name: nextEligible.name_ar,
            assignee_type: nextEligible.assignee_type,
          },
        },
      };
    } else {
      // Final stage reached
      return {
        ok: true,
        nextStatus: 'approved',
        nextStage: null,
        actionRecord: {
          request_instance_id: requestInstance.id,
          stage_instance_id: currentStage.id,
          action: 'approve',
          action_at: now.toISOString(),
          actor_user_id: actor.user_id,
          actor_employee_id: actor.employee_id,
          comments,
        },
        outboxEvent: {
          event_type: 'final_approved',
          aggregate_id: String(requestInstance.id),
          idempotency_key: generateOutboxDeduplicationKey(requestInstance.id, 'final_approved', now.getTime()),
          payload: {
            request_id: requestInstance.id,
            request_number: requestInstance.request_number,
            employee_id: requestInstance.employee_id,
            approved_at: now.toISOString(),
          },
        },
      };
    }
  }

  if (action === 'reject') {
    return {
      ok: true,
      nextStatus: 'rejected',
      nextStage: null,
      actionRecord: {
        request_instance_id: requestInstance.id,
        stage_instance_id: currentStage.id,
        action: 'reject',
        action_at: now.toISOString(),
        actor_user_id: actor.user_id,
        actor_employee_id: actor.employee_id,
        rejection_reason: rejectionReason,
        comments,
      },
      outboxEvent: {
        event_type: 'stage_rejected',
        aggregate_id: String(requestInstance.id),
        idempotency_key: generateOutboxDeduplicationKey(requestInstance.id, 'stage_rejected', currentStage.id),
        payload: {
          request_id: requestInstance.id,
          request_number: requestInstance.request_number,
          stage_id: currentStage.id,
          stage_name: currentStage.name_ar,
          rejection_reason: rejectionReason,
          actor_id: actor.user_id,
        },
      },
    };
  }

  return { ok: false, error: `Unhandled action ${action}` };
}
