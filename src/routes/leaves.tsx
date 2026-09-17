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

  return (
    <AppShell>
      <div className="mt-4">
        <Breadcrumbs trail={["شئون الموظفين", "طلبات الأجازات"]} />
        <PageBanner icon="beach_access" title="طلبات الأجازات" subtitle="إضافة ومتابعة واعتماد أجازات الموظفين" />
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
