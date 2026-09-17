import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import type { WidgetProps } from "../types";
import { computeJobLevelBreakdown, num } from "../services/analyticsData";

const COLORS = ["#0b57d0", "#00639b", "#137333", "#b06000", "#6750a4"];

export function JobLevelWidget({ employees, onDrillDown }: WidgetProps) {
  const data = computeJobLevelBreakdown(employees);

  return (
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-purple-50 text-[#6750a4] dark:bg-purple-950/60 dark:text-purple-400">
              <MaterialIcon name="stacked_bar_chart" size={20} filled />
            </span>
            <div>
              <h3 className="text-sm font-black text-foreground">
                توزيع المستويات الوظيفية
              </h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                توزيع الكوادر حسب التسلسل الهرمي والمستويات الإدارية
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 h-60 w-full">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              لا توجد بيانات مستويات مطابقة
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="level"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", className: "text-muted-foreground font-bold" }}
                  width={90}
                />
                <Tooltip
                  cursor={{ fill: "rgba(11,87,208,0.05)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0]!.payload;
                      return (
                        <div className="rounded-2xl border border-border bg-popover p-2.5 shadow-md text-right text-popover-foreground">
                          <p className="text-xs font-black text-foreground">
                            {item.level}
                          </p>
                          <p className="text-xs font-mono font-bold text-primary">
                            {num(item.count)} موظف ({item.percent}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 8, 8, 0]}
                  barSize={18}
                  onClick={(entry) => {
                    const matched = employees.filter((e) => e.job_level === entry.level);
                    onDrillDown({
                      title: `المستوى: ${entry.level}`,
                      count: entry.count,
                      metricKey: `level_${entry.level}`,
                      employees: matched,
                      filterDescription: `الموظفون في المستوى الوظيفي ${entry.level}`,
                    });
                  }}
                >
                  {data.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      className="cursor-pointer hover:opacity-80 transition"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  );
}
