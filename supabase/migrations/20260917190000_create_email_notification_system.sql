-- ============================================================================
-- Central Email Configuration, Templates & Logs System
-- ============================================================================

-- 1. Table for email logs (سجل البريد الإلكتروني المركزي)
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  recipient_email text,
  recipient_name text,
  sender_email text,
  sender_name text,
  subject text NOT NULL,
  body_html text,
  body_text text,
  request_type text,
  request_id text,
  request_number text,
  event_type text NOT NULL,
  template_key text,
  language text NOT NULL DEFAULT 'ar',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped_no_email')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  message_id text,
  dedup_key text UNIQUE,
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON public.email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_status_idx ON public.email_logs (status);
CREATE INDEX IF NOT EXISTS email_logs_recipient_idx ON public.email_logs (recipient_email);
CREATE INDEX IF NOT EXISTS email_logs_request_idx ON public.email_logs (request_type, request_number);
CREATE INDEX IF NOT EXISTS email_logs_event_idx ON public.email_logs (event_type);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_logs_all ON public.email_logs;
CREATE POLICY email_logs_all ON public.email_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_logs TO authenticated, service_role;

-- 2. Table for email templates (قوالب البريد الإلكتروني)
CREATE TABLE IF NOT EXISTS public.email_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  event_type text NOT NULL,
  request_type text NOT NULL DEFAULT 'all',
  subject_ar text NOT NULL,
  subject_en text NOT NULL,
  body_ar text NOT NULL,
  body_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_templates_event_idx ON public.email_templates (event_type, request_type);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_all ON public.email_templates;
CREATE POLICY email_templates_all ON public.email_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated, service_role;

-- 3. Seed default templates (القوالب الافتراضية المدمجة)
INSERT INTO public.email_templates (id, name, event_type, request_type, subject_ar, subject_en, body_ar, body_en, is_active, is_system)
VALUES
(
  'tpl_request_created',
  'تأكيد استلام طلب جديد (للموظف)',
  'request_created',
  'all',
  'تم استلام طلبك: {{RequestType}} رقم #{{RequestNumber}}',
  'Request Received: {{RequestType}} #{{RequestNumber}}',
  '<p>مرحبًا <strong>{{EmployeeName}}</strong>،</p><p>تم استلام طلبك بنجاح وجارٍ متابعته في مسار الاعتماد.</p><table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e2e8f0;"><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">رقم الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace;">{{RequestNumber}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">نوع الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{RequestType}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">تاريخ الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{RequestDate}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold;">المرحلة الحالية:</td><td style="padding:8px 12px;">{{CurrentStage}}</td></tr></table><p>سيتم إشعارك تلقائيًا عند حدوث أي تحديث جديد على طلبك.</p>',
  '<p>Hello <strong>{{EmployeeName}}</strong>,</p><p>Your request has been received and is currently in the approval workflow.</p><p>Request Number: <code>#{{RequestNumber}}</code><br/>Type: {{RequestType}}<br/>Current Stage: {{CurrentStage}}</p>',
  true,
  true
),
(
  'tpl_stage_assigned',
  'طلب جديد بانتظار الإجراء (للمعتمد)',
  'stage_assigned',
  'all',
  'طلب جديد بانتظار مراجعتك – #{{RequestNumber}}',
  'Action Required: New Request Pending Review – #{{RequestNumber}}',
  '<p>عناية المسئول،</p><p>يوجد طلب جديد بانتظار مراجعتك واعتمادك وفق مسار العمل المعتمد.</p><table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e2e8f0;"><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">الموظف:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{EmployeeName}} ({{EmployeeCode}})</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">نوع الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{RequestType}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">رقم الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace;">{{RequestNumber}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">تاريخ التقديم:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{RequestDate}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold;">المرحلة الحالية:</td><td style="padding:8px 12px;">{{CurrentStage}}</td></tr></table><p><a href="{{ActionUrl}}" style="display:inline-block; padding:10px 20px; background:#0284c7; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">مراجعة واتخاذ الإجراء داخل النظام</a></p>',
  '<p>Dear Approver,</p><p>A new request requires your review and action.</p><p>Employee: {{EmployeeName}} ({{EmployeeCode}})<br/>Type: {{RequestType}}<br/>Number: #{{RequestNumber}}<br/>Stage: {{CurrentStage}}</p>',
  true,
  true
),
(
  'tpl_stage_approved',
  'اعتماد مرحلة وانتقال الطلب (للموظف)',
  'stage_approved',
  'all',
  'تحديث على طلبك #{{RequestNumber}}: تم اعتماد مرحلة {{PreviousStage}}',
  'Request Update #{{RequestNumber}}: Stage {{PreviousStage}} Approved',
  '<p>مرحبًا <strong>{{EmployeeName}}</strong>،</p><p>تم اعتماد طلبك في مرحلة <strong>{{PreviousStage}}</strong> بنجاح بواسطة <strong>{{ActionBy}}</strong> بتاريخ {{ActionDate}}.</p><p>انتقل الطلب الآن إلى مرحلة: <strong>{{CurrentStage}}</strong>.</p><p>سيتم إشعارك فور اكتمال الإجراءات التالية.</p>',
  '<p>Hello <strong>{{EmployeeName}}</strong>,</p><p>Your request has been approved in stage <strong>{{PreviousStage}}</strong> by <strong>{{ActionBy}}</strong> on {{ActionDate}}.</p><p>The request has moved to: <strong>{{CurrentStage}}</strong>.</p>',
  true,
  true
),
(
  'tpl_final_approved',
  'الاعتماد النهائي للطلب (للموظف)',
  'final_approved',
  'all',
  'تم اعتماد طلبك نهائيًا: {{RequestType}} رقم #{{RequestNumber}}',
  'Final Approval: {{RequestType}} #{{RequestNumber}} has been Approved',
  '<p>مرحبًا <strong>{{EmployeeName}}</strong>،</p><p style="color:#059669; font-weight:bold; font-size:16px;">تهانينا، تم اعتماد طلبك نهائيًا واكتمال كافة دورات الموافقة المطلوبة.</p><table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e2e8f0;"><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">نوع الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{RequestType}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">رقم الطلب:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace;">{{RequestNumber}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">تاريخ الاعتماد:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{ActionDate}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold;">معتمد بواسطة:</td><td style="padding:8px 12px;">{{ActionBy}}</td></tr></table>',
  '<p>Hello <strong>{{EmployeeName}}</strong>,</p><p>Your request <strong>#{{RequestNumber}}</strong> has received final approval.</p>',
  true,
  true
),
(
  'tpl_stage_rejected',
  'رفض الطلب (للموظف)',
  'stage_rejected',
  'all',
  'تم رفض طلبك: {{RequestType}} رقم #{{RequestNumber}}',
  'Request Rejected: {{RequestType}} #{{RequestNumber}}',
  '<p>مرحبًا <strong>{{EmployeeName}}</strong>،</p><p style="color:#dc2626; font-weight:bold;">نحيطك علمًا بأنه تم رفض طلبك رقم #{{RequestNumber}}.</p><table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e2e8f0;"><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">المرحلة:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{CurrentStage}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">الإجراء بواسطة:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{ActionBy}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold;">سبب الرفض:</td><td style="padding:8px 12px; color:#b91c1c;">{{RejectionReason}}</td></tr></table><p>يمكنك مراجعة المسئول أو تقديم طلب جديد بعد استيفاء الملاحظات.</p>',
  '<p>Hello <strong>{{EmployeeName}}</strong>,</p><p>Your request #{{RequestNumber}} was rejected in stage {{CurrentStage}} by {{ActionBy}}.<br/>Reason: {{RejectionReason}}</p>',
  true,
  true
),
(
  'tpl_inquiry_issued',
  'تسجيل مساءلة إدارية (للموظف)',
  'inquiry_issued',
  'all',
  'إشعار تسجيل مساءلة إدارية – {{InquiryType}}',
  'Notice of Administrative Inquiry – {{InquiryType}}',
  '<p>مرحبًا <strong>{{EmployeeName}}</strong>،</p><p>نحيطك علمًا بأنه قد تم تسجيل مساءلة إدارية بحقكم، ويرجى الاطلاع وتقديم الإفادة المطلوبة.</p><table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e2e8f0;"><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">موضوع المساءلة:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{InquiryName}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold; border-bottom:1px solid #e2e8f0;">نوع المساءلة:</td><td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">{{InquiryType}}</td></tr><tr><td style="padding:8px 12px; background:#f8fafc; font-weight:bold;">التاريخ:</td><td style="padding:8px 12px;">{{InquiryDate}}</td></tr></table>',
  '<p>Hello <strong>{{EmployeeName}}</strong>,</p><p>An administrative inquiry ({{InquiryType}}) has been registered. Please check the system for details.</p>',
  true,
  true
),
(
  'tpl_test_email',
  'رسالة اختبار إعدادات البريد',
  'test_email',
  'all',
  'رسالة اختبار اتصال البريد الإلكتروني – نظام الموارد البشرية',
  'Email Connection Test – HRMS System',
  '<p>مرحبًا،</p><p style="color:#0284c7; font-weight:bold;">هذه رسالة اختبار تم إرسالها بنجاح من نظام الموارد البشرية.</p><p>تؤكد هذه الرسالة أن إعدادات خادم SMTP وتشفير البيانات وبيانات الاعتماد تعمل بشكل سليم تمامًا.</p><p style="font-size:12px; color:#64748b;">تاريخ ووقت الاختبار: {{ActionDate}}</p>',
  '<p>Hello,</p><p>This is a test email sent from the HRMS system. Your SMTP settings and credentials are configured correctly.</p><p>Timestamp: {{ActionDate}}</p>',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;
