import { useState } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
              <MaterialIcon name="domain" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-foreground">
                توزيع الموظفين حسب الأقسام
              </h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                ترتيب الأقسام تنازلياً حسب كثافة الكوادر البشرية
              </p>
            </div>
          </div>

          {departments.length > limit && (
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="text-xs font-black text-primary p-0 h-auto hover:underline"
            >
              {showAll ? "عرض أقل" : `عرض الكل (${num(departments.length)})`}
            </Button>
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
                className="group cursor-pointer rounded-xl p-2 hover:bg-muted/50 transition"
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                  <span className="text-foreground group-hover:text-primary transition">
                    {dept.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-foreground font-black">
                      {num(dept.count)} موظف
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      ({numPercent(dept.percent)})
                    </span>
                  </div>
                </div>

                <Progress
                  value={Math.max(dept.percent, 4)}
                  className="h-2 bg-muted"
                  indicatorClassName="bg-[#0b57d0]"
                />
              </div>
            );
          })}

          {departments.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              لا توجد أقسام مطابقة للفلاتر الحالية
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
