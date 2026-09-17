import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeSectorBreakdown, num, numPercent } from "../services/analyticsData";

export function SectorDistributionWidget({ employees, onDrillDown }: WidgetProps) {
  const sectors = computeSectorBreakdown(employees);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400">
              <MaterialIcon name="lan" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                توزيع الموظفين حسب القطاع
              </h3>
              <p className="text-[11px] font-medium text-slate-400">
                توزيع الكوادر حسب القطاعات التنظيمية الكبرى بالمنشأة
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3.5">
          {sectors.map((s) => {
            const matched = employees.filter((e) => e.sector === s.sector);
            return (
              <div
                key={s.sector}
                onClick={() =>
                  onDrillDown({
                    title: `القطاع: ${s.sector}`,
                    count: s.count,
                    metricKey: `sec_${s.sector}`,
                    employees: matched,
                    filterDescription: `الموظفون التابعون لـ ${s.sector}`,
                  })
                }
                className="group cursor-pointer rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                  <span className="text-slate-800 dark:text-slate-200 group-hover:text-[#0b57d0] transition">
                    {s.sector}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-900 dark:text-white font-black">
                      {num(s.count)} موظف
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      ({numPercent(s.percent)})
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[#b06000] transition-all duration-500 group-hover:bg-[#8f4e00]"
                    style={{ width: `${Math.max(s.percent, 5)}%` }}
                  />
                </div>
              </div>
            );
          })}

          {sectors.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-400">
              لا توجد قطاعات مطابقة للفلاتر الحالية
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
