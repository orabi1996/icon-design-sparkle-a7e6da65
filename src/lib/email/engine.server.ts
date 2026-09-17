import type {
  EmailLogItem,
  EmailRulesConfig,
  EmailSmtpConfig,
  EmailTemplate,
  SendEmailResult,
  TestConnectionResult,
  WorkflowEmailEvent,
} from "./types";
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from "./crypto";
import { DEFAULT_TEMPLATES, renderEmail } from "./templates";
import { resolveApproverEmails, resolveEmployeeEmail } from "./recipient-resolver.server";
import { sendSmtpEmail, verifySmtpConnection } from "./smtp-transport.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DEFAULT_SMTP_CONFIG: EmailSmtpConfig = {
  enabled: false,
  host: "smtp.gmail.com",
  port: 587,
  encryption: "tls",
  fromEmail: "hr@company.com",
  fromName: "نظام الموارد البشرية HRMS",
  username: "",
  password: "",
  replyTo: "",
  timeoutSeconds: 15,
  maxRetries: 3,
};

const DEFAULT_EMAIL_RULES: EmailRulesConfig = {
  notifyOnCreated: true,
  notifyOnStageAssigned: true,
  notifyOnStageApproved: true,
  notifyOnStageRejected: true,
  notifyOnFinalApproved: true,
  notifyOnCancelled: true,
  notifyOnInquiry: true,
  notifyRequester: true,
  notifyApprover: true,
};

/**
 * Load and parse SMTP configuration from app_settings.
 */
export async function loadSmtpConfig(db: Db): Promise<EmailSmtpConfig> {
  try {
    const { data, error } = await db
      .from("app_settings")
      .select("key, value")
      .eq("section", "email");

    if (error || !data) return { ...DEFAULT_SMTP_CONFIG };

    const map: Record<string, string> = {};
    for (const row of data) {
      map[row.key] = row.value ?? "";
    }

    const rawPassword = map["password"] || "";
    return {
      enabled: map["enabled"] === "true",
      host: map["host"] || DEFAULT_SMTP_CONFIG.host,
      port: Number(map["port"]) || DEFAULT_SMTP_CONFIG.port,
      encryption: (map["encryption"] as any) || "tls",
      fromEmail: map["from_email"] || map["email"] || DEFAULT_SMTP_CONFIG.fromEmail,
      fromName: map["from_name"] || DEFAULT_SMTP_CONFIG.fromName,
      username: map["username"] || map["email"] || "",
      password: rawPassword, // may be encrypted
      passwordMasked: maskSecret(rawPassword),
      hasPassword: Boolean(rawPassword && rawPassword.trim().length > 0),
      replyTo: map["reply_to"] || "",
      timeoutSeconds: Number(map["timeout_seconds"]) || DEFAULT_SMTP_CONFIG.timeoutSeconds,
      maxRetries: Number(map["max_retries"]) || DEFAULT_SMTP_CONFIG.maxRetries,
    };
  } catch (error) {
    console.error("[EmailEngine] Failed to load SMTP config:", error);
    return { ...DEFAULT_SMTP_CONFIG };
  }
}

/**
 * Save SMTP configuration to app_settings with encrypted password.
 */
export async function saveSmtpConfig(db: Db, config: Partial<EmailSmtpConfig>): Promise<void> {
  const current = await loadSmtpConfig(db);
  const nextPassword =
    config.password !== undefined && config.password.trim().length > 0 && config.password !== "••••••••"
      ? encryptSecret(config.password.trim())
      : current.password;

  const rows = [
    { section: "email", key: "enabled", value: String(config.enabled ?? current.enabled) },
    { section: "email", key: "host", value: config.host ?? current.host },
    { section: "email", key: "port", value: String(config.port ?? current.port) },
    { section: "email", key: "encryption", value: config.encryption ?? current.encryption },
    { section: "email", key: "from_email", value: config.fromEmail ?? current.fromEmail },
    { section: "email", key: "from_name", value: config.fromName ?? current.fromName },
    { section: "email", key: "username", value: config.username ?? current.username },
    { section: "email", key: "password", value: nextPassword || "" },
    { section: "email", key: "reply_to", value: config.replyTo ?? current.replyTo ?? "" },
    { section: "email", key: "timeout_seconds", value: String(config.timeoutSeconds ?? current.timeoutSeconds) },
    { section: "email", key: "max_retries", value: String(config.maxRetries ?? current.maxRetries) },
  ];

  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "section,key" });
  if (error) throw new Error(`فشل حفظ إعدادات البريد: ${error.message}`);
}

/**
 * Load email notification rules from app_settings.
 */
export async function loadEmailRules(db: Db): Promise<EmailRulesConfig> {
  try {
    const { data } = await db
      .from("app_settings")
      .select("key, value")
      .eq("section", "email_rules");

    if (!data) return { ...DEFAULT_EMAIL_RULES };
    const map: Record<string, string> = {};
    for (const r of data) map[r.key] = r.value ?? "";

    return {
      notifyOnCreated: map["notifyOnCreated"] !== "false",
      notifyOnStageAssigned: map["notifyOnStageAssigned"] !== "false",
      notifyOnStageApproved: map["notifyOnStageApproved"] !== "false",
      notifyOnStageRejected: map["notifyOnStageRejected"] !== "false",
      notifyOnFinalApproved: map["notifyOnFinalApproved"] !== "false",
      notifyOnCancelled: map["notifyOnCancelled"] !== "false",
      notifyOnInquiry: map["notifyOnInquiry"] !== "false",
      notifyRequester: map["notifyRequester"] !== "false",
      notifyApprover: map["notifyApprover"] !== "false",
    };
  } catch (error) {
    console.error("[EmailEngine] Failed to load email rules:", error);
    return { ...DEFAULT_EMAIL_RULES };
  }
}

/**
 * Save email notification rules to app_settings.
 */
export async function saveEmailRules(db: Db, rules: Partial<EmailRulesConfig>): Promise<void> {
  const current = await loadEmailRules(db);
  const next = { ...current, ...rules };
  const rows = Object.entries(next).map(([key, value]) => ({
    section: "email_rules",
    key,
    value: String(value),
  }));

  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "section,key" });
  if (error) throw new Error(`فشل حفظ إعدادات الإشعارات: ${error.message}`);
}

/**
 * Check if an event should be dispatched according to the notification rules.
 */
function shouldSendEvent(event: WorkflowEmailEvent, rules: EmailRulesConfig): boolean {
  switch (event.eventType) {
    case "request_created":
      return rules.notifyOnCreated;
    case "stage_assigned":
      return rules.notifyOnStageAssigned;
    case "stage_approved":
      return rules.notifyOnStageApproved;
    case "stage_rejected":
      return rules.notifyOnStageRejected;
    case "final_approved":
      return rules.notifyOnFinalApproved;
    case "request_cancelled":
      return rules.notifyOnCancelled;
    case "inquiry_issued":
      return rules.notifyOnInquiry;
    case "test_email":
      return true;
    default:
      return true;
  }
}

/**
 * Asynchronously execute email delivery for a queued log row, handling retries and errors.
 */
async function processEmailLogRow(db: Db, logId: string, config: EmailSmtpConfig) {
  try {
    const { data: log, error: fetchErr } = await db
      .from("email_logs")
      .select("*")
      .eq("id", logId)
      .maybeSingle();

    if (fetchErr || !log) return;
    if (log.status === "sent" || log.status === "skipped_no_email") return;

    await db.from("email_logs").update({ status: "sending" }).eq("id", logId);

    const result = await sendSmtpEmail(config, {
      to: log.recipient_email,
      subject: log.subject,
      html: log.body_html || "",
      text: log.body_text || "",
      fromName: log.sender_name || config.fromName,
      fromEmail: log.sender_email || config.fromEmail,
    });

    if (result.ok) {
      await db
        .from("email_logs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_id: result.messageId || null,
          attempts: (log.attempts || 0) + 1,
          last_error: null,
        })
        .eq("id", logId);
    } else {
      await db
        .from("email_logs")
        .update({
          status: "failed",
          attempts: (log.attempts || 0) + 1,
          last_error: result.error || "خطأ غير معروف أثناء الإرسال",
        })
        .eq("id", logId);
    }
  } catch (err) {
    const message = (err as Error).message || String(err);
    await db
      .from("email_logs")
      .update({
        status: "failed",
        last_error: message,
      })
      .eq("id", logId);
  }
}

/**
 * Central Dispatcher: processes any workflow event, resolves recipients, logs, and dispatches asynchronously.
 * NEVER throws to the caller: business workflows remain 100% resilient.
 */
export async function dispatchWorkflowEmail(
  db: Db,
  event: WorkflowEmailEvent,
  options?: { immediate?: boolean }
): Promise<{ success: boolean; logIds: string[]; skipped?: boolean; error?: string }> {
  try {
    const [smtpConfig, rules] = await Promise.all([
      loadSmtpConfig(db),
      loadEmailRules(db),
    ]);

    // Check system-level enable flag
    if (!smtpConfig.enabled && event.eventType !== "test_email") {
      return { success: true, logIds: [], skipped: true, error: "نظام البريد الإلكتروني معطل حاليًا" };
    }

    // Check rule-level event toggle
    if (!shouldSendEvent(event, rules)) {
      return { success: true, logIds: [], skipped: true, error: "نوع الإشعار معطل في قواعد الإشعارات" };
    }

    // 1. Resolve recipients
    const recipients: { email: string | null; name: string | null; role?: string }[] = [];

    if (event.eventType === "stage_assigned") {
      // Destination is the approver(s) of the new stage
      if (rules.notifyApprover) {
        const approvers = await resolveApproverEmails(db, {
          stage: event.currentStage || "",
          employeeId: event.employeeId,
          approverEmail: event.approverEmail,
          awaitingApproverName: event.approverName,
        });
        recipients.push(...approvers);
      }
    } else if (event.eventType === "test_email") {
      recipients.push({
        email: event.employeeEmail || "",
        name: event.employeeName || "المشرف",
      });
    } else {
      // Destination is the employee (requester)
      if (rules.notifyRequester) {
        if (event.employeeEmail) {
          recipients.push({
            email: event.employeeEmail,
            name: event.employeeName || null,
          });
        } else {
          const emp = await resolveEmployeeEmail(db, event.employeeId, event.employeeCode);
          recipients.push(emp);
        }
      }
    }

    if (recipients.length === 0) {
      return { success: true, logIds: [], skipped: true, error: "لم يتم تحديد أي مستلم للإشعار" };
    }

    // 2. Fetch custom template if any exists
    let template: EmailTemplate | undefined;
    try {
      const { data: tpls } = await db
        .from("email_templates")
        .select("*")
        .eq("event_type", event.eventType)
        .eq("is_active", true);

      if (tpls && tpls.length > 0) {
        // match specific requestType or 'all'
        template =
          tpls.find((t: any) => t.request_type === event.requestType) ||
          tpls.find((t: any) => t.request_type === "all") ||
          tpls[0];
      }
    } catch {
      // fallback to default
    }

    const { subject, html, text } = renderEmail(event, template);
    const createdLogIds: string[] = [];

    // 3. For each recipient, check dedup and create log entry
    for (const rc of recipients) {
      const recipientEmail = rc.email?.trim() || null;
      const recipientName = rc.name || null;

      // Handle missing recipient email gracefully
      if (!recipientEmail) {
        const { data: skippedLog } = await db
          .from("email_logs")
          .insert({
            recipient_email: "missing@email.invalid",
            recipient_name: recipientName,
            sender_email: smtpConfig.fromEmail,
            sender_name: smtpConfig.fromName,
            subject,
            body_html: html,
            body_text: text,
            request_type: event.requestType,
            request_id: event.requestId ? String(event.requestId) : null,
            request_number: event.requestNumber ? String(event.requestNumber) : null,
            event_type: event.eventType,
            template_key: template?.id || `tpl_${event.eventType}`,
            language: event.language || "ar",
            status: "skipped_no_email",
            attempts: 0,
            last_error: "لا يوجد بريد إلكتروني مسجل للموظف أو المسؤول",
            payload: event,
          })
          .select("id")
          .single();

        if (skippedLog) createdLogIds.push(skippedLog.id);
        continue;
      }

      // Compute deduplication key to prevent duplicate sends upon page refreshes
      const dedupKey =
        event.dedupKey ||
        `${event.eventType}:${event.requestId || event.requestNumber || "no-req"}:${event.currentStage || "main"}:${recipientEmail}:${new Date().toISOString().slice(0, 10)}`;

      // Check if already dispatched or queued with this dedupKey
      const { data: existing } = await db
        .from("email_logs")
        .select("id, status")
        .eq("dedup_key", dedupKey)
        .maybeSingle();

      if (existing) {
        console.log(`[EmailEngine] Skipped duplicate dispatch with dedupKey: ${dedupKey}`);
        createdLogIds.push(existing.id);
        continue;
      }

      // Create queued log entry
      const { data: newLog, error: insertError } = await db
        .from("email_logs")
        .insert({
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          sender_email: smtpConfig.fromEmail,
          sender_name: smtpConfig.fromName,
          subject,
          body_html: html,
          body_text: text,
          request_type: event.requestType,
          request_id: event.requestId ? String(event.requestId) : null,
          request_number: event.requestNumber ? String(event.requestNumber) : null,
          event_type: event.eventType,
          template_key: template?.id || `tpl_${event.eventType}`,
          language: event.language || "ar",
          status: "queued",
          attempts: 0,
          dedup_key: dedupKey,
          payload: event,
        })
        .select("id")
        .single();

      if (insertError || !newLog) {
        console.error("[EmailEngine] Failed to create email log entry:", insertError);
        continue;
      }

      createdLogIds.push(newLog.id);

      // 4. Asynchronous or immediate dispatch
      if (options?.immediate) {
        await processEmailLogRow(db, newLog.id, smtpConfig);
      } else {
        // Fire and forget without holding up caller
        void processEmailLogRow(db, newLog.id, smtpConfig);
      }
    }

    return { success: true, logIds: createdLogIds };
  } catch (error) {
    const err = (error as Error).message || String(error);
    console.error("[EmailEngine] Dispatch error (fail-safe caught):", err);
    return { success: false, logIds: [], error: err };
  }
}

/**
 * Resend a failed email from the email log.
 */
export async function resendFailedEmail(db: Db, logId: string): Promise<TestConnectionResult> {
  try {
    const { data: log, error } = await db
      .from("email_logs")
      .select("*")
      .eq("id", logId)
      .maybeSingle();

    if (error || !log) {
      return { ok: false, message: "لم يتم العثور على سجل الرسالة المطلوب إعادة إرسالها" };
    }

    if (!log.recipient_email || log.recipient_email === "missing@email.invalid") {
      return { ok: false, message: "لا يمكن إعادة الإرسال: عنوان البريد الإلكتروني للمستلم غير متوفر" };
    }

    const smtpConfig = await loadSmtpConfig(db);
    if (!smtpConfig.enabled) {
      return { ok: false, message: "إرسال البريد معطل حاليًا في إعدادات النظام" };
    }

    await db.from("email_logs").update({ status: "sending" }).eq("id", logId);

    const result = await sendSmtpEmail(smtpConfig, {
      to: log.recipient_email,
      subject: log.subject,
      html: log.body_html || "",
      text: log.body_text || "",
      fromName: log.sender_name || smtpConfig.fromName,
      fromEmail: log.sender_email || smtpConfig.fromEmail,
    });

    if (result.ok) {
      await db
        .from("email_logs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_id: result.messageId || null,
          attempts: (log.attempts || 0) + 1,
          last_error: null,
        })
        .eq("id", logId);
      return { ok: true, message: "تمت إعادة إرسال الرسالة بنجاح" };
    } else {
      await db
        .from("email_logs")
        .update({
          status: "failed",
          attempts: (log.attempts || 0) + 1,
          last_error: result.error || "فشلت إعادة الإرسال",
        })
        .eq("id", logId);
      return { ok: false, message: result.error || "فشلت إعادة الإرسال" };
    }
  } catch (error) {
    const msg = (error as Error).message || String(error);
    return { ok: false, message: `تعذر إعادة الإرسال: ${msg}` };
  }
}
