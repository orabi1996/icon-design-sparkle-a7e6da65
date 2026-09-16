import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useLoanReportRows } from "@/lib/report-rows";
import { summarizeLoanBalances, totalLoanBalances, csvCell, type LoanBalanceRow } from "@/lib/business-core.mjs";

export const Route = createFileRoute("/reports/loans-balance")({
  head: () => ({ meta: [{ title: "تقرير أرصدة السلف والقروض القائمة | التقارير المالية" }] }),
  component: LoansBalanceRoute,
});

type LoanBalanceItem = LoanBalanceRow;

function LoansBalanceRoute() {
  return <AppShell><LoansBalanceReport /></AppShell>;
}

function uniq(arr: string[]) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

const inputCls =
  "h-8 w-full rounded border border-[#b4c7e7] bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20";

function LoansBalanceReport() {
  const employeeQuery = useLoanReportRows("employees");
  const loanQuery = useLoanReportRows("loans");
  const employees = employeeQuery.data ?? [];
  const loans = loanQuery.data ?? [];
  const isLoading = employeeQuery.isPending || loanQuery.isPending;

  const [filters, setFilters] = useState({
    branch: "",
    department: "",
    hasBalanceOnly: "الكل",
    employee: "",
  });

  const [appliedFilters, setAppliedFilters] = useState<typeof filters | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortCol, setSortCol] = useState<string>("current_balance");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const options = useMemo(() => ({
    branches: uniq(employees.map((e) => String(e["branch"] ?? ""))),
    departments: uniq(employees.map((e) => String(e["department"] ?? ""))),
  }), [employees]);

  // Read actual loan amounts; never synthesize balances or payment dates.
  const summary = useMemo(() => {
    try { return { ...summarizeLoanBalances(employees, loans), error: null as Error | null }; }
    catch (error) { return { rows: [] as LoanBalanceItem[], issues: [], error: error as Error }; }
  }, [employees, loans]);
  const reportError = employeeQuery.error || loanQuery.error || summary.error;
  const blocked = isLoading || Boolean(reportError);
  const balanceRows = blocked ? [] : summary.rows;

  // Filtering
  const filtered = useMemo(() => {
    const f = appliedFilters || filters;
    const gSearch = globalSearch.trim().toLowerCase();
    const empQ = f.employee.trim().toLowerCase();

    return balanceRows.filter((r) => {
      if (f.branch && r.branch !== f.branch) return false;
      if (f.department && r.department !== f.department) return false;

      if (f.hasBalanceOnly === "أرصدة قائمة فقط" && r.current_balance <= 0) return false;
      if (f.hasBalanceOnly === "سلف مسددة" && (r.current_balance > 0 || r.loans_count === 0)) return false;

      if (empQ) {
        const matchName = r.employee_name.toLowerCase().includes(empQ);
        const matchNo = r.emp_no.includes(empQ);
        if (!matchName && !matchNo) return false;
      }

      if (gSearch) {
        const match = Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(gSearch)
        );
        if (!match) return false;
      }

      for (const [k, q] of Object.entries(colFilters)) {
        if (!q.trim()) continue;
        const val = String((r as any)[k] ?? "").toLowerCase();
        if (!val.includes(q.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [balanceRows, appliedFilters, filters, globalSearch, colFilters]);

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
  const visiblePage = Math.min(currentPage, totalPages);
  useEffect(() => { setCurrentPage(1); }, [colFilters, appliedFilters, filters, globalSearch, pageSize]);
  const paginatedRows = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, visiblePage, pageSize]);

  // Totals also use exact minor-unit arithmetic.
  const totals = useMemo(() => totalLoanBalances(filtered), [filtered]);

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) setSortAsc(!sortAsc);
    else {
      setSortCol(colKey);
      setSortAsc(true);
    }
  };

  /* ─── Export ─── */
  const exportExcel = (ext: "xlsx" | "xls") => {
    if (blocked) return;
    const headers = [
      "الرقم الوظيفي", "اسم الموظف", "الفرع", "القسم", "المسمى الوظيفي",
      "عدد السلف", "إجمالي الممنوح", "إجمالي المسدد", "الرصيد القائم",
      "مجموع الأقساط المسجلة", "تاريخ آخر سداد", "الحالة", "معرّفات السلف المصدرية"
    ];
    const data = sorted.map((r) => [
      r.emp_no, r.employee_name, r.branch, r.department, r.job_title,
      r.loans_count, r.total_granted, r.total_paid, r.current_balance,
      r.active_monthly_installment, r.last_payment_date, r.status, r.source_loan_ids.join(" | ")
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    if (!ws["!views"]) ws["!views"] = [];
    ws["!views"].push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "أرصدة السلف والقروض");
    XLSX.writeFile(wb, `تقرير-أرصدة-السلف-للموظفين.${ext}`);
  };

  const exportCsv = () => {
    if (blocked) return;
    const matrix = [
      ["الرقم الوظيفي", "اسم الموظف", "الفرع", "القسم", "المسمى الوظيفي", "عدد السلف", "إجمالي الممنوح", "إجمالي المسدد", "الرصيد القائم", "مجموع الأقساط المسجلة", "تاريخ آخر سداد", "الحالة", "معرّفات السلف المصدرية"],
      ...sorted.map((r) => [r.emp_no, r.employee_name, r.branch, r.department, r.job_title,
        r.loans_count, r.total_granted, r.total_paid, r.current_balance,
        r.active_monthly_installment, r.last_payment_date, r.status, r.source_loan_ids.join(" | ")]),
    ];
    const blob = new Blob(["\uFEFF" + matrix.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "loan-balances.csv"; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-[16px] font-extrabold text-[#004e82] flex items-center gap-2">
          <MaterialIcon name="account_balance_wallet" size={22} className="text-[#0070c0]" />
          تقرير أرصدة السلف والقروض القائمة
        </h1>
        <div className="text-[11px] text-slate-400">التقارير / تقارير ماليات الموظفين / رصيد السلف</div>
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-6">
        المصدر: سجلات السلف الفعلية والموظفون في قاعدة البيانات القديمة. السلف المرفوضة أو الملغاة أو غير المعتمدة مستبعدة.
        مجموع الأقساط المسجلة ليس استحقاق الشهر ولا يرحّل خصمًا إلى الرواتب. تاريخ آخر سداد غير متاح لعدم وجود دفتر حركات سداد في النموذج الحالي.
        <a href="/loans" className="ms-2 font-bold text-blue-700 underline">فتح إدارة السلف</a>
      </div>
      {reportError && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm">
        تعذر إعداد التقرير: {reportError.message}
        <button onClick={() => { void employeeQuery.refetch(); void loanQuery.refetch(); }} className="ms-3 underline">إعادة المحاولة</button>
      </div>}
      {!blocked && summary.issues.length > 0 && <div role="alert" className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs">
        توجد {summary.issues.length} ملاحظة في ربط السلف أو أرصدتها. تظهر السجلات كما هي مع عبارة «يحتاج مراجعة»؛ راجع المصدر قبل استخدام التقرير ماليًا.
      </div>}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي المبالغ الممنوحة</div>
          <div className="text-lg font-extrabold text-[#0070c0] font-mono mt-1">{blocked ? "—" : totals.granted.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي المبالغ المحصلة</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">{blocked ? "—" : totals.paid.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي محفظة السلف القائمة</div>
          <div className="text-lg font-extrabold text-amber-700 font-mono mt-1">{blocked ? "—" : totals.balance.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">مجموع الأقساط المسجلة للسلف القائمة</div>
          <div className="text-lg font-extrabold text-purple-700 font-mono mt-1">{blocked ? "—" : totals.activeMonthly.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="mb-4 rounded-xl border border-[#b4c7e7] bg-[#f0f6ff]/70 p-4 shadow-sm" dir="rtl">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-2 items-end">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">الفروع</span>
            <select
              value={filters.branch}
              onChange={(e) => setFilters((p) => ({ ...p, branch: e.target.value }))}
              className={inputCls}
            >
              <option value="">اختر ...</option>
              {options.branches.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">القسم</span>
            <select
              value={filters.department}
              onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
              className={inputCls}
            >
              <option value="">اختر ...</option>
              {options.departments.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">حالة الرصيد</span>
            <select
              value={filters.hasBalanceOnly}
              onChange={(e) => setFilters((p) => ({ ...p, hasBalanceOnly: e.target.value }))}
              className={inputCls}
            >
              <option value="الكل">الكل</option>
              <option value="أرصدة قائمة فقط">أرصدة قائمة فقط</option>
              <option value="سلف مسددة">سلف مسددة بالكامل</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">الموظف</span>
            <input
              type="text"
              placeholder="البحث بالإسم أو الرقم"
              value={filters.employee}
              onChange={(e) => setFilters((p) => ({ ...p, employee: e.target.value }))}
              className={inputCls}
            />
          </label>

          <div>
            <button
              onClick={() => {
                setAppliedFilters({ ...filters });
                setCurrentPage(1);
              }}
              className="flex items-center justify-center gap-1 rounded bg-[#0070c0] w-full h-8 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#005fa3] transition"
            >
              <MaterialIcon name="search" size={16} />
              تحديث الرصيد
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-2 flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200" dir="rtl">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 w-44 rounded border border-slate-300 bg-white pe-7 ps-2 text-[11px] font-medium outline-none focus:border-[#0070c0]"
            />
            <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2 top-2 text-slate-400" />
          </div>

          <div className="flex items-center gap-1.5 mr-2">
            <button
              disabled={blocked}
              onClick={() => { if (!blocked) window.print(); }}
              title="طباعة / PDF"
              className="flex items-center justify-center h-8 w-8 rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition shadow-xs"
            >
              <span className="text-[10px] font-extrabold uppercase">PDF</span>
            </button>
            <button
              disabled={blocked}
              onClick={() => exportExcel("xls")}
              title="تصدير XLS"
              className="flex items-center justify-center h-8 w-8 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-xs"
            >
              <span className="text-[10px] font-extrabold uppercase">XLS</span>
            </button>
            <button
              disabled={blocked}
              onClick={() => exportExcel("xlsx")}
              title="تصدير XLSX"
              className="flex items-center justify-center h-8 px-2 rounded border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs gap-1 font-bold text-[11px]"
            >
              <MaterialIcon name="table_chart" size={14} />
              <span>XLSX</span>
            </button>
            <button
              disabled={blocked}
              onClick={exportCsv}
              title="تصدير CSV"
              className="flex items-center justify-center h-8 px-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition shadow-xs font-bold text-[11px]"
            >
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-lg border border-[#004e82]/30 shadow-xs" dir="rtl">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#004e82] text-white">
              <th onClick={() => handleSort("emp_no")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">الرقم الوظيفي</th>
              <th onClick={() => handleSort("employee_name")} className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right cursor-pointer select-none">اسم الموظف</th>
              <th onClick={() => handleSort("branch")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-right cursor-pointer select-none">الفرع</th>
              <th onClick={() => handleSort("department")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-right cursor-pointer select-none">القسم</th>
              <th onClick={() => handleSort("loans_count")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">عدد السلف</th>
              <th onClick={() => handleSort("total_granted")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">إجمالي الممنوح</th>
              <th onClick={() => handleSort("total_paid")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">إجمالي المسدد</th>
              <th onClick={() => handleSort("current_balance")} className="px-3 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none bg-[#7a481c]">الرصيد القائم المتبقي</th>
              <th onClick={() => handleSort("active_monthly_installment")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">مجموع الأقساط المسجلة</th>
              <th onClick={() => handleSort("last_payment_date")} className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center cursor-pointer select-none">تاريخ آخر سداد</th>
              <th className="px-2.5 py-2 font-extrabold text-center">الحالة</th>
            </tr>

            {/* Filter row */}
            <tr className="bg-[#e8f1fb] border-b border-slate-300">
              {["emp_no", "employee_name", "branch", "department", "loans_count", "total_granted", "total_paid", "current_balance", "active_monthly_installment", "last_payment_date"].map((k) => (
                <th key={`filter-${k}`} className="p-1 border-r border-slate-300 last:border-r-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={colFilters[k] || ""}
                      onChange={(e) => setColFilters((prev) => ({ ...prev, [k]: e.target.value }))}
                      className="h-6 w-full rounded border border-slate-300 bg-white px-1 pe-4 text-[10px] outline-none focus:border-[#0070c0]"
                    />
                    <MaterialIcon name="search" size={11} className="pointer-events-none absolute left-1 top-1.5 text-slate-400" />
                  </div>
                </th>
              ))}
              <th className="p-1 text-center text-[10px] text-slate-500 font-bold">(All)</th>
            </tr>
          </thead>

          <tbody>
            {reportError ? (<tr><td colSpan={11} className="py-10 text-center text-red-700">تعذر تحميل بيانات كاملة؛ لم يتم عرض إجماليات ناقصة.</td></tr>) : isLoading ? (
              <tr>
                <td colSpan={11} className="text-center py-10 text-slate-500 font-bold">
                  جارٍ تحميل بيانات الأرصدة...
                </td>
              </tr>
            ) : paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-slate-400 font-bold">
                  لا توجد أرصدة سلف مطابقة
                </td>
              </tr>
            ) : (
              paginatedRows.map((r, idx) => (
                <tr
                  key={r.id || idx}
                  className={`border-b border-slate-200 transition hover:bg-blue-50/70 ${
                    idx % 2 === 0 ? "bg-white" : "bg-[#f8fafd]"
                  }`}
                >
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono font-bold text-[#0070c0]">{r.emp_no}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-right font-bold text-slate-800">{r.employee_name}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-right text-slate-700">{r.branch}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-right text-slate-700">{r.department}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-700">{r.loans_count}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-800">{r.total_granted.toLocaleString()}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-emerald-700 font-bold">{r.total_paid.toLocaleString()}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-center font-mono font-extrabold text-amber-800 bg-amber-50/70 text-xs">
                    {r.current_balance.toLocaleString()} ريال
                  </td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-[#0070c0] font-bold">{r.active_monthly_installment.toLocaleString()}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-600">{r.last_payment_date}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.current_balance > 0 ? "bg-amber-100 text-amber-800" : r.loans_count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600" dir="rtl">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
            disabled={visiblePage === 1}
            className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`rounded px-2.5 py-1 text-xs font-bold transition ${
                  visiblePage === p
                    ? "bg-[#0070c0] text-white"
                    : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && (
            <>
              <span className="px-1 text-slate-400">...</span>
              <button
                onClick={() => setCurrentPage(totalPages)}
                className={`rounded px-2.5 py-1 text-xs font-bold transition ${
                  visiblePage === totalPages
                    ? "bg-[#0070c0] text-white"
                    : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                {totalPages}
              </button>
            </>
          )}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1))}
            disabled={visiblePage === totalPages}
            className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ›
          </button>
          <span className="mr-3 font-bold text-slate-500">
            صفحة {visiblePage} من {totalPages} [{totalItems} عنصر]
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">عرض:</span>
          {[5, 10, 20, 50, 100].map((sz) => (
            <button
              key={sz}
              onClick={() => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              className={`rounded px-2 py-0.5 text-xs font-bold transition ${
                pageSize === sz
                  ? "bg-[#004e82] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 text-center text-xs font-bold text-slate-400 border-t border-slate-200 pt-4">
        جميع الحقوق محفوظة © الحلول الخبيرة
      </div>
    </>
  );
}
