import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { WidgetProps } from "../types";
import { computeSectorBreakdown, num, numPercent } from "../services/analyticsData";

export function SectorDistributionWidget({ employees, onDrillDown }: WidgetProps) {
  const sectors = computeSectorBreakdown(employees);

  return (
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400">
              <MaterialIcon name="lan" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-foreground">
                توزيع الموظفين حسب القطاع
              </h3>
              <p className="text-[11px] font-medium text-muted-foreground">
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
                className="group cursor-pointer rounded-xl p-2 hover:bg-muted/50 transition"
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                  <span className="text-foreground group-hover:text-primary transition">
                    {s.sector}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-foreground font-black">
                      {num(s.count)} موظف
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      ({numPercent(s.percent)})
                    </span>
                  </div>
                </div>

                <Progress
                  value={Math.max(s.percent, 5)}
                  className="h-2 bg-muted"
                  indicatorClassName="bg-[#b06000]"
                />
              </div>
            );
          })}

          {sectors.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              لا توجد قطاعات مطابقة للفلاتر الحالية
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
