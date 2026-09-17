import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WidgetProps } from "../types";
import { computeEmployeeStatusKPIs, num, numPercent } from "../services/analyticsData";

export function EmployeeStatusWidget({
  employees,
  leaveRequests,
  onDrillDown,
}: WidgetProps) {
  const kpis = computeEmployeeStatusKPIs(employees, leaveRequests);

  const cards = [
    {
      key: "active",
      label: "الموظفون المفعلون",
      count: kpis.active.count,
      percent: kpis.active.percent,
      trend: kpis.active.trend,
      icon: "person_check",
      tone: "text-[#137333] bg-[#e6f4ea] dark:text-emerald-400 dark:bg-emerald-950/50",
      employees: kpis.active.employees,
      filterDesc: "الموظفون المسجلون بحالة نشط في النظام",
    },
    {
      key: "terminated",
      label: "منتهي خدماتهم",
      count: kpis.terminated.count,
      percent: kpis.terminated.percent,
      trend: kpis.terminated.trend,
      icon: "person_remove",
      tone: "text-[#ba1a1a] bg-[#fce8e6] dark:text-rose-400 dark:bg-rose-950/50",
      employees: kpis.terminated.employees,
      filterDesc: "الموظفون المنتهية خدماتهم أو المستقيلون",
    },
    {
      key: "suspendedPayroll",
      label: "الموقوفون من المسيرات",
      count: kpis.suspendedPayroll.count,
      percent: kpis.suspendedPayroll.percent,
      trend: kpis.suspendedPayroll.trend,
      icon: "money_off",
      tone: "text-[#b06000] bg-[#fef7e0] dark:text-amber-400 dark:bg-amber-950/50",
      employees: kpis.suspendedPayroll.employees,
      filterDesc: "الموظفون المستبعدون من مسير الرواتب",
    },
    {
      key: "suspended",
      label: "الموظفون الموقوفون",
      count: kpis.suspended.count,
      percent: kpis.suspended.percent,
      trend: kpis.suspended.trend,
      icon: "pause_circle",
      tone: "text-[#6750a4] bg-[#f3e8fd] dark:text-purple-400 dark:bg-purple-950/50",
      employees: kpis.suspended.employees,
      filterDesc: "الموظفون الموقوفون مؤقتاً عن العمل",
    },
    {
      key: "onLeave",
      label: "الموظفون في إجازة",
      count: kpis.onLeave.count,
      percent: kpis.onLeave.percent,
      trend: kpis.onLeave.trend,
      icon: "beach_access",
      tone: "text-[#00639b] bg-[#e1f5fe] dark:text-cyan-400 dark:bg-cyan-950/50",
      employees: kpis.onLeave.employees,
      filterDesc: "الموظفون المتمتعون بإجازة معتمدة سارية",
    },
    {
      key: "probation",
      label: "تحت التجربة",
      count: kpis.probation.count,
      percent: kpis.probation.percent,
      trend: kpis.probation.trend,
      icon: "hourglass_top",
      tone: "text-[#0b57d0] bg-[#e8f0fe] dark:text-blue-400 dark:bg-blue-950/50",
      employees: kpis.probation.employees,
      filterDesc: "الموظفون المعينون حديثاً وخلال فترة التجربة 90 يوماً",
    },
    {
      key: "total",
      label: "إجمالي القوى العاملة",
      count: kpis.total.count,
      percent: 100,
      trend: "+3.8%",
      icon: "groups",
      tone: "text-slate-800 bg-slate-100 dark:text-slate-200 dark:bg-slate-800",
      employees: kpis.total.employees,
      filterDesc: "إجمالي الموظفين المسجلين في النطاق المفلتر",
    },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
            <MaterialIcon name="groups" size={20} filled />
          </span>
          <div>
            <h2 className="text-sm font-black text-foreground leading-tight">
              مؤشرات حالات الموظفين والقوى العاملة
            </h2>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              مقارنة بالفترة السابقة مع إمكانية الفحص التفصيلي لكل حالة
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {cards.map((c) => (
          <Card
            key={c.key}
            onClick={() =>
              onDrillDown({
                title: c.label,
                count: c.count,
                metricKey: c.key,
                employees: c.employees,
                filterDescription: c.filterDesc,
              })
            }
            className="group cursor-pointer rounded-2xl border-border bg-card p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between text-card-foreground"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={`grid size-9 place-items-center rounded-xl ${c.tone} shadow-2xs`}>
                  <MaterialIcon name={c.icon} size={18} filled />
                </span>
                <Badge variant="secondary" className="font-mono text-[10px] font-bold px-2 py-0.5">
                  {numPercent(c.percent)}
                </Badge>
              </div>

              <p className="mt-3 text-xs font-black text-foreground truncate" title={c.label}>
                {c.label}
              </p>
            </div>

            <div className="mt-2 flex items-baseline justify-between pt-1 border-t border-border">
              <p className="text-2xl font-black text-foreground font-mono tracking-tight">
                {num(c.count)}
              </p>
              <span
                className={`flex items-center text-[10.5px] font-black font-mono ${
                  c.trend.startsWith("+")
                    ? "text-emerald-600 dark:text-emerald-400"
                    : c.trend.startsWith("-")
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
                }`}
              >
                {c.trend.startsWith("+") && <MaterialIcon name="arrow_upward" size={13} />}
                {c.trend.startsWith("-") && <MaterialIcon name="arrow_downward" size={13} />}
                <span>{c.trend}</span>
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
