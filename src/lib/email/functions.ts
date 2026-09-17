import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import type {
  EmailLogItem,
  EmailRulesConfig,
  EmailSmtpConfig,
  EmailTemplate,
  TestConnectionResult,
  WorkflowEmailEvent,
} from "./types";
import {
  dispatchWorkflowEmail,
  loadEmailRules,
  loadSmtpConfig,
  resendFailedEmail,
  saveEmailRules,
  saveSmtpConfig,
} from "./engine.server";
import { verifySmtpConnection } from "./smtp-transport.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * Get current SMTP config with password safely masked.
 * Requires: email.settings (read)
 */
export const getSmtpConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailSmtpConfig> => {
    await requirePermission(context, "email.settings", "read");
    const db = await getAdminDb();
    const config = await loadSmtpConfig(db);
    return {
      ...config,
      password: config.passwordMasked, // Never expose encrypted or plain password
    };
  });

/**
 * Save SMTP config (validates and encrypts sensitive fields).
 * Requires: email.settings (update)
 */
export const saveSmtpConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        enabled: z.boolean(),
        host: z.string().trim().min(1, "اسم الخادم مطلوب"),
        port: z.number().int().min(1).max(65535, "المنفذ غير صحيح"),
        encryption: z.enum(["none", "ssl", "tls", "starttls"]),
        fromEmail: z.string().trim().email("البريد الإلكتروني للمرسل غير صحيح"),
        fromName: z.string().trim().min(1, "اسم المرسل مطلوب"),
        username: z.string().trim().optional().default(""),
        password: z.string().optional(),
        replyTo: z.string().trim().optional(),
        timeoutSeconds: z.number().int().min(1).max(120).default(15),
        maxRetries: z.number().int().min(1).max(10).default(3),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const user = await requirePermission(context, "email.settings", "update");
    const db = await getAdminDb();
    await saveSmtpConfig(db, data);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "email.settings",
      action: "update",
      details: {
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        encryption: data.encryption,
      },
    });

    return { success: true, message: "تم حفظ إعدادات البريد بنجاح" };
  });

/**
 * Test SMTP connection (can test unsaved form values or saved database config).
 * Requires: email.test (update)
 */
export const testSmtpConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        host: z.string().optional(),
        port: z.number().optional(),
        encryption: z.enum(["none", "ssl", "tls", "starttls"]).optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        timeoutSeconds: z.number().optional(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<TestConnectionResult> => {
    await requirePermission(context, "email.test", "update");
    const db = await getAdminDb();
    const saved = await loadSmtpConfig(db);

    // Merge unsaved form inputs if provided
    const testConfig: EmailSmtpConfig = {
      ...saved,
      host: data.host || saved.host,
      port: data.port || saved.port,
      encryption: data.encryption || saved.encryption,
      username: data.username !== undefined ? data.username : saved.username,
      password:
        data.password && data.password !== "••••••••" ? data.password : saved.password,
      timeoutSeconds: data.timeoutSeconds || saved.timeoutSeconds,
    };

    return await verifySmtpConnection(testConfig);
  });

/**
 * Send a real test email to verify end-to-end functionality.
 * Requires: email.test (update)
 */
export const sendTestEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        recipientEmail: z.string().trim().email("البريد الإلكتروني للمستلم غير صحيح"),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    await requirePermission(context, "email.test", "update");
    const db = await getAdminDb();
    const result = await dispatchWorkflowEmail(
      db,
      {
        eventType: "test_email",
        requestType: "اختبار النظام",
        employeeEmail: data.recipientEmail,
        employeeName: "مسؤول النظام",
        actionDate: new Date().toLocaleString("ar-SA"),
      },
      { immediate: true },
    );

    if (!result.success) {
      return { success: false, message: result.error || "فشل إرسال رسالة الاختبار" };
    }

    return { success: true, message: `تم إرسال رسالة الاختبار بنجاح إلى ${data.recipientEmail}` };
  });

/**
 * Get notification rules.
 * Requires: email.settings (read)
 */
export const getEmailRulesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailRulesConfig> => {
    await requirePermission(context, "email.settings", "read");
    const db = await getAdminDb();
    return await loadEmailRules(db);
  });

/**
 * Save notification rules.
 * Requires: email.settings (update)
 */
export const saveEmailRulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        notifyOnCreated: z.boolean(),
        notifyOnStageAssigned: z.boolean(),
        notifyOnStageApproved: z.boolean(),
        notifyOnStageRejected: z.boolean(),
        notifyOnFinalApproved: z.boolean(),
        notifyOnCancelled: z.boolean(),
        notifyOnInquiry: z.boolean(),
        notifyRequester: z.boolean(),
        notifyApprover: z.boolean(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const user = await requirePermission(context, "email.settings", "update");
    const db = await getAdminDb();
    await saveEmailRules(db, data);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "email.rules",
      action: "update",
      details: data,
    });

    return { success: true, message: "تم حفظ قواعد تشغيل الإشعارات بنجاح" };
  });

/**
 * Get paginated email logs.
 * Requires: email.logs (read)
 */
export const getEmailLogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
        status: z.string().optional(),
        requestType: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(input);
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ items: EmailLogItem[]; total: number; page: number; pageSize: number }> => {
      await requirePermission(context, "email.logs", "read");
      const db = await getAdminDb();
      let query = db.from("email_logs").select("*", { count: "exact" });

      if (data.status && data.status !== "all") {
        query = query.eq("status", data.status);
      }
      if (data.requestType && data.requestType !== "all") {
        query = query.eq("request_type", data.requestType);
      }
      if (data.search?.trim()) {
        const s = `%${data.search.trim()}%`;
        query = query.or(`recipient_email.ilike.${s},subject.ilike.${s},recipient_name.ilike.${s}`);
      }

      const from = (data.page - 1) * data.pageSize;
      const to = from + data.pageSize - 1;

      const {
        data: rows,
        count,
        error,
      } = await query.order("created_at", { ascending: false }).range(from, to);

      if (error) throw new Error(`تعذر استرجاع سجل البريد: ${error.message}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: EmailLogItem[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        sentAt: r.sent_at,
        recipientEmail: r.recipient_email,
        recipientName: r.recipient_name,
        senderEmail: r.sender_email,
        senderName: r.sender_name,
        subject: r.subject,
        bodyHtml: r.body_html,
        bodyText: r.body_text,
        requestType: r.request_type,
        requestId: r.request_id,
        requestNumber: r.request_number,
        eventType: r.event_type,
        templateKey: r.template_key,
        language: r.language || "ar",
        status: r.status,
        attempts: r.attempts || 0,
        lastError: r.last_error,
        messageId: r.message_id,
        dedupKey: r.dedup_key,
      }));

      return {
        items,
        total: count || 0,
        page: data.page,
        pageSize: data.pageSize,
      };
    },
  );

/**
 * Resend a failed email.
 * Requires: email.logs (resend)
 */
export const resendFailedEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z.object({ logId: z.string().uuid() }).parse(input);
  })
  .handler(async ({ data, context }): Promise<TestConnectionResult> => {
    await requirePermission(context, "email.logs", "resend");
    const db = await getAdminDb();
    return await resendFailedEmail(db, data.logId);
  });

/**
 * Get email templates.
 * Requires: email.templates (read)
 */
export const getEmailTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailTemplate[]> => {
    await requirePermission(context, "email.templates", "read");
    const db = await getAdminDb();
    const { data, error } = await db
      .from("email_templates")
      .select("*")
      .order("event_type", { ascending: true });

    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      eventType: t.event_type,
      requestType: t.request_type,
      subjectAr: t.subject_ar,
      subjectEn: t.subject_en,
      bodyAr: t.body_ar,
      bodyEn: t.body_en,
      isActive: t.is_active,
      isSystem: t.is_system,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  });

/**
 * Save / update an email template.
 * Requires: email.templates (update)
 */
export const saveEmailTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        id: z.string(),
        name: z.string().min(1, "اسم القالب مطلوب"),
        eventType: z.string().min(1),
        requestType: z.string().default("all"),
        subjectAr: z.string().min(1, "الموضوع بالعربية مطلوب"),
        subjectEn: z.string().min(1, "الموضوع بالإنجليزية مطلوب"),
        bodyAr: z.string().min(1, "نص الرسالة بالعربية مطلوب"),
        bodyEn: z.string().min(1, "نص الرسالة بالإنجليزية مطلوب"),
        isActive: z.boolean().default(true),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const user = await requirePermission(context, "email.templates", "update");
    const db = await getAdminDb();
    const row = {
      id: data.id,
      name: data.name,
      event_type: data.eventType,
      request_type: data.requestType,
      subject_ar: data.subjectAr,
      subject_en: data.subjectEn,
      body_ar: data.bodyAr,
      body_en: data.bodyEn,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("email_templates").upsert([row]);
    if (error) throw new Error(`فشل حفظ قالب البريد: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "email.templates",
      action: "update",
      details: { templateId: data.id, eventType: data.eventType },
    });

    return { success: true, message: "تم حفظ قالب البريد بنجاح" };
  });

/**
 * Dispatch workflow email event from any client or server component.
 * Requires: email.dispatch (create)
 */
export const dispatchWorkflowEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        eventType: z.string(),
        requestId: z.string().optional(),
        requestNumber: z.union([z.string(), z.number()]).optional(),
        requestType: z.string(),
        employeeId: z.string().optional(),
        employeeName: z.string().optional(),
        employeeCode: z.string().optional(),
        employeeEmail: z.string().optional(),
        currentStage: z.string().optional(),
        previousStage: z.string().optional(),
        nextStage: z.string().optional(),
        currentStatus: z.string().optional(),
        approverRole: z.string().optional(),
        approverName: z.string().optional(),
        approverEmail: z.string().optional(),
        actionBy: z.string().optional(),
        actionDate: z.string().optional(),
        rejectionReason: z.string().optional(),
        amount: z.union([z.string(), z.number()]).optional(),
        leaveFrom: z.string().optional(),
        leaveTo: z.string().optional(),
        days: z.union([z.string(), z.number()]).optional(),
        actionUrl: z.string().optional(),
        inquiryName: z.string().optional(),
        inquiryType: z.string().optional(),
        inquiryDate: z.string().optional(),
        companyName: z.string().optional(),
        language: z.enum(["ar", "en"]).optional(),
        dedupKey: z.string().optional(),
      })
      .parse(input);
  })
  .handler(
    async ({ data, context }): Promise<{ success: boolean; logIds: string[]; error?: string }> => {
      await requirePermission(context, "email.dispatch", "create");
      const db = await getAdminDb();
      return await dispatchWorkflowEmail(db, data as WorkflowEmailEvent);
    },
  );
