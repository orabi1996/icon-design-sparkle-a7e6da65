import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailSmtpConfig, SendEmailResult, TestConnectionResult } from "./types";
import { decryptSecret } from "./crypto";
import { translateSmtpError as rawTranslateSmtpError } from "./smtp-diagnostics.mjs";

export const translateSmtpError = rawTranslateSmtpError as (
  error: unknown
) => { message: string; code: string; details: string };

/**
 * Build a nodemailer transporter instance from system SMTP config.
 */
export function createTransporter(config: EmailSmtpConfig): Transporter {
  const password = decryptSecret(config.password || "");
  const secure = config.encryption === "ssl" || config.port === 465;

  const transportOptions: Record<string, unknown> = {
    host: config.host,
    port: config.port,
    secure,
    auth: config.username
      ? {
          user: config.username,
          pass: password,
        }
      : undefined,
    connectionTimeout: (config.timeoutSeconds || 10) * 1000,
    greetingTimeout: (config.timeoutSeconds || 10) * 1000,
    socketTimeout: (config.timeoutSeconds || 10) * 1000,
    tls: {
      rejectUnauthorized: config.encryption !== "none",
    },
  };

  if (config.encryption === "starttls") {
    transportOptions["requireTLS"] = true;
  } else if (config.encryption === "none") {
    transportOptions["ignoreTLS"] = true;
  }

  return nodemailer.createTransport(transportOptions as any);
}

/**
 * Test SMTP connection and authentication without sending an email.
 */
export async function verifySmtpConnection(config: EmailSmtpConfig): Promise<TestConnectionResult> {
  if (!config.host || !config.port) {
    return {
      ok: false,
      code: "INVALID_CONFIG",
      message: "يجب تحديد اسم الخادم (Host) والمنفذ (Port) لاختبار الاتصال",
    };
  }

  const transporter = createTransporter(config);
  try {
    await transporter.verify();
    return {
      ok: true,
      message: "تم الاتصال بخادم البريد الإلكتروني والتحقق من بيانات الاعتماد بنجاح",
    };
  } catch (error) {
    const diagnosed = translateSmtpError(error);
    return {
      ok: false,
      code: diagnosed.code,
      message: diagnosed.message,
      details: diagnosed.details,
    };
  } finally {
    transporter.close();
  }
}

/**
 * Send an email via SMTP.
 */
export async function sendSmtpEmail(
  config: EmailSmtpConfig,
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
  }
): Promise<SendEmailResult> {
  if (!config.enabled) {
    return {
      ok: false,
      error: "إرسال البريد الإلكتروني معطل في إعدادات النظام",
    };
  }

  if (!params.to || !params.to.trim()) {
    return {
      ok: false,
      error: "عنوان البريد الإلكتروني للمستلم مطلوب",
    };
  }

  const transporter = createTransporter(config);
  try {
    const fromName = params.fromName || config.fromName || "نظام الموارد البشرية";
    const fromEmail = params.fromEmail || config.fromEmail || config.username;
    const replyTo = params.replyTo || config.replyTo || fromEmail;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to.trim(),
      replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return {
      ok: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const diagnosed = translateSmtpError(error);
    return {
      ok: false,
      error: `${diagnosed.message} [${diagnosed.code}]`,
    };
  } finally {
    transporter.close();
  }
}
