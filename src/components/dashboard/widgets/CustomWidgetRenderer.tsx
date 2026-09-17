/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type {
  WidgetProps,
  CustomWidgetDefinition,
  EmployeeRecord,
} from "../types";
import { num, numMoney, numPercent } from "../services/analyticsData";
import { getCustomWidgetById } from "../services/customWidgetsStorage";

const PALETTE = [
  "#0b57d0",
  "#137333",
  "#b06000",
  "#00639b",
  "#6750a4",
  "#ba1a1a",
  "#0284c7",
  "#d97706",
];

const PROGRESS_CLASSES = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-purple-600",
  "bg-rose-600",
];

export function CustomWidgetRenderer({
  widget,
  employees,
  allEmployees,
  attendance,
  leaveRequests,
  requests,
  loans,
  payrollRuns,
  onDrillDown,
}: WidgetProps) {
  // Resolve definition from settings or persistent library
  const def: CustomWidgetDefinition | undefined = useMemo(() => {
    if (widget.settings?.customDefinition) {
      return widget.settings.customDefinition;
    }
    if (widget.settings?.customWidgetId) {
      return getCustomWidgetById(widget.settings.customWidgetId);
    }
    return undefined;
  }, [widget.settings]);

  // Compute aggregated data
  const { items, totalValue, isMoneyMetric } = useMemo(() => {
    if (!def) {
      return { items: [], totalValue: 0, isMoneyMetric: false };
    }

    // 1. Choose dataset
    let dataset: any[] = [];
    switch (def.dataSource) {
      case "employees":
        dataset = employees;
        break;
      case "attendance":
        dataset = attendance;
        break;
      case "leave_requests":
        dataset = leaveRequests;
        break;
      case "requests":
        dataset = requests;
        break;
      case "loans":
        dataset = loans;
        break;
      case "payroll_runs":
        dataset = payrollRuns;
        break;
      default:
        dataset = employees;
    }

    // 2. Optional filters
    if (def.filterCriteria?.status && def.filterCriteria.status !== "all") {
      dataset = dataset.filter((d) => (d.status ?? "") === def.filterCriteria?.status);
    }
    if (def.filterCriteria?.branch && def.filterCriteria.branch !== "all") {
      dataset = dataset.filter((d) => (d.branch ?? "") === def.filterCriteria?.branch);
    }
    if (def.filterCriteria?.department && def.filterCriteria.department !== "all") {
      dataset = dataset.filter(
        (d) => (d.department ?? "") === def.filterCriteria?.department
      );
    }

    const isMoney =
      def.metricType === "sum" ||
      def.metricType === "avg" ||
      def.valueField === "basic_salary" ||
      def.valueField === "amount" ||
      def.valueField === "total_net";

    // 3. If KPI Card with no dimension (single metric card)
    if (def.chartType === "kpi_card" && (!def.dimension || def.dimension === "none")) {
      let val = 0;
      if (def.metricType === "count") {
        val = dataset.length;
      } else {
        const field = def.valueField || "basic_salary";
        const sum = dataset.reduce((s, row) => s + (Number(row[field]) || 0), 0);
        val = def.metricType === "avg" && dataset.length > 0 ? sum / dataset.length : sum;
      }
      return {
        items: [{ label: def.title, value: Math.round(val), percent: 100, matchedEmployees: employees }],
        totalValue: Math.round(val),
        isMoneyMetric: isMoney,
      };
    }

    // 4. Group by dimension
    const dim = def.dimension || "department";
    const groups = new Map<string, { total: number; count: number; matchedEmps: EmployeeRecord[] }>();

    dataset.forEach((row) => {
      let groupKey = "غير محدد";
      if (dim === "branch") groupKey = row.branch || "الفرع الرئيسي";
      else if (dim === "department") groupKey = row.department || "عام";
      else if (dim === "sector") groupKey = row.sector || "قطاع عام";
      else if (dim === "job_level") groupKey = row.job_level || "تنفيذي";
      else if (dim === "job_category") groupKey = row.job_category || "إداري";
      else if (dim === "nationality") groupKey = row.nationality || "أخرى";
      else if (dim === "status") groupKey = row.status || "نشط";
      else if (dim === "type") groupKey = row.type || row.leave_type || "طلب عام";
      else if (row[dim]) groupKey = String(row[dim]);

      const current = groups.get(groupKey) || { total: 0, count: 0, matchedEmps: [] };
      current.count += 1;

      if (def.metricType === "sum" || def.metricType === "avg") {
        const field = def.valueField || "basic_salary";
        current.total += Number(row[field]) || 0;
      } else {
        current.total += 1;
      }

      // Link matched employees for drill down
      if (def.dataSource === "employees") {
        current.matchedEmps.push(row);
      } else if (row.employee_id) {
        const matched = allEmployees.find((e) => e.id === row.employee_id);
        if (matched && !current.matchedEmps.some((e) => e.id === matched.id)) {
          current.matchedEmps.push(matched);
        }
      }

      groups.set(groupKey, current);
    });

    let overallSum = 0;
    const computedItems = Array.from(groups.entries()).map(([label, stats]) => {
      const finalVal =
        def.metricType === "avg" && stats.count > 0
          ? Math.round(stats.total / stats.count)
          : Math.round(stats.total);
      overallSum += finalVal;
      return {
        label,
        value: finalVal,
        count: stats.count,
        percent: 0,
        matchedEmployees: stats.matchedEmps,
      };
    });

    // Sort descending and compute percentages
    computedItems.sort((a, b) => b.value - a.value);
    const limit = def.limit || 8;
    const sliced = computedItems.slice(0, limit);

    sliced.forEach((item) => {
      item.percent = overallSum > 0 ? Math.round((item.value / overallSum) * 100) : 0;
    });

    return { items: sliced, totalValue: overallSum, isMoneyMetric: isMoney };
  }, [def, employees, allEmployees, attendance, leaveRequests, requests, loans, payrollRuns]);

  // Fallback if no definition configured yet
  if (!def) {
    return (
      <Card className="rounded-3xl border-border bg-card p-6 text-center text-card-foreground">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
          <MaterialIcon name="widgets" size={26} />
        </div>
        <h4 className="text-sm font-black">{widget.title || "عنصر مخصص"}</h4>
        <p className="text-xs text-muted-foreground mt-1">
          يرجى فتح إعدادات العنصر من الاستوديو وتحديد مصدر البيانات والمؤشر المطلوب.
        </p>
      </Card>
    );
  }

  const primaryTone = def.toneColor || "#0b57d0";

  return (
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-9 place-items-center rounded-xl text-white shadow-2xs"
              style={{ backgroundColor: primaryTone }}
            >
              <MaterialIcon name={def.icon || "query_stats"} size={20} filled />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground">{def.title}</h3>
                {def.isPublic && (
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    عام للنظام
                  </Badge>
                )}
              </div>
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                {def.description || `تحليل ${def.category} حسب ${def.dimension || "المؤشر"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs font-black">
              {isMoneyMetric ? numMoney(totalValue) : `${num(totalValue)} إجمالي`}
            </Badge>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 1. KPI Metric Card                                    */}
        {/* ==================================================== */}
        {def.chartType === "kpi_card" && (
          <div
            onClick={() =>
              items[0] &&
              onDrillDown({
                title: def.title,
                count: items[0].matchedEmployees.length || items[0].value,
                metricKey: def.id,
                employees: items[0].matchedEmployees,
                filterDescription: def.description || `إجمالي ${def.title}`,
              })
            }
            className="mt-6 cursor-pointer p-6 rounded-2xl bg-muted/40 border border-border hover:border-primary/50 transition text-center"
          >
            <p className="text-xs font-bold text-muted-foreground">{def.title}</p>
            <p
              className="mt-2 text-4xl font-black font-mono tracking-tight"
              style={{ color: primaryTone }}
            >
              {isMoneyMetric ? numMoney(totalValue) : num(totalValue)}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs font-bold">
                {items[0]?.matchedEmployees.length ?? 0} موظف مشمول
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">
                انقر للفحص التفصيلي
              </span>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* 2. Horizontal Bar Chart                              */}
        {/* ==================================================== */}
        {def.chartType === "horizontal_bar" && (
          <div className="mt-4 h-60 w-full">
            {items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                لا توجد بيانات مطابقة للفلاتر المحددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={items}
                  layout="vertical"
                  margin={{ top: 10, right: 25, left: 15, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="label"
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
                        const row = payload[0]!.payload;
                        return (
                          <div className="rounded-xl border border-border bg-popover p-2.5 shadow-md text-right text-popover-foreground">
                            <p className="text-xs font-black text-foreground">{row.label}</p>
                            <p className="text-xs font-mono font-bold" style={{ color: primaryTone }}>
                              {isMoneyMetric ? numMoney(row.value) : `${num(row.value)} (${row.percent}%)`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 8, 8, 0]}
                    barSize={18}
                    onClick={(entry) => {
                      onDrillDown({
                        title: `${def.title}: ${entry.label}`,
                        count: entry.matchedEmployees.length || entry.value,
                        metricKey: `${def.id}_${entry.label}`,
                        employees: entry.matchedEmployees,
                        filterDescription: `السجلات التابعة لـ ${entry.label}`,
                      });
                    }}
                  >
                    {items.map((_, idx) => (
                      <Cell
                        key={`bar-${idx}`}
                        fill={PALETTE[idx % PALETTE.length]}
                        className="cursor-pointer hover:opacity-80 transition"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* 3. Vertical Bar Chart                                */}
        {/* ==================================================== */}
        {def.chartType === "bar" && (
          <div className="mt-4 h-60 w-full">
            {items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                لا توجد بيانات مطابقة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={items}
                  margin={{ top: 10, right: 15, left: 15, bottom: 25 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground font-bold" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const row = payload[0]!.payload;
                        return (
                          <div className="rounded-xl border border-border bg-popover p-2.5 shadow-md text-right text-popover-foreground">
                            <p className="text-xs font-black text-foreground">{row.label}</p>
                            <p className="text-xs font-mono font-bold" style={{ color: primaryTone }}>
                              {isMoneyMetric ? numMoney(row.value) : `${num(row.value)} (${row.percent}%)`}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[8, 8, 0, 0]}
                    barSize={24}
                    onClick={(entry) => {
                      onDrillDown({
                        title: `${def.title}: ${entry.label}`,
                        count: entry.matchedEmployees.length || entry.value,
                        metricKey: `${def.id}_${entry.label}`,
                        employees: entry.matchedEmployees,
                        filterDescription: `السجلات التابعة لـ ${entry.label}`,
                      });
                    }}
                  >
                    {items.map((_, idx) => (
                      <Cell
                        key={`vbar-${idx}`}
                        fill={PALETTE[idx % PALETTE.length]}
                        className="cursor-pointer hover:opacity-80 transition"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* 4. Donut / Pie Chart                                 */}
        {/* ==================================================== */}
        {(def.chartType === "donut" || def.chartType === "pie") && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-muted/30 border border-border/60">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={items}
                      nameKey="label"
                      dataKey="value"
                      innerRadius={def.chartType === "donut" ? 48 : 0}
                      outerRadius={68}
                      paddingAngle={3}
                      onClick={(entry) => {
                        onDrillDown({
                          title: `${def.title}: ${entry.label}`,
                          count: entry.matchedEmployees.length || entry.value,
                          metricKey: `${def.id}_${entry.label}`,
                          employees: entry.matchedEmployees,
                          filterDescription: `السجلات المكونة لشريحة ${entry.label}`,
                        });
                      }}
                    >
                      {items.map((_, idx) => (
                        <Cell
                          key={`pie-${idx}`}
                          fill={PALETTE[idx % PALETTE.length]}
                          className="cursor-pointer hover:opacity-80 transition"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const row = payload[0]!.payload;
                          return (
                            <div className="rounded-xl border border-border bg-popover p-2 text-xs font-bold text-right shadow-md text-popover-foreground">
                              <p className="text-foreground">{row.label}</p>
                              <p className="font-mono" style={{ color: primaryTone }}>
                                {isMoneyMetric ? numMoney(row.value) : `${num(row.value)} (${row.percent}%)`}
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

              {def.chartType === "donut" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-3">
                  <span className="text-xl font-black font-mono" style={{ color: primaryTone }}>
                    {isMoneyMetric ? numMoney(totalValue) : num(totalValue)}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">الإجمالي</span>
                </div>
              )}
            </div>

            {/* Slices Legend */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {items.map((item, idx) => (
                <div
                  key={item.label}
                  onClick={() =>
                    onDrillDown({
                      title: `${def.title}: ${item.label}`,
                      count: item.matchedEmployees.length || item.value,
                      metricKey: `${def.id}_${item.label}`,
                      employees: item.matchedEmployees,
                      filterDescription: `السجلات المكونة لشريحة ${item.label}`,
                    })
                  }
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 cursor-pointer transition text-xs font-bold"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                    />
                    <span className="truncate max-w-[110px]">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span>{isMoneyMetric ? numMoney(item.value) : num(item.value)}</span>
                    <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                      {numPercent(item.percent)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* 5. Progress List                                     */}
        {/* ==================================================== */}
        {def.chartType === "progress_list" && (
          <div className="mt-4 space-y-3">
            {items.map((item, idx) => (
              <div
                key={item.label}
                onClick={() =>
                  onDrillDown({
                    title: `${def.title}: ${item.label}`,
                    count: item.matchedEmployees.length || item.value,
                    metricKey: `${def.id}_${item.label}`,
                    employees: item.matchedEmployees,
                    filterDescription: `السجلات التابعة لـ ${item.label}`,
                  })
                }
                className="group cursor-pointer rounded-xl p-2 hover:bg-muted/50 transition space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground group-hover:text-primary transition truncate max-w-[180px]">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-black text-foreground">
                      {isMoneyMetric ? numMoney(item.value) : num(item.value)}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                      {numPercent(item.percent)}
                    </Badge>
                  </div>
                </div>

                <Progress
                  value={Math.max(item.percent, 3)}
                  className="h-2 bg-muted"
                  indicatorClassName={PROGRESS_CLASSES[idx % PROGRESS_CLASSES.length] ?? "bg-primary"}
                />
              </div>
            ))}
          </div>
        )}

        {/* ==================================================== */}
        {/* 6. Mini Summary Table                                */}
        {/* ==================================================== */}
        {def.chartType === "table" && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground font-black">
                  <th className="py-2.5 px-3">الفئة / البعد</th>
                  <th className="py-2.5 px-3">القيمة</th>
                  <th className="py-2.5 px-3">النسبة</th>
                  <th className="py-2.5 px-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-bold">
                {items.map((item) => (
                  <tr key={item.label} className="hover:bg-muted/40 transition">
                    <td className="py-2 px-3 text-foreground truncate max-w-[140px]">{item.label}</td>
                    <td className="py-2 px-3 font-mono text-foreground font-black">
                      {isMoneyMetric ? numMoney(item.value) : num(item.value)}
                    </td>
                    <td className="py-2 px-3 font-mono text-muted-foreground">
                      {numPercent(item.percent)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          onDrillDown({
                            title: `${def.title}: ${item.label}`,
                            count: item.matchedEmployees.length || item.value,
                            metricKey: `${def.id}_${item.label}`,
                            employees: item.matchedEmployees,
                            filterDescription: `السجلات التابعة لـ ${item.label}`,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
                      >
                        <span>فحص</span>
                        <MaterialIcon name="chevron_left" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
