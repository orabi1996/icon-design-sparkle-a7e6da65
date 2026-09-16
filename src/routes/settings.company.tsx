import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useCompanyWorkspace } from "@/components/hr/CompanyWorkspace";
import { useCurrentIsAdmin } from "@/lib/permissions-db";
import {
  COMPANY_BUSINESS_ENABLED, useCompanyProfile, useCompanyVersions, useSaveCompanyProfile,
} from "@/lib/company-db";
import {
  emptyCompanyProfile, validateCompanyProfile, csvCell,
  type CompanyProfile,
} from "@/lib/business-core.mjs";

export const Route = createFileRoute("/settings/company")({
  head: () => ({ meta: [{ title: "تهيئة بيانات المنشأة والشركة | إعدادات النظام" }] }),
  component: CompanySettingsPage,
});

const inputCls = "h-9 w-full rounded border border-[#b4c7e7] bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20 disabled:bg-slate-50";
type Tab = "general" | "address" | "officers" | "branding" | "history";
type Field = { key: keyof CompanyProfile; label: string; type?: string; required?: boolean };
const fields: Record<"general" | "address" | "officers", Field[]> = {
  general: [
    { key: "companyNameAr", label: "اسم الشركة بالعربية", required: true },
    { key: "companyNameEn", label: "اسم الشركة بالإنجليزية" },
    { key: "countryCode", label: "الدولة", required: true },
    { key: "currency", label: "العملة الافتراضية", required: true },
    { key: "timezone", label: "المنطقة الزمنية", required: true },
    { key: "crNumber", label: "رقم السجل التجاري" },
    { key: "unified700Number", label: "الرقم الموحد للمنشأة" },
    { key: "vatNumber", label: "الرقم الضريبي" },
    { key: "gosiEstNumber", label: "رقم اشتراك التأمينات" },
    { key: "molEstNumber", label: "رقم المنشأة في وزارة العمل" },
    { key: "chamberNumber", label: "رقم اشتراك الغرفة التجارية" },
    { key: "establishmentDate", label: "تاريخ التأسيس", type: "date" },
    { key: "activityType", label: "النشاط الرئيسي" },
  ],
  address: [
    { key: "city", label: "المدينة" }, { key: "district", label: "الحي" },
    { key: "street", label: "الشارع" }, { key: "buildingNo", label: "رقم المبنى" },
    { key: "postalCode", label: "الرمز البريدي" }, { key: "additionalNo", label: "الرقم الإضافي" },
    { key: "phone", label: "الهاتف" }, { key: "email", label: "البريد الإلكتروني", type: "email" },
    { key: "website", label: "الموقع الإلكتروني", type: "url" },
  ],
  officers: [
    { key: "generalManager", label: "المدير العام" }, { key: "hrManager", label: "مدير الموارد البشرية" },
    { key: "financeManager", label: "المدير المالي" },
  ],
};
const selectOptions: Partial<Record<keyof CompanyProfile, [string, string][]>> = {
  countryCode: [["EG", "مصر"], ["SA", "السعودية"], ["QA", "قطر"], ["OM", "عُمان"], ["BH", "البحرين"]],
  currency: [["EGP", "EGP"], ["SAR", "SAR"], ["QAR", "QAR"], ["OMR", "OMR"], ["BHD", "BHD"]],
  timezone: [
    ["Africa/Cairo", "القاهرة"], ["Asia/Riyadh", "الرياض"], ["Asia/Qatar", "قطر"],
    ["Asia/Muscat", "مسقط"], ["Asia/Bahrain", "البحرين"], ["UTC", "UTC"],
  ],
};
const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "general", label: "البيانات الأساسية", icon: "domain" },
  { key: "address", label: "العنوان والاتصال", icon: "pin_drop" },
  { key: "officers", label: "المسؤولون", icon: "badge" },
  { key: "branding", label: "الشعار والختم", icon: "palette" },
  { key: "history", label: "سجل التغييرات", icon: "history" },
];

function CompanySettingsPage() {
  const workspace = useCompanyWorkspace();
  const company = workspace.selectedCompany;
  const { data: isSystemAdmin = false, isLoading: adminLoading } = useCurrentIsAdmin();
  const profile = useCompanyProfile(company);
  const versions = useCompanyVersions(company);
  const save = useSaveCompanyProfile();
  const [tab, setTab] = useState<Tab>("general");
  const [formData, setFormData] = useState<CompanyProfile>(emptyCompanyProfile);
  const [dirty, setDirty] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [newTenantId, setNewTenantId] = useState("");
  const [tenantChoice, setTenantChoice] = useState("new");
  const [tenantName, setTenantName] = useState("");
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const request = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    if (!isNew && profile.data && !dirty) {
      setFormData({ ...emptyCompanyProfile(), ...profile.data.profile });
      setExpectedVersion(profile.data.version);
    }
  }, [profile.data, isNew, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);

  const tenantOptions = useMemo(() => Array.from(new Map(
    workspace.companies.filter((entry) => entry.can_manage)
      .map((entry) => [entry.tenant_id, entry.tenant_name]),
  ).entries()), [workspace.companies]);

  const confirmDiscard = () => !dirty || window.confirm("توجد تعديلات لم تُحفظ. هل تريد تجاهلها؟");
  const beginNew = () => {
    if (!confirmDiscard()) return;
    setIsNew(true); setCompanyId(crypto.randomUUID()); setNewTenantId(crypto.randomUUID());
    setTenantChoice(company?.can_manage ? company.tenant_id : "new");
    setTenantName(""); setFormData(emptyCompanyProfile()); setExpectedVersion(0);
    setReason("إنشاء ملف شركة"); setErrors({}); setDirty(false); setTab("general"); request.current = null;
  };
  const chooseCompany = (id: string) => {
    if (!confirmDiscard()) return;
    setIsNew(false); setDirty(false); setFormData(emptyCompanyProfile()); setExpectedVersion(null);
    setReason(""); setErrors({}); request.current = null; workspace.selectCompany(id);
  };
  const change = (key: keyof CompanyProfile, value: string) => {
    setFormData((current) => ({ ...current, [key]: value })); setDirty(true);
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  const handleSave = async () => {
    if (save.isPending || (!isNew && (!company?.can_manage || expectedVersion === null))) return;
    const validation = validateCompanyProfile(formData);
    const nextErrors = { ...validation.errors };
    if (reason.trim().length < 3 || reason.trim().length > 500) nextErrors["reason"] = "سبب التغيير مطلوب (3 إلى 500 حرف)";
    if (isNew && tenantChoice === "new" && (!isSystemAdmin || !tenantName.trim() || tenantName.trim().length > 200)) {
      nextErrors["tenant"] = "إنشاء مساحة عميل جديدة يتطلب مدير النظام واسم مجموعة من 1 إلى 200 حرف";
    }
    if (isNew && tenantChoice !== "new" && !tenantOptions.some(([id]) => id === tenantChoice)) {
      nextErrors["tenant"] = "اختر مساحة عميل تملك صلاحية إدارتها";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const targetCompany = isNew ? companyId : company!.id;
    const targetTenant = isNew ? tenantChoice === "new" ? newTenantId : tenantChoice : company!.tenant_id;
    const payload = {
      companyId: targetCompany, tenantId: targetTenant, profile: validation.profile,
      expectedVersion: expectedVersion ?? 0, reason: reason.trim(),
      ...(isNew && tenantChoice === "new" ? { newTenantName: tenantName.trim() } : {}),
    };
    const signature = JSON.stringify(payload);
    let pendingRequest = request.current;
    if (!pendingRequest || pendingRequest.signature !== signature) {
      pendingRequest = { signature, id: crypto.randomUUID() };
      request.current = pendingRequest;
    }
    try {
      const saved = await save.mutateAsync({ ...payload, requestId: pendingRequest.id });
      setDirty(false); setIsNew(false); setFormData(saved.profile);
      setExpectedVersion(saved.version); setReason(""); workspace.selectCompany(saved.id);
      request.current = null;
    } catch (error) {
      setErrors({ save: (error as Error).message });
    }
  };

  const reload = () => {
    if (!confirmDiscard()) return;
    setDirty(false); setReason(""); setErrors({}); request.current = null;
    setExpectedVersion(null); workspace.reload(); void profile.refetch();
  };
  const exportHistory = () => {
    if (!versions.data || versions.error) return;
    const rows = [
      ["الإصدار", "تاريخ السريان UTC", "معرّف المستخدم", "سبب التغيير", "البيانات"],
      ...versions.data.map((item) => [item.version, item.effective_from, item.changed_by, item.change_reason, JSON.stringify(item.profile)]),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "company-history-last-50.csv"; link.click();
    URL.revokeObjectURL(url);
  };

  if (!COMPANY_BUSINESS_ENABLED) return (
    <section className="rounded-xl border border-blue-200 bg-white p-6" dir="rtl">
      <h1 className="mb-2 font-bold">تهيئة بيانات الشركة — منطق الحفظ الجديد</h1>
      <p className="text-sm text-slate-600">هذه الوظيفة خلف مفتاح تفعيل لحماية النسخة الحالية. يجب تطبيق ترحيل الشركات على بيئة اختبار والتحقق من الصلاحيات ثم تفعيل VITE_COMPANY_BUSINESS_ENABLED=true عند البناء.</p>
      <p className="mt-3 text-xs text-slate-500">لن تظهر رسالة حفظ ناجح قبل الحفظ الفعلي في قاعدة البيانات.</p>
    </section>
  );

  const readError = workspace.error || (!isNew ? profile.error : null);
  const blocked = save.isPending || workspace.isLoading || (!isNew && (!company?.can_manage || profile.isLoading || expectedVersion === null || Boolean(readError)));
  return (
    <div dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-[#004e82]"><MaterialIcon name="corporate_fare" size={22} />تهيئة بيانات المنشأة والشركة</h1>
        <span className="text-xs text-slate-500">إعدادات النظام / بيانات الشركة</span>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-60 flex-1 text-xs font-bold">الشركة الحالية
          <select value={isNew ? "" : company?.id ?? ""} onChange={(event) => chooseCompany(event.target.value)} disabled={save.isPending} className={inputCls}>
            <option value="" disabled>{isNew ? "ملف شركة جديد" : "اختر الشركة"}</option>
            {workspace.companies.map((entry) => <option key={entry.id} value={entry.id}>{entry.tenant_name} — {entry.display_name}</option>)}
          </select>
        </label>
        <button type="button" onClick={beginNew} disabled={save.isPending || adminLoading || (!isSystemAdmin && tenantOptions.length === 0)} className="rounded-lg bg-[#0070c0] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">إضافة شركة</button>
        <button type="button" onClick={reload} disabled={save.isPending} className="rounded-lg border px-4 py-2 text-xs">إعادة تحميل البيانات</button>
      </div>
      <p className="mb-3 text-xs leading-6 text-slate-500">اختيار الشركة يحدد سياق الإعدادات الجديدة فقط. ربط الموظفين والمعاملات القديمة بالعملاء والفروع يحتاج مرحلة ترحيل مستقلة. تغيير العملة أو البيانات الافتراضية لا يعيد كتابة أي معاملة سابقة.</p>
      {readError && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">{readError.message}</div>}
      {Object.keys(errors).length > 0 && <ul role="alert" className="mb-3 list-inside list-disc rounded-lg border border-red-200 bg-red-50 p-3 text-xs">{Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}</ul>}
      {!company && !isNew && !workspace.isLoading && <p className="rounded-xl border bg-white p-5 text-sm">لا توجد شركات ضمن عضويتك. يمكن لمدير النظام إنشاء مساحة عميل وملف شركة، أو يلزم منحك عضوية بواسطة مسؤول قاعدة البيانات.</p>}
      {company && !company.can_manage && !isNew && <p className="rounded-xl border bg-white p-5 text-sm">لديك صلاحية الاطلاع على اسم الشركة فقط. بياناتها التفصيلية وسجلها متاحان لمديري مساحة العميل.</p>}

      {(isNew || company?.can_manage) && <>
        {isNew && <div className="mb-4 grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-2">
          <label className="text-xs font-bold">مساحة العميل / المجموعة
            <select value={tenantChoice} disabled={save.isPending} onChange={(event) => { setTenantChoice(event.target.value); setDirty(true); }} className={inputCls}>
              {tenantOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              {isSystemAdmin && <option value="new">إنشاء مساحة عميل مستقلة</option>}
            </select>
          </label>
          {tenantChoice === "new" && <label className="text-xs font-bold">اسم مساحة العميل / المجموعة *
            <input value={tenantName} disabled={save.isPending} maxLength={200} onChange={(event) => { setTenantName(event.target.value); setDirty(true); }} className={inputCls} />
          </label>}
        </div>}
        <div className="mb-4 flex flex-wrap border-b border-slate-200">
          {tabs.map((item) => <button type="button" key={item.key} onClick={() => setTab(item.key)} className={"flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-extrabold " + (tab === item.key ? "border-[#0070c0] text-[#0070c0]" : "border-transparent text-slate-600")}><MaterialIcon name={item.icon} size={16} />{item.label}</button>)}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          {tab === "branding" ? <p className="text-sm text-slate-600">رفع الشعار والختم لم يُفعّل بعد. سيحتاج تخزين ملفات بصلاحيات مستقلة قبل ربطه بالنماذج؛ لا يوجد رفع أو توقيع إلكتروني فعلي في هذه المرحلة.</p> :
          tab === "history" ? <div className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-bold">آخر 50 إصدارًا محفوظًا</h2><button onClick={exportHistory} disabled={versions.isLoading || Boolean(versions.error) || !versions.data?.length} className="rounded border px-3 py-1 text-xs disabled:opacity-40">تصدير السجل CSV</button></div>
            {versions.error && <p role="alert" className="text-sm text-red-700">تعذر تحميل سجل التغييرات.</p>}
            {versions.isLoading && !isNew && <p>جارٍ تحميل السجل...</p>}
            {(isNew || !versions.data?.length) && <p className="text-sm text-slate-500">لا توجد إصدارات محفوظة بعد.</p>}
            {!isNew && versions.data?.map((item) => <details key={item.version} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-bold">الإصدار {item.version} — {item.change_reason} — <time dateTime={item.effective_from}>{new Date(item.effective_from).toLocaleString("ar-EG")}</time></summary>
              <p className="my-2 break-all text-xs text-slate-500">معرّف المستخدم: {item.changed_by}</p>
              <dl className="grid gap-2 md:grid-cols-2">{Object.values(fields).flat().map((field) => <div key={field.key}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="break-words text-sm">{item.profile[field.key] || "—"}</dd></div>)}</dl>
            </details>)}
          </div> : <fieldset disabled={blocked} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields[tab].map((field) => <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700">{field.label}{field.required ? " *" : ""}</span>
              {selectOptions[field.key] ? <select value={formData[field.key]} onChange={(event) => change(field.key, event.target.value)} required={field.required} aria-invalid={Boolean(errors[field.key])} className={inputCls}>
                <option value="">اختر...</option>
                {selectOptions[field.key]!.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                {formData[field.key] && !selectOptions[field.key]!.some(([value]) => value === formData[field.key]) && <option value={formData[field.key]}>{formData[field.key]}</option>}
              </select> : <input type={field.type ?? "text"} value={formData[field.key]} maxLength={500} required={field.required} aria-invalid={Boolean(errors[field.key])} onChange={(event) => change(field.key, event.target.value)} className={inputCls} />}
              {errors[field.key] && <span className="text-xs text-red-700">{errors[field.key]}</span>}
            </label>)}
          </fieldset>}
          {tab !== "history" && tab !== "branding" && <div className="mt-6 grid gap-3 border-t border-slate-200 pt-4">
            <label className="text-xs font-bold">سبب التغيير *
              <input value={reason} maxLength={500} disabled={blocked} onChange={(event) => { setReason(event.target.value); setDirty(true); }} className={inputCls} placeholder="اكتب سبب تعديل البيانات" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">{isNew ? "ملف جديد غير محفوظ" : expectedVersion === null ? "جارٍ تحميل البيانات" : "الإصدار المحمّل: " + expectedVersion}{dirty ? " — توجد تعديلات غير محفوظة" : ""}</span>
              <button type="button" onClick={() => { void handleSave(); }} disabled={blocked || (!dirty && !isNew)} className="flex items-center gap-1.5 rounded-lg bg-[#0070c0] px-5 py-2 text-xs font-extrabold text-white disabled:opacity-40"><MaterialIcon name="save" size={18} />{save.isPending ? "جارٍ الحفظ..." : "حفظ وتحديث البيانات"}</button>
            </div>
          </div>}
        </div>
      </>}
    </div>
  );
}
