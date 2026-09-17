import { useState } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeDepartmentBreakdown, num, numPercent } from "../services/analyticsData";

export function DepartmentDistributionWidget({
  employees,
  widget,
  onDrillDown,
}: WidgetProps) {
  const [showAll, setShowAll] = useState(false);
  const departments = computeDepartmentBreakdown(employees);
  const limit = widget.settings?.limit || 5;
  const displayed = showAll ? departments : departments.slice(0, limit);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
              <MaterialIcon name="domain" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                توزيع الموظفين حسب الأقسام
              </h3>
              <p className="text-[11px] font-medium text-slate-400">
                ترتيب الأقسام تنازلياً حسب كثافة الكوادر البشرية
              </p>
            </div>
          </div>

          {departments.length > limit && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-xs font-black text-[#0b57d0] hover:underline"
            >
              {showAll ? "عرض أقل" : `عرض الكل (${num(departments.length)})`}
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3.5">
          {displayed.map((dept) => {
            const deptEmployees = employees.filter((e) => (e.department || "غير محدد") === dept.name);
            return (
              <div
                key={dept.name}
                onClick={() =>
                  onDrillDown({
                    title: `قسم: ${dept.name}`,
                    count: dept.count,
                    metricKey: `dept_${dept.name}`,
                    employees: deptEmployees,
                    filterDescription: `موظفو قسم ${dept.name}`,
                  })
                }
                className="group cursor-pointer rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                  <span className="text-slate-800 dark:text-slate-200 group-hover:text-[#0b57d0] transition">
                    {dept.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-900 dark:text-white font-black">
                      {num(dept.count)} موظف
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      ({numPercent(dept.percent)})
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[#0b57d0] transition-all duration-500 group-hover:bg-[#0842a0]"
                    style={{ width: `${Math.max(dept.percent, 4)}%` }}
                  />
                </div>
              </div>
            );
          })}

          {departments.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-400">
              لا توجد أقسام مطابقة للفلاتر الحالية
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
