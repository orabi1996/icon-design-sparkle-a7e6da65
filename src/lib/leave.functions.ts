import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  calculateDeductibleDays,
  detectDateOverlap,
  computeBalanceFromLedger,
  validateLeaveEligibility,
  validatePermitQuota,
  toIsoDate,
  type LeavePolicy,
} from "./leave-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. Submit Leave Request with Overlap Detection, Working Calendar, and Ledger Reservation
 */
export const submitLeaveRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        employeeId: z.string().uuid("معرّف الموظف مطلوب"),
        leavePolicyId: z.string().uuid("معرّف سياسة الإجازة مطلوب"),
        fromDate: z.string().min(1, "تاريخ البداية مطلوب"),
        toDate: z.string().min(1, "تاريخ النهاية مطلوب"),
        notes: z.string().trim().optional().nullable(),
        attachmentUrl: z.string().trim().optional().nullable(),
      })
      .refine((data) => new Date(data.toDate) >= new Date(data.fromDate), {
        message: "تاريخ النهاية يجب أن يكون بعد أو يطابق تاريخ البداية",
        path: ["toDate"],
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(
      context,
      "leaves",
      "create",
      { type: "all" }
    );

    const db = await getAdminDb();

    // 1. Fetch employee master details
    const { data: emp, error: empErr } = await db
      .from("employees")
      .select("id, emp_no, full_name, gender, employment_status, branch, department")
      .eq("id", data.employeeId)
      .single();

    if (empErr || !emp) {
      throw new Error("بيانات الموظف غير موجودة في النظام");
    }

    // 2. Fetch leave policy
    const { data: policy, error: polErr } = await db
      .from("leave_policies")
      .select("*")
      .eq("id", data.leavePolicyId)
      .eq("active", true)
      .single();

    if (polErr || !policy) {
      throw new Error("سياسة الإجازة غير مفعلة أو غير موجودة");
    }

    // 3. Fetch active official holidays
    const { data: holidays = [] } = await db
      .from("official_holidays")
      .select("from_date, to_date")
      .eq("active", true)
      .or(`company_id.eq.${data.companyId},company_id.is.null`);

    // 4. Calculate deductible days using working calendar
    const dayCalc = calculateDeductibleDays(data.fromDate, data.toDate, policy, holidays);
    if (dayCalc.deductibleDays <= 0) {
      throw new Error("الفترة المحددة تقع بالكامل ضمن أيام العطلات الأسبوعية أو الإجازات الرسمية");
    }

    // 5. Check overlap with existing active/pending leaves
    const { data: hasOverlap } = await db.rpc("check_leave_overlap", {
      p_employee_id: data.employeeId,
      p_from_date: toIsoDate(data.fromDate),
      p_to_date: toIsoDate(data.toDate),
    });

    if (hasOverlap) {
      throw new Error("يوجد طلب إجازة آخر معتمد أو قيد المراجعة متداخل مع نفس التواريخ المحددة للموظف");
    }

    // 6. Get live authoritative balance from ledger
    const { data: balResult } = await db.rpc("get_employee_leave_balance", {
      p_employee_id: data.employeeId,
      p_leave_policy_id: data.leavePolicyId,
    });

    const currentBal = balResult?.[0]?.available_balance ?? 0;

    // 7. Validate eligibility against policy
    const eligCheck = validateLeaveEligibility(emp, policy, dayCalc.deductibleDays, currentBal, {
      hasAttachment: Boolean(data.attachmentUrl),
    });

    if (!eligCheck.eligible) {
      throw new Error(eligCheck.reason || "الموظف غير مؤهل لطلب هذه الإجازة");
    }

    // 8. Insert into leave_requests_domain (Status: draft)
    const { data: newLeave, error: leaveErr } = await db
      .from("leave_requests_domain")
      .insert({
        tenant_id: data.tenantId,
        company_id: data.companyId,
        employee_id: data.employeeId,
        leave_policy_id: data.leavePolicyId,
        from_date: toIsoDate(data.fromDate),
        to_date: toIsoDate(data.toDate),
        total_calendar_days: dayCalc.totalCalendarDays,
        deductible_days: dayCalc.deductibleDays,
        status: "draft",
        notes: data.notes || null,
        attachment_url: data.attachmentUrl || null,
        created_by: actor.userId,
      })
      .select()
      .single();

    if (leaveErr || !newLeave) {
      throw new Error(`فشل إنشاء طلب الإجازة: ${leaveErr?.message || "خطأ غير متوقع"}`);
    }

    // 9. Atomic state transition to 'pending' with ledger reservation
    const { data: transitionRes, error: transErr } = await db.rpc("execute_leave_request_transition", {
      p_request_id: newLeave.id,
      p_new_status: "pending",
      p_actor_user_id: actor.userId,
      p_reason: data.notes || "تقديم طلب إجازة",
    });

    if (transErr) {
      throw new Error(`فشل حجز رصيد الإجازة: ${transErr.message}`);
    }

    // 10. Sync to legacy leave_requests for backwards compatibility
    await db.from("leave_requests").insert({
      employee_id: data.employeeId,
      employee_name: emp.full_name,
      leave_type: policy.name_ar,
      from_date: toIsoDate(data.fromDate),
      to_date: toIsoDate(data.toDate),
      days: dayCalc.deductibleDays,
      balance_before: currentBal,
      status: "بانتظار الموافقة",
      notes: data.notes || null,
      domain_request_id: newLeave.id,
    });

    await logSecurityAudit(db, {
      eventType: "user_created",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "leaves",
      action: "create",
      details: {
        leaveRequestId: newLeave.id,
        policyCode: policy.code,
        days: dayCalc.deductibleDays,
        employeeId: data.employeeId,
      },
    });

    return {
      ok: true,
      leaveRequest: newLeave,
      calculation: dayCalc,
      remainingAvailableBalance: currentBal - dayCalc.deductibleDays,
    };
  });

/**
 * 2. Decide Leave Request (Approve, Reject, Cancel)
 */
export const decideLeaveRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        leaveRequestId: z.string().uuid("معرّف طلب الإجازة مطلوب"),
        action: z.enum(["approve", "reject", "cancel"]),
        rejectionReason: z.string().trim().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const requiredAction = data.action === "cancel" ? "cancel" : "approve";
    const actor = await requirePermission(
      context,
      "leaves",
      requiredAction,
      { type: "all" }
    );

    const db = await getAdminDb();

    if (data.action === "reject" && (!data.rejectionReason || !data.rejectionReason.trim())) {
      throw new Error("سبب الرفض إلزامي عند رفض طلب الإجازة");
    }

    const nextStatus =
      data.action === "approve"
        ? "approved"
        : data.action === "reject"
          ? "rejected"
          : "cancelled";

    // Call atomic stored procedure
    const { data: result, error: rpcErr } = await db.rpc("execute_leave_request_transition", {
      p_request_id: data.leaveRequestId,
      p_new_status: nextStatus,
      p_actor_user_id: actor.userId,
      p_reason: data.rejectionReason || (data.action === "approve" ? "اعتماد الإجازة" : "إلغاء الإجازة"),
    });

    if (rpcErr) {
      throw new Error(`تعذر معالجة قرار الإجازة: ${rpcErr.message}`);
    }

    // Sync legacy leave_requests row
    const legacyStatus =
      nextStatus === "approved" ? "معتمدة" : nextStatus === "rejected" ? "مرفوضة" : "ملغى";
    await db
      .from("leave_requests")
      .update({ status: legacyStatus })
      .eq("domain_request_id", data.leaveRequestId);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "leaves",
      action: data.action,
      details: { leaveRequestId: data.leaveRequestId, newStatus: nextStatus, reason: data.rejectionReason },
    });

    return { ok: true, status: nextStatus, result };
  });

/**
 * 3. Get Authoritative Leave Balances for an Employee
 */
export const getEmployeeLeaveBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        employeeId: z.string().uuid("معرّف الموظف مطلوب"),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    await requirePermission(
      context,
      "leaves",
      "read",
      { type: "all" }
    );

    const db = await getAdminDb();

    // 1. Fetch active policies
    let query = db
      .from("leave_policies")
      .select("*")
      .eq("active", true)
      .order("name_ar", { ascending: true });

    if (data.companyId) {
      query = query.or(`company_id.eq.${data.companyId},company_id.is.null`);
    }

    const { data: policies = [], error: polErr } = await query;
    if (polErr) {
      throw new Error(`فشل جلب سياسات الإجازات: ${polErr.message}`);
    }

    const balances = [];

    for (const policy of policies) {
      const { data: balData } = await db.rpc("get_employee_leave_balance", {
        p_employee_id: data.employeeId,
        p_leave_policy_id: policy.id,
      });

      const current = balData?.[0]?.current_balance ?? 0;
      const reserved = balData?.[0]?.reserved_balance ?? 0;
      const available = balData?.[0]?.available_balance ?? 0;

      balances.push({
        policyId: policy.id,
        code: policy.code,
        nameAr: policy.name_ar,
        nameEn: policy.name_en,
        paid: policy.paid,
        unit: policy.unit,
        annualEntitlement: policy.annual_entitlement,
        currentBalance: current,
        reservedBalance: reserved,
        availableBalance: available,
      });
    }

    return { ok: true, balances };
  });

/**
 * 4. List Leave Ledger Audit Transactions
 */
export const listLeaveLedgerTransactionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        employeeId: z.string().uuid("معرّف الموظف مطلوب"),
        leavePolicyId: z.string().uuid().optional().nullable(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    await requirePermission(
      context,
      "leaves",
      "read",
      { type: "all" }
    );

    const db = await getAdminDb();

    let query = db
      .from("leave_ledger")
      .select(`
        id,
        transaction_type,
        amount,
        source_type,
        source_id,
        effective_date,
        reason,
        created_at,
        leave_policies (
          code,
          name_ar
        )
      `)
      .eq("employee_id", data.employeeId)
      .order("created_at", { ascending: false });

    if (data.leavePolicyId) {
      query = query.eq("leave_policy_id", data.leavePolicyId);
    }

    const { data: transactions = [], error } = await query;
    if (error) {
      throw new Error(`فشل استرجاع حركات دفتر الأستاذ: ${error.message}`);
    }

    return { ok: true, transactions };
  });

/**
 * 5. Submit Hourly Permit with Monthly Quota Validation
 */
export const submitPermitRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        employeeId: z.string().uuid("معرّف الموظف مطلوب"),
        permitPolicyId: z.string().uuid("معرّف سياسة الإذن مطلوب"),
        permitDate: z.string().min(1, "تاريخ الإذن مطلوب"),
        fromTime: z.string().min(1, "وقت البداية مطلوب"),
        toTime: z.string().min(1, "وقت النهاية مطلوب"),
        reason: z.string().trim().min(2, "سبب الاستئذان مطلوب"),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(
      context,
      "permits",
      "create",
      { type: "all" }
    );

    const db = await getAdminDb();

    // 1. Fetch policy
    const { data: policy, error: polErr } = await db
      .from("permit_policies")
      .select("*")
      .eq("id", data.permitPolicyId)
      .single();

    if (polErr || !policy) {
      throw new Error("سياسة الإذن غير محددة أو غير مفعلة");
    }

    // 2. Calculate duration in hours
    const [hFrom, mFrom] = data.fromTime.split(":").map(Number);
    const [hTo, mTo] = data.toTime.split(":").map(Number);
    const startMins = (hFrom || 0) * 60 + (mFrom || 0);
    const endMins = (hTo || 0) * 60 + (mTo || 0);

    if (endMins <= startMins) {
      throw new Error("وقت نهاية الإذن يجب أن يكون بعد وقت البداية");
    }

    const durationHours = Number(((endMins - startMins) / 60).toFixed(2));

    // 3. Query existing approved/pending permits in the same month
    const dateObj = new Date(data.permitDate);
    const monthStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split("T")[0]!;
    const monthEnd = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).toISOString().split("T")[0]!;

    const { data: monthPermits = [] } = await db
      .from("permit_requests_domain")
      .select("duration_hours")
      .eq("employee_id", data.employeeId)
      .gte("permit_date", monthStart)
      .lte("permit_date", monthEnd)
      .in("status", ["pending", "approved"]);

    // 4. Validate monthly quota
    const quotaCheck = validatePermitQuota(monthPermits, durationHours, policy);
    if (!quotaCheck.allowed) {
      throw new Error(quotaCheck.reason || "تم تجاوز حد الاستئذان الشهري");
    }

    // 5. Insert permit request
    const { data: permitReq, error: insertErr } = await db
      .from("permit_requests_domain")
      .insert({
        tenant_id: data.tenantId,
        company_id: data.companyId,
        employee_id: data.employeeId,
        permit_policy_id: data.permitPolicyId,
        permit_date: toIsoDate(data.permitDate),
        from_time: data.fromTime,
        to_time: data.toTime,
        duration_hours: durationHours,
        status: "pending",
        reason: data.reason,
        created_by: actor.userId,
      })
      .select()
      .single();

    if (insertErr || !permitReq) {
      throw new Error(`فشل تقديم طلب الاستئذان: ${insertErr?.message || "خطأ غير متوقع"}`);
    }

    // 6. Sync to legacy employee_permits
    const { data: emp } = await db.from("employees").select("full_name, emp_no, branch, department").eq("id", data.employeeId).single();
    await db.from("employee_permits").insert({
      employee_id: data.employeeId,
      employee_name: emp?.full_name || "موظف",
      emp_no: emp?.emp_no || null,
      branch: emp?.branch || null,
      department: emp?.department || null,
      kind: policy.name_ar,
      permit_type: policy.name_ar,
      permission_date: toIsoDate(data.permitDate),
      scheduled_morning: data.fromTime,
      scheduled_evening: data.toTime,
      total_minutes: endMins - startMins,
      status: "قيد التنفيذ",
      notes: data.reason,
      domain_request_id: permitReq.id,
    });

    await logSecurityAudit(db, {
      eventType: "user_created",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      resource: "permits",
      action: "create",
      details: { permitRequestId: permitReq.id, hours: durationHours, employeeId: data.employeeId },
    });

    return {
      ok: true,
      permitRequest: permitReq,
      remainingHours: quotaCheck.remainingHours,
    };
  });
