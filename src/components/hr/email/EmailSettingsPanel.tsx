import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getEmailLogsFn,
  getEmailRulesFn,
  getEmailTemplatesFn,
  getSmtpConfigFn,
  resendFailedEmailFn,
  saveEmailRulesFn,
  saveEmailTemplateFn,
  saveSmtpConfigFn,
  sendTestEmailFn,
  testSmtpConnectionFn,
} from "@/lib/email/functions";
import type {
  EmailLogItem,
  EmailRulesConfig,
  EmailSmtpConfig,
  EmailTemplate,
  TestConnectionResult,
} from "@/lib/email/types";

export function EmailSettingsPanel() {
  const [subTab, setSubTab] = useState<"smtp" | "rules" | "templates" | "logs">("smtp");

  return (
    <div className="space-y-4">
      {/* Sub Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {[
          { id: "smtp", label: "تهيئة خادم SMTP واختبار الاتصال", icon: "dns" },
          { id: "rules", label: "قواعد تشغيل الإشعارات", icon: "rule" },
          { id: "templates", label: "قوالب البريد الإلكتروني", icon: "draw" },
          { id: "logs", label: "سجل البريد المركزي", icon: "history" },
        ].map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
              }`}
            >
              <MaterialIcon name={tab.icon} size={16} filled={active} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === "smtp" && <SmtpConfigTab />}
      {subTab === "rules" && <RulesConfigTab />}
      {subTab === "templates" && <TemplatesTab />}
      {subTab === "logs" && <LogsTab />}
    </div>
  );
}

/* ==========================================================================
   1. SMTP Configuration Tab
   ========================================================================== */
function SmtpConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const [form, setForm] = useState<EmailSmtpConfig>({
    enabled: false,
    host: "smtp.gmail.com",
    port: 587,
    encryption: "tls",
    fromEmail: "hr@company.com",
    fromName: "نظام الموارد البشرية HRMS",
    username: "",
    password: "",
    hasPassword: false,
    replyTo: "",
    timeoutSeconds: 15,
    maxRetries: 3,
  });

  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    getSmtpConfigFn()
      .then((cfg) => {
        setForm(cfg);
        if (!cfg.hasPassword) setChangePassword(true);
      })
      .catch((err) => toast.error(`تعذر تحميل إعدادات البريد: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<EmailSmtpConfig> = {
        ...form,
        password: changePassword ? newPassword : form.password,
      };
      const res = await saveSmtpConfigFn({ data: payload as any });
      toast.success(res.message);
      if (changePassword && newPassword) {
        setChangePassword(false);
        setNewPassword("");
        setForm((prev) => ({ ...prev, hasPassword: true, password: "••••••••" }));
      }
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSmtpConnectionFn({
        data: {
          host: form.host,
          port: form.port,
          encryption: form.encryption,
          username: form.username,
          password: changePassword ? newPassword : form.password,
          timeoutSeconds: form.timeoutSeconds,
        },
      });
      setTestResult(res);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      const msg = err.message || "حدث خطأ غير متوقع أثناء اختبار الاتصال";
      setTestResult({ ok: false, message: msg, details: String(err) });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testRecipient.trim() || !testRecipient.includes("@")) {
      toast.error("أدخل عنوان بريد إلكتروني صالح لاستقبال الاختبار");
      return;
    }
    setSendingTest(true);
    try {
      const res = await sendTestEmailFn({ data: { recipientEmail: testRecipient.trim() } });
      if (res.success) {
        toast.success(res.message);
        setTestEmailOpen(false);
        setTestRecipient("");
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || "فشل إرسال رسالة الاختبار");
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm font-semibold text-muted-foreground">
        <MaterialIcon name="sync" size={20} className="animate-spin me-2" />
        جارٍ تحميل إعدادات البريد الإلكتروني...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Master Toggle Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <MaterialIcon name="mark_email_read" size={22} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-foreground">تفعيل خدمة إرسال البريد الإلكتروني من النظام</h3>
              <p className="text-xs text-muted-foreground">
                عند التفعيل، سيقوم النظام تلقائيًا بإرسال إشعارات الاعتماد والطلبات والمساءلات عبر خادم SMTP المحدد.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-foreground">
              {form.enabled ? "الخدمة مفعّلة" : "الخدمة معطّلة"}
            </span>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Connection Diagnostic Result Banner */}
      {testResult && (
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 text-xs font-semibold ${
            testResult.ok
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive-foreground"
          }`}
        >
          <MaterialIcon
            name={testResult.ok ? "check_circle" : "error"}
            size={20}
            className={testResult.ok ? "text-emerald-600" : "text-destructive"}
            filled
          />
          <div className="flex-1 space-y-1">
            <div className="font-extrabold text-[13px]">{testResult.message}</div>
            {testResult.details && (
              <div className="font-mono text-[11px] opacity-80" dir="ltr">
                {testResult.details}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTestResult(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <MaterialIcon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Main Settings Card */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MaterialIcon name="settings_ethernet" size={18} className="text-primary" />
            بيانات خادم البريد (SMTP Server Parameters)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* SMTP Host */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">اسم الخادم (SMTP Host) *</Label>
            <Input
              value={form.host}
              onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
              placeholder="smtp.example.com أو smtp.gmail.com"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          {/* SMTP Port */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">منفذ الخادم (Port) *</Label>
            <Input
              type="number"
              value={form.port}
              onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) || 587 }))}
              placeholder="587 أو 465 أو 25"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          {/* Encryption Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">نوع التشفير (Encryption) *</Label>
            <Select
              value={form.encryption}
              onValueChange={(val: any) => setForm((p) => ({ ...p, encryption: val }))}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="اختر التشفير" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tls">STARTTLS / TLS (الموصى به - Port 587)</SelectItem>
                <SelectItem value="ssl">SSL / SMTPS (Port 465)</SelectItem>
                <SelectItem value="none">بدون تشفير (None - Port 25)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">اسم المستخدم (SMTP Username)</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="username@company.com"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">كلمة مرور SMTP</Label>
              {form.hasPassword && !changePassword && (
                <button
                  type="button"
                  onClick={() => setChangePassword(true)}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  تغيير كلمة المرور
                </button>
              )}
            </div>
            {changePassword ? (
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة"
                  dir="ltr"
                  className="font-mono text-xs"
                />
                {form.hasPassword && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setChangePassword(false);
                      setNewPassword("");
                    }}
                  >
                    إلغاء
                  </Button>
                )}
              </div>
            ) : (
              <Input
                type="text"
                readOnly
                value="••••••••••••"
                className="bg-muted font-mono text-xs text-muted-foreground"
              />
            )}
          </div>

          {/* Sender From Email */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">البريد المرسل (From Email) *</Label>
            <Input
              type="email"
              value={form.fromEmail}
              onChange={(e) => setForm((p) => ({ ...p, fromEmail: e.target.value }))}
              placeholder="hr@company.com"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          {/* Sender From Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">اسم المرسل (From Name) *</Label>
            <Input
              value={form.fromName}
              onChange={(e) => setForm((p) => ({ ...p, fromName: e.target.value }))}
              placeholder="إدارة الموارد البشرية"
              className="text-xs"
            />
          </div>

          {/* Reply-To Email */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">بريد الرد (Reply-To Email)</Label>
            <Input
              type="email"
              value={form.replyTo || ""}
              onChange={(e) => setForm((p) => ({ ...p, replyTo: e.target.value }))}
              placeholder="support@company.com"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          {/* Timeout */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">مهلة الاتصال بالثواني (Timeout)</Label>
            <Input
              type="number"
              min={3}
              max={60}
              value={form.timeoutSeconds}
              onChange={(e) => setForm((p) => ({ ...p, timeoutSeconds: Number(e.target.value) || 15 }))}
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Test Connection Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="flex items-center gap-2 text-xs font-bold"
          >
            <MaterialIcon
              name={testing ? "sync" : "network_check"}
              size={16}
              className={testing ? "animate-spin text-primary" : ""}
            />
            <span>{testing ? "جارٍ اختبار الاتصال..." : "اختبار الاتصال"}</span>
          </Button>

          {/* Send Test Email Button */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTestEmailOpen(true)}
            disabled={testing || saving}
            className="flex items-center gap-2 text-xs font-bold"
          >
            <MaterialIcon name="send" size={16} />
            <span>إرسال رسالة اختبار</span>
          </Button>
        </div>

        {/* Save Settings Button */}
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 text-xs font-bold"
        >
          <MaterialIcon name={saving ? "sync" : "save"} size={16} className={saving ? "animate-spin" : ""} />
          <span>{saving ? "جارٍ الحفظ..." : "حفظ إعدادات البريد"}</span>
        </Button>
      </div>

      {/* Dialog: Send Test Email */}
      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <MaterialIcon name="outgoing_mail" size={18} className="text-primary" />
              إرسال رسالة بريد إلكتروني تجريبية
            </DialogTitle>
            <DialogDescription className="text-xs">
              أدخل البريد الإلكتروني الذي ترغب في استلام رسالة الاختبار عليه للتأكد من وصول الرسائل بنجاح.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold">البريد الإلكتروني للمستلم *</Label>
            <Input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTestEmailOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendTestEmail}
              disabled={sendingTest}
              className="flex items-center gap-2 font-bold"
            >
              <MaterialIcon name={sendingTest ? "sync" : "send"} size={16} className={sendingTest ? "animate-spin" : ""} />
              <span>{sendingTest ? "جارٍ الإرسال..." : "إرسال الآن"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ==========================================================================
   2. Notification Rules Tab
   ========================================================================== */
function RulesConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<EmailRulesConfig>({
    notifyOnCreated: true,
    notifyOnStageAssigned: true,
    notifyOnStageApproved: true,
    notifyOnStageRejected: true,
    notifyOnFinalApproved: true,
    notifyOnCancelled: true,
    notifyOnInquiry: true,
    notifyRequester: true,
    notifyApprover: true,
  });

  useEffect(() => {
    getEmailRulesFn()
      .then((data) => setRules(data))
      .catch((err) => toast.error(`تعذر تحميل قواعد الإشعارات: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveEmailRulesFn({ data: rules });
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ القواعد");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm font-semibold text-muted-foreground">
        <MaterialIcon name="sync" size={20} className="animate-spin me-2" />
        جارٍ تحميل قواعد الإشعارات...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MaterialIcon name="rule" size={18} className="text-primary" />
            أحداث دورات العمل التي يتم إرسال إشعار بريدي لها
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          {[
            {
              key: "notifyOnCreated",
              title: "إرسال بريد عند تقديم / إنشاء طلب جديد",
              desc: "يصل للموظف تأكيد استلام الطلب برقم الطلب وتفاصيله.",
            },
            {
              key: "notifyOnStageAssigned",
              title: "إرسال بريد لصاحب المرحلة عند وصول الطلب إليه",
              desc: "يُخطر المسئول أو المعتمد بوجود طلب جديد بانتظار إجراء منه.",
            },
            {
              key: "notifyOnStageApproved",
              title: "إرسال بريد للموظف عند اعتماد مرحلة وانتقالها",
              desc: "يُخطر الموظف بأن مرحلة معينة قد تمت بنجاح وانتقل الطلب للمرحلة التالية.",
            },
            {
              key: "notifyOnFinalApproved",
              title: "إرسال بريد للموظف عند الاعتماد النهائي للطلب",
              desc: "يُخطر الموظف بانتهاء مسار الموافقات واعتماد طلبه نهائيًا.",
            },
            {
              key: "notifyOnStageRejected",
              title: "إرسال بريد للموظف عند رفض الطلب",
              desc: "يُخطر الموظف بسبب الرفض والمرحلة التي تم الرفض فيها.",
            },
            {
              key: "notifyOnCancelled",
              title: "إرسال بريد عند إلغاء أو إرجاع الطلب للتصحيح",
              desc: "يُخطر الأطراف المعنية بإلغاء المعاملة أو طلب استكمال النواقص.",
            },
            {
              key: "notifyOnInquiry",
              title: "إرسال بريد عند تسجيل مساءلة إدارية بحق موظف",
              desc: "يُخطر الموظف فور قيد مساءلة غياب أو تأخير لتقديم إفادته.",
            },
          ].map((item) => {
            const on = (rules as any)[item.key];
            return (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/40"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(checked) =>
                    setRules((prev) => ({ ...prev, [item.key]: checked === true }))
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-foreground">{item.title}</div>
                  <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                </div>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MaterialIcon name="groups" size={18} className="text-primary" />
            الفئات المستفيدة من الإشعارات (Recipients Scope)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <Checkbox
              checked={rules.notifyRequester}
              onCheckedChange={(c) => setRules((p) => ({ ...p, notifyRequester: c === true }))}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-foreground">إشعار الموظف مقدم الطلب (Requester)</div>
              <div className="text-[11px] text-muted-foreground">
                إرسال تحديثات الحالة للموظف على بريده المسجل في ملفه الشخصي.
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <Checkbox
              checked={rules.notifyApprover}
              onCheckedChange={(c) => setRules((p) => ({ ...p, notifyApprover: c === true }))}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-foreground">إشعار المعتمدين وأصحاب المراحل (Approvers)</div>
              <div className="text-[11px] text-muted-foreground">
                إرسال تنبيهات للمدير المباشر أو الموارد البشرية أو المالية عند وجود طلب في انتظارهم.
              </div>
            </div>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 text-xs font-bold"
        >
          <MaterialIcon name={saving ? "sync" : "save"} size={16} className={saving ? "animate-spin" : ""} />
          <span>{saving ? "جارٍ الحفظ..." : "حفظ قواعد الإشعارات"}</span>
        </Button>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Email Templates Tab
   ========================================================================== */
function TemplatesTab() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getEmailTemplatesFn()
      .then((data) => {
        setTemplates(data);
        if (data.length > 0) setSelected(data[0]!);
      })
      .catch((err) => toast.error(`تعذر استرجاع القوالب: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveTemplate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await saveEmailTemplateFn({ data: selected as any });
      toast.success(res.message);
      setTemplates((prev) => prev.map((t) => (t.id === selected.id ? selected : t)));
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ القالب");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm font-semibold text-muted-foreground">
        <MaterialIcon name="sync" size={20} className="animate-spin me-2" />
        جارٍ تحميل قوالب البريد الإلكتروني...
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Sidebar List */}
      <div className="space-y-2">
        <div className="text-xs font-extrabold text-foreground px-1">القوالب المعرّفة في النظام</div>
        <div className="space-y-1">
          {templates.map((tpl) => {
            const active = selected?.id === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelected(tpl)}
                className={`w-full text-start p-3 rounded-xl border text-xs font-bold transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                <div className="truncate">{tpl.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{tpl.eventType}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor Main */}
      {selected ? (
        <Card>
          <CardHeader className="border-b border-border pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MaterialIcon name="edit_note" size={18} className="text-primary" />
              تعديل القالب: {selected.name}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">مفعّل:</span>
              <Switch
                checked={selected.isActive}
                onCheckedChange={(checked) => setSelected((p) => (p ? { ...p, isActive: checked } : null))}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {/* Subject AR */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">موضوع الرسالة بالعربية (Subject AR) *</Label>
              <Input
                value={selected.subjectAr}
                onChange={(e) => setSelected((p) => (p ? { ...p, subjectAr: e.target.value } : null))}
                className="text-xs font-bold"
              />
            </div>

            {/* Subject EN */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">موضوع الرسالة بالإنجليزية (Subject EN) *</Label>
              <Input
                value={selected.subjectEn}
                onChange={(e) => setSelected((p) => (p ? { ...p, subjectEn: e.target.value } : null))}
                dir="ltr"
                className="text-xs font-bold font-mono"
              />
            </div>

            {/* Body AR */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">محتوى الرسالة بالعربية (HTML) *</Label>
              <Textarea
                rows={8}
                value={selected.bodyAr}
                onChange={(e) => setSelected((p) => (p ? { ...p, bodyAr: e.target.value } : null))}
                className="text-xs font-mono leading-relaxed"
              />
            </div>

            {/* Supported Variables Chip Bar */}
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-[11px] font-bold text-muted-foreground mb-1.5">المتغيرات المتاحة للاستخدام في القالب:</div>
              <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
                {[
                  "{{EmployeeName}}",
                  "{{EmployeeCode}}",
                  "{{RequestNumber}}",
                  "{{RequestType}}",
                  "{{CurrentStage}}",
                  "{{CurrentStatus}}",
                  "{{PreviousStage}}",
                  "{{NextStage}}",
                  "{{ActionBy}}",
                  "{{ActionDate}}",
                  "{{RejectionReason}}",
                  "{{Amount}}",
                  "{{ActionUrl}}",
                ].map((v) => (
                  <Badge key={v} variant="outline" className="bg-background cursor-pointer hover:bg-secondary">
                    {v}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex items-center gap-2 text-xs font-bold"
              >
                <MaterialIcon name={saving ? "sync" : "save"} size={16} className={saving ? "animate-spin" : ""} />
                <span>{saving ? "جارٍ الحفظ..." : "حفظ تعديلات القالب"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   4. Email Logs Tab
   ========================================================================== */
function LogsTab() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchLogs = async (p = page, st = statusFilter, s = search) => {
    setLoading(true);
    try {
      const res = await getEmailLogsFn({
        data: {
          page: p,
          pageSize: 15,
          status: st === "all" ? undefined : st,
          search: s.trim() || undefined,
        },
      });
      setLogs(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err: any) {
      toast.error(`تعذر جلب سجل البريد: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, statusFilter, search);
  }, [statusFilter]);

  const handleResend = async (logId: string) => {
    setResendingId(logId);
    try {
      const res = await resendFailedEmailFn({ data: { logId } });
      if (res.ok) {
        toast.success(res.message);
        fetchLogs();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || "فشلت محاولة إعادة الإرسال");
    } finally {
      setResendingId(null);
    }
  };

  const statusBadge = (st: string) => {
    switch (st) {
      case "sent":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10.5px]">تم الإرسال</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10.5px]">فشل الإرسال</Badge>;
      case "queued":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10.5px]">في قائمة الانتظار</Badge>;
      case "sending":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10.5px]">جارٍ الإرسال</Badge>;
      case "skipped_no_email":
        return <Badge variant="outline" className="text-muted-foreground text-[10.5px]">بدون بريد مسجل</Badge>;
      default:
        return <Badge variant="outline">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchLogs(1, statusFilter, search)}
            placeholder="بحث بالبريد، الموضوع، أو الاسم..."
            className="h-9 w-64 text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fetchLogs(1, statusFilter, search)}
            className="text-xs font-bold"
          >
            بحث
          </Button>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="حالة الإرسال" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كافة الحالات</SelectItem>
              <SelectItem value="sent">تم الإرسال (Sent)</SelectItem>
              <SelectItem value="failed">فشل الإرسال (Failed)</SelectItem>
              <SelectItem value="queued">في الانتظار (Queued)</SelectItem>
              <SelectItem value="skipped_no_email">بدون بريد (No Email)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold"
        >
          <MaterialIcon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
          <span>تحديث</span>
        </Button>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <Table className="text-right">
          <TableHeader>
            <TableRow className="bg-muted/50 text-[11px] font-bold">
              <TableHead className="text-start">المستلم</TableHead>
              <TableHead className="text-start">نوع الطلب</TableHead>
              <TableHead className="text-start">الموضوع</TableHead>
              <TableHead className="text-center">الحدث</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead className="text-center">المحاولات</TableHead>
              <TableHead className="text-start">وقت الإرسال</TableHead>
              <TableHead className="text-center">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                  <MaterialIcon name="sync" size={20} className="animate-spin inline-block me-2" />
                  جارٍ تحميل السجل...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                  لا توجد سجلات بريد مطابقة للبحث
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="text-xs hover:bg-muted/30">
                  <TableCell className="font-mono text-start">
                    <div className="font-bold text-foreground">{log.recipientName || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{log.recipientEmail}</div>
                  </TableCell>
                  <TableCell className="font-bold text-start">{log.requestType || "عام"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-start" title={log.subject}>
                    {log.subject}
                    {log.lastError && (
                      <div className="text-[10px] text-destructive truncate" title={log.lastError}>
                        {log.lastError}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {log.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{statusBadge(log.status)}</TableCell>
                  <TableCell className="text-center font-mono">{log.attempts}</TableCell>
                  <TableCell className="text-start font-mono text-[11px] text-muted-foreground">
                    {log.sentAt
                      ? new Intl.DateTimeFormat("en-US", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(log.sentAt))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {log.status === "failed" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(log.id)}
                        disabled={resendingId === log.id}
                        className="h-7 text-[11px] font-bold"
                      >
                        <MaterialIcon
                          name={resendingId === log.id ? "sync" : "replay"}
                          size={14}
                          className={resendingId === log.id ? "animate-spin" : ""}
                        />
                        <span>إعادة الإرسال</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
        <div>إجمالي السجلات: {total}</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(page - 1)}
            disabled={page <= 1 || loading}
            className="h-8 text-xs font-bold"
          >
            السابق
          </Button>
          <span className="font-mono px-2">صفحة {page}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(page + 1)}
            disabled={logs.length < 15 || loading}
            className="h-8 text-xs font-bold"
          >
            التالي
          </Button>
        </div>
      </div>
    </div>
  );
}
