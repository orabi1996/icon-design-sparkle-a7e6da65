import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, PageBanner } from "@/components/hr/ui";
import { CrudTable } from "@/components/hr/CrudTable";
import { useRows } from "@/lib/hr-db";
import { notifyWorkflow } from "@/lib/email/dispatcher";

export const Route = createFileRoute("/leaves")({
  head: () => ({
    meta: [
      { title: "طلبات الأجازات | إدارة أجازات الموظفين" },
      {
        name: "description",
        content: "إضافة وتعديل واعتماد طلبات أجازات الموظفين: النوع والفترة وعدد الأيام والرصيد وحالة الطلب.",
      },
      { property: "og:title", content: "طلبات الأجازات | إدارة أجازات الموظفين" },
      { property: "og:description", content: "متابعة طلبات الأجازات واعتمادها ورفضها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Leaves,
});

function Leaves() {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const names = employees.map((e) => String(e["full_name"]));
  const { data: allLeaves = [] } = useRows("leave_requests", { orderBy: "id" });

  const totalCount = allLeaves.length;
  const pendingCount = allLeaves.filter((r) => String(r["status"] || "").includes("انتظار")).length;
  const approvedCount = allLeaves.filter((r) => String(r["status"] || "").includes("معتمد")).length;
  const rejectedCount = allLeaves.filter((r) => String(r["status"] || "").includes("مرفوض")).length;

  return (
    <AppShell>
      <div className="mt-4">
        <Breadcrumbs trail={["شئون الموظفين", "طلبات الأجازات"]} />
        <PageBanner icon="beach_access" title="طلبات الأجازات" subtitle="إضافة ومتابعة واعتماد أجازات الموظفين وفق سياسات رصيد الأستاذ وحساب أيام العمل" />

        {/* Live Leave Status KPI Cards */}
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4" dir="rtl">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="text-[11px] font-bold text-slate-500">إجمالي طلبات الإجازات</div>
            <div className="mt-1 font-mono text-lg font-extrabold text-blue-700 dark:text-blue-300">{totalCount} طلب</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="text-[11px] font-bold text-slate-500">بانتظار دورة الاعتماد</div>
            <div className="mt-1 font-mono text-lg font-extrabold text-amber-700 dark:text-amber-300">{pendingCount} معلق</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="text-[11px] font-bold text-slate-500">إجازات معتمدة ومخصومة</div>
            <div className="mt-1 font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">{approvedCount} معتمد</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/20">
            <div className="text-[11px] font-bold text-slate-500">إجازات مرفوضة / ملغاة</div>
            <div className="mt-1 font-mono text-lg font-extrabold text-rose-700 dark:text-rose-300">{rejectedCount} مرفوض</div>
          </div>
        </div>

        <CrudTable
          table="leave_requests"
          title="طلبات الأجازات"
          addLabel="إضافة طلب أجازة"
          onAfterSave={(row, res) => {
            const emp = employees.find((e) => String(e["full_name"]) === String(row["employee_name"]));
            const st = String(row["status"] || "بانتظار الموافقة");
            const evType =
              st === "معتمدة" ? "final_approved" : st === "مرفوضة" ? "stage_rejected" : "request_created";

            notifyWorkflow({
              eventType: evType,
              requestId: String(res?.["id"] || row["id"] || ""),
              requestNumber: res?.["id"] || Date.now(),
              requestType: String(row["leave_type"] || "طلب إجازة"),
              employeeId: emp?.["id"],
              employeeName: String(row["employee_name"] || ""),
              employeeCode: emp?.["emp_no"],
              leaveFrom: String(row["from_date"] || ""),
              leaveTo: String(row["to_date"] || ""),
              days: row["days"],
              currentStatus: st,
              currentStage: "إدارة الموارد البشرية",
              actionDate: new Date().toLocaleDateString("ar-SA"),
            });

            if (evType === "request_created") {
              notifyWorkflow({
                eventType: "stage_assigned",
                requestId: String(res?.["id"] || row["id"] || ""),
                requestNumber: res?.["id"] || Date.now(),
                requestType: String(row["leave_type"] || "طلب إجازة"),
                employeeId: emp?.["id"],
                employeeName: String(row["employee_name"] || ""),
                employeeCode: emp?.["emp_no"],
                currentStage: "المدير المباشر",
                actionUrl: typeof window !== "undefined" ? `${window.location.origin}/leaves` : "/leaves",
                actionDate: new Date().toLocaleDateString("ar-SA"),
              });
            }
          }}
          fields={[
            { key: "employee_name", label: "الموظف", type: "select", options: names, required: true },
            {
              key: "leave_type",
              label: "نوع الأجازة",
              type: "select",
              options: ["أجازة سنوية", "أجازة مرضية", "أجازة اضطرارية", "أجازة بدون راتب", "أجازة وضع", "أجازة زواج"],
            },
            { key: "from_date", label: "من تاريخ", type: "date" },
            { key: "to_date", label: "إلى تاريخ", type: "date" },
            { key: "days", label: "عدد الأيام", type: "number" },
            { key: "balance_before", label: "الرصيد قبل", type: "number" },
            { key: "status", label: "الحالة", type: "select", options: ["بانتظار الموافقة", "معتمدة", "مرفوضة"] },
            { key: "notes", label: "ملاحظات", type: "textarea" },
          ]}
        />
      </div>
    </AppShell>
  );
}
