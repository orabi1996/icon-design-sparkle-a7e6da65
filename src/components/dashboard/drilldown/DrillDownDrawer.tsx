import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DrillDownData } from "../types";
import { num } from "../services/analyticsData";
import { exportToExcel } from "../export/exportUtils";

interface DrillDownDrawerProps {
  data: DrillDownData;
  onClose: () => void;
}

export function DrillDownDrawer({ data, onClose }: DrillDownDrawerProps) {
  const [search, setSearch] = useState("");

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return data.employees;
    const q = search.toLowerCase();
    return data.employees.filter(
      (e) =>
        (e.full_name ?? "").toLowerCase().includes(q) ||
        (e.emp_no ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q) ||
        (e.job_title ?? "").toLowerCase().includes(q) ||
        (e.branch ?? "").toLowerCase().includes(q)
    );
  }, [data.employees, search]);

  if (!data.isOpen) return null;

  const handleExport = () => {
    exportToExcel(
      `تفاصيل_${data.title}`,
      filteredEmployees,
      [
        { header: "الرقم الوظيفي", key: "emp_no" },
        { header: "اسم الموظف", key: "full_name" },
        { header: "الفرع", key: "branch" },
        { header: "القسم", key: "department" },
        { header: "المسمى الوظيفي", key: "job_title" },
        { header: "حالة الدوام", key: "attendance_status" },
        { header: "وقت الحضور", key: "check_in" },
        { header: "وقت الانصراف", key: "check_out" },
        { header: "دقائق التأخير", key: "late_minutes" },
        { header: "الحالة الوظيفية", key: "status" },
      ],
      data.title
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs transition-opacity"
    >
      <div className="flex h-full w-full max-w-3xl flex-col bg-card shadow-2xl border-s border-border animate-in slide-in-from-left duration-200 text-card-foreground">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border p-5 bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#e8f0fe] text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
              <MaterialIcon name="manage_search" size={24} filled />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-foreground">
                  {data.title}
                </h3>
                <Badge variant="default" className="font-mono text-xs font-black">
                  {num(data.count)}
                </Badge>
              </div>
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                {data.filterDescription || "استكشاف تفاصيل السجلات المكونة للمؤشر"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-1.5 rounded-xl font-extrabold text-xs"
              title="تصدير القائمة إلى Excel"
            >
              <MaterialIcon name="download" size={16} />
              <span>تصدير Excel</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-9 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <MaterialIcon name="close" size={20} />
            </Button>
          </div>
        </div>

        {/* Search bar inside drawer */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <MaterialIcon
              name="search"
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="ابحث بالاسم، الرقم الوظيفي، القسم، أو المسمى..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl bg-muted/30 pe-10 ps-4 text-xs font-bold"
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground font-mono whitespace-nowrap">
            {num(filteredEmployees.length)} موظف
          </span>
        </div>

        {/* Employee Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredEmployees.length === 0 ? (
            <div className="py-16 text-center text-xs font-bold text-slate-400">
              لا توجد سجلات تطابق شروط البحث أو الفلتر
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-extrabold dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="py-3 px-3.5">الموظف</th>
                    <th className="py-3 px-3.5">الرقم</th>
                    <th className="py-3 px-3.5">الفرع والقسم</th>
                    <th className="py-3 px-3.5">المسمى الوظيفي</th>
                    <th className="py-3 px-3.5">حالة الحضور</th>
                    <th className="py-3 px-3.5">التوقيت</th>
                    <th className="py-3 px-3.5">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-800 dark:divide-slate-800 dark:text-slate-200">
                  {filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 transition dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-full bg-[#e8f0fe] text-[11px] font-black text-[#0b57d0] dark:bg-blue-950 dark:text-blue-400">
                            {String(emp.full_name ?? "؟").charAt(0)}
                          </span>
                          <span className="truncate max-w-[140px]">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-500 dark:text-slate-400">
                        {emp.emp_no}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="block font-bold text-slate-800 dark:text-slate-200">
                          {emp.department || "عام"}
                        </span>
                        <span className="block text-[10.5px] text-slate-400">
                          {emp.branch || "الفرع الرئيسي"}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                        {emp.job_title || "—"}
                      </td>
                      <td className="py-3 px-3.5">
                        <Badge
                          variant="outline"
                          className={`text-[10.5px] font-bold ${
                            emp.attendance_status === "حاضر"
                              ? "bg-emerald-50 text-[#137333] border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900"
                              : emp.attendance_status === "متأخر"
                              ? "bg-amber-50 text-[#b06000] border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900"
                              : emp.attendance_status === "في إجازة"
                              ? "bg-purple-50 text-[#6750a4] border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-900"
                          }`}
                        >
                          {emp.attendance_status || "غير مسجل"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {emp.check_in ? (
                          <span>
                            {emp.check_in.slice(0, 5)}
                            {emp.check_out ? ` - ${emp.check_out.slice(0, 5)}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                        {(emp.late_minutes ?? 0) > 0 && (
                          <span className="block text-amber-600 font-bold">
                            تأخير {num(emp.late_minutes)} د
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <Link
                          to="/staff/update"
                          search={{ id: emp.id } as never}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#0b57d0] hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                        >
                          <span>الملف</span>
                          <MaterialIcon name="chevron_left" size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
