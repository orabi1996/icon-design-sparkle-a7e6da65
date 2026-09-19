import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  calculateTaskSla,
  validateDisciplinaryPenalty,
  roundCurrency,
} from "./operational-domains-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. TASKS: Create Task with SLA and Watchers
 */
export const createTaskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        title: z.string().min(3),
        description: z.string().optional(),
        priorityCode: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        assigneeEmployeeId: z.string().uuid().optional(),
        assigneeName: z.string().optional(),
        branch: z.string().optional(),
        department: z.string().optional(),
        watchers: z.array(z.string().uuid()).default([]),
        slaHours: z.number().int().positive().optional(),
        dueDate: z.string().optional(),
        recurringConfig: z.record(z.unknown()).optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "tasks", "create");
    const db = await getAdminDb();

    let slaDueAt: string | null = null;
    if (data.slaHours) {
      slaDueAt = new Date(Date.now() + data.slaHours * 3600000).toISOString();
    } else if (data.dueDate) {
      slaDueAt = new Date(`${data.dueDate}T23:59:59.999Z`).toISOString();
    }

    const { data: task, error } = await db
      .from("tasks")
      .insert({
        title: data.title,
        description: data.description || null,
        priority_code: data.priorityCode,
        assignee_employee_id: data.assigneeEmployeeId || null,
        assignee_name: data.assigneeName || null,
        branch: data.branch || null,
        department: data.department || null,
        watchers: data.watchers,
        sla_hours: data.slaHours || null,
        sla_due_at: slaDueAt,
        end_date: data.dueDate || null,
        status_code: "pending",
        recurring_config: data.recurringConfig || null,
        creator_name: user.fullName || user.email,
        created_by: user.userId,
      })
      .select()
      .single();

    if (error) throw new Error(`فشل إنشاء المهمة: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "tasks",
      action: "create",
      details: { taskId: task.id, title: data.title },
    });

    return { success: true, task };
  });

/**
 * 2. TASKS: Update Status and record completion
 */
export const updateTaskStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        taskId: z.string().uuid(),
        statusCode: z.enum(["pending", "in_progress", "review", "completed", "cancelled", "postponed"]),
        notes: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "tasks", "update");
    const db = await getAdminDb();

    const isDone = ["completed", "cancelled"].includes(data.statusCode);
    const updatePayload: Record<string, unknown> = {
      status_code: data.statusCode,
      updated_at: new Date().toISOString(),
    };
    if (isDone) {
      updatePayload["completed_at"] = new Date().toISOString();
    }
    if (data.notes) {
      updatePayload["notes"] = data.notes;
    }

    const { data: updated, error } = await db
      .from("tasks")
      .update(updatePayload)
      .eq("id", data.taskId)
      .select()
      .single();

    if (error) throw new Error(`فشل تحديث حالة المهمة: ${error.message}`);

    return { success: true, task: updated };
  });

/**
 * 3. CORRESPONDENCE: Send Administrative Correspondence with Confidentiality Enforcement
 */
export const sendCorrespondenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        directionType: z.enum(["incoming", "outgoing", "internal"]).default("internal"),
        confidentiality: z.enum(["normal", "confidential", "top_secret"]).default("normal"),
        classification: z.string().default("general"),
        subject: z.string().min(3),
        message: z.string().min(5),
        recipientEmail: z.string().email().optional(),
        employeeId: z.string().uuid().optional(),
        employeeName: z.string().optional(),
        branch: z.string().optional(),
        department: z.string().optional(),
        attachmentName: z.string().optional(),
        attachmentPath: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    // If correspondence is sensitive/confidential, require view_sensitive permission
    const isSensitive = data.confidentiality === "confidential" || data.confidentiality === "top_secret";
    const user = isSensitive
      ? await requirePermission(context, "correspondence", "view_sensitive")
      : await requirePermission(context, "correspondence", "create");

    const db = await getAdminDb();
    const prefix = data.directionType.toUpperCase().slice(0, 3);
    const referenceNumber = `CORR-${prefix}-${Date.now().toString().slice(-7)}`;

    const { data: corr, error } = await db
      .from("employee_correspondence")
      .insert({
        direction_type: data.directionType,
        confidentiality: data.confidentiality,
        classification: data.classification,
        reference_number: referenceNumber,
        subject: data.subject,
        message: data.message,
        recipient_email: data.recipientEmail || null,
        employee_id: data.employeeId || null,
        employee_name: data.employeeName || "إشعار عام",
        branch: data.branch || null,
        department: data.department || null,
        attachment_name: data.attachmentName || null,
        attachment_path: data.attachmentPath || null,
        sender_name: user.fullName || user.email,
        sender_email: user.email,
        status: "تم الإرسال",
        character_count: data.message.length,
        created_by: user.userId,
      })
      .select()
      .single();

    if (error) throw new Error(`تعذر حفظ المراسلة: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "correspondence",
      action: "create",
      details: {
        correspondenceId: corr.id,
        referenceNumber,
        confidentiality: data.confidentiality,
      },
    });

    return { success: true, correspondence: corr };
  });

/**
 * 4. DISCIPLINARY: Issue Inquiry (Start of Lifecycle)
 */
export const issueDisciplinaryInquiryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        employeeId: z.string().uuid(),
        incidentDate: z.string(),
        subject: z.string().min(3),
        incidentDescription: z.string().min(10),
        evidenceAttachments: z.array(z.record(z.unknown())).default([]),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "inquiries", "create");
    const db = await getAdminDb();

    const { data: emp, error: empErr } = await db
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .single();

    if (empErr || !emp) throw new Error("الموظف غير موجود");

    const inquiryNumber = `INQ-${Date.now().toString().slice(-7)}`;

    const { data: inq, error } = await db
      .from("disciplinary_inquiries")
      .insert({
        inquiry_number: inquiryNumber,
        employee_id: data.employeeId,
        employee_name: emp.full_name,
        emp_no: emp.emp_no,
        branch: emp.branch || null,
        department: emp.department || null,
        incident_date: data.incidentDate,
        subject: data.subject,
        incident_description: data.incidentDescription,
        evidence_attachments: data.evidenceAttachments,
        lifecycle_status: "issued",
        created_by: user.userId,
      })
      .select()
      .single();

    if (error) throw new Error(`فشل إصدار المسائلة التأديبية: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "inquiries",
      action: "create",
      details: { inquiryId: inq.id, inquiryNumber, employeeId: data.employeeId },
    });

    return { success: true, inquiry: inq };
  });

/**
 * 5. DISCIPLINARY: Decide Penalty with Saudi Cap and Decoupled Payroll Adjustment
 */
export const decideDisciplinaryPenaltyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        inquiryId: z.string().uuid(),
        decisionType: z.enum([
          "dismissed",
          "verbal_warning",
          "written_warning",
          "salary_deduction",
          "suspension",
          "termination_art80",
        ]),
        deductionDays: z.number().int().min(0).max(5).default(0),
        investigationFindings: z.string().min(5),
        notes: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "inquiries", "approve");
    const db = await getAdminDb();

    // 1. Fetch inquiry
    const { data: inq, error: inqErr } = await db
      .from("disciplinary_inquiries")
      .select("*")
      .eq("id", data.inquiryId)
      .single();

    if (inqErr || !inq) throw new Error("المسائلة التأديبية غير موجودة");
    if (inq.lifecycle_status === "approved" || inq.lifecycle_status === "closed") {
      throw new Error("القرار معتمد مسبقاً وغير قابل لإعادة البت المباشر");
    }

    // 2. Fetch employee wage base
    const { data: emp } = await db.from("employees").select("*").eq("id", inq.employee_id).single();
    const wageBase = Number(emp?.basic_salary || 0) + Number(emp?.housing_allowance || 0);

    // 3. Pure domain validation against Saudi Labor Law (max 5 days)
    const val = validateDisciplinaryPenalty({
      employeeId: inq.employee_id,
      monthlyWageBase: wageBase,
      decisionType: data.decisionType,
      deductionDays: data.deductionDays,
      notes: data.notes,
    });

    if (!val.valid) {
      throw new Error(val.errors.join("; "));
    }

    let payrollAdjustmentId: string | null = null;

    // 4. Decoupled Payroll Adjustment: If salary deduction, create pending adjustment
    if (val.adjustmentPayload) {
      const { data: adj, error: adjErr } = await db
        .from("payroll_adjustments")
        .insert({
          employee_id: inq.employee_id,
          component_code: val.adjustmentPayload.component_code,
          component_type: val.adjustmentPayload.component_type,
          amount: val.adjustmentPayload.amount,
          source: val.adjustmentPayload.source,
          status: "pending", // Requires separate financial review
          notes: val.adjustmentPayload.reason,
          created_by: user.userId,
        })
        .select()
        .single();

      if (adjErr) {
        throw new Error(`تعذر تسجيل تسوية المسير المعلقة: ${adjErr.message}`);
      }
      payrollAdjustmentId = adj?.id || null;
    }

    // 5. Update inquiry to approved/closed
    const { data: updatedInq, error: updateErr } = await db
      .from("disciplinary_inquiries")
      .update({
        lifecycle_status: "approved",
        decision_type: data.decisionType,
        deduction_days: data.deductionDays || null,
        penalty_amount: val.calculatedDeductionAmount,
        investigation_findings: data.investigationFindings,
        payroll_adjustment_id: payrollAdjustmentId,
        approved_by: user.userId,
        approved_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      })
      .eq("id", data.inquiryId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`تعذر اعتماد القرار التأديبي: ${updateErr.message}`);
    }

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "inquiries",
      action: "approve",
      details: {
        inquiryId: data.inquiryId,
        decisionType: data.decisionType,
        deductionDays: data.deductionDays,
        penaltyAmount: val.calculatedDeductionAmount,
      },
    });

    return {
      success: true,
      inquiry: updatedInq,
      payrollAdjustmentId,
      calculatedPenalty: val.calculatedDeductionAmount,
    };
  });

/**
 * 6. DOCUMENTS: Generate Secure Signed Temporary Download URL (Private Bucket)
 */
export const getSecureDocumentDownloadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        docId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const db = await getAdminDb();

    // 1. Fetch document record
    const { data: doc, error: docErr } = await db
      .from("archived_documents")
      .select("*")
      .eq("id", data.docId)
      .single();

    if (docErr || !doc) throw new Error("المستند غير موجود بالأرشيف");

    // 2. Check confidentiality permission
    const isSensitive = doc.confidentiality === "confidential" || doc.confidentiality === "restricted";
    const user = isSensitive
      ? await requirePermission(context, "reports.archive", "view_sensitive")
      : await requirePermission(context, "reports.archive", "read");

    // 3. Generate secure signed URL with 60s TTL from private bucket
    const { data: signed, error: signErr } = await db.storage
      .from(doc.storage_bucket || "documents-archive")
      .createSignedUrl(doc.storage_path, 60);

    if (signErr || !signed?.signedUrl) {
      throw new Error(`فشل إنشاء رابط التحميل الآمن: ${signErr?.message || "رابط غير متاح"}`);
    }

    // 4. Audit access to sensitive files
    if (isSensitive) {
      await logSecurityAudit(db, {
        eventType: "data_exported",
        status: "success",
        userId: user.userId,
        actorEmail: user.email,
        resource: "archived_documents",
        action: "read",
        details: { docId: doc.id, docTitle: doc.doc_title, confidentiality: doc.confidentiality },
      });
    }

    return {
      success: true,
      signedUrl: signed.signedUrl,
      fileHash: doc.file_hash,
      expiresInSeconds: 60,
    };
  });
