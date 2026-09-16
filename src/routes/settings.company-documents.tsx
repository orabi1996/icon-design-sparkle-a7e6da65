import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";

export const Route = createFileRoute("/settings/company-documents")({
  head: () => ({ meta: [{ title: "مستندات وتراخيص الشركة والفروع | إعدادات النظام" }] }),
  component: CompanyDocumentsPage,
});

type LicenseDoc = {
  id: string;
  doc_type: string;
  doc_no: string;
  branch: string;
  issuer: string;
  issue_date: string;
  expiry_date: string;
  days_remaining: number;
  status: "سارٍ" | "قارب على الانتهاء" | "منتهي";
};

const DOC_TYPES = [
  "السجل التجاري (CR)",
  "رخصة البلدية / رخصة النشاط",
  "شهادة الزكاة والضريبة (ZATCA)",
  "شهادة السعودة (التوطين)",
  "اشتراك الغرفة التجارية",
  "ترخيص السلامة والدفاع المدني",
  "شهادة التأمينات الاجتماعية (GOSI)",
  "عقد تأسيس الشركة وملاحقه",
];

const inputCls =
  "h-8 w-full rounded border border-[#b4c7e7] bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20";

function CompanyDocumentsPage() {
  const [documents, setDocuments] = useState<LicenseDoc[]>([
    {
      id: "doc-1",
      doc_type: "السجل التجاري (CR)",
      doc_no: "1010789456",
      branch: "المقر الرئيسي - الرياض",
      issuer: "وزارة التجارة",
      issue_date: "2023/04/15",
      expiry_date: "2027/04/15",
      days_remaining: 590,
      status: "سارٍ",
    },
    {
      id: "doc-2",
      doc_type: "شهادة الزكاة والضريبة (ZATCA)",
      doc_no: "310198425100003",
      branch: "المقر الرئيسي - الرياض",
      issuer: "هيئة الزكاة والضريبة والجمارك",
      issue_date: "2025/01/01",
      expiry_date: "2026/04/30",
      days_remaining: 240,
      status: "سارٍ",
    },
    {
      id: "doc-3",
      doc_type: "شهادة السعودة (التوطين)",
      doc_no: "SAUD-2025-9842",
      branch: "المقر الرئيسي - الرياض",
      issuer: "وزارة الموارد البشرية",
      issue_date: "2025/03/01",
      expiry_date: "2025/09/01",
      days_remaining: 35,
      status: "قارب على الانتهاء",
    },
    {
      id: "doc-4",
      doc_type: "رخصة البلدية / رخصة النشاط",
      doc_no: "BAL-445892",
      branch: "فرع جدة",
      issuer: "أمانة محافظة جدة",
      issue_date: "2024/06/10",
      expiry_date: "2026/06/10",
      days_remaining: 280,
      status: "سارٍ",
    },
    {
      id: "doc-5",
      doc_type: "ترخيص السلامة والدفاع المدني",
      doc_no: "DEF-88219",
      branch: "فرع الدمام",
      issuer: "المديرية العامة للدفاع المدني",
      issue_date: "2024/08/01",
      expiry_date: "2025/08/01",
      days_remaining: 0,
      status: "منتهي",
    },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<LicenseDoc | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [newDoc, setNewDoc] = useState({
    doc_type: DOC_TYPES[0]!,
    doc_no: "",
    branch: "المقر الرئيسي - الرياض",
    issuer: "",
    issue_date: "",
    expiry_date: "",
  });

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.doc_type.toLowerCase().includes(q) ||
        d.doc_no.includes(q) ||
        d.branch.toLowerCase().includes(q) ||
        d.issuer.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  const totals = useMemo(() => {
    const valid = documents.filter((d) => d.status === "سارٍ").length;
    const expiring = documents.filter((d) => d.status === "قارب على الانتهاء").length;
    const expired = documents.filter((d) => d.status === "منتهي").length;
    return { count: documents.length, valid, expiring, expired };
  }, [documents]);

  const handleOpenAdd = () => {
    setEditingDoc(null);
    setNewDoc({
      doc_type: DOC_TYPES[0]!,
      doc_no: "",
      branch: "المقر الرئيسي - الرياض",
      issuer: "",
      issue_date: "2025-01-01",
      expiry_date: "2026-01-01",
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!newDoc.doc_no.trim()) return;

    if (editingDoc) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === editingDoc.id ? { ...d, ...newDoc, days_remaining: 180, status: "سارٍ" } : d))
      );
    } else {
      const item: LicenseDoc = {
        id: `doc-${Date.now()}`,
        ...newDoc,
        days_remaining: 365,
        status: "سارٍ",
      };
      setDocuments((prev) => [...prev, item]);
    }
    setIsModalOpen(false);
  };

  /* ─── Export ─── */
  const exportExcel = () => {
    const headers = ["نوع المستند / الترخيص", "رقم المستند", "الفرع", "الجهة المصدرة", "تاريخ الإصدار", "تاريخ الانتهاء", "الأيام المتبقية", "الحالة"];
    const data = filtered.map((d) => [
      d.doc_type, d.doc_no, d.branch, d.issuer, d.issue_date, d.expiry_date, d.days_remaining, d.status
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    if (!ws["!views"]) ws["!views"] = [];
    ws["!views"].push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تراخيص ومستندات الشركة");
    XLSX.writeFile(wb, "سجل-تراخيص-ومستندات-الشركة.xlsx");
  };

  return (
    <AppShell>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-[16px] font-extrabold text-[#004e82] flex items-center gap-2">
          <MaterialIcon name="verified_user" size={22} className="text-[#0070c0]" />
          مستندات وتراخيص وسجلات الشركة والفروع
        </h1>
        <div className="text-[11px] text-slate-400">إعدادات النظام / تهيئة بيانات الشركات والفروع / مستندات الشركة</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي التراخيص والسجلات</div>
          <div className="text-lg font-extrabold text-[#0070c0] font-mono mt-1">{totals.count} ترخيص</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">تراخيص سارية الفعالية</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">{totals.valid} ترخيص</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">قاربت على الانتهاء (&lt; 60 يوم)</div>
          <div className="text-lg font-extrabold text-amber-700 font-mono mt-1">{totals.expiring} ترخيص</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">تراخيص منتهية الصلاحية</div>
          <div className="text-lg font-extrabold text-rose-700 font-mono mt-1">{totals.expired} ترخيص</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200" dir="rtl">
        <div className="relative">
          <input
            type="text"
            placeholder="البحث بنوع الترخيص، الرقم، الفرع، الجهة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-72 rounded border border-slate-300 bg-white pe-7 ps-2 text-[11px] font-medium outline-none focus:border-[#0070c0]"
          />
          <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2 top-2 text-slate-400" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-1 rounded bg-[#0070c0] h-8 px-4 text-xs font-bold text-white shadow-xs hover:bg-[#005fa3] transition"
          >
            <MaterialIcon name="add" size={16} />
            إضافة ترخيص / مستند
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center justify-center gap-1 rounded bg-emerald-600 h-8 px-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <MaterialIcon name="table_chart" size={15} />
            Excel
          </button>
        </div>
      </div>

      {/* Documents Table */}
      <div className="overflow-x-auto rounded-lg border border-[#004e82]/30 shadow-xs" dir="rtl">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#004e82] text-white">
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right">نوع المستند / الترخيص</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">رقم المستند</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-right">الفرع التابع</th>
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right">الجهة المصدرة</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">تاريخ الإصدار</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">تاريخ الانتهاء</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center bg-[#00385e]">الأيام المتبقية</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">الحالة</th>
              <th className="px-2.5 py-2 font-extrabold text-center">إجراءات</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((d, idx) => (
              <tr
                key={d.id}
                className={`border-b border-slate-200 transition hover:bg-blue-50/70 ${
                  idx % 2 === 0 ? "bg-white" : "bg-[#f8fafd]"
                }`}
              >
                <td className="px-3 py-1.5 border-r border-slate-200 text-right font-bold text-slate-800 flex items-center gap-1.5">
                  <MaterialIcon name="description" size={16} className="text-[#0070c0]" />
                  {d.doc_type}
                </td>
                <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono font-bold text-slate-700">{d.doc_no}</td>
                <td className="px-2.5 py-1.5 border-r border-slate-200 text-right text-slate-700">{d.branch}</td>
                <td className="px-3 py-1.5 border-r border-slate-200 text-right text-slate-700">{d.issuer}</td>
                <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-600">{d.issue_date}</td>
                <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-600">{d.expiry_date}</td>
                <td className={`px-2.5 py-1.5 border-r border-slate-200 text-center font-mono font-extrabold ${
                  d.status === "منتهي"
                    ? "text-rose-700 bg-rose-50/60"
                    : d.status === "قارب على الانتهاء"
                    ? "text-amber-700 bg-amber-50/60"
                    : "text-emerald-700"
                }`}>
                  {d.days_remaining} يوم
                </td>
                <td className="px-2.5 py-1.5 border-r border-slate-200 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    d.status === "سارٍ"
                      ? "bg-emerald-100 text-emerald-800"
                      : d.status === "قارب على الانتهاء"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <button
                    onClick={() => {
                      setEditingDoc(d);
                      setNewDoc({ ...d });
                      setIsModalOpen(true);
                    }}
                    className="p-1 text-slate-600 hover:text-[#0070c0] transition rounded hover:bg-slate-100"
                  >
                    <MaterialIcon name="edit" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-[#004e82] flex items-center gap-1.5">
                <MaterialIcon name="verified_user" size={18} className="text-[#0070c0]" />
                {editingDoc ? "تعديل بيانات الترخيص" : "إضافة ترخيص / مستند رسمي جديد"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 transition"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-slate-700">نوع المستند / الترخيص *</span>
                <select
                  value={newDoc.doc_type}
                  onChange={(e) => setNewDoc((p) => ({ ...p, doc_type: e.target.value }))}
                  className={inputCls}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">رقم الترخيص / السجل *</span>
                <input
                  type="text"
                  value={newDoc.doc_no}
                  onChange={(e) => setNewDoc((p) => ({ ...p, doc_no: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">الجهة المصدرة</span>
                <input
                  type="text"
                  value={newDoc.issuer}
                  onChange={(e) => setNewDoc((p) => ({ ...p, issuer: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">تاريخ الإصدار</span>
                <input
                  type="date"
                  value={newDoc.issue_date}
                  onChange={(e) => setNewDoc((p) => ({ ...p, issue_date: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">تاريخ الانتهاء</span>
                <input
                  type="date"
                  value={newDoc.expiry_date}
                  onChange={(e) => setNewDoc((p) => ({ ...p, expiry_date: e.target.value }))}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 h-8 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-5 h-8 rounded-lg bg-[#0070c0] hover:bg-[#005fa3] text-white text-xs font-bold shadow-xs transition"
              >
                حفظ الترخيص
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
