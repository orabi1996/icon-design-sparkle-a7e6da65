import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { WidgetProps } from "../types";
import { computeNationalitiesBreakdown, num, numPercent } from "../services/analyticsData";

const DONUT_COLORS = ["#137333", "#0b57d0", "#d97706", "#7c3aed", "#ba1a1a"];
const PROGRESS_BAR_COLORS = [
  "bg-emerald-600",
  "bg-blue-600",
  "bg-amber-600",
  "bg-purple-600",
  "bg-rose-600",
];

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
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400">
              <MaterialIcon name="public" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-foreground">
                الجنسيات ونسبة السعودة والتوطين
              </h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                توزيع الكفاءات الوطنية والوافدة ومعدلات الامتثال للتوطين
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Donut Chart for Saudization */}
          {saudizationEnabled && (
            <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-muted/40 border border-border/50">
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
                            <div className="rounded-xl border border-border bg-popover p-2 text-xs font-bold text-right shadow-md text-popover-foreground">
                              <p className="text-foreground">{item.name}</p>
                              <p className="font-mono text-primary">
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
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {numPercent(saudizationRate)}
                </span>
                <span className="text-[10px] font-extrabold text-muted-foreground">
                  معدل التوطين
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-xs font-bold mt-2">
                <Badge variant="outline" className="gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
                  <span className="size-2 rounded-full bg-emerald-600" />
                  <span>سعودي ({num(saudiCount)})</span>
                </Badge>
                <Badge variant="outline" className="gap-1.5 bg-secondary text-secondary-foreground">
                  <span className="size-2 rounded-full bg-slate-400" />
                  <span>وافد ({num(nonSaudiCount)})</span>
                </Badge>
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
                  className="group cursor-pointer rounded-2xl p-2.5 hover:bg-muted/50 transition border border-transparent hover:border-border space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full ring-2 ring-background shadow-2xs"
                        style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                      />
                      <span className="font-bold text-foreground group-hover:text-primary transition">
                        {n.nationality}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="font-black text-foreground">
                        {num(n.count)} موظف
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10.5px] font-black px-2 py-0.5">
                        {numPercent(n.percent)}
                      </Badge>
                    </div>
                  </div>

                  {/* Horizontal Proportional Progress Bar */}
                  <Progress
                    value={Math.min(100, Math.max(2, n.percent))}
                    className="h-1.5 bg-muted"
                    indicatorClassName={PROGRESS_BAR_COLORS[idx % PROGRESS_BAR_COLORS.length] ?? "bg-primary"}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
