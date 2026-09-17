import { Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <Card className="rounded-3xl border-border bg-card p-5 shadow-sm flex flex-col justify-between h-full text-card-foreground">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400">
              <MaterialIcon name="pending_actions" size={20} filled />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground">
                  مركز الطلبات المعلقة والموافقات
                </h3>
                <Badge variant="outline" className="bg-amber-100/70 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/60 font-mono text-[10.5px]">
                  {num(totalPending)} طلب
                </Badge>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                متابعة الطلبات المفتوحة التي تتطلب اعتماد الإدارة وسرعة المعالجة
              </p>
            </div>
          </div>

          <Button asChild size="sm" className="rounded-xl gap-1.5 shadow-xs font-black text-xs">
            <Link to="/approval-requests">
              <MaterialIcon name="task_alt" size={16} />
              <span>فتح مركز الموافقات</span>
            </Link>
          </Button>
        </div>

        {/* Requests List */}
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.typeKey}
              to={item.link as never}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-muted/50 transition border border-transparent hover:border-border group"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid size-9 place-items-center rounded-xl transition ${
                    item.typeKey === "leaves"
                      ? "bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400"
                      : item.typeKey === "loans"
                      ? "bg-amber-50 text-[#b06000] dark:bg-amber-950/60 dark:text-amber-400"
                      : item.typeKey === "permits"
                      ? "bg-emerald-50 text-[#137333] dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-purple-50 text-[#6750a4] dark:bg-purple-950/60 dark:text-purple-400"
                  }`}
                >
                  <MaterialIcon name={item.icon} size={18} />
                </span>
                <div>
                  <p className="text-xs font-black text-foreground group-hover:text-primary transition">
                    {item.type}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground font-medium">
                    متوسط الإنجاز: {item.avgDays}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {item.urgent > 0 && (
                  <Badge variant="destructive" className="px-2 py-0.5 text-[10px] font-black">
                    {num(item.urgent)} عاجل
                  </Badge>
                )}
                {item.overdue > 0 && (
                  <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/60 px-2 py-0.5 text-[10px] font-black">
                    {num(item.overdue)} متأخر
                  </Badge>
                )}
                <Badge variant="secondary" className="min-w-[28px] justify-center px-2.5 py-0.5 text-xs font-black font-mono">
                  {num(item.count)}
                </Badge>
                <MaterialIcon
                  name="chevron_left"
                  size={16}
                  className="text-muted-foreground/40 group-hover:text-primary transition"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
