import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useSaveSettings, useSettings } from "@/lib/hr-db";
import {
  DEFAULT_REQUEST_TYPES,
  parseRequestConfigs,
  serializeRequestConfigs,
  splitApprovalChain,
  validateRequestConfig,
  type RequestTypeConfig,
} from "@/lib/request-config.mjs";

export const Route = createFileRoute("/requests/setup")({
  head: () => ({ meta: [{ title: "تهيئة الطلبات ومسارات الاعتماد | الطلبات" }] }),
  component: RequestSetupPage,
});

const inputCls =
  "h-8 w-full rounded border border-[#b4c7e7] bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20";

function RequestSetupPage() {
  const settingsQuery = useSettings("request_types");
  const saveSettings = useSaveSettings("request_types");
  const [requestConfigs, setRequestConfigs] = useState<RequestTypeConfig[]>(() =>
    DEFAULT_REQUEST_TYPES.map((item) => ({ ...item, approval_chain: [...item.approval_chain] })),
  );
  const [hydrated, setHydrated] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.isFetched || hydrated) return;
    const parsed = parseRequestConfigs(settingsQuery.data?.["configs"]);
    setRequestConfigs(parsed.configs);
    if (parsed.invalidCount > 0) {
      setLoadWarning("تم العثور على إعدادات غير مكتملة؛ عُرضت القيم السليمة مع إبقاء القيم الافتراضية عند الحاجة.");
    }
    setHydrated(true);
  }, [hydrated, settingsQuery.data, settingsQuery.isFetched]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<RequestTypeConfig | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const emptyDraft = (): Omit<RequestTypeConfig, "id"> => ({
    code: "",
    name: "",
    category: "شؤون موظفين",
    approval_chain: ["المدير المباشر", "الموارد البشرية"],
    max_sla_hours: 24,
    requires_attachment: false,
    allow_cancel: true,
    status: "نشط",
  });
  const draftFrom = (request: RequestTypeConfig): Omit<RequestTypeConfig, "id"> => ({
    code: request.code,
    name: request.name,
    category: request.category,
    approval_chain: [...request.approval_chain],
    max_sla_hours: request.max_sla_hours,
    requires_attachment: request.requires_attachment,
    allow_cancel: request.allow_cancel,
    status: request.status,
  });
  const [newReq, setNewReq] = useState<Omit<RequestTypeConfig, "id">>(() => emptyDraft());

  const handleOpenAdd = () => {
    setEditingReq(null);
    setFormError(null);
    setNewReq({
      ...emptyDraft(),
      code: `REQ-${String(requestConfigs.length + 1).padStart(2, "0")}`,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (request: RequestTypeConfig) => {
    setEditingReq(request);
    setFormError(null);
    setNewReq(draftFrom(request));
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const candidate: RequestTypeConfig = {
      id: editingReq?.id ?? `req-${Date.now()}`,
      ...newReq,
    };
    const validation = validateRequestConfig(candidate);
    if (!validation.ok || !validation.value) {
      setFormError(Object.values(validation.errors)[0] ?? "راجع بيانات نوع الطلب.");
      return;
    }
    if (requestConfigs.some((request) => request.code === validation.value.code && request.id !== candidate.id)) {
      setFormError("كود الطلب مستخدم بالفعل؛ اختر كودًا مختلفًا.");
      return;
    }

    const next = editingReq
      ? requestConfigs.map((request) => (request.id === editingReq.id ? validation.value! : request))
      : [...requestConfigs, validation.value];
    try {
      await saveSettings.mutateAsync({ configs: serializeRequestConfigs(next) });
      setRequestConfigs(next);
      setFormError(null);
      setIsModalOpen(false);
    } catch {
      setFormError("تعذر حفظ إعدادات الطلبات. تحقق من صلاحية المستخدم وحاول مرة أخرى.");
    }
  };

  const handleDelete = async (request: RequestTypeConfig) => {
    if (requestConfigs.length === 1) {
      setFormError("لا يمكن حذف آخر نوع طلب؛ يجب الاحتفاظ بنوع واحد على الأقل.");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`حذف نوع الطلب "${request.name}"؟`)) return;
    const next = requestConfigs.filter((item) => item.id !== request.id);
    try {
      await saveSettings.mutateAsync({ configs: serializeRequestConfigs(next) });
      setRequestConfigs(next);
      setFormError(null);
    } catch {
      setFormError("تعذر حذف نوع الطلب. حاول مرة أخرى.");
    }
  };

  return (
    <AppShell>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-[16px] font-extrabold text-[#004e82] flex items-center gap-2">
          <MaterialIcon name="schema" size={22} className="text-[#0070c0]" />
          تهيئة أنواع الطلبات ومسارات سلاسل الاعتماد
        </h1>
        <div className="text-[11px] text-slate-400">الطلبات / الموافقة على الطلبات / تهيئة الطلبات</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">أنواع الطلبات المعرفة</div>
          <div className="text-lg font-extrabold text-[#0070c0] font-mono mt-1">{requestConfigs.length} أنواع</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">الطلبات المتاحة للخدمة الذاتية</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">{requestConfigs.filter((r) => r.status === "نشط").length} طلب نشط</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">متوسط زمن الاستجابة المستهدف (SLA)</div>
          <div className="text-lg font-extrabold text-indigo-700 font-mono mt-1">{Math.round(requestConfigs.reduce((sum, request) => sum + request.max_sla_hours, 0) / Math.max(requestConfigs.length, 1))} ساعة</div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">التكامل مع الإشعارات والتطبيق</div>
          <div className="text-lg font-extrabold text-purple-700 font-mono mt-1">فوري (Realtime)</div>
        </div>
      </div>

      {settingsQuery.isLoading && <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">جاري تحميل إعدادات أنواع الطلبات...</p>}
      {(settingsQuery.isError || loadWarning) && (
        <div className="mb-3 space-y-2">
          {settingsQuery.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">تعذر تحميل إعدادات الطلبات؛ يتم عرض نسخة افتراضية آمنة.</p>}
          {loadWarning && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{loadWarning}</p>}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200" dir="rtl">
        <span className="text-xs font-bold text-slate-700">دليل أنواع الطلبات وسلاسل الموافقات المعرفة في النظام</span>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-1 rounded bg-[#0070c0] h-8 px-4 text-xs font-bold text-white shadow-xs hover:bg-[#005fa3] transition"
        >
          <MaterialIcon name="add" size={16} />
          إضافة نوع طلب جديد
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4" dir="rtl">
        {requestConfigs.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-[#0070c0] transition">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-extrabold text-[#0070c0] bg-blue-50 px-2 py-0.5 rounded">{r.code}</span>
                <span className="font-extrabold text-slate-800 text-xs">{r.name}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                r.status === "نشط" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
              }`}>
                {r.status}
              </span>
            </div>

            <div className="mb-3">
              <span className="text-[11px] font-bold text-slate-500 block mb-1.5">سلسلة مسار الموافقات:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {r.approval_chain.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="px-2 py-1 bg-slate-100 rounded text-[11px] font-bold text-slate-700 border border-slate-200">
                      {idx + 1}. {step}
                    </span>
                    {idx < r.approval_chain.length - 1 && (
                      <MaterialIcon name="arrow_back" size={14} className="text-slate-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2 gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span>زمن الاستجابة: <strong className="text-slate-800 font-mono">{r.max_sla_hours} ساعة</strong></span>
                <span>المرفقات: <strong className="text-slate-800">{r.requires_attachment ? "إلزامية" : "اختيارية"}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(r)}
                  className="text-[#0070c0] font-bold hover:underline"
                >
                  تعديل المسار
                </button>
                <button
                type="button"
                onClick={() => void handleDelete(r)}
                disabled={saveSettings.isPending}
                className="text-rose-600 font-bold hover:underline disabled:opacity-40"
              >
                  حذف
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-[#004e82] flex items-center gap-1.5">
                <MaterialIcon name="schema" size={18} className="text-[#0070c0]" />
                {editingReq ? "تعديل إعدادات نوع الطلب" : "إضافة نوع طلب ومسار اعتماد جديد"}
              </h3>
              <button type="button" onClick={() => { setIsModalOpen(false); setFormError(null); }} className="text-slate-400 hover:text-slate-700">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">كود الطلب *</span>
                <input
                  type="text"
                  value={newReq.code}
                  required
                  maxLength={32}
                  onChange={(e) => { setNewReq((p) => ({ ...p, code: e.target.value })); setFormError(null); }}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">التصنيف</span>
                <select
                  value={newReq.category}
                  onChange={(e) => setNewReq((p) => ({ ...p, category: e.target.value as RequestTypeConfig["category"] }))}
                  className={inputCls}
                >
                  <option value="شؤون موظفين">شؤون موظفين</option>
                  <option value="مالية">مالية</option>
                  <option value="إدارية">إدارية</option>
                  <option value="عمليات">عمليات</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-slate-700">اسم الطلب *</span>
                <input
                  type="text"
                  value={newReq.name}
                  required
                  maxLength={160}
                  onChange={(e) => { setNewReq((p) => ({ ...p, name: e.target.value })); setFormError(null); }}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">أقصى وقت للاعتماد (بالساعات)</span>
                <input
                  type="number"
                  value={newReq.max_sla_hours}
                  min={1}
                  max={720}
                  step={1}
                  onChange={(e) => setNewReq((p) => ({ ...p, max_sla_hours: Number(e.target.value) }))}
                  className={`${inputCls} font-mono`}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">الحالة</span>
                <select
                  value={newReq.status}
                  onChange={(e) => setNewReq((p) => ({ ...p, status: e.target.value as RequestTypeConfig["status"] }))}
                  className={inputCls}
                >
                  <option value="نشط">نشط</option>
                  <option value="معطل">معطل</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-slate-700">سلسلة الموافقات * <span className="font-normal text-slate-400">(افصل بين الخطوات بفاصلة أو سطر جديد)</span></span>
                <textarea
                  value={newReq.approval_chain.join("، ")}
                  onChange={(e) => setNewReq((p) => ({ ...p, approval_chain: splitApprovalChain(e.target.value) }))}
                  rows={2}
                  maxLength={700}
                  className={inputCls + " min-h-16 py-2"}
                  required
                />
              </label>

              <label className="flex items-center gap-2 sm:col-span-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={newReq.requires_attachment}
                  onChange={(e) => setNewReq((p) => ({ ...p, requires_attachment: e.target.checked }))}
                />
                المرفق إلزامي مع الطلب
              </label>
              <label className="flex items-center gap-2 sm:col-span-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={newReq.allow_cancel}
                  onChange={(e) => setNewReq((p) => ({ ...p, allow_cancel: e.target.checked }))}
                />
                السماح للموظف بإلغاء الطلب قبل اعتماده
              </label>
            </div>

            {formError && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700">{formError}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => { setIsModalOpen(false); setFormError(null); }}
                className="px-4 h-8 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveSettings.isPending}
                className="px-5 h-8 rounded-lg bg-[#0070c0] hover:bg-[#005fa3] text-white text-xs font-bold shadow-xs disabled:opacity-50"
              >
                {saveSettings.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-xs font-bold text-slate-400 border-t border-slate-200 pt-4">
        جميع الحقوق محفوظة © الحلول الخبيرة
      </div>
    </AppShell>
  );
}
