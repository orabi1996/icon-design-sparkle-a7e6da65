import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeLiveAttendance, num, numPercent } from "../services/analyticsData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function LiveAttendanceWidget({
  employees,
  attendance,
  onDrillDown,
}: WidgetProps) {
  const metrics = computeLiveAttendance(employees, attendance);

  const cards = [
    {
      key: "present",
      label: "الحضور الفعلي اليوم",
      count: metrics.present.count,
      percent: metrics.present.percent,
      hint: `من إجمالي ${num(metrics.totalExpected)} متوقع حضورهم`,
      icon: "how_to_reg",
      tone: {
        bg: "bg-[#e6f4ea] dark:bg-emerald-950/50",
        text: "text-[#137333] dark:text-emerald-400",
        bar: "bg-[#137333]",
        border: "hover:border-emerald-300 dark:hover:border-emerald-700",
      },
      employees: metrics.present.employees,
      filterDesc: `الموظفون المسجل حضورهم ليوم ${metrics.targetDate}`,
    },
    {
      key: "absent",
      label: "الغياب اليوم",
      count: metrics.absent.count,
      percent: metrics.absent.percent,
      hint: `نسبة الغياب ${numPercent(metrics.absent.percent)}`,
      icon: "person_off",
      tone: {
        bg: "bg-[#fce8e6] dark:bg-rose-950/50",
        text: "text-[#ba1a1a] dark:text-rose-400",
        bar: "bg-[#ba1a1a]",
        border: "hover:border-rose-300 dark:hover:border-rose-700",
      },
      employees: metrics.absent.employees,
      filterDesc: `الموظفون الغائبون ليوم ${metrics.targetDate}`,
    },
    {
      key: "late",
      label: "التأخير اليوم",
      count: metrics.late.count,
      percent: metrics.late.percent,
      hint: `نسبة المتأخرين ${numPercent(metrics.late.percent)}`,
      icon: "alarm_on",
      tone: {
        bg: "bg-[#fef7e0] dark:bg-amber-950/50",
        text: "text-[#b06000] dark:text-amber-400",
        bar: "bg-[#b06000]",
        border: "hover:border-amber-300 dark:hover:border-amber-700",
      },
      employees: metrics.late.employees,
      filterDesc: `الموظفون المسجل لهم تأخير ليوم ${metrics.targetDate}`,
    },
    {
      key: "early",
      label: "الانصراف المبكر",
      count: metrics.early.count,
      percent: metrics.early.percent,
      hint: `قبل نهاية الدوام المجدول`,
      icon: "exit_to_app",
      tone: {
        bg: "bg-[#f3e8fd] dark:bg-purple-950/50",
        text: "text-[#6750a4] dark:text-purple-400",
        bar: "bg-[#6750a4]",
        border: "hover:border-purple-300 dark:hover:border-purple-700",
      },
      employees: metrics.early.employees,
      filterDesc: `الموظفون المنصرفون قبل نهاية فترة الدوام`,
    },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500"></span>
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
              متابعة الحضور والانصراف المباشر (Live Attendance)
            </h2>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">
              مؤشرات يومية فورية لبيانات الحضور والانصراف ليوم <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{metrics.targetDate}</span>
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
          انقر على أي بطاقة لعرض تفاصيل الموظفين (Drill Down)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            className={cn(
              "group relative cursor-pointer overflow-hidden rounded-3xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
              c.tone.border
            )}
          >
            <span className={cn("absolute inset-x-0 top-0 h-1.5", c.tone.bar)} />

            <div className="flex items-center justify-between">
              <span
                className={cn("grid size-11 place-items-center rounded-2xl shadow-2xs", c.tone.bg, c.tone.text)}
              >
                <MaterialIcon name={c.icon} size={22} filled />
              </span>

              <Badge
                variant="secondary"
                className={cn("rounded-full px-2.5 py-0.5 text-xs font-black font-mono border-0", c.tone.bg, c.tone.text)}
              >
                {numPercent(c.percent)}
              </Badge>
            </div>

            <p className="mt-3 text-xs font-black text-foreground">
              {c.label}
            </p>

            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-3xl font-black tracking-tight text-foreground font-mono">
                {num(c.count)}
              </p>
              <span className="text-[10.5px] font-bold text-muted-foreground group-hover:text-primary transition flex items-center gap-0.5">
                <span>استكشاف</span>
                <MaterialIcon name="chevron_left" size={14} />
              </span>
            </div>

            {/* shadcn Progress Bar */}
            <Progress
              value={c.percent}
              className="mt-2.5 h-1.5 bg-muted"
              indicatorClassName={c.tone.bar}
            />

            <p className="mt-2 text-[11px] font-medium text-muted-foreground truncate">
              {c.hint}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
