import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs } from "@/components/hr/ui";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, useSaveRow, useDeleteRow, type Row } from "@/lib/hr-db";
import { notifyWorkflow } from "@/lib/email/dispatcher";

export const Route = createFileRoute("/approval-requests")({
  head: () => ({
    meta: [
      { title: "طلبات الاعتماد | نظام الموارد البشرية" },
      {
        name: "description",
        content:
          "متابعة طلبات الموظفين ودورة الاعتماد: أذون الانصراف والتأخير والإجازات وسلاسل الموافقات.",
      },
      { property: "og:title", content: "طلبات الاعتماد" },
      {
        property: "og:description",
        content: "قائمة طلبات الموظفين مع سلسلة الاعتماد وحالة الاعتماد الحالية.",
      },
    ],
  }),
  component: ApprovalRequestsPage,
});

const control =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25";

const REQUEST_TYPES = [
  "أذن إنصراف مبكر",
  "أذن تأخير",
  "أذن مغادرة",
  "طلب إجازة",
  "طلب سلفة",
  "طلب تعديل بصمة",
  "طلب مراسلة",
  "طلب استقالة",
];

const APPROVAL_CHAINS = [
  "موارد بشرية",
  "الشؤون الإدارية",
  "الشؤون المالية",
  "المدير التنفيذي",
];

const AWAITING_STAGES = [
  "المدير المباشر",
  "موارد بشرية",
  "المدير المالي",
  "المدير التنفيذي",
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "بانتظار الاعتماد" },
  { value: "approved", label: "معتمد" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغى" },
];

/** Format a date exactly like the mockup: "May 21 at 12:00:00 AM" */
function fmtDateEn(v: unknown) {
  if (!v) return "—";
  try {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    const datePart = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
    return `${datePart} at ${timePart}`;
  } catch {
    return String(v);
  }
}

type ColKey =
  | "employee_name"
  | "request_type"
  | "branch"
  | "category"
  | "request_date"
  | "entered_at"
  | "approval_chain"
  | "direct_manager_name"
  | "awaiting_approver_name";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "employee_name",          label: "اسم الموظف" },
  { key: "request_type",           label: "بيانات الطلب" },
  { key: "branch",                 label: "الفرع" },
  { key: "category",               label: "التصنيف" },
  { key: "request_date",           label: "تاريخ الطلب" },
  { key: "entered_at",             label: "تاريخ الإدخال" },
  { key: "approval_chain",         label: "سلسلة الموافقة" },
  { key: "direct_manager_name",    label: "المدير المباشر" },
  { key: "awaiting_approver_name", label: "في انتظار موافقة" },
];

function ApprovalRequestsPage() {
  const { data: rows = [], isLoading } = useRows("approval_requests", {
    orderBy: "request_date",
  });
  const save = useSaveRow("approval_requests");
  const del = useDeleteRow("approval_requests");

  const [draft, setDraft] = useState<Row | null>(null);
  const [term, setTerm] = useState("");
  const [colFilters, setColFilters] = useState<Record<ColKey, string>>({
    employee_name: "",
    request_type: "",
    branch: "",
    category: "",
    request_date: "",
    entered_at: "",
    approval_chain: "",
    direct_manager_name: "",
    awaiting_approver_name: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = term.trim();
    return rows.filter((r) => {
      // per-column contains filters
      for (const c of COLUMNS) {
        const f = colFilters[c.key];
        if (!f) continue;
        if (!String(r[c.key] ?? "").includes(f)) return false;
      }
      if (!t) return true;
      return COLUMNS.some((c) => String(r[c.key] ?? "").includes(t));
    });
  }, [rows, term, colFilters]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openNew = () =>
    setDraft({
      employee_name: "",
      emp_no: "",
      branch: "",
      department: "",
      category: "",
      request_type: "",
      request_subject: "",
      request_details: "",
      approval_chain: "",
      direct_manager_name: "",
      awaiting_approver_name: "",
      awaiting_stage: "المدير المباشر",
      status: "pending",
    });

  const submit = async () => {
    if (!draft) return;
    if (!String(draft["employee_name"] ?? "").trim()) return;
    if (!String(draft["request_type"] ?? "").trim()) return;
    const saved = await save.mutateAsync(draft);

    const reqNumber = saved?.["request_number"] || draft["request_number"] || Date.now();
    notifyWorkflow({
      eventType: "request_created",
      requestId: String(saved?.["id"] || ""),
      requestNumber: reqNumber,
      requestType: String(draft["request_type"]),
      employeeId: draft["employee_id"],
      employeeName: draft["employee_name"],
      employeeCode: draft["emp_no"],
      currentStage: draft["awaiting_stage"] || "المدير المباشر",
      currentStatus: "بانتظار الاعتماد",
      actionDate: new Date().toLocaleDateString("ar-SA"),
    });

    notifyWorkflow({
      eventType: "stage_assigned",
      requestId: String(saved?.["id"] || ""),
      requestNumber: reqNumber,
      requestType: String(draft["request_type"]),
      employeeId: draft["employee_id"],
      employeeName: draft["employee_name"],
      employeeCode: draft["emp_no"],
      currentStage: draft["awaiting_stage"] || "المدير المباشر",
      approverName: draft["awaiting_approver_name"] || draft["direct_manager_name"],
      actionUrl: typeof window !== "undefined" ? `${window.location.origin}/approval-requests` : "/approval-requests",
      actionDate: new Date().toLocaleDateString("ar-SA"),
    });

    setDraft(null);
  };

  const approve = async (r: Row) => {
    const chain = String(r["approval_chain"] || "")
      .split(/[,،\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const currentStage = String(r["awaiting_stage"] || "المدير المباشر");
    const currentIndex = chain.indexOf(currentStage);

    const hasNextStage = currentIndex >= 0 && currentIndex < chain.length - 1;
    const nextStage = hasNextStage ? chain[currentIndex + 1]! : null;
    const nextStatus = hasNextStage ? "pending" : "approved";

    await save.mutateAsync({
      ...r,
      status: nextStatus,
      awaiting_stage: nextStage || currentStage,
      decision_at: new Date().toISOString(),
      decision_by: "المشرف",
    });

    if (hasNextStage && nextStage) {
      notifyWorkflow({
        eventType: "stage_approved",
        requestId: String(r["id"]),
        requestNumber: r["request_number"],
        requestType: String(r["request_type"]),
        employeeId: r["employee_id"],
        employeeName: r["employee_name"],
        employeeCode: r["emp_no"],
        previousStage: currentStage,
        currentStage: nextStage,
        actionBy: "المشرف",
        actionDate: new Date().toLocaleDateString("ar-SA"),
      });

      notifyWorkflow({
        eventType: "stage_assigned",
        requestId: String(r["id"]),
        requestNumber: r["request_number"],
        requestType: String(r["request_type"]),
        employeeId: r["employee_id"],
        employeeName: r["employee_name"],
        employeeCode: r["emp_no"],
        currentStage: nextStage,
        actionUrl: typeof window !== "undefined" ? `${window.location.origin}/approval-requests` : "/approval-requests",
        actionDate: new Date().toLocaleDateString("ar-SA"),
      });
    } else {
      notifyWorkflow({
        eventType: "final_approved",
        requestId: String(r["id"]),
        requestNumber: r["request_number"],
        requestType: String(r["request_type"]),
        employeeId: r["employee_id"],
        employeeName: r["employee_name"],
        employeeCode: r["emp_no"],
        currentStage: currentStage,
        actionBy: "المشرف",
        actionDate: new Date().toLocaleDateString("ar-SA"),
      });
    }

    setOpenMenu(null);
  };

  const reject = async (r: Row) => {
    const reason = prompt("سبب الرفض؟") ?? "";
    await save.mutateAsync({
      ...r,
      status: "rejected",
      decision_at: new Date().toISOString(),
      decision_reason: reason,
      decision_by: "المشرف",
    });

    notifyWorkflow({
      eventType: "stage_rejected",
      requestId: String(r["id"]),
      requestNumber: r["request_number"],
      requestType: String(r["request_type"]),
      employeeId: r["employee_id"],
      employeeName: r["employee_name"],
      employeeCode: r["emp_no"],
      currentStage: r["awaiting_stage"] || "مرحلة الاعتماد",
      actionBy: "المشرف",
      rejectionReason: reason || "لم يتم تحديد سبب",
      actionDate: new Date().toLocaleDateString("ar-SA"),
    });

    setOpenMenu(null);
  };

  return (
    <AppShell>
      <div className="mt-3">
        <Breadcrumbs trail={["طلبات الاعتماد"]} />
      </div>

      <h1 className="mt-3 flex items-center gap-2 text-lg font-extrabold text-foreground">
        <MaterialIcon name="task_alt" size={22} className="text-primary" filled />
        طلبات الاعتماد
      </h1>

      {/* Toolbar: search + export buttons + add */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search..."
            dir="ltr"
            className={`${control} h-10 w-64 pl-9`}
          />
          <MaterialIcon
            name="search"
            size={17}
            className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
          />
        </div>

        {[
          { icon: "picture_as_pdf", label: "PDF" },
          { icon: "table_view", label: "Excel" },
          { icon: "print", label: "طباعة" },
        ].map((b) => (
          <button
            key={b.label}
            title={b.label}
            className="grid size-10 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <MaterialIcon name={b.icon} size={18} />
          </button>
        ))}

        <button
          onClick={openNew}
          className="ms-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <MaterialIcon name="add" size={18} />
          إضافة طلب
        </button>
      </div>

      {/* Table */}
      <div
        className="mt-3 overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-right">
            {/* Dark-blue header + per-column filter row */}
            <thead>
              <tr className="bg-topbar text-topbar-foreground">
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="whitespace-nowrap px-4 py-3 text-[12.5px] font-extrabold"
                  >
                    <span className="flex items-center gap-1.5">
                      {c.label}
                      <MaterialIcon
                        name="expand_more"
                        size={16}
                        className="text-white/85"
                      />
                    </span>
                  </th>
                ))}
                <th className="w-12 px-2" />
              </tr>
              <tr className="bg-secondary/60">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-1.5">
                    <div className="relative">
                      <input
                        value={colFilters[c.key]}
                        onChange={(e) =>
                          setColFilters({ ...colFilters, [c.key]: e.target.value })
                        }
                        placeholder=""
                        className="h-8 w-full rounded-md border border-border bg-background px-2 pe-7 text-[12px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/20"
                      />
                      <MaterialIcon
                        name="search"
                        size={14}
                        className="pointer-events-none absolute inset-y-0 left-2 my-auto h-fit text-muted-foreground"
                      />
                    </div>
                  </th>
                ))}
                <th className="px-2" />
              </tr>
            </thead>

            <tbody>
              {(isLoading || pageRows.length === 0) && (
                <tr>
                  <td
                    colSpan={COLUMNS.length + 1}
                    className="px-4 py-14 text-center text-sm font-semibold text-muted-foreground"
                  >
                    {isLoading ? "جارٍ تحميل الطلبات..." : "لا توجد طلبات مطابقة"}
                  </td>
                </tr>
              )}

              {pageRows.map((r) => (
                <tr
                  key={String(r["id"])}
                  className={`border-b border-border transition-colors last:border-0 hover:bg-accent/40 ${
                    r["status"] === "approved"
                      ? "bg-emerald-50/40 dark:bg-emerald-500/[.04]"
                      : r["status"] === "rejected"
                        ? "bg-rose-50/40 dark:bg-rose-500/[.04]"
                        : "odd:bg-secondary/30"
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[13px] font-bold">
                    {String(r["employee_name"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {String(r["request_type"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {String(r["branch"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {String(r["category"] ?? "—")}
                  </td>
                  <td dir="ltr" className="whitespace-nowrap px-4 py-3 text-left text-[12.5px]">
                    {fmtDateEn(r["request_date"])}
                  </td>
                  <td dir="ltr" className="whitespace-nowrap px-4 py-3 text-left text-[12.5px]">
                    {fmtDateEn(r["entered_at"])}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {String(r["approval_chain"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {String(r["direct_manager_name"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                    {r["awaiting_approver_name"] ? (
                      String(r["awaiting_approver_name"])
                    ) : (
                      <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                        بانتظار اعتماد {String(r["awaiting_stage"] ?? "المدير المباشر")}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenu(openMenu === String(r["id"]) ? null : String(r["id"]))
                        }
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <MaterialIcon name="more_vert" size={18} />
                      </button>
                      {openMenu === String(r["id"]) && (
                        <div
                          className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                          onMouseLeave={() => setOpenMenu(null)}
                        >
                          {r["status"] === "pending" && (
                            <>
                              <MenuItem
                                icon="check"
                                label="اعتماد الطلب"
                                tone="emerald"
                                onClick={() => approve(r)}
                              />
                              <MenuItem
                                icon="close"
                                label="رفض الطلب"
                                tone="rose"
                                onClick={() => reject(r)}
                              />
                              <div className="h-px bg-border" />
                            </>
                          )}
                          <MenuItem
                            icon="edit"
                            label="تعديل"
                            onClick={() => {
                              setDraft({ ...r });
                              setOpenMenu(null);
                            }}
                          />
                          <MenuItem
                            icon="delete"
                            label="حذف"
                            tone="rose"
                            onClick={() => {
                              if (confirm("هل تريد حذف هذا الطلب نهائياً؟"))
                                del.mutate(String(r["id"]));
                              setOpenMenu(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager (matches mockup: left=info+arrows+page numbers, right=page-size 20/10/5) */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[12px] font-bold">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <MaterialIcon name="chevron_right" size={18} />
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`grid size-8 place-items-center rounded-lg transition-colors ${
                  n === currentPage
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={currentPage >= pages}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <MaterialIcon name="chevron_left" size={18} />
            </button>
            <span className="ms-2 text-muted-foreground">
              صفحة {currentPage} من {pages} ({filtered.length} عنصر)
            </span>
          </div>

          <div className="ms-auto flex items-center gap-1">
            {[20, 10, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setPageSize(n);
                  setPage(1);
                }}
                className={`grid size-8 place-items-center rounded-lg transition-colors ${
                  n === pageSize
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-topbar/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <MaterialIcon
                name={draft["id"] ? "edit" : "add_task"}
                size={22}
                className="text-primary"
                filled
              />
              <div>
                <h3 className="text-sm font-extrabold">
                  {draft["id"] ? "تعديل طلب اعتماد" : "إضافة طلب اعتماد"}
                </h3>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  أدخل بيانات الموظف والطلب وسلسلة الاعتماد
                </p>
              </div>
              <button
                onClick={() => setDraft(null)}
                className="ms-auto text-muted-foreground hover:text-foreground"
              >
                <MaterialIcon name="close" size={22} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold">
                  <MaterialIcon name="badge" size={17} className="text-primary" filled />
                  بيانات الموظف
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <FieldText
                    label="اسم الموظف"
                    required
                    value={String(draft["employee_name"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, employee_name: v })}
                  />
                  <FieldText
                    label="رقم الموظف"
                    value={String(draft["emp_no"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, emp_no: v })}
                  />
                  <FieldText
                    label="الفرع"
                    value={String(draft["branch"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, branch: v })}
                  />
                  <FieldText
                    label="القسم"
                    value={String(draft["department"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, department: v })}
                  />
                  <FieldText
                    label="التصنيف الإداري"
                    value={String(draft["category"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, category: v })}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold">
                  <MaterialIcon name="description" size={17} className="text-primary" filled />
                  بيانات الطلب
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <FieldSelect
                    label="نوع الطلب"
                    required
                    value={String(draft["request_type"] ?? "")}
                    options={REQUEST_TYPES.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => setDraft({ ...draft, request_type: v })}
                  />
                  <FieldText
                    label="عنوان الطلب"
                    value={String(draft["request_subject"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, request_subject: v })}
                  />
                  <label>
                    <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">
                      من تاريخ
                    </span>
                    <input
                      type="date"
                      className={control}
                      value={String(draft["effective_from"] ?? "")}
                      onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">
                      إلى تاريخ
                    </span>
                    <input
                      type="date"
                      className={control}
                      value={String(draft["effective_to"] ?? "")}
                      onChange={(e) => setDraft({ ...draft, effective_to: e.target.value })}
                    />
                  </label>
                  <label className="sm:col-span-2 xl:col-span-3">
                    <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">
                      تفاصيل الطلب
                    </span>
                    <textarea
                      rows={3}
                      className={`${control} h-auto py-2`}
                      value={String(draft["request_details"] ?? "")}
                      onChange={(e) => setDraft({ ...draft, request_details: e.target.value })}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold">
                  <MaterialIcon name="account_tree" size={17} className="text-primary" filled />
                  سلسلة الاعتماد
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <FieldSelect
                    label="سلسلة الموافقة"
                    value={String(draft["approval_chain"] ?? "")}
                    options={APPROVAL_CHAINS.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => setDraft({ ...draft, approval_chain: v })}
                  />
                  <FieldText
                    label="المدير المباشر"
                    value={String(draft["direct_manager_name"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, direct_manager_name: v })}
                  />
                  <FieldText
                    label="في انتظار موافقة"
                    value={String(draft["awaiting_approver_name"] ?? "")}
                    onChange={(v) => setDraft({ ...draft, awaiting_approver_name: v })}
                  />
                  <FieldSelect
                    label="المرحلة الحالية"
                    value={String(draft["awaiting_stage"] ?? "المدير المباشر")}
                    options={AWAITING_STAGES.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => setDraft({ ...draft, awaiting_stage: v })}
                  />
                  <FieldSelect
                    label="الحالة"
                    value={String(draft["status"] ?? "pending")}
                    options={STATUS_OPTIONS}
                    onChange={(v) => setDraft({ ...draft, status: v })}
                  />
                </div>
              </section>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
              <button
                onClick={submit}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700"
              >
                <MaterialIcon name="save" size={18} />
                {save.isPending ? "جارٍ الحفظ..." : draft["id"] ? "حفظ التعديلات" : "إضافة الطلب"}
              </button>
              <button
                onClick={() => setDraft(null)}
                className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2.5 text-[13px] font-bold text-rose-700 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-200"
              >
                <MaterialIcon name="close" size={18} />
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function MenuItem({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: string;
  label: string;
  tone?: "emerald" | "rose";
  onClick: () => void;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
      : tone === "rose"
        ? "text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
        : "text-foreground hover:bg-secondary";
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-right text-[12.5px] font-bold transition-colors ${toneCls}`}
    >
      <MaterialIcon name={icon} size={17} />
      {label}
    </button>
  );
}

function FieldText({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-foreground/80">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      <input
        className={control}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function FieldSelect({
  label,
  required,
  value,
  options,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-foreground/80">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      <select className={control} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">اختر ....</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
