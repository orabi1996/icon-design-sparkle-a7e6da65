import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  evaluateCondition,
  isStageEligible,
  checkSelfApproval,
  isAuthorizedApprover,
  calculateStageSla,
  generateOutboxDeduplicationKey,
  validateDecisionPayload,
  advanceWorkflowState,
  type WfStage,
  type WfRequestInstance,
  type WfDelegation,
} from "./workflow-core.mjs";
import { notifyWorkflow } from "./email/dispatcher";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. Submit a workflow request instance with version locking
 */
export const submitWorkflowRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        requestTypeCode: z.string().min(1),
        title: z.string().trim().min(2, "عنوان الطلب مطلوب"),
        details: z.string().trim().optional().nullable(),
        employeeId: z.string().uuid("معرّف الموظف مطلوب"),
        requestPayload: z.record(z.unknown()).default({}),
        sourceTable: z.string().optional().nullable(),
        sourceRecordId: z.string().uuid().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(
      context,
      "requests",
      "create",
      { type: "all" }
    );

    const db = await getAdminDb();

    // 1. Fetch request type
    const { data: reqType, error: reqTypeError } = await db
      .from("wf_request_types")
      .select("*")
      .eq("code", data.requestTypeCode)
      .single();

    if (reqTypeError || !reqType) {
      throw new Error(`نوع الطلب "${data.requestTypeCode}" غير مسجل في النظام`);
    }

    // 2. Fetch active workflow definition & published version
    const { data: wfDef, error: wfDefError } = await db
      .from("wf_definitions")
      .select("id, code, name_ar, active_version_id")
      .eq("request_type_id", reqType["id"])
      .eq("active", true)
      .maybeSingle();

    if (wfDefError || !wfDef || !wfDef["active_version_id"]) {
      throw new Error(`لا يوجد مسار اعتماد معتمد ومفعل لنوع الطلب "${reqType["name_ar"]}"`);
    }

    const versionId = String(wfDef["active_version_id"]);

    // 3. Fetch all stages and conditions for this published version
    const { data: stages = [] } = await db
      .from("wf_stages")
      .select(`
        id,
        stage_order,
        code,
        name_ar,
        name_en,
        stage_type,
        assignee_type,
        assignee_target_id,
        sla_hours,
        can_send_back,
        require_comment_on_reject,
        wf_conditions (
          id,
          field_name,
          operator,
          expected_value,
          is_mandatory
        )
      `)
      .eq("version_id", versionId)
      .order("stage_order", { ascending: true });

    if (stages.length === 0) {
      throw new Error("مسار الاعتماد لا يحتوي على مراحل محددة");
    }

    // 4. Find first eligible stage
    const mappedStages = stages.map((s: any) => ({
      ...s,
      conditions: s.wf_conditions || [],
    }));

    let initialStage: any = null;
    for (const s of mappedStages) {
      if (isStageEligible(s, s.conditions, data.requestPayload)) {
        initialStage = s;
        break;
      }
    }

    if (!initialStage) {
      throw new Error("لا توجد مراحل اعتماد مؤهلة لهذا الطلب وفق شروط النظام");
    }

    // 5. Create Request Instance (Locked to this version)
    const now = new Date();
    const { data: instance, error: instError } = await db
      .from("wf_request_instances")
      .insert({
        tenant_id: data.tenantId,
        company_id: data.companyId,
        request_type_id: reqType["id"],
        workflow_version_id: versionId,
        employee_id: data.employeeId,
        applicant_user_id: actor.userId,
        title: data.title,
        details: data.details || null,
        request_payload: data.requestPayload,
        current_stage_id: initialStage.id,
        current_stage_order: initialStage.stage_order,
        status: "pending",
        source_table: data.sourceTable || null,
        source_record_id: data.sourceRecordId || null,
        created_by: actor.userId,
      })
      .select()
      .single();

    if (instError || !instance) {
      throw new Error(`فشل إنشاء الطلب: ${instError?.message || "خطأ غير متوقع"}`);
    }

    // 6. Create Initial Stage Instance
    const slaInfo = calculateStageSla(now, initialStage.sla_hours, now);
    const { data: stageInst, error: stageInstError } = await db
      .from("wf_stage_instances")
      .insert({
        request_instance_id: instance["id"],
        stage_id: initialStage.id,
        stage_order: initialStage.stage_order,
        status: "pending",
        assigned_to_role: initialStage.assignee_type,
        due_at: slaInfo.dueAt.toISOString(),
        started_at: now.toISOString(),
      })
      .select()
      .single();

    if (stageInstError) {
      throw new Error(`فشل تسجيل مرحلة الاعتماد الأولى: ${stageInstError.message}`);
    }

    // 7. Record Immutable Initial Action
    await db.from("wf_request_actions").insert({
      request_instance_id: instance["id"],
      stage_instance_id: stageInst?.["id"] || null,
      actor_user_id: actor.userId,
      action: "submit",
      action_at: now.toISOString(),
      comments: data.details || "تم تقديم الطلب",
    });

    // 8. Atomically queue Transactional Outbox Event
    const outboxKey = generateOutboxDeduplicationKey(instance["id"], "request_created", now.getTime());
    await db.from("wf_outbox_events").insert({
      tenant_id: data.tenantId,
      event_type: "request_created",
      aggregate_type: "workflow_request",
      aggregate_id: String(instance["id"]),
      idempotency_key: outboxKey,
      payload: {
        request_id: instance["id"],
        request_number: instance["request_number"],
        request_type: reqType["name_ar"],
        employee_id: data.employeeId,
        title: data.title,
        current_stage: initialStage.name_ar,
      },
    });

    // 9. Backwards compatibility: add row to legacy approval_requests if not linked to another source
    if (!data.sourceTable) {
      const { data: emp } = await db.from("employees").select("full_name, emp_no, branch, department").eq("id", data.employeeId).single();
      await db.from("approval_requests").insert({
        request_number: instance["request_number"],
        request_instance_id: instance["id"],
        tenant_id: data.tenantId,
        company_id: data.companyId,
        employee_id: data.employeeId,
        employee_name: emp?.full_name || "موظف",
        emp_no: emp?.emp_no || null,
        branch: emp?.branch || null,
        department: emp?.department || null,
        request_type: reqType["name_ar"],
        request_subject: data.title,
        request_details: data.details || null,
        approval_chain: initialStage.name_ar,
        awaiting_stage: initialStage.name_ar,
        status: "pending",
      });
    }

    // 10. Trigger outbox worker asynchronously (fail-safe)
    void processWorkflowOutboxFn({ data: { tenantId: data.tenantId } }).catch(() => {});

    await logSecurityAudit(db, {
      eventType: "user_created",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "requests",
      action: "create",
      details: { title: data.title, requestType: reqType["code"], requestId: instance["id"] },
    });

    return { ok: true, requestInstance: instance };
  });

/**
 * 2. Decide on a workflow stage (Approve, Reject, Cancel, Return)
 */
export const decideWorkflowStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        requestInstanceId: z.string().uuid("معرّف الطلب مطلوب"),
        action: z.enum(["approve", "reject", "cancel", "return"]),
        rejectionReason: z.string().trim().optional().nullable(),
        comments: z.string().trim().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const requiredAction = data.action === "cancel" ? "cancel" : "approve";
    const actor = await requirePermission(
      context,
      "requests",
      requiredAction,
      { type: "all" }
    );

    const db = await getAdminDb();

    // Rejection validation
    if (data.action === "reject" && (!data.rejectionReason || !data.rejectionReason.trim())) {
      throw new Error("سبب الرفض إلزامي عند رفض الطلب");
    }

    // Find actor's employee record if any
    let actorEmployeeId: string | null = null;
    if (actor.empNo) {
      const { data: emp } = await db.from("employees").select("id").eq("emp_no", actor.empNo).maybeSingle();
      if (emp) actorEmployeeId = emp.id;
    }

    // Call stored procedure execute_workflow_decision
    const { data: rpcResult, error: rpcError } = await db.rpc("execute_workflow_decision", {
      p_request_instance_id: data.requestInstanceId,
      p_action: data.action,
      p_actor_user_id: actor.userId,
      p_actor_employee_id: actorEmployeeId,
      p_rejection_reason: data.rejectionReason || null,
      p_comments: data.comments || null,
    });

    if (rpcError) {
      throw new Error(`تعذر تنفيذ قرار الاعتماد: ${rpcError.message}`);
    }

    // Trigger Outbox worker asynchronously (never blocks decision)
    void processWorkflowOutboxFn({ data: { tenantId: actor.tenantId || null } }).catch(() => {});

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "requests",
      action: data.action,
      details: { requestId: data.requestInstanceId, action: data.action, reason: data.rejectionReason },
    });

    return { ok: true, result: rpcResult };
  });

/**
 * 3. List Pending Approvals for current user (including delegations)
 */
export const listPendingApprovalsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid().optional().nullable(),
        companyId: z.string().uuid().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(
      context,
      "requests",
      "read",
      { type: "all" }
    );

    const db = await getAdminDb();

    // Actor's employee record
    let actorEmployeeId: string | null = null;
    if (actor.empNo) {
      const { data: emp } = await db.from("employees").select("id").eq("emp_no", actor.empNo).maybeSingle();
      if (emp) actorEmployeeId = emp.id;
    }

    // Fetch active delegations for caller
    const nowIso = new Date().toISOString();
    let delegatedFromIds: string[] = [];
    if (actorEmployeeId) {
      const { data: dels = [] } = await db
        .from("wf_delegations")
        .select("delegator_id")
        .eq("active", true)
        .eq("delegatee_id", actorEmployeeId)
        .lte("valid_from", nowIso)
        .gte("valid_to", nowIso);
      delegatedFromIds = dels.map((d: any) => d.delegator_id);
    }

    // Query pending stage instances
    const query = db
      .from("wf_stage_instances")
      .select(`
        id,
        request_instance_id,
        stage_id,
        stage_order,
        status,
        due_at,
        started_at,
        assigned_to_role,
        assigned_to_user_id,
        assigned_to_employee_id,
        wf_stages (
          code,
          name_ar,
          assignee_type,
          sla_hours
        ),
        wf_request_instances (
          id,
          request_number,
          title,
          details,
          request_payload,
          submitted_at,
          employee_id,
          employees (
            id,
            emp_no,
            full_name,
            branch,
            department
          ),
          wf_request_types (
            code,
            name_ar,
            category
          )
        )
      `)
      .eq("status", "pending")
      .order("started_at", { ascending: false });

    const { data: rows = [], error } = await query;
    if (error) {
      throw new Error(`فشل استرجاع طلبات الاعتماد المعلقة: ${error.message}`);
    }

    // Filter by authorization:
    // 1. assigned to current user
    // 2. assigned to current employee
    // 3. delegated to current employee
    // 4. role-based matching user's permissions
    const accessible = rows.filter((row: any) => {
      if (row.assigned_to_user_id && row.assigned_to_user_id === actor.userId) return true;
      if (row.assigned_to_employee_id && actorEmployeeId && row.assigned_to_employee_id === actorEmployeeId) return true;
      if (row.assigned_to_employee_id && delegatedFromIds.includes(row.assigned_to_employee_id)) return true;
      if (!row.assigned_to_user_id && !row.assigned_to_employee_id) return true; // generic role/group stage
      return false;
    });

    return {
      ok: true,
      pendingApprovals: accessible.map((item: any) => {
        const sla = calculateStageSla(item.started_at, item.wf_stages?.sla_hours || 24);
        const isDelegated = Boolean(
          item.assigned_to_employee_id &&
          delegatedFromIds.includes(item.assigned_to_employee_id) &&
          item.assigned_to_employee_id !== actorEmployeeId
        );

        return {
          stageInstanceId: item.id,
          requestInstanceId: item.request_instance_id,
          requestNumber: item.wf_request_instances?.request_number,
          title: item.wf_request_instances?.title,
          details: item.wf_request_instances?.details,
          requestType: item.wf_request_instances?.wf_request_types?.name_ar,
          employeeName: item.wf_request_instances?.employees?.full_name,
          empNo: item.wf_request_instances?.employees?.emp_no,
          branch: item.wf_request_instances?.employees?.branch,
          department: item.wf_request_instances?.employees?.department,
          stageName: item.wf_stages?.name_ar,
          stageOrder: item.stage_order,
          dueAt: sla.dueAt.toISOString(),
          isSlaBreached: sla.isBreached,
          hoursRemaining: sla.hoursRemaining,
          isDelegated,
          submittedAt: item.wf_request_instances?.submitted_at,
        };
      }),
    };
  });

/**
 * 4. Get Immutable Approval History & Timeline for a Request
 */
export const getRequestApprovalHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        requestInstanceId: z.string().uuid("معرّف الطلب مطلوب"),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    await requirePermission(
      context,
      "requests",
      "read",
      { type: "all" }
    );

    const db = await getAdminDb();

    // 1. Fetch request instance
    const { data: instance, error: instErr } = await db
      .from("wf_request_instances")
      .select(`
        *,
        wf_request_types (*),
        employees (*)
      `)
      .eq("id", data.requestInstanceId)
      .single();

    if (instErr || !instance) {
      throw new Error("الطلب غير موجود");
    }

    // 2. Fetch stages
    const { data: stages = [] } = await db
      .from("wf_stage_instances")
      .select(`
        *,
        wf_stages (*)
      `)
      .eq("request_instance_id", data.requestInstanceId)
      .order("stage_order", { ascending: true });

    // 3. Fetch immutable actions
    const { data: actions = [] } = await db
      .from("wf_request_actions")
      .select(`
        *,
        employees (full_name, emp_no)
      `)
      .eq("request_instance_id", data.requestInstanceId)
      .order("action_at", { ascending: true });

    // 4. Fetch comments
    const { data: comments = [] } = await db
      .from("wf_comments")
      .select("*")
      .eq("request_instance_id", data.requestInstanceId)
      .order("created_at", { ascending: true });

    return {
      ok: true,
      instance,
      stages,
      actions,
      comments,
    };
  });

/**
 * 5. Save/Update Workflow Delegation
 */
export const saveDelegationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        id: z.string().uuid().optional(),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid().optional().nullable(),
        delegatorId: z.string().uuid("معرّف المفوّض مطلوب"),
        delegateeId: z.string().uuid("معرّف المفوّض إليه مطلوب"),
        requestTypeId: z.string().uuid().optional().nullable(),
        validFrom: z.string().min(1, "تاريخ بدء التفويض مطلوب"),
        validTo: z.string().min(1, "تاريخ انتهاء التفويض مطلوب"),
        reason: z.string().trim().optional().nullable(),
        active: z.boolean().default(true),
      })
      .refine((data) => data.delegatorId !== data.delegateeId, {
        message: "لا يمكن تفويض الصلاحية لنفس الشخص (Self-delegation forbidden)",
        path: ["delegateeId"],
      })
      .refine((data) => new Date(data.validTo) >= new Date(data.validFrom), {
        message: "تاريخ انتهاء التفويض يجب أن يكون بعد تاريخ البدء",
        path: ["validTo"],
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(
      context,
      "requests",
      "configure",
      { type: "all" }
    );

    const db = await getAdminDb();

    const record = {
      tenant_id: data.tenantId,
      company_id: data.companyId || null,
      delegator_id: data.delegatorId,
      delegatee_id: data.delegateeId,
      request_type_id: data.requestTypeId || null,
      valid_from: new Date(data.validFrom).toISOString(),
      valid_to: new Date(data.validTo).toISOString(),
      reason: data.reason || null,
      active: data.active,
      created_by: actor.userId,
    };

    let result;
    if (data.id) {
      const { data: updated, error } = await db
        .from("wf_delegations")
        .update(record)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(`فشل تحديث التفويض: ${error.message}`);
      result = updated;
    } else {
      const { data: created, error } = await db
        .from("wf_delegations")
        .insert(record)
        .select()
        .single();
      if (error) throw new Error(`فشل إنشاء التفويض: ${error.message}`);
      result = created;
    }

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "requests",
      action: data.id ? "update" : "create",
      details: { delegationId: result.id, delegator: data.delegatorId, delegatee: data.delegateeId },
    });

    return { ok: true, delegation: result };
  });

/**
 * 6. Transactional Outbox Background Processor
 * Delivers pending outbox events safely without affecting transaction integrity.
 */
export const processWorkflowOutboxFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid().optional().nullable(),
        limit: z.number().min(1).max(100).default(20),
      })
      .parse(input);
  })
  .handler(async ({ data }) => {
    const db = await getAdminDb();

    let query = db
      .from("wf_outbox_events")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(data.limit);

    if (data.tenantId) {
      query = query.eq("tenant_id", data.tenantId);
    }

    const { data: events = [], error } = await query;
    if (error || !events.length) {
      return { ok: true, processed: 0 };
    }

    let processedCount = 0;

    for (const evt of events) {
      // Mark event processing
      await db
        .from("wf_outbox_events")
        .update({ status: "processing" })
        .eq("id", evt.id);

      try {
        // Dispatch email notification safely
        await notifyWorkflow({
          eventType: evt.event_type,
          requestId: evt.aggregate_id,
          requestNumber: evt.payload?.request_number || 0,
          requestType: evt.payload?.request_type || "طلب إداري",
          employeeId: evt.payload?.employee_id,
          employeeName: evt.payload?.employee_name || "الموظف",
          currentStage: evt.payload?.current_stage || evt.payload?.stage_name,
          currentStatus: evt.event_type === "final_approved" ? "معتمد" : evt.event_type === "stage_rejected" ? "مرفوض" : "بانتظار الاعتماد",
          actionDate: new Date().toLocaleDateString("ar-SA"),
        });

        // Mark completed
        await db
          .from("wf_outbox_events")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", evt.id);

        processedCount++;
      } catch (err: any) {
        const retryCount = (evt.retry_count || 0) + 1;
        const nextStatus = retryCount >= 5 ? "dead_letter" : "pending";

        await db
          .from("wf_outbox_events")
          .update({
            status: nextStatus,
            retry_count: retryCount,
            last_error: err?.message || "Outbox dispatch failed",
          })
          .eq("id", evt.id);
      }
    }

    return { ok: true, processed: processedCount };
  });
