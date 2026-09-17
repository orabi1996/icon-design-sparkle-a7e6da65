import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateCondition,
  isStageEligible,
  checkSelfApproval,
  isAuthorizedApprover,
  calculateStageSla,
  generateOutboxDeduplicationKey,
  validateDecisionPayload,
  advanceWorkflowState,
} from '../src/lib/workflow-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

test('Workflow Domain: Condition Evaluation Engine (Numeric & Text)', () => {
  // Numeric: amount > 5000
  assert.equal(
    evaluateCondition({ field_name: 'amount', operator: 'gt', expected_value: 5000 }, { amount: 7500 }),
    true
  );
  assert.equal(
    evaluateCondition({ field_name: 'amount', operator: 'gt', expected_value: 5000 }, { amount: 3000 }),
    false
  );
  assert.equal(
    evaluateCondition({ field_name: 'amount', operator: 'gte', expected_value: 5000 }, { amount: 5000 }),
    true
  );

  // Numeric: days <= 3
  assert.equal(
    evaluateCondition({ field_name: 'days', operator: 'lte', expected_value: 3 }, { days: 2 }),
    true
  );
  assert.equal(
    evaluateCondition({ field_name: 'days', operator: 'lte', expected_value: 3 }, { days: 5 }),
    false
  );

  // Text: leave_type in ['annual', 'unpaid']
  assert.equal(
    evaluateCondition(
      { field_name: 'leave_type', operator: 'in', expected_value: ['annual', 'unpaid'] },
      { leave_type: 'ANNUAL' }
    ),
    true
  );
  assert.equal(
    evaluateCondition(
      { field_name: 'leave_type', operator: 'in', expected_value: ['annual', 'unpaid'] },
      { leave_type: 'maternity' }
    ),
    false
  );

  // Missing field in payload returns false
  assert.equal(
    evaluateCondition({ field_name: 'non_existent', operator: 'eq', expected_value: 'foo' }, { amount: 100 }),
    false
  );
});

test('Workflow Domain: Conditional Stage Eligibility & Skipping', () => {
  const sequentialStage = { stage_type: 'sequential' };
  assert.equal(isStageEligible(sequentialStage, [], {}), true);

  const conditionalStage = { stage_type: 'conditional' };
  const conditions = [
    { field_name: 'amount', operator: 'gt', expected_value: 10000, is_mandatory: true },
  ];

  // Fails condition: should skip stage
  assert.equal(isStageEligible(conditionalStage, conditions, { amount: 4000 }), false);

  // Passes condition: should execute stage
  assert.equal(isStageEligible(conditionalStage, conditions, { amount: 15000 }), true);
});

test('Workflow Domain: Configurable Self-Approval Prevention', () => {
  const applicantEmpId = 'emp-001';
  const approverEmpId = 'emp-001';
  const otherEmpId = 'emp-002';

  // Prevent self approval = true
  const blocked = checkSelfApproval(applicantEmpId, approverEmpId, true);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /Self-approval violation/);

  // Another employee approving: allowed
  const allowedDifferent = checkSelfApproval(applicantEmpId, otherEmpId, true);
  assert.equal(allowedDifferent.allowed, true);

  // Policy allows self approval (e.g. single-owner company): allowed
  const allowedByPolicy = checkSelfApproval(applicantEmpId, approverEmpId, false);
  assert.equal(allowedByPolicy.allowed, true);
});

test('Workflow Domain: Active Delegation Validation & Temporal Windows', () => {
  const stageInstance = {
    assigned_to_employee_id: 'manager-01',
    request_type_id: 'req-leave',
  };

  const actor = {
    employee_id: 'deputy-02',
    user_id: 'user-deputy',
  };

  const delegations = [
    {
      delegator_id: 'manager-01',
      delegatee_id: 'deputy-02',
      request_type_id: 'req-leave',
      valid_from: '2026-09-01T00:00:00Z',
      valid_to: '2026-09-30T23:59:59Z',
      active: true,
    },
  ];

  // Within valid window: authorized via delegation
  const inWindow = isAuthorizedApprover(
    stageInstance,
    actor,
    delegations,
    new Date('2026-09-15T12:00:00Z')
  );
  assert.equal(inWindow.authorized, true);
  assert.equal(inWindow.isDelegated, true);
  assert.equal(inWindow.delegatedFrom, 'manager-01');

  // Outside valid window (expired): unauthorized
  const expired = isAuthorizedApprover(
    stageInstance,
    actor,
    delegations,
    new Date('2026-10-05T12:00:00Z')
  );
  assert.equal(expired.authorized, false);

  // Inactive delegation: unauthorized
  const inactive = isAuthorizedApprover(
    stageInstance,
    actor,
    [{ ...delegations[0], active: false }],
    new Date('2026-09-15T12:00:00Z')
  );
  assert.equal(inactive.authorized, false);

  // Unrelated person without delegation: unauthorized
  const stranger = { employee_id: 'stranger-99' };
  const strangerCheck = isAuthorizedApprover(
    stageInstance,
    stranger,
    delegations,
    new Date('2026-09-15T12:00:00Z')
  );
  assert.equal(strangerCheck.authorized, false);
});

test('Workflow Domain: Decision Payload Validation & Rejection Reason Mandate', () => {
  // Reject without reason must fail
  const noReason = validateDecisionPayload('reject', '');
  assert.equal(noReason.valid, false);
  assert.match(noReason.error, /Rejection reason is strictly required/);

  const nullReason = validateDecisionPayload('reject', null);
  assert.equal(nullReason.valid, false);

  // Reject with reason succeeds
  const withReason = validateDecisionPayload('reject', 'خارج رصيد الإجازات المتاح');
  assert.equal(withReason.valid, true);

  // Approve without reason succeeds
  const approveOk = validateDecisionPayload('approve');
  assert.equal(approveOk.valid, true);

  // Invalid action fails
  const badAction = validateDecisionPayload('unknown_action');
  assert.equal(badAction.valid, false);
});

test('Workflow Domain: Multi-Stage Sequential Chain State Transition', () => {
  const stage1 = { id: 'stg-1', stage_order: 1, name_ar: 'المدير المباشر', stage_type: 'sequential', assignee_type: 'direct_manager' };
  const stage2 = { id: 'stg-2', stage_order: 2, name_ar: 'الموارد البشرية', stage_type: 'sequential', assignee_type: 'hr' };
  const allStages = [stage1, stage2];

  const request = {
    id: 'req-inst-100',
    request_number: 5001,
    employee_id: 'emp-applicant',
    status: 'pending',
    request_payload: {},
  };

  const actorManager = { user_id: 'user-mgr', employee_id: 'emp-mgr' };

  // 1. Stage 1 Approved -> Advances to Stage 2
  const transition1 = advanceWorkflowState({
    requestInstance: request,
    currentStage: stage1,
    allStages,
    action: 'approve',
    actor: actorManager,
    comments: 'معتمد من المدير المباشر',
  });

  assert.equal(transition1.ok, true);
  assert.equal(transition1.nextStatus, 'pending');
  assert.equal(transition1.nextStage?.id, 'stg-2');
  assert.equal(transition1.outboxEvent?.event_type, 'stage_assigned');
  assert.equal(transition1.actionRecord?.action, 'approve');

  // 2. Stage 2 Approved -> Final Approval
  const actorHr = { user_id: 'user-hr', employee_id: 'emp-hr' };
  const transition2 = advanceWorkflowState({
    requestInstance: request,
    currentStage: stage2,
    allStages,
    action: 'approve',
    actor: actorHr,
    comments: 'اعتماد الموارد البشرية النهائي',
  });

  assert.equal(transition2.ok, true);
  assert.equal(transition2.nextStatus, 'approved');
  assert.equal(transition2.nextStage, null);
  assert.equal(transition2.outboxEvent?.event_type, 'final_approved');
});

test('Workflow Domain: SLA Tracking & Breach Computation', () => {
  const startedAt = '2026-09-17T08:00:00Z';
  const slaHours = 24;

  // Check 5 hours in: not breached, ~19 hours remaining
  const check1 = calculateStageSla(startedAt, slaHours, new Date('2026-09-17T13:00:00Z'));
  assert.equal(check1.isBreached, false);
  assert.equal(check1.hoursRemaining, 19);

  // Check 30 hours in: breached, negative hours remaining
  const check2 = calculateStageSla(startedAt, slaHours, new Date('2026-09-18T14:00:00Z'));
  assert.equal(check2.isBreached, true);
  assert.ok(check2.hoursRemaining < 0);
});

test('Workflow Domain: Transactional Outbox Decoupling & Deduplication Keys', () => {
  const key1 = generateOutboxDeduplicationKey('req-101', 'stage_assigned', 'stg-2');
  const key2 = generateOutboxDeduplicationKey('req-101', 'stage_assigned', 'stg-2');
  assert.equal(key1, key2);

  const key3 = generateOutboxDeduplicationKey('req-101', 'stage_assigned', 'stg-3');
  assert.notEqual(key1, key3);
});

test('Workflow Domain: Database Migration SQL Contract (Static Verification)', () => {
  const migrationPath = path.join(
    REPO_ROOT,
    'supabase/migrations/20260918040000_requests_workflow_approval_domain.sql'
  );
  assert.ok(fs.existsSync(migrationPath), 'Migration SQL file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify all required entities
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_request_types/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_definitions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_stages/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_conditions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_delegations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_request_instances/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_stage_instances/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_request_actions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_comments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_attachments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.wf_outbox_events/);

  // Verify immutability triggers (zero updates, zero deletes on audit and comments)
  assert.match(sql, /prevent_wf_audit_tampering/);
  assert.match(sql, /trg_prevent_wf_request_actions_tampering/);
  assert.match(sql, /trg_prevent_wf_comments_tampering/);

  // Verify atomic stored procedure
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.execute_workflow_decision/);

  // Verify delegation constraints
  assert.match(sql, /wf_delegations_no_self_delegation/);
  assert.match(sql, /wf_delegations_date_check/);

  // Verify zero anon access
  assert.match(sql, /REVOKE ALL ON public\.wf_request_types FROM anon/);
  assert.match(sql, /REVOKE ALL ON public\.wf_request_actions FROM anon/);
  assert.match(sql, /REVOKE ALL ON public\.wf_outbox_events FROM anon/);
});
