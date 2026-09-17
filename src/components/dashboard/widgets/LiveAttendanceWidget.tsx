import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeLiveAttendance, num, numPercent } from "../services/analyticsData";

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500"></span>
          </span>
          <h2 className="text-sm font-black text-slate-900 dark:text-white">
            متابعة الحضور والانصراف المباشر (Live Attendance)
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-mono font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {metrics.targetDate}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          انقر على أي بطاقة لعرض تفاصيل الموظفين (Drill Down)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
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
            className={`group relative cursor-pointer overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_0_rgba(60,64,67,0.12)] dark:border-slate-800 dark:bg-slate-900 ${c.tone.border}`}
          >
            <span className={`absolute inset-x-0 top-0 h-1.5 ${c.tone.bar}`} />

            <div className="flex items-center justify-between">
              <span
                className={`grid size-11 place-items-center rounded-2xl ${c.tone.bg} ${c.tone.text} shadow-2xs`}
              >
                <MaterialIcon name={c.icon} size={22} filled />
              </span>

              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black font-mono ${c.tone.bg} ${c.tone.text}`}
              >
                <span>{numPercent(c.percent)}</span>
              </span>
            </div>

            <p className="mt-3.5 text-xs font-extrabold text-slate-500 dark:text-slate-400">
              {c.label}
            </p>

            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                {num(c.count)}
              </p>
              <span className="text-[10.5px] font-bold text-slate-400 group-hover:text-[#0b57d0] transition flex items-center gap-0.5">
                <span>استكشاف</span>
                <MaterialIcon name="chevron_left" size={14} />
              </span>
            </div>

            <p className="mt-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate">
              {c.hint}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
