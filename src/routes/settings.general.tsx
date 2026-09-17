import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Breadcrumbs, PageBanner, Btn } from "@/components/hr/ui";
import { useSettings, useSaveSettings, type SettingsMap } from "@/lib/hr-db";
import { EmailSettingsPanel } from "@/components/hr/email/EmailSettingsPanel";

export const Route = createFileRoute("/settings/general")({
  head: () => ({
    meta: [
      { title: "التهيئة العامة للبرنامج | نظام الموارد البشرية" },
      {
        name: "description",
        content:
          "تهيئة البريد الإلكتروني والاشعارات وشاشة الموظف والمسائلات ومسارات البرامج وتهيئة البنك مع حفظ الإعدادات في قاعدة البيانات.",
      },
      { property: "og:title", content: "التهيئة العامة للبرنامج | نظام الموارد البشرية" },
      {
        property: "og:description",
        content: "إدارة كل إعدادات النظام العامة وحفظها مباشرة في قاعدة البيانات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneralSettings,
});

type F =
  | { key: string; label: string; type?: "text" | "number" | "time" | "password" }
  | { key: string; label: string; type: "check" }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "radio"; options: string[] };

type Sec = { key: string; label: string; icon: string; groups: { title?: string; cols?: number; fields: F[] }[] };

const SECTIONS: Sec[] = [
  {
    key: "email",
    label: "تهيئه البريد الالكتروني",
    icon: "mail",
    groups: [
      {
        fields: [
          { key: "host", label: "الهوست" },
          { key: "port", label: "المنفذ", type: "number" },
        ],
      },
      {
        fields: [
          { key: "email", label: "البريد الاكتروني" },
          { key: "password", label: "كلمة المرور", type: "password" },
        ],
      },
    ],
  },
  {
    key: "email_create",
    label: "اعدادات أنشاء الأيميلات",
    icon: "alternate_email",
    groups: [
      {
        fields: [
          { key: "email", label: "البريد الاكتروني" },
          { key: "mail_server", label: "Mail Server" },
        ],
      },
    ],
  },
  {
    key: "employee_screen",
    label: "اعدادات شاشة الموظف",
    icon: "person",
    groups: [
      {
        cols: 4,
        fields: [
          { key: "name_en_required", label: "اسم الموظف بالانجليزية حقل الزامي", type: "check" },
          { key: "main_dept_required", label: "القسم الرئيسي حقل الزامي", type: "check" },
          { key: "sector_required", label: "القطاع حقل الزامي", type: "check" },
          { key: "path", label: "المسار", type: "check" },
          { key: "add_direct_manager", label: "اضافه المدير المباشر للموظف", type: "check" },
          { key: "job_title_required", label: "المسمى الوظيفى الزامى", type: "check" },
          { key: "mobile", label: "رقم الجوال", type: "check" },
          { key: "origin_address", label: "العنوان ف البلد الاصل", type: "check" },
          { key: "current_address", label: "العنوان الحالى", type: "check" },
          { key: "building_no", label: "رقم المبنى", type: "check" },
          { key: "postal_code", label: "الرقم البريدي", type: "check" },
          { key: "extra_number", label: "الرقم الاضافي", type: "check" },
          { key: "district", label: "الحي", type: "check" },
        ],
      },
    ],
  },
  {
    key: "attendance_inquiries",
    label: "اعدادات المسائلات للحضور والانصراف",
    icon: "help",
    groups: [
      {
        fields: [
          { key: "system_admin", label: "System Admin" },
          { key: "auto_close_after", label: "اغلاق المسااله اليا بعد", type: "number" },
        ],
      },
      {
        cols: 3,
        fields: [
          { key: "send_morning_late", label: "ارسال تأخير صباحى آلى من البصمة", type: "check" },
          { key: "morning_late_type", label: "تأخير صباحى آلى من البصمة" },
          { key: "morning_late_name", label: "اسم المسائلة (تأخير صباحى)" },
          { key: "send_morning_early_out", label: "ارسال انصراف صباحى مبكر من البصمة", type: "check" },
          { key: "morning_early_type", label: "انصراف مبكر صباحى من البصمة" },
          { key: "morning_early_name", label: "اسم المسائلة (انصراف صباحى مبكر)" },
          { key: "send_absence", label: "إرسال مسائلة الغياب آلياً", type: "check" },
          { key: "absence_type", label: "غياب آلى من البصمة" },
          { key: "absence_name", label: "اسم المسائلة (الغياب)" },
          { key: "send_no_fingerprint", label: "إرسال مسائلة عدم تسجيل احد البصمات آلياً", type: "check" },
          { key: "no_fingerprint_type", label: "عدم تسجيل احد البصمات" },
          { key: "no_fingerprint_name", label: "اسم المسائلة (عدم التسجيل)" },
          { key: "send_evening_late", label: "ارسال تأخير مسائى آلى من البصمة", type: "check" },
          { key: "evening_late_type", label: "تأخير مسائى آلى من البصمة" },
          { key: "evening_late_name", label: "اسم المسائلة (تأخير مسائى)" },
          { key: "send_evening_early_out", label: "ارسال انصراف مسائى مبكر من البصمة", type: "check" },
          { key: "evening_early_type", label: "انصراف مبكر مسائى من البصمة" },
          { key: "evening_early_name", label: "اسم المسائلة (انصراف مسائى مبكر)" },
        ],
      },
    ],
  },
  {
    key: "other",
    label: "اخرى",
    icon: "more_horiz",
    groups: [
      {
        cols: 5,
        fields: [
          { key: "link_general_accounts", label: "الربط مع الحسابات العامه", type: "check" },
          { key: "default_branches", label: "افتراضي الفروع", type: "check" },
          { key: "default_months_years", label: "افتراضي الشهور والسنوات", type: "check" },
          { key: "add_insurance_salary_reports", label: "اضافة الراتب التأميني للتقارير", type: "check" },
          { key: "add_housing_to_basic", label: "اضافة بدل السكن للراتب الأساسي", type: "check" },
          {
            key: "leave_without_salary_default",
            label: "احتساب الاجازة بدون راتب طبقا لتعبئة السنوات و الشهور",
            type: "check",
          },
          {
            key: "fingerprint_deduction_by_last_day",
            label: "احتساب خصم البصمة حسب اخر يوم في الشهر",
            type: "check",
          },
          { key: "link_visa_requests_leave", label: "ربط طلبات التأشيرات بالاجازه", type: "check" },
          { key: "eos_bonus_360", label: "احتساب مكافأة نهاية الخدمة سنويا 360 يوم", type: "check" },
          { key: "notes_required_permits", label: "الزامية الملاحظات والمرفقات للأذونات", type: "check" },
        ],
      },
      {
        cols: 4,
        fields: [
          { key: "max_deduction", label: "الحد الاعلى للخصم", type: "number" },
          { key: "min_days_salary_cut", label: "الحد الادنى من الايام لنزول الراتب", type: "number" },
          { key: "resources_entitlement_value", label: "قيمة استحقاق الموارد", type: "number" },
          { key: "bank_commission_deduction", label: "استقطاعات العمولات البنكيه" },
          { key: "nationality", label: "مواطن" },
          { key: "resources_entitlement", label: "استحقاق الموارد" },
          { key: "insurance_deduction", label: "استقطاعات التامينات" },
          { key: "annual_visa_leave_days", label: "عدد أيام الاجازة السنوية طلبات التأشيرات", type: "number" },
          { key: "annual_visa_fine_days", label: "عدد أيام الغرامة السنوية طلبات التأشيرات", type: "number" },
          { key: "visa_sub_account", label: "حساب الفرعي للتأشيرات" },
          {
            key: "fingerprint_late_calc",
            label: "احتساب تأخيرات البصمه",
            type: "select",
            options: ["شهرى", "يومى", "اسبوعى"],
          },
          {
            key: "fingerprint_early_calc",
            label: "احتساب انصراف مبكر من البصمه",
            type: "select",
            options: ["شهرى", "يومى", "اسبوعى"],
          },
          {
            key: "leaves_carryover",
            label: "ترحيل الاجازات",
            type: "select",
            options: ["اختر ....", "ترحيل آلى", "ترحيل يدوى"],
          },
        ],
      },
    ],
  },
  {
    key: "notifications",
    label: "الاشعارات",
    icon: "notifications",
    groups: [
      {
        cols: 4,
        fields: [
          { key: "enabled", label: "تفعيل نظام الاشعارات", type: "check" },
          { key: "probation_end", label: "تفعيل اشعار انتهاء فترة التجربة", type: "check" },
          { key: "employee_notice", label: "إشعار الموظف", type: "check" },
          { key: "employee_docs", label: "تفعيل إشعارات مستندات الموظفين", type: "check" },
        ],
      },
      {
        title: "إعدادات إشعار تأخر المهام",
        cols: 4,
        fields: [
          { key: "task_delay_enabled", label: "تفعيل إشعار تأخر المهام", type: "check" },
          { key: "task_delay_time", label: "وقت إرسال إشعار تأخر المهام", type: "time" },
          { key: "branch_company_docs", label: "تفعيل إشعارات مستندات الافرع والشركات", type: "check" },
          { key: "doc_owner_notice", label: "إشعار مالك المستند", type: "check" },
          { key: "employee_contracts", label: "تفعيل إشعارات عقود الموظفين", type: "check" },
          { key: "contract_owner_notice", label: "إشعار مالك العقد", type: "check" },
        ],
      },
      {
        cols: 4,
        fields: [
          { key: "max_notice_period", label: "المدة القصوى لانتهاء الإشعارات", type: "number" },
          { key: "dept_notice_owners", label: "المعنيون بالإشعارات في القسم" },
          { key: "dept_notice_receivers", label: "مستلمو الإشعارات في القسم" },
          { key: "branch_notice_owners", label: "المعنيون بالإشعارات في الفرع" },
          { key: "branch_notice_receivers", label: "مستلمو الإشعارات في الفرع" },
          { key: "doc_types", label: "أنواع المستندات" },
          { key: "contract_end_notice_months", label: "مدة الإشعار بانتهاء العقد", type: "number" },
          { key: "alert_days", label: "عدد أيام التنبيه", type: "number" },
        ],
      },
    ],
  },
  {
    key: "paths",
    label: "اعدادات مسارات البرامج",
    icon: "folder",
    groups: [
      {
        cols: 3,
        fields: [
          { key: "accounts", label: "مسار الحسابات" },
          { key: "sso", label: "مسار الدخول الموحد" },
          { key: "support_services", label: "مسار الخدمات المساندة" },
          { key: "students_accounts", label: "مسار حسابات الطلاب" },
          { key: "warehouses", label: "مسار المستودعات" },
          { key: "platform", label: "مسار المنصة" },
        ],
      },
    ],
  },
  {
    key: "bank",
    label: "تهيئة البنك",
    icon: "account_balance",
    groups: [
      {
        cols: 3,
        fields: [
          { key: "id_number_len", label: "رقم الهوية", type: "number" },
          { key: "exchange_account_len", label: "رقم الحساب للصراف", type: "number" },
          { key: "bank_account_len", label: "رقم الحساب للبنك", type: "number" },
          { key: "sponsor_account_len", label: "رقم الحساب للكفالة", type: "number" },
          { key: "client_number_len", label: "رقم العميل", type: "number" },
          { key: "bank_type", label: "نوع البنك", type: "radio", options: ["سعودي", "مصري", "قطري"] },
        ],
      },
    ],
  },
];

const control =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25";

function GeneralSettings() {
  const [active, setActive] = useState(SECTIONS[0]!.key);
  const section = SECTIONS.find((s) => s.key === active)!;
  const { data, isLoading } = useSettings(section.key);
  const save = useSaveSettings(section.key);
  const [form, setForm] = useState<SettingsMap>({});

  useEffect(() => {
    setForm(data ?? {});
  }, [data, section.key]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const val = (k: string) => form[k] ?? "";

  const allFields = section.groups.flatMap((g) => g.fields);
  const submit = () => {
    const payload: SettingsMap = {};
    for (const f of allFields) payload[f.key] = f.type === "check" ? (val(f.key) === "true" ? "true" : "false") : val(f.key);
    save.mutate(payload);
  };

  return (
    <div className="mt-4">
      <Breadcrumbs trail={["إعدادات النظام", "التهيئة العامة للبرنامج"]} />
      <PageBanner
        icon="settings"
        title="التهيئة العامة للبرنامج"
        subtitle="إعدادات البريد والاشعارات وشاشة الموظف والمسائلات ومسارات البرامج وتهيئة البنك"
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside>
          <div
            className="overflow-hidden rounded-2xl border border-border bg-card"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <h2 className="border-b border-border bg-secondary px-4 py-3 text-[12px] font-extrabold text-secondary-foreground">
              التهيئة العامة للبرنامج
            </h2>
            <nav className="p-2">
              {SECTIONS.map((s) => {
                const on = s.key === active;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActive(s.key)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-[13px] font-bold transition-colors ${
                      on ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent/60"
                    }`}
                  >
                    <MaterialIcon name={s.icon} size={18} filled={on} />
                    <span className="min-w-0 flex-1">{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="space-y-4">
          {active === "email" ? (
            <EmailSettingsPanel />
          ) : (
            <>
              {section.groups.map((g, gi) => (
                <section
                  key={gi}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                    <MaterialIcon name={section.icon} size={19} className="text-primary" filled />
                    <h2 className="text-sm font-bold">{g.title ?? section.label}</h2>
                  </div>
                  <div
                    className={`grid gap-4 p-5 sm:grid-cols-2 ${
                      (g.cols ?? 2) >= 5
                        ? "lg:grid-cols-5"
                        : (g.cols ?? 2) === 4
                          ? "lg:grid-cols-4"
                          : (g.cols ?? 2) === 3
                            ? "lg:grid-cols-3"
                            : "lg:grid-cols-2"
                    }`}
                  >
                    {g.fields.map((f) => {
                      if (f.type === "check") {
                        const on = val(f.key) === "true";
                        return (
                          <label
                            key={f.key}
                            className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => set(f.key, String(e.target.checked))}
                              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                            />
                            <span className="text-[12px] font-bold leading-snug text-foreground/85">{f.label}</span>
                          </label>
                        );
                      }
                      if (f.type === "radio") {
                        return (
                          <div key={f.key}>
                            <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">{f.label}</span>
                            <div className="flex flex-wrap gap-3">
                              {f.options.map((o) => (
                                <label key={o} className="flex items-center gap-1.5 text-[12px] font-bold">
                                  <input
                                    type="radio"
                                    name={`${section.key}-${f.key}`}
                                    checked={val(f.key) === o}
                                    onChange={() => set(f.key, o)}
                                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                                  />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <label key={f.key} className="block">
                          <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">{f.label}</span>
                          {f.type === "select" ? (
                            <select
                              className={`${control} appearance-none`}
                              value={val(f.key)}
                              onChange={(e) => set(f.key, e.target.value)}
                            >
                              {["", ...f.options].map((o) => (
                                <option key={o} value={o}>
                                  {o || "اختر ...."}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className={control}
                              type={f.type ?? "text"}
                              value={val(f.key)}
                              onChange={(e) => set(f.key, e.target.value)}
                              placeholder="اختر ...."
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="flex justify-center pb-6">
                <Btn icon="save" variant="teal" onClick={submit}>
                  {save.isPending || isLoading ? "جارٍ الحفظ..." : "حفظ"}
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
