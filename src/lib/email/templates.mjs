export const DEFAULT_TEMPLATES = {
  request_created: {
    id: "tpl_request_created",
    name: "تأكيد استلام طلب جديد (للموظف)",
    eventType: "request_created",
    requestType: "all",
    subjectAr: "تم استلام طلبك: {{RequestType}} رقم #{{RequestNumber}}",
    subjectEn: "Request Received: {{RequestType}} #{{RequestNumber}}",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا <strong>{{EmployeeName}}</strong>،
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        تم استلام طلبك بنجاح في النظام، وجارٍ توجيهه للمراجعة والاعتماد وفق مسار العمل المعتمد.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">رقم الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: bold;">#{{RequestNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">نوع الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{RequestType}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">تاريخ التقديم:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{RequestDate}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">الحالة الحالية:</td>
            <td style="padding: 6px 0; color: #0284c7; font-weight: bold;">{{CurrentStatus}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">المرحلة الحالية:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{CurrentStage}}</td>
          </tr>
        </table>
      </div>
      <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
        سيتم إشعارك تلقائيًا عبر البريد الإلكتروني عند حدوث أي إجراء أو تحديث جديد على الطلب.
      </p>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello <strong>{{EmployeeName}}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        Your request has been successfully submitted and forwarded to the approval chain.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">Request Number:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: bold;">#{{RequestNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Type:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{RequestType}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Date:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{RequestDate}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Stage:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{CurrentStage}}</td>
          </tr>
        </table>
      </div>
    `,
    isActive: true,
    isSystem: true,
  },

  stage_assigned: {
    id: "tpl_stage_assigned",
    name: "طلب جديد بانتظار الإجراء (للمعتمد)",
    eventType: "stage_assigned",
    requestType: "all",
    subjectAr: "طلب جديد بانتظار الإجراء – #{{RequestNumber}}",
    subjectEn: "Action Required: Request #{{RequestNumber}} Pending Review",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        عناية المسئول / صاحب الاعتماد،
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        يوجد طلب جديد وصل إلى مرحلتكم وبانتظار المراجعة واتخاذ الإجراء المناسب.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">الموظف:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">{{EmployeeName}} ({{EmployeeCode}})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">نوع الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{RequestType}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">رقم الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: bold;">#{{RequestNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">تاريخ التقديم:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{RequestDate}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">المرحلة الحالية:</td>
            <td style="padding: 6px 0; color: #b45309; font-weight: bold;">{{CurrentStage}}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center; margin: 24px 0 12px;">
        <a href="{{ActionUrl}}" style="display: inline-block; padding: 12px 28px; background-color: #0284c7; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: bold; box-shadow: 0 2px 4px rgba(2,132,199,0.25);">
          فتح الطلب واتخاذ الإجراء في النظام
        </a>
      </div>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Dear Approver,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        A request requires your review and approval in stage: <strong>{{CurrentStage}}</strong>.
      </p>
    `,
    isActive: true,
    isSystem: true,
  },

  stage_approved: {
    id: "tpl_stage_approved",
    name: "اعتماد مرحلة وانتقال الطلب (للموظف)",
    eventType: "stage_approved",
    requestType: "all",
    subjectAr: "تحديث على طلبك #{{RequestNumber}}: تم اعتماد مرحلة {{PreviousStage}}",
    subjectEn: "Request Update #{{RequestNumber}}: Stage {{PreviousStage}} Approved",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا <strong>{{EmployeeName}}</strong>،
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        نحيطك علمًا بأنه تم اعتماد طلبك بنجاح في مرحلة <strong>{{PreviousStage}}</strong> بواسطة <strong>{{ActionBy}}</strong>.
      </p>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 600; width: 35%;">رقم الطلب:</td>
            <td style="padding: 6px 0; color: #14532d; font-family: monospace; font-weight: bold;">#{{RequestNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 600;">المرحلة المعتمدة:</td>
            <td style="padding: 6px 0; color: #14532d; font-weight: bold;">{{PreviousStage}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 600;">تاريخ الاعتماد:</td>
            <td style="padding: 6px 0; color: #14532d;">{{ActionDate}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #166534; font-weight: 600;">المرحلة التالية:</td>
            <td style="padding: 6px 0; color: #0284c7; font-weight: bold;">{{CurrentStage}}</td>
          </tr>
        </table>
      </div>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello <strong>{{EmployeeName}}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        Your request #{{RequestNumber}} has been approved in stage <strong>{{PreviousStage}}</strong> by <strong>{{ActionBy}}</strong>.
      </p>
    `,
    isActive: true,
    isSystem: true,
  },

  final_approved: {
    id: "tpl_final_approved",
    name: "الاعتماد النهائي للطلب (للموظف)",
    eventType: "final_approved",
    requestType: "all",
    subjectAr: "تم اعتماد طلبك نهائيًا: {{RequestType}} رقم #{{RequestNumber}}",
    subjectEn: "Final Approval: {{RequestType}} #{{RequestNumber}} has been Approved",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا <strong>{{EmployeeName}}</strong>،
      </p>
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <h3 style="margin: 0 0 8px; color: #065f46; font-size: 18px; font-weight: bold;">
          تهانينا! تم الاعتماد النهائي لطلبك
        </h3>
        <p style="margin: 0; font-size: 13.5px; color: #047857;">
          تمت الموافقة النهائية على الطلب واكتمال كافة دورات ومراحل الاعتماد النظامية.
        </p>
      </div>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello <strong>{{EmployeeName}}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #065f46; font-weight: bold;">
        Your request #{{RequestNumber}} has received FINAL APPROVAL.
      </p>
    `,
    isActive: true,
    isSystem: true,
  },

  stage_rejected: {
    id: "tpl_stage_rejected",
    name: "رفض الطلب (للموظف)",
    eventType: "stage_rejected",
    requestType: "all",
    subjectAr: "تم رفض طلبك: {{RequestType}} رقم #{{RequestNumber}}",
    subjectEn: "Request Rejected: {{RequestType}} #{{RequestNumber}}",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا <strong>{{EmployeeName}}</strong>،
      </p>
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px; color: #991b1b; font-size: 16px; font-weight: bold;">
          تم رفض طلبك
        </h3>
        <p style="margin: 0; font-size: 13.5px; color: #b91c1c;">
          نحيطك علمًا بأنه تم رفض الطلب في مسار المراجعة.
        </p>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">نوع الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">{{RequestType}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">رقم الطلب:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: bold;">#{{RequestNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">مرحلة الرفض:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">{{CurrentStage}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">مرفوض بواسطة:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{ActionBy}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #b91c1c; font-weight: bold;">سبب الرفض:</td>
            <td style="padding: 6px 0; color: #b91c1c; font-weight: bold;">{{RejectionReason}}</td>
          </tr>
        </table>
      </div>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello <strong>{{EmployeeName}}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #991b1b; font-weight: bold;">
        Your request #{{RequestNumber}} was rejected in stage {{CurrentStage}} by {{ActionBy}}.
      </p>
      <p style="margin: 0 0 12px; font-size: 13px; color: #334155;">
        Reason: <strong>{{RejectionReason}}</strong>
      </p>
    `,
    isActive: true,
    isSystem: true,
  },

  inquiry_issued: {
    id: "tpl_inquiry_issued",
    name: "تسجيل مساءلة إدارية (للموظف)",
    eventType: "inquiry_issued",
    requestType: "all",
    subjectAr: "إشعار تسجيل مساءلة إدارية – {{InquiryType}}",
    subjectEn: "Notice of Administrative Inquiry – {{InquiryType}}",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا <strong>{{EmployeeName}}</strong>،
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        نحيطك علمًا بأنه تم تسجيل إجراء مساءلة إدارية بحقكم، ويرجى الاطلاع وتقديم الإفادة أو المبررات عبر النظام.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">موضوع المساءلة:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">{{InquiryName}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">نوع المساءلة:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{InquiryType}}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">تاريخ التسجيل:</td>
            <td style="padding: 6px 0; color: #0f172a;">{{InquiryDate}}</td>
          </tr>
        </table>
      </div>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello <strong>{{EmployeeName}}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        An administrative inquiry ({{InquiryType}} - {{InquiryName}}) has been recorded in the system.
      </p>
    `,
    isActive: true,
    isSystem: true,
  },

  test_email: {
    id: "tpl_test_email",
    name: "رسالة اختبار إعدادات البريد",
    eventType: "test_email",
    requestType: "all",
    subjectAr: "رسالة اختبار اتصال البريد الإلكتروني – نظام الموارد البشرية",
    subjectEn: "Email Connection Test – HRMS System",
    bodyAr: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        مرحبًا،
      </p>
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <h3 style="margin: 0 0 8px; color: #0369a1; font-size: 17px; font-weight: bold;">
          نجاح اختبار اتصال البريد الإلكتروني
        </h3>
        <p style="margin: 0; font-size: 13.5px; color: #0284c7;">
          هذه رسالة اختبار تم إرسالها بنجاح من نظام الموارد البشرية HRMS.
        </p>
      </div>
      <p style="margin: 0 0 12px; font-size: 13.5px; line-height: 1.6; color: #334155;">
        تؤكد هذه الرسالة أن إعدادات خادم SMTP، وبيانات الاعتماد، والتشفير، ومنفذ الاتصال تعمل جميعها بكفاءة وجاهزة لتوصيل إشعارات دورات العمل والطلبات.
      </p>
      <p style="margin: 0; font-size: 12px; color: #64748b; font-family: monospace;">
        تاريخ ووقت الاختبار: {{ActionDate}}
      </p>
    `,
    bodyEn: `
      <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
        Hello,
      </p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #0284c7; font-weight: bold;">
        This is a test email sent from the HRMS system. Your SMTP settings are working properly.
      </p>
    `,
    isActive: true,
    isSystem: true,
  },
};

export function wrapHtmlLayout(content, options = {}) {
  const lang = options.language || "ar";
  const isRtl = lang === "ar";
  const dir = isRtl ? "rtl" : "ltr";
  const company = options.companyName || "نظام الموارد البشرية HRMS";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || company}</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; direction: ${dir}; text-align: ${isRtl ? "right" : "left"};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 0 16px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff;">
              <div style="font-size: 18px; font-weight: 800;">${company}</div>
              <div style="font-size: 12px; opacity: 0.85; margin-top: 2px;">إشعارات دورات العمل والطلبات</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11.5px; color: #94a3b8; text-align: center;">
              تم إرسال هذا البريد الإلكتروني تلقائيًا من نظام الموارد البشرية. يُرجى عدم الرد المباشر على هذه الرسالة.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function interpolateVariables(templateText, event) {
  if (!templateText) return "";

  const nowFormatted =
    event.actionDate ||
    new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

  const variables = {
    EmployeeName: event.employeeName || "الموظف",
    EmployeeCode: String(event.employeeCode || "—"),
    RequestNumber: String(event.requestNumber || event.requestId || "—"),
    RequestType: event.requestType || "طلب",
    RequestDate: event.actionDate || nowFormatted,
    CurrentStatus: event.currentStatus || "قيد المراجعة",
    CurrentStage: event.currentStage || "المرحلة الحالية",
    PreviousStage: event.previousStage || "المرحلة السابقة",
    NextStage: event.nextStage || "المرحلة القادمة",
    ActionBy: event.actionBy || "المسؤول المعتمد",
    ActionDate: nowFormatted,
    RejectionReason: event.rejectionReason || "لم يتم تحديد سبب",
    Amount: event.amount ? `${event.amount} ر.س` : "—",
    LeaveFrom: event.leaveFrom || "—",
    LeaveTo: event.leaveTo || "—",
    Days: String(event.days || "—"),
    ActionUrl: event.actionUrl || "#",
    InquiryName: event.inquiryName || "مساءلة إدارية",
    InquiryType: event.inquiryType || "إدارية",
    InquiryDate: event.inquiryDate || nowFormatted,
    CompanyName: event.companyName || "نظام الموارد البشرية",
  };

  let result = templateText;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{?\\s*${key}\\s*\\}\\}?`, "gi");
    result = result.replace(regex, value);
  }
  return result;
}

export function renderEmail(event, customTemplate) {
  const lang = event.language || "ar";
  const fallback = DEFAULT_TEMPLATES[event.eventType] || DEFAULT_TEMPLATES["request_created"];
  const tpl = customTemplate || fallback;

  const subjectRaw =
    lang === "en" ? tpl.subjectEn || tpl.subjectAr : tpl.subjectAr;
  const bodyRaw =
    lang === "en" ? tpl.bodyEn || tpl.bodyAr : tpl.bodyAr;

  const subject = interpolateVariables(subjectRaw, event);
  const bodyContent = interpolateVariables(bodyRaw, event);
  const html = wrapHtmlLayout(bodyContent, {
    language: lang,
    companyName: event.companyName,
    title: subject,
  });

  const text = bodyContent
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { subject, html, text };
}
