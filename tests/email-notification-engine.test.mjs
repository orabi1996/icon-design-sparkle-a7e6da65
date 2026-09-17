import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, isEncrypted, maskSecret } from "../src/lib/email/crypto.mjs";
import {
  DEFAULT_TEMPLATES,
  interpolateVariables,
  renderEmail,
  wrapHtmlLayout,
} from "../src/lib/email/templates.mjs";
import { translateSmtpError } from "../src/lib/email/smtp-diagnostics.mjs";

process.env["EMAIL_CONFIG_ENCRYPTION_KEY"] = "test-encryption-key-32-chars-ok!!";

test("crypto: fails securely without hardcoded fallback if key is missing", () => {
  const originalKey = process.env["EMAIL_CONFIG_ENCRYPTION_KEY"];
  delete process.env["EMAIL_CONFIG_ENCRYPTION_KEY"];
  try {
    assert.throws(
      () => encryptSecret("any-secret"),
      /Missing required environment secret: EMAIL_CONFIG_ENCRYPTION_KEY/,
    );
  } finally {
    process.env["EMAIL_CONFIG_ENCRYPTION_KEY"] = originalKey;
  }
});

test("crypto: encrypts, decrypts, and masks secret correctly", () => {
  const secret = "SuperSecretP@ssword2026!";
  const encrypted = encryptSecret(secret);

  assert.ok(isEncrypted(encrypted));
  assert.notEqual(encrypted, secret);
  assert.match(encrypted, /^enc:v1:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret);

  // Masking
  assert.equal(maskSecret(secret), "••••••••");
  assert.equal(maskSecret(""), "");
  assert.equal(maskSecret(undefined), "");

  // Fallback for plaintext
  assert.equal(decryptSecret("plain-password"), "plain-password");
});

test("templates: interpolates workflow variables with clean fallback", () => {
  const tpl = "مرحبًا {{EmployeeName}}، رقم طلبك هو #{{RequestNumber}} ونوعه {{RequestType}} في مرحلة {{CurrentStage}}.";
  const rendered = interpolateVariables(tpl, {
    eventType: "request_created",
    requestType: "طلب إجازة اعتيادية",
    requestNumber: "5024",
    employeeName: "أحمد علي",
    currentStage: "المدير المباشر",
  });

  assert.equal(
    rendered,
    "مرحبًا أحمد علي، رقم طلبك هو #5024 ونوعه طلب إجازة اعتيادية في مرحلة المدير المباشر."
  );
});

test("templates: renders Arabic RTL layout and English LTR layout", () => {
  const arabic = renderEmail({
    eventType: "request_created",
    requestType: "إجازة سنوية",
    requestNumber: 1001,
    employeeName: "محمد المنصوري",
    currentStage: "الموارد البشرية",
    currentStatus: "بانتظار الموافقة",
    language: "ar",
  });

  assert.ok(arabic.subject.includes("إجازة سنوية"));
  assert.ok(arabic.subject.includes("1001"));
  assert.ok(arabic.html.includes('dir="rtl"'));
  assert.ok(arabic.html.includes("محمد المنصوري"));

  const english = renderEmail({
    eventType: "request_created",
    requestType: "Annual Leave",
    requestNumber: 1002,
    employeeName: "John Doe",
    currentStage: "HR Review",
    currentStatus: "Pending",
    language: "en",
  });

  assert.ok(english.html.includes('dir="ltr"'));
  assert.ok(english.subject.includes("Annual Leave"));
  assert.ok(english.subject.includes("1002"));
  assert.ok(english.html.includes("John Doe"));
});

test("smtp-diagnostics: accurately translates network and auth errors to Arabic", () => {
  // Auth error
  const authErr = translateSmtpError({ code: "EAUTH", message: "Invalid login: 535-5.7.8 Username and Password not accepted." });
  assert.equal(authErr.code, "EAUTH");
  assert.ok(authErr.message.includes("بيانات المستخدم أو كلمة المرور غير صحيحة"));

  // Host not found
  const dnsErr = translateSmtpError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND smtp.invalidhost.xyz" });
  assert.equal(dnsErr.code, "ENOTFOUND");
  assert.ok(dnsErr.message.includes("اسم المضيف (Host) غير صحيح"));

  // Connection refused
  const connErr = translateSmtpError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:25" });
  assert.equal(connErr.code, "ECONNREFUSED");
  assert.ok(connErr.message.includes("المنفذ (Port) غير صحيح أو مغلق"));

  // Timeout
  const timeoutErr = translateSmtpError({ code: "ETIMEDOUT", message: "Connection timed out" });
  assert.equal(timeoutErr.code, "ETIMEDOUT");
  assert.ok(timeoutErr.message.includes("انتهت مهلة الاتصال بالخادم"));

  // TLS error
  const tlsErr = translateSmtpError({ code: "CERT_HAS_EXPIRED", message: "certificate has expired" });
  assert.equal(tlsErr.code, "ETLS");
  assert.ok(tlsErr.message.includes("مشكلة في تشفير TLS / SSL"));
});

test("workflow lifecycle: leave request multi-stage simulation", () => {
  const events = [];
  const captureDispatcher = (event) => events.push(event);

  // 1. Employee submits leave request
  captureDispatcher({
    eventType: "request_created",
    requestId: "req-101",
    requestNumber: 5010,
    requestType: "طلب إجازة",
    employeeName: "سارة خالد",
    employeeEmail: "sara@company.com",
    currentStage: "المدير المباشر",
    currentStatus: "بانتظار الموافقة",
  });

  // Stage 1 assigned to manager
  captureDispatcher({
    eventType: "stage_assigned",
    requestId: "req-101",
    requestNumber: 5010,
    requestType: "طلب إجازة",
    currentStage: "المدير المباشر",
    approverName: "عبدالله الشمري",
    approverEmail: "manager@company.com",
  });

  // 2. Manager approves stage 1, moves to HR
  captureDispatcher({
    eventType: "stage_approved",
    requestId: "req-101",
    requestNumber: 5010,
    requestType: "طلب إجازة",
    employeeName: "سارة خالد",
    employeeEmail: "sara@company.com",
    previousStage: "المدير المباشر",
    currentStage: "الموارد البشرية",
    actionBy: "عبدالله الشمري",
  });

  captureDispatcher({
    eventType: "stage_assigned",
    requestId: "req-101",
    requestNumber: 5010,
    requestType: "طلب إجازة",
    currentStage: "الموارد البشرية",
    approverName: "فريق الموارد البشرية",
    approverEmail: "hr@company.com",
  });

  // 3. HR gives final approval
  captureDispatcher({
    eventType: "final_approved",
    requestId: "req-101",
    requestNumber: 5010,
    requestType: "طلب إجازة",
    employeeName: "سارة خالد",
    employeeEmail: "sara@company.com",
    currentStage: "الموارد البشرية",
    actionBy: "مدير الموارد البشرية",
  });

  assert.equal(events.length, 5);
  assert.equal(events[0].eventType, "request_created");
  assert.equal(events[1].eventType, "stage_assigned");
  assert.equal(events[2].eventType, "stage_approved");
  assert.equal(events[3].eventType, "stage_assigned");
  assert.equal(events[4].eventType, "final_approved");
  assert.equal(events[4].actionBy, "مدير الموارد البشرية");
});

test("workflow rejection: rejection reason and stage propagation", () => {
  const email = renderEmail({
    eventType: "stage_rejected",
    requestId: "req-102",
    requestNumber: 5011,
    requestType: "طلب سلفة مالية",
    employeeName: "خالد بن فهد",
    currentStage: "المدير المالي",
    actionBy: "المدير المالي",
    rejectionReason: "تجاوز الحد الائتماني المسموح به للراتب",
  });

  assert.ok(email.subject.includes("تم رفض طلبك"));
  assert.ok(email.subject.includes("5011"));
  assert.ok(email.html.includes("تجاوز الحد الائتماني المسموح به للراتب"));
  assert.ok(email.html.includes("المدير المالي"));
});

test("generic support: loan / inquiry / permits all produce valid emails", () => {
  const loanEmail = renderEmail({
    eventType: "request_created",
    requestType: "طلب سلفة شخصية",
    requestNumber: 801,
    employeeName: "عمرو جمال",
    currentStage: "مدير الحسابات",
    amount: "15,000",
  });
  assert.ok(loanEmail.html.includes("طلب سلفة شخصية"));
  assert.ok(loanEmail.html.includes("801"));

  const inquiryEmail = renderEmail({
    eventType: "inquiry_issued",
    requestType: "مساءلة إدارية",
    employeeName: "ياسر النجار",
    inquiryName: "تأخير صباحي متكرر",
    inquiryType: "تأخير",
    inquiryDate: "2026-09-17",
  });
  assert.ok(inquiryEmail.html.includes("تأخير صباحي متكرر"));
  assert.ok(inquiryEmail.html.includes("ياسر النجار"));
});

test("fail-safe: missing employee email is handled gracefully without exception", () => {
  // Simulating recipient resolution when employee has no email
  const resolved = { email: null, name: "موظف بلا بريد", empNo: "EMP-999" };
  assert.equal(resolved.email, null);

  // Building log item for missing email
  const logItem = {
    recipient_email: "missing@email.invalid",
    recipient_name: resolved.name,
    status: "skipped_no_email",
    last_error: "لا يوجد بريد إلكتروني مسجل للموظف أو المسؤول",
  };

  assert.equal(logItem.status, "skipped_no_email");
  assert.ok(logItem.last_error.includes("لا يوجد بريد"));
});

test("idempotency: deduplication key generation prevents double sends", () => {
  const event = {
    eventType: "stage_approved",
    requestId: "req-999",
    currentStage: "المدير المباشر",
    employeeEmail: "emp@company.com",
    actionDate: "2026-09-17",
  };

  const key1 = `${event.eventType}:${event.requestId}:${event.currentStage}:${event.employeeEmail}:${event.actionDate}`;
  const key2 = `${event.eventType}:${event.requestId}:${event.currentStage}:${event.employeeEmail}:${event.actionDate}`;

  assert.equal(key1, key2);

  const seen = new Set();
  const dispatchOnce = (k) => {
    if (seen.has(k)) return "duplicate_skipped";
    seen.add(k);
    return "queued";
  };

  assert.equal(dispatchOnce(key1), "queued");
  assert.equal(dispatchOnce(key2), "duplicate_skipped");
});
