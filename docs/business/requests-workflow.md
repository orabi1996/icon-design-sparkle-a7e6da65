# Central Requests & Approval Workflow Engine

## 1. Overview & Architectural Goals

The **Central Requests & Approval Workflow Engine** provides an enterprise-grade, unified approval workflow domain for all request types in the HRMS (leaves, loans, permits, inquiries, end-of-service, letters, and custom enterprise requests).

It eliminates fragmented, hardcoded per-module approval loops by enforcing:
1. **Multi-Stage Approval Chains**: Supports sequential, conditional, optional, and parallel execution paths.
2. **Versioned Definitions**: Requests lock immutably to the workflow version published at time of submission. Changes to workflow configurations increment the version and never mutate active in-flight requests.
3. **Dynamic & Role-Based Assignees**: Direct Manager, Department Manager, HR, Finance, Payroll, Specific User, Specific Role, or Permission Group.
4. **Server-Enforced Condition Engine**: Stage execution evaluated against request payload criteria (e.g. `amount > 5000`, `days >= 3`, `leave_type in ['annual', 'unpaid']`, `branch_id`, `department_id`, `employee_level`).
5. **Configurable Prevention of Self-Approval**: Strict validation preventing applicants from approving their own requests, with tenant-level policy control.
6. **Delegation with Temporal Validity**: Approvers can delegate authority with strict `valid_from` and `valid_to` date boundaries and prevention of self-delegation.
7. **Mandatory Rejection Reasons**: Any rejection requires a clear, non-empty business explanation recorded permanently in the audit trail.
8. **Tamper-Proof Audit History**: Database triggers strictly block `UPDATE` and `DELETE` on decisions (`wf_request_actions`) and comments (`wf_comments`).
9. **Transactional Outbox (`wf_outbox_events`)**: Decouples business state transactions from SMTP delivery. Business decisions are committed reliably regardless of third-party mail transport status.
10. **Zero Anonymous Access & Granular Multi-Tenant RLS**: Access is restricted to authenticated tenant members with explicit permission checks (`hr_is_tenant_member`, `hr_can_manage_tenant`).

---

## 2. Relational Schema & Entities

```
+-------------------+        +--------------------+        +--------------------+
| wf_request_types  | 1    * |   wf_definitions   | 1    * |    wf_versions     |
+-------------------+--------+--------------------+--------+--------------------+
                                                                     | 1
                                                                     |
                                                                     | *
+-------------------+        +--------------------+        +--------------------+
|   wf_conditions   | *    1 |     wf_stages      |        |wf_request_instances|
+-------------------+--------+--------------------+        +--------------------+
                                                                     | 1
                                                                     |
                                                                     | *
+-------------------+        +--------------------+        +--------------------+
| wf_outbox_events  |        | wf_stage_instances | 1    * | wf_request_actions |
+-------------------+        +--------------------+--------+--------------------+
```

### Key Tables:
- `wf_request_types`: Master catalog of request categories (`hr`, `finance`, `operations`, `administrative`, `general`) with configurable self-approval and cancellation policies.
- `wf_definitions`: Master workflow container per company and request type.
- `wf_versions`: Version history (`draft`, `published`, `archived`) with effective dates and snapshot metadata.
- `wf_stages`: Individual stages defining order, assignee type, SLA target hours, and behavior.
- `wf_conditions`: Rule criteria evaluated server-side to determine conditional stage activation.
- `wf_delegations`: Explicit authority delegation between employees with date ranges.
- `wf_request_instances`: In-flight and completed requests locked to a specific `workflow_version_id`.
- `wf_stage_instances`: Active stage state, assignee, SLA target due date, and breach tracking.
- `wf_request_actions`: Append-only, tamper-proof historical log of all actions (`submit`, `approve`, `reject`, `return`, `cancel`, `delegate`).
- `wf_comments`: Immutable request discussion thread.
- `wf_outbox_events`: Transactional outbox records processed asynchronously with deduplication keys and retry limits.

---

## 3. Workflow Progression & Business Rules

### 3.1 Submission Phase
1. Requester submits a request through `submitWorkflowRequestFn`.
2. Engine resolves the active `wf_definitions` and its published `wf_versions`.
3. An instance is created in `wf_request_instances` permanently bound to `workflow_version_id`.
4. Stage 1 is evaluated: if sequential, it activates immediately; if conditional, conditions are checked against `request_payload`.
5. `wf_stage_instances` is created with SLA deadline `due_at = now() + sla_hours`.
6. An immutable action (`submit`) is recorded in `wf_request_actions`.
7. A `request_created` event is enqueued in `wf_outbox_events`.

### 3.2 Decision Phase (Approval / Rejection)
1. Approver invokes `decideWorkflowStageFn`.
2. `execute_workflow_decision` stored procedure executes under row-level locks (`FOR UPDATE`):
   - Confirms request is `pending`.
   - **Self-Approval Check**: Verifies that actor != applicant when `prevent_self_approval = true`.
   - **Authorization Check**: Confirms caller is direct assignee or has an active `wf_delegations` covering `now()`.
   - If action is **Reject**: Enforces non-empty `rejection_reason`, marks instance `rejected`, logs action, and enqueues `stage_rejected` outbox event.
   - If action is **Approve**: Marks current stage `approved`, resolves next eligible stage. If next stage exists, activates it with new SLA due date. If final stage, marks request `approved` with timestamp and enqueues `final_approved` outbox event.
3. Whole sequence executes atomically in a single database transaction.

### 3.3 Transactional Outbox Pattern
To prevent business operations from failing due to SMTP timeouts or network interruptions:
1. Every state transition atomically inserts a notification event into `wf_outbox_events`.
2. The asynchronous outbox processor (`processWorkflowOutboxFn`) batches pending events.
3. Successfully sent emails update the event to `completed`.
4. Failed deliveries increment `retry_count` and log the error, retrying up to 5 times before transitioning to `dead_letter`.
5. Business data is never rolled back due to notification delivery issues.

---

## 4. Verification & Testing

The workflow engine is tested natively with `node --test tests/workflow-engine.test.mjs`:
- Condition evaluation (numeric `gt`, `gte`, `lt`, `lte`, text `in`, `not_in`).
- Conditional stage skipping and execution.
- Configurable self-approval prevention.
- Temporal delegation boundaries and expired delegation blocking.
- Rejection reason mandate.
- Multi-stage sequential chain progression.
- SLA deadline calculation and breach detection.
- Transactional Outbox deduplication key idempotency.
- Static SQL migration contract verification.
