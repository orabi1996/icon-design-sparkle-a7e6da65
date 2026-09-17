import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computeNationalitiesBreakdown, num, numPercent } from "../services/analyticsData";

const DONUT_COLORS = ["#137333", "#0b57d0", "#d97706", "#7c3aed", "#ba1a1a"];

export function NationalitiesWidget({
  employees,
  widget,
  onDrillDown,
}: WidgetProps) {
  const { list, saudiCount, nonSaudiCount, saudizationRate } =
    computeNationalitiesBreakdown(employees);

  const saudizationEnabled = widget.settings?.saudizationEnabled !== false;

  const donutData = [
    { name: "سعوديون (توطين)", value: saudiCount },
    { name: "غير سعوديين", value: nonSaudiCount },
  ];

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400">
              <MaterialIcon name="public" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                الجنسيات ونسبة السعودة والتوطين
              </h3>
              <p className="text-[11px] font-medium text-slate-400">
                توزيع الكفاءات الوطنية والوافدة ومعدلات الامتثال للتوطين
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Donut Chart for Saudization */}
          {saudizationEnabled && (
            <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell fill="#137333" />
                      <Cell fill="#94a3b8" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0]!.payload;
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-right shadow-md dark:border-slate-700 dark:bg-slate-800">
                              <p className="text-slate-900 dark:text-white">{item.name}</p>
                              <p className="font-mono text-[#0b57d0]">
                                {num(item.value)} موظف
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                <span className="text-2xl font-black font-mono text-[#137333] dark:text-emerald-400">
                  {numPercent(saudizationRate)}
                </span>
                <span className="text-[10px] font-extrabold text-slate-400">
                  معدل التوطين
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-xs font-bold mt-2">
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-300">
                  <span className="size-2 rounded-full bg-[#137333]" />
                  <span>سعودي ({num(saudiCount)})</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-slate-600 dark:text-slate-300">
                  <span className="size-2 rounded-full bg-slate-400" />
                  <span>وافد ({num(nonSaudiCount)})</span>
                </div>
              </div>
            </div>
          )}

          {/* Nationalities List */}
          <div className="space-y-2">
            {list.slice(0, 5).map((n, idx) => {
              const matched = employees.filter((e) => (e.nationality || "أخرى") === n.nationality);
              return (
                <div
                  key={n.nationality}
                  onClick={() =>
                    onDrillDown({
                      title: `الجنسية: ${n.nationality}`,
                      count: n.count,
                      metricKey: `nat_${n.nationality}`,
                      employees: matched,
                      filterDescription: `الموظفون ذوو الجنسية ${n.nationality}`,
                    })
                  }
                  className="group cursor-pointer rounded-2xl p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition border border-transparent hover:border-slate-200/80 dark:hover:border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-2xs"
                        style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0b57d0] transition">
                        {n.nationality}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="font-black text-slate-900 dark:text-white">
                        {num(n.count)} موظف
                      </span>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10.5px] font-black text-slate-600 dark:text-slate-400">
                        {numPercent(n.percent)}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Proportional Progress Bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(2, n.percent))}%`,
                        backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
