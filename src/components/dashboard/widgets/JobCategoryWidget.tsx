import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeJobCategoryBreakdown, num, numPercent } from "../services/analyticsData";

const CATEGORY_COLORS: Record<string, string> = {
  إداري: "bg-[#0b57d0] text-white",
  تقني: "bg-[#00639b] text-white",
  تشغيلي: "bg-[#137333] text-white",
  عمالة: "bg-[#b06000] text-white",
  تعليمي: "bg-[#6750a4] text-white",
};

export function JobCategoryWidget({ employees, onDrillDown }: WidgetProps) {
  const categories = computeJobCategoryBreakdown(employees);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-50 text-[#00639b] dark:bg-cyan-950/60 dark:text-cyan-400">
              <MaterialIcon name="category" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                توزيع الفئات الوظيفية
              </h3>
              <p className="text-[11px] font-medium text-slate-400">
                تصنيف القوى العاملة حسب طبيعة العمل والتأهيل المهني
              </p>
            </div>
          </div>
        </div>

        {/* Stacked Visual Bar */}
        <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          {categories.map((c) => (
            <div
              key={c.category}
              style={{ width: `${c.percent}%` }}
              className={`${CATEGORY_COLORS[c.category] || "bg-slate-500"} transition-all duration-300`}
              title={`${c.category}: ${c.count} (${c.percent}%)`}
            />
          ))}
        </div>

        {/* Category list items */}
        <div className="mt-4 space-y-2.5">
          {categories.map((c) => {
            const matched = employees.filter((e) => e.job_category === c.category);
            return (
              <div
                key={c.category}
                onClick={() =>
                  onDrillDown({
                    title: `الفئة: ${c.category}`,
                    count: c.count,
                    metricKey: `cat_${c.category}`,
                    employees: matched,
                    filterDescription: `الموظفون المنتمون للفئة الوظيفية ${c.category}`,
                  })
                }
                className="group cursor-pointer rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2.5 rounded-full ${CATEGORY_COLORS[c.category]?.split(" ")[0] || "bg-slate-400"}`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0b57d0] transition">
                    {c.category}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="font-black text-slate-900 dark:text-white">
                    {num(c.count)}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ({numPercent(c.percent)})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
