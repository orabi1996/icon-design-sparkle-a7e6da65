import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, type Row } from "@/lib/hr-db";

export const Route = createFileRoute("/reports/surveys-report")({
  head: () => ({ meta: [{ title: "تقرير التعميمات الإدارية والاستبيانات | التقارير الإحصائية" }] }),
  component: SurveysReport,
});

type SurveyItem = {
  id: string;
  code: string;
  title: string;
  category: "تعميم إداري" | "استبيان رأي" | "سياسة ولوائح";
  publish_date: string;
  expiry_date: string;
  target_audience: string;
  target_count: number;
  response_count: number;
  response_rate: number;
  status: string;
};

const CATEGORIES = ["الكل", "تعميم إداري", "استبيان رأي", "سياسة ولوائح"];

function uniq(arr: string[]) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

const inputCls =
  "h-8 w-full rounded border border-[#b4c7e7] bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20";

function SurveysReport() {
  const { data: employees = [] } = useRows("employees");

  const [filters, setFilters] = useState({
    category: "",
    status: "",
    search: "",
  });

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortCol, setSortCol] = useState<string>("publish_date");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Generate survey items
  const surveyRows = useMemo(() => {
    const list: SurveyItem[] = [
      {
        id: "srv-1",
        code: "CIRC-2025-01",
        title: "تعميم مواعيد دوام شهر رمضان المبارك وإجراءات المرونة",
        category: "تعميم إداري",
        publish_date: "2025/02/20",
        expiry_date: "2025/03/30",
        target_audience: "جميع الفروع والأقسام",
        target_count: employees.length || 32,
        response_count: employees.length ? Math.round(employees.length * 0.95) : 30,
        response_rate: 95.0,
        status: "سارٍ ومعتمد",
      },
      {
        id: "srv-2",
        code: "SURV-2025-02",
        title: "استبيان قياس الرضا الوظيفي وبيئة العمل للربع الأول",
        category: "استبيان رأي",
        publish_date: "2025/03/01",
        expiry_date: "2025/03/25",
        target_audience: "كافة منسوبي الشركة",
        target_count: employees.length || 32,
        response_count: employees.length ? Math.round(employees.length * 0.82) : 26,
        response_rate: 82.5,
        status: "مكتمل ومغلق",
      },
      {
        id: "srv-3",
        code: "POL-2025-03",
        title: "تحديث لائحة تنظيم العمل والجزاءات المعتمدة من وزارة الموارد البشرية",
        category: "سياسة ولوائح",
        publish_date: "2025/01/10",
        expiry_date: "2026/01/10",
        target_audience: "جميع الموظفين",
        target_count: employees.length || 32,
        response_count: employees.length || 32,
        response_rate: 100.0,
        status: "سارٍ ومعتمد",
      },
      {
        id: "srv-4",
        code: "SURV-2025-04",
        title: "استطلاع الاحتياجات التدريبية والتطويرية للعام الجديد",
        category: "استبيان رأي",
        publish_date: "2025/04/05",
        expiry_date: "2025/05/01",
        target_audience: "الإدارات الفنية والتنفيذية",
        target_count: 24,
        response_count: 21,
        response_rate: 87.5,
        status: "مكتمل ومغلق",
      },
      {
        id: "srv-5",
        code: "CIRC-2025-05",
        title: "تعميم الالتزام بالزي المهني وبطاقات الهوية أثناء الدوام الرسمي",
        category: "تعميم إداري",
        publish_date: "2025/05/10",
        expiry_date: "2025/12/31",
        target_audience: "جميع فروع الشركة",
        target_count: employees.length || 32,
        response_count: employees.length ? Math.round(employees.length * 0.9) : 29,
        response_rate: 90.0,
        status: "سارٍ ومعتمد",
      },
    ];

    return list;
  }, [employees]);

  // Filtering
  const filtered = useMemo(() => {
    const gSearch = globalSearch.trim().toLowerCase();
    const q = filters.search.trim().toLowerCase();

    return surveyRows.filter((r) => {
      if (filters.category && filters.category !== "الكل" && r.category !== filters.category) return false;
      if (filters.status && filters.status !== "الكل" && r.status !== filters.status) return false;

      if (q) {
        const match = r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (gSearch) {
        const match = Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(gSearch)
        );
        if (!match) return false;
      }

      for (const [k, valQ] of Object.entries(colFilters)) {
        if (!valQ.trim()) continue;
        const cell = String((r as any)[k] ?? "").toLowerCase();
        if (!cell.includes(valQ.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [surveyRows, filters, globalSearch, colFilters]);

  // Sorting
  const sorted = useMemo(() => {
    const list = [...filtered];
    if (!sortCol) return list;
    return list.sort((a, b) => {
      const valA = (a as any)[sortCol] ?? "";
      const valB = (b as any)[sortCol] ?? "";
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc ? String(valA).localeCompare(String(valB), "ar") : String(valB).localeCompare(String(valA), "ar");
    });
  }, [filtered, sortCol, sortAsc]);

  // Pagination
  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) setSortAsc(!sortAsc);
    else {
      setSortCol(colKey);
      setSortAsc(true);
    }
  };

  /* ─── Export ─── */
  const exportExcel = (ext: "xlsx" | "xls") => {
    const headers = [
      "الرقم المرجعي", "عنوان التعميم / الاستبيان", "النوع والتصنيف", "تاريخ النشر",
      "الجمهور المستهدف", "المستهدفين", "المشاركين", "نسبة الاستجابة %", "الحالة"
    ];
    const data = sorted.map((r) => [
      r.code, r.title, r.category, r.publish_date, r.target_audience,
      r.target_count, r.response_count, `${r.response_rate}%`, r.status
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    if (!ws["!views"]) ws["!views"] = [];
    ws["!views"].push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التعميمات والاستبيانات");
    XLSX.writeFile(wb, `تقرير-التعميمات-والاستبيانات.${ext}`);
  };

  return (
    <AppShell>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-[16px] font-extrabold text-[#004e82] flex items-center gap-2">
          <MaterialIcon name="campaign" size={22} className="text-[#0070c0]" />
          تقرير التعميمات الإدارية والاستبيانات
        </h1>
        <div className="text-[11px] text-slate-400">التقارير / تقارير إحصائية / التعميمات والاستبيانات</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي التعميمات الصادرة</div>
          <div className="text-lg font-extrabold text-[#0070c0] font-mono mt-1">3 تعميمات</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">استبيانات الرأي المنفذة</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">2 استبيان</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">متوسط نسبة تفاعل الموظفين</div>
          <div className="text-lg font-extrabold text-indigo-700 font-mono mt-1">91.0%</div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">معدل قراءة السياسات واللوائح</div>
          <div className="text-lg font-extrabold text-purple-700 font-mono mt-1">100%</div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="mb-4 rounded-xl border border-[#b4c7e7] bg-[#f0f6ff]/70 p-4 shadow-sm" dir="rtl">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">التصنيف</span>
            <select
              value={filters.category}
              onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
              className={inputCls}
            >
              {CATEGORIES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">البحث بالعنوان أو الكود</span>
            <input
              type="text"
              placeholder="ابحث..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              className={inputCls}
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center gap-1 rounded bg-[#0070c0] h-8 px-4 text-xs font-bold text-white shadow-xs hover:bg-[#005fa3] transition"
            >
              <MaterialIcon name="print" size={15} />
              طباعة التقرير
            </button>
            <button
              onClick={() => exportExcel("xlsx")}
              className="flex items-center justify-center gap-1 rounded bg-emerald-600 h-8 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <MaterialIcon name="table_chart" size={15} />
              تصدير Excel
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-lg border border-[#004e82]/30 shadow-xs" dir="rtl">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#004e82] text-white">
              <th onClick={() => handleSort("code")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">الرقم المرجعي</th>
              <th onClick={() => handleSort("title")} className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right cursor-pointer select-none">عنوان التعميم / الاستبيان</th>
              <th onClick={() => handleSort("category")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">التصنيف</th>
              <th onClick={() => handleSort("publish_date")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">تاريخ النشر</th>
              <th onClick={() => handleSort("target_audience")} className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right cursor-pointer select-none">الجمهور المستهدف</th>
              <th onClick={() => handleSort("target_count")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">المستهدفين</th>
              <th onClick={() => handleSort("response_count")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">المشاركين</th>
              <th onClick={() => handleSort("response_rate")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none bg-[#185e2b]">نسبة التفاعل</th>
              <th className="px-2.5 py-2 font-extrabold text-center">الحالة</th>
            </tr>
          </thead>

          <tbody>
            {paginatedRows.map((r, idx) => (
              <tr
                key={r.id || idx}
                className={`border-b border-slate-200 transition hover:bg-blue-50/70 ${
                  idx % 2 === 0 ? "bg-white" : "bg-[#f8fafd]"
                }`}
              >
                <td className="px-2.5 py-2 border-r border-slate-200 text-center font-mono font-bold text-[#0070c0]">{r.code}</td>
                <td className="px-3 py-2 border-r border-slate-200 text-right font-bold text-slate-800">{r.title}</td>
                <td className="px-2.5 py-2 border-r border-slate-200 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.category === "تعميم إداري" ? "bg-blue-100 text-blue-800" : r.category === "استبيان رأي" ? "bg-emerald-100 text-emerald-800" : "bg-purple-100 text-purple-800"
                  }`}>
                    {r.category}
                  </span>
                </td>
                <td className="px-2.5 py-2 border-r border-slate-200 text-center font-mono text-slate-600">{r.publish_date}</td>
                <td className="px-3 py-2 border-r border-slate-200 text-right text-slate-700">{r.target_audience}</td>
                <td className="px-2.5 py-2 border-r border-slate-200 text-center font-mono text-slate-700">{r.target_count}</td>
                <td className="px-2.5 py-2 border-r border-slate-200 text-center font-mono font-bold text-emerald-800">{r.response_count}</td>
                <td className="px-2.5 py-2 border-r border-slate-200 text-center font-mono font-extrabold text-emerald-800 bg-emerald-50/50">
                  {r.response_rate}%
                </td>
                <td className="px-2.5 py-2 text-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-center text-xs font-bold text-slate-400 border-t border-slate-200 pt-4">
        جميع الحقوق محفوظة © الحلول الخبيرة
      </div>
    </AppShell>
  );
}
