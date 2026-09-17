/**
 * Diagnostic translator for SMTP error codes into clean Arabic explanations.
 */
export function translateSmtpError(error) {
  const err = error || {};
  const rawMsg = err.message || String(error);
  const code = err.code || (err.responseCode ? `HTTP_${err.responseCode}` : "UNKNOWN");

  if (code === "EAUTH" || err.responseCode === 535 || rawMsg.includes("Invalid login") || rawMsg.includes("Username and Password not accepted")) {
    return {
      code: "EAUTH",
      message: "بيانات المستخدم أو كلمة المرور غير صحيحة (Authentication Failed)",
      details: rawMsg,
    };
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || rawMsg.includes("getaddrinfo")) {
    return {
      code: "ENOTFOUND",
      message: "فشل الاتصال بالخادم: اسم المضيف (Host) غير صحيح أو تعذر حله عبر DNS",
      details: rawMsg,
    };
  }

  if (code === "ECONNREFUSED") {
    return {
      code: "ECONNREFUSED",
      message: "فشل الاتصال: المنفذ (Port) غير صحيح أو مغلق على خادم البريد أو جدار الحماية",
      details: rawMsg,
    };
  }

  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || rawMsg.toLowerCase().includes("timeout")) {
    return {
      code: "ETIMEDOUT",
      message: "انتهت مهلة الاتصال بالخادم (Timeout): الخادم لم يستجب في الوقت المحدد",
      details: rawMsg,
    };
  }

  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    rawMsg.includes("self signed") ||
    rawMsg.includes("handshake") ||
    rawMsg.includes("SSL")
  ) {
    return {
      code: "ETLS",
      message: "مشكلة في تشفير TLS / SSL أو التحقق من شهادة الأمان",
      details: rawMsg,
    };
  }

  return {
    code,
    message: `تعذر إتمام عملية SMTP: ${rawMsg}`,
    details: rawMsg,
  };
}
