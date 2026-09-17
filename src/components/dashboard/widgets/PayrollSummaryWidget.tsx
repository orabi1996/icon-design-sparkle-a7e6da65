import { MaterialIcon } from "@/components/MaterialIcon";
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
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400">
            <MaterialIcon name="payments" size={20} filled />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              ملخص الأجور ومسيرات الرواتب الشهرية
            </h3>
            <p className="text-[11px] font-medium text-slate-400">
              إجمالي الرواتب الأساسية، البدلات، والاستقطاعات للموظفين المشمولين بالفلاتر
            </p>
          </div>
        </div>

        {latestRun && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            آخر مسير: {latestRun.title}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Gross */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-bold text-slate-500">إجمالي الأجور الشهرية</p>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white font-mono">
            {numMoney(totalGross)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            شامل {numMoney(totalBasic)} أساسي + {numMoney(totalAllowances)} بدلات
          </p>
        </div>

        {/* Card 2: Net Payroll */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-bold text-slate-500">صافي المستحق للصرف</p>
          <p className="mt-1 text-2xl font-black text-[#137333] dark:text-emerald-400 font-mono">
            {numMoney(runTotalNet)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            بعد خصم التأمينات والاستقطاعات
          </p>
        </div>

        {/* Card 3: Deductions */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-bold text-slate-500">إجمالي الاستقطاعات</p>
          <p className="mt-1 text-2xl font-black text-[#ba1a1a] dark:text-rose-400 font-mono">
            {numMoney(runTotalDeductions)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            تأمينات اجتماعية وسلف وغيابات
          </p>
        </div>

        {/* Card 4: Average Salary */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-bold text-slate-500">متوسط راتب الموظف</p>
          <p className="mt-1 text-2xl font-black text-[#0b57d0] dark:text-blue-400 font-mono">
            {numMoney(avgSalary)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            لكل موظف من {num(employees.length)} موظف مفلتر
          </p>
        </div>
      </div>
    </div>
  );
}
