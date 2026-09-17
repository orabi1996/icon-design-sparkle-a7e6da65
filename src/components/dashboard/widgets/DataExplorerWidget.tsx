import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps, EmployeeRecord } from "../types";
import { num, numMoney } from "../services/analyticsData";
import { exportToExcel, exportToCsv } from "../export/exportUtils";

interface ColumnDef {
  key: keyof EmployeeRecord | "actions";
  label: string;
  sortable?: boolean;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "emp_no", label: "الرقم الوظيفي", sortable: true },
  { key: "full_name", label: "اسم الموظف", sortable: true },
  { key: "branch", label: "الفرع", sortable: true },
  { key: "department", label: "القسم", sortable: true },
  { key: "sector", label: "القطاع", sortable: true },
  { key: "job_level", label: "المستوى الوظيفي", sortable: true },
  { key: "job_category", label: "الفئة الوظيفية", sortable: true },
  { key: "nationality", label: "الجنسية", sortable: true },
  { key: "status", label: "الحالة الوظيفية", sortable: true },
  { key: "attendance_status", label: "حالة الحضور", sortable: true },
  { key: "basic_salary", label: "الراتب الأساسي", sortable: true },
];

export function DataExplorerWidget({ employees, onDrillDown }: WidgetProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("emp_no");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(DEFAULT_COLUMNS.map((c) => c.key))
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Filter & Search
  const searchedData = useMemo(() => {
    if (!searchTerm.trim()) return employees;
    const q = searchTerm.toLowerCase();
    return employees.filter(
      (e) =>
        (e.full_name ?? "").toLowerCase().includes(q) ||
        (e.emp_no ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q) ||
        (e.branch ?? "").toLowerCase().includes(q) ||
        (e.job_title ?? "").toLowerCase().includes(q) ||
        (e.nationality ?? "").toLowerCase().includes(q)
    );
  }, [employees, searchTerm]);

  // Sort
  const sortedData = useMemo(() => {
    const list = [...searchedData];
    list.sort((a: any, b: any) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, "ar")
        : bStr.localeCompare(aStr, "ar");
    });
    return list;
  }, [searchedData, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (colKey: string) => {
    if (sortColumn === colKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(colKey);
      setSortDirection("asc");
    }
  };

  const toggleColumn = (key: string) => {
    const next = new Set(visibleKeys);
    if (next.has(key)) {
      if (next.size > 2) next.delete(key);
    } else {
      next.add(key);
    }
    setVisibleKeys(next);
  };

  const handleExportExcel = () => {
    const cols = DEFAULT_COLUMNS.filter((c) => visibleKeys.has(c.key)).map((c) => ({
      header: c.label,
      key: c.key as string,
      format: c.key === "basic_salary" ? (v: any) => numMoney(v) : undefined,
    }));
    exportToExcel("مستكشف_البيانات_التحليلي", sortedData, cols);
  };

  const handleExportCsv = () => {
    const cols = DEFAULT_COLUMNS.filter((c) => visibleKeys.has(c.key)).map((c) => ({
      header: c.label,
      key: c.key as string,
    }));
    exportToCsv("مستكشف_البيانات_التحليلي", sortedData, cols);
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 space-y-4">
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
            <MaterialIcon name="table_chart" size={20} filled />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                مستكشف البيانات التحليلي (Data Explorer)
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {num(sortedData.length)} سجل
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-400">
              جدول تحليلي متقدم متعدد الأبعاد مع دعم البحث والفرز والترقيم وتصدير البيانات
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar */}
          <div className="relative">
            <MaterialIcon
              name="search"
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="ابحث في السجلات..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-52 rounded-full border border-slate-200 bg-slate-50 pe-9 ps-3.5 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-[#0b57d0] focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          {/* Column Picker Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
            >
              <MaterialIcon name="view_column" size={16} />
              <span>الأعمدة</span>
            </button>

            {showColumnPicker && (
              <div className="absolute left-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl z-20 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-black text-slate-900 mb-2 dark:text-white">
                  إظهار وإخفاء الأعمدة
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {DEFAULT_COLUMNS.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleKeys.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded accent-[#0b57d0]"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export Buttons */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
            title="تصدير إلى Excel"
          >
            <MaterialIcon name="file_download" size={16} />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
            title="تصدير إلى CSV"
          >
            <MaterialIcon name="description" size={16} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-extrabold dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              {DEFAULT_COLUMNS.filter((c) => visibleKeys.has(c.key)).map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`py-3 px-3.5 whitespace-nowrap ${col.sortable ? "cursor-pointer hover:text-[#0b57d0]" : ""}`}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {sortColumn === col.key && (
                      <MaterialIcon
                        name={sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
                        size={14}
                      />
                    )}
                  </div>
                </th>
              ))}
              <th className="py-3 px-3.5 text-center">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-800 dark:divide-slate-800 dark:text-slate-200">
            {paginatedData.map((emp) => (
              <tr
                key={emp.id}
                className="hover:bg-slate-50/80 transition dark:hover:bg-slate-800/40"
              >
                {visibleKeys.has("emp_no") && (
                  <td className="py-2.5 px-3.5 font-mono text-slate-500 dark:text-slate-400">
                    {emp.emp_no}
                  </td>
                )}
                {visibleKeys.has("full_name") && (
                  <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-[#e8f0fe] text-[10px] font-black text-[#0b57d0] dark:bg-blue-950 dark:text-blue-400">
                        {String(emp.full_name ?? "؟").charAt(0)}
                      </span>
                      <span>{emp.full_name}</span>
                    </div>
                  </td>
                )}
                {visibleKeys.has("branch") && (
                  <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                    {emp.branch || "الفرع الرئيسي"}
                  </td>
                )}
                {visibleKeys.has("department") && (
                  <td className="py-2.5 px-3.5 font-bold text-slate-800 dark:text-slate-200">
                    {emp.department || "عام"}
                  </td>
                )}
                {visibleKeys.has("sector") && (
                  <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                    {emp.sector || "قطاع اداري"}
                  </td>
                )}
                {visibleKeys.has("job_level") && (
                  <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                    {emp.job_level || "تنفيذي"}
                  </td>
                )}
                {visibleKeys.has("job_category") && (
                  <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                    {emp.job_category || "إداري"}
                  </td>
                )}
                {visibleKeys.has("nationality") && (
                  <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                    {emp.nationality || "—"}
                  </td>
                )}
                {visibleKeys.has("status") && (
                  <td className="py-2.5 px-3.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        emp.status === "نشط"
                          ? "bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400"
                          : emp.status === "موقوف"
                          ? "bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                      }`}
                    >
                      {emp.status || "نشط"}
                    </span>
                  </td>
                )}
                {visibleKeys.has("attendance_status") && (
                  <td className="py-2.5 px-3.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        emp.attendance_status === "حاضر"
                          ? "bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400"
                          : emp.attendance_status === "متأخر"
                          ? "bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {emp.attendance_status || "غير مسجل"}
                    </span>
                  </td>
                )}
                {visibleKeys.has("basic_salary") && (
                  <td className="py-2.5 px-3.5 font-mono text-slate-800 dark:text-slate-200">
                    {numMoney(emp.basic_salary)}
                  </td>
                )}

                <td className="py-2.5 px-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onDrillDown({
                          title: `سجل الموظف: ${emp.full_name}`,
                          count: 1,
                          metricKey: `emp_${emp.id}`,
                          employees: [emp],
                          filterDescription: `تفاصيل الموظف ${emp.full_name} (${emp.emp_no})`,
                        })
                      }
                      className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-[#0b57d0] dark:hover:bg-blue-950/40"
                      title="فحص التفاصيل"
                    >
                      <MaterialIcon name="visibility" size={16} />
                    </button>
                    <Link
                      to="/staff/update"
                      search={{ id: emp.id } as never}
                      className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      title="الملف الوظيفي"
                    >
                      <MaterialIcon name="edit" size={15} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {paginatedData.length === 0 && (
              <tr>
                <td
                  colSpan={visibleKeys.size + 1}
                  className="py-12 text-center text-xs text-slate-400"
                >
                  لا توجد سجلات مطابقة للبحث أو الفلاتر المحددة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold">
          <span>عرض</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <option value={10}>10 أسطر</option>
            <option value={25}>25 سطراً</option>
            <option value={50}>50 سطراً</option>
          </select>
          <span>من إجمالي {num(sortedData.length)} سجل</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
          >
            <MaterialIcon name="chevron_right" size={16} />
          </button>
          <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 px-2">
            صفحة {currentPage} من {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
          >
            <MaterialIcon name="chevron_left" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
