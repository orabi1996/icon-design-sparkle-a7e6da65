import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WidgetProps } from "../types";
import { num, numMoney } from "../services/analyticsData";

export function PayrollSummaryWidget({
  employees,
  payrollRuns,
}: WidgetProps) {
  // Aggregate payroll stats from actual runs or active employees
  const latestRun = payrollRuns[payrollRuns.length - 1];

  const totalBasic = employees.reduce((sum, e) => sum + (e.basic_salary ?? 0), 0);
  const totalAllowances = employees.reduce((sum, e) => sum + (e.allowances ?? 0), 0);
  const totalGross = totalBasic + totalAllowances;
  const avgSalary = employees.length > 0 ? Math.round(totalGross / employees.length) : 0;

  const runTotalNet = latestRun ? latestRun.total_net : totalGross * 0.9;
  const runTotalDeductions = latestRun ? latestRun.total_deductions : totalGross * 0.1;

  return (
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400">
            <MaterialIcon name="payments" size={20} filled />
          </span>
          <div>
            <h3 className="text-sm font-black text-foreground">
              ملخص الأجور ومسيرات الرواتب الشهرية
            </h3>
            <p className="text-[11px] font-medium text-muted-foreground">
              إجمالي الرواتب الأساسية، البدلات، والاستقطاعات للموظفين المشمولين بالفلاتر
            </p>
          </div>
        </div>

        {latestRun && (
          <Badge variant="secondary" className="px-3 py-1 text-xs font-bold">
            آخر مسير: {latestRun.title}
          </Badge>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Gross */}
        <Card className="rounded-2xl border-border bg-muted/40 p-4 shadow-none">
          <p className="text-xs font-bold text-muted-foreground">إجمالي الأجور الشهرية</p>
          <p className="mt-1 text-2xl font-black text-foreground font-mono">
            {numMoney(totalGross)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            شامل {numMoney(totalBasic)} أساسي + {numMoney(totalAllowances)} بدلات
          </p>
        </Card>

        {/* Card 2: Net Payroll */}
        <Card className="rounded-2xl border-border bg-muted/40 p-4 shadow-none">
          <p className="text-xs font-bold text-muted-foreground">صافي المستحق للصرف</p>
          <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {numMoney(runTotalNet)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            بعد خصم التأمينات والاستقطاعات
          </p>
        </Card>

        {/* Card 3: Deductions */}
        <Card className="rounded-2xl border-border bg-muted/40 p-4 shadow-none">
          <p className="text-xs font-bold text-muted-foreground">إجمالي الاستقطاعات</p>
          <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {numMoney(runTotalDeductions)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            تأمينات اجتماعية وسلف وغيابات
          </p>
        </Card>

        {/* Card 4: Average Salary */}
        <Card className="rounded-2xl border-border bg-muted/40 p-4 shadow-none">
          <p className="text-xs font-bold text-muted-foreground">متوسط راتب الموظف</p>
          <p className="mt-1 text-2xl font-black text-primary font-mono">
            {numMoney(avgSalary)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            لكل موظف من {num(employees.length)} موظف مفلتر
          </p>
        </Card>
      </div>
    </Card>
  );
}
