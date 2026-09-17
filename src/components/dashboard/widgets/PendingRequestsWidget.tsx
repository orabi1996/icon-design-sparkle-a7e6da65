import { Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import type { WidgetProps } from "../types";
import { computePendingRequests, num } from "../services/analyticsData";

export function PendingRequestsWidget({
  leaveRequests,
  requests,
  loans,
}: WidgetProps) {
  const items = computePendingRequests(leaveRequests, requests, loans);
  const totalPending = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between h-full">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400">
              <MaterialIcon name="pending_actions" size={20} filled />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  مركز الطلبات المعلقة والموافقات
                </h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-black text-amber-800 font-mono dark:bg-amber-950 dark:text-amber-300">
                  {num(totalPending)} طلب
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                متابعة الطلبات المفتوحة التي تتطلب اعتماد الإدارة وسرعة المعالجة
              </p>
            </div>
          </div>

          <Link
            to="/approval-requests"
            className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] px-3.5 py-2 text-xs font-black text-white hover:bg-[#0842a0] transition shadow-xs"
          >
            <MaterialIcon name="task_alt" size={16} />
            <span>فتح مركز الموافقات</span>
          </Link>
        </div>

        {/* Requests List */}
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
          {items.map((item) => (
            <Link
              key={item.typeKey}
              to={item.link as never}
              className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 group-hover:bg-blue-50 group-hover:text-[#0b57d0] transition">
                  <MaterialIcon name={item.icon} size={17} />
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#0b57d0] transition">
                    {item.type}
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    متوسط الإنجاز: {item.avgDays}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.urgent > 0 && (
                  <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 text-[10px] font-bold dark:bg-rose-950/60 dark:text-rose-400">
                    {num(item.urgent)} عاجل
                  </span>
                )}
                {item.overdue > 0 && (
                  <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold dark:bg-amber-950/60 dark:text-amber-400">
                    {num(item.overdue)} متأخر
                  </span>
                )}
                <span className="min-w-[28px] text-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-black font-mono text-slate-900 dark:text-white">
                  {num(item.count)}
                </span>
                <MaterialIcon
                  name="chevron_left"
                  size={16}
                  className="text-slate-300 group-hover:text-[#0b57d0] transition"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
