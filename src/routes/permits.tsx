import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, Btn, Card, Chip, PageBanner } from "@/components/hr/ui";
import { useRows, useSaveRow, type Row } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/permits")({
  head: () => ({
    meta: [
      { title: "الأذونات | شؤون الموظفين" },
      {
        name: "description",
        content: "إضافة أذونات الموظفين والبحث فيها ومتابعة الأرصدة والحالات.",
      },
      { property: "og:title", content: "الأذونات | شؤون الموظفين" },
      {
        property: "og:description",
        content: "إدارة أذونات التأخير والانصراف المبكر للموظفين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PermitsPage,
});

type TabKey = "create" | "search";

type PermitForm = {
  employeeId: string;
  kind: string;
  permitType: string;
  permissionDate: string;
  allowedPerMonth: string;
  hoursPerMonth: string;
  notes: string;
  attachmentName: string;
};

type PermitFilters = {
  branch: string;
  department: string;
  mainDepartment: string;
  sector: string;
  careerPath: string;
  employeeName: string;
  empNo: string;
  nationalId: string;
  kind: string;
  permitType: string;
  fromDate: string;
  toDate: string;
};

const initialForm: PermitForm = {
  employeeId: "",
  kind: "تأخير",
  permitType: "إذن تأخير",
  permissionDate: "",
  allowedPerMonth: "3",
  hoursPerMonth: "10",
  notes: "",
  attachmentName: "",
};

const initialFilters: PermitFilters = {
  branch: "",
  department: "",
  mainDepartment: "",
  sector: "",
  careerPath: "",
  employeeName: "",
  empNo: "",
  nationalId: "",
  kind: "",
  permitType: "",
  fromDate: "",
  toDate: "",
};

const kindOptions = ["تأخير", "انصراف مبكر", "إذن شخصي", "مهمة عمل"];
const permitTypes: Record<string, string[]> = {
  تأخير: ["إذن تأخير", "بدون بصمة", "ظرف طارئ"],
  "انصراف مبكر": ["إذن انصراف مبكر", "بدون بصمة", "ظرف طارئ"],
  "إذن شخصي": ["إذن بالساعات", "موعد طبي", "ظرف عائلي"],
  "مهمة عمل": ["مأمورية داخلية", "مأمورية خارجية"],
};

const tableColumns = [
  "اسم الموظف",
  "الرقم الوظيفي",
  "الفرع",
  "القسم",
  "تاريخ الإدخال",
  "النوع",
  "حالة الطلب",
  "اسم المستخدم",
  "نوع الإذن",
  "تاريخ الإذن",
  "الحضور الصباحي",
  "الحضور الفعلي صباحًا",
  "الحضور المسائي",
  "الحضور الفعلي مساءً",
  "إجمالي الدقائق",
] as const;

const controlClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20";

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(String).filter(Boolean)));
}

function dateAr(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(String(value)));
}

function minutesAr(value: unknown) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-foreground/80">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

function SelectControl({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClass} appearance-none pe-9 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <MaterialIcon
        name="expand_more"
        size={18}
        className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  tone?: "primary" | "teal" | "amber";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    teal: "bg-teal/12 text-teal",
    amber: "bg-gyellow/15 text-gold",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        <MaterialIcon name={icon} size={22} filled />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-black text-foreground">{value}</p>
        <p className="text-[10px] font-semibold text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function PermitTabs({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "create", label: "الأذونات", icon: "event_available" },
    { key: "search", label: "بحث الأذونات", icon: "manage_search" },
  ];
  return (
    <div
      className="mt-4 flex gap-1.5 rounded-2xl border border-border bg-card p-2"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-extrabold transition-all sm:flex-none ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <MaterialIcon name={item.icon} size={19} filled={active} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function statusChip(status: string) {
  if (status === "مقبول" || status === "معتمد") return <Chip label={status} tone="green" />;
  if (status === "مرفوض") {
    return (
      <span className="inline-flex rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">
        {status}
      </span>
    );
  }
  return <Chip label={status || "قيد التنفيذ"} tone="amber" />;
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function PermitsPage() {
  const [tab, setTab] = useState<TabKey>("create");
  const [form, setForm] = useState<PermitForm>(initialForm);
  const [filters, setFilters] = useState<PermitFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<PermitFilters>(initialFilters);
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const permitsQuery = useRows("employee_permits", {
    orderBy: "permission_date",
    ascending: false,
  });
  const savePermit = useSaveRow("employee_permits");

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const permits = useMemo(() => permitsQuery.data ?? [], [permitsQuery.data]);
  const selectedEmployee = employees.find((employee) => employee["id"] === form.employeeId);
  const selectedMonth = form.permissionDate.slice(0, 7);
  const employeeMonthPermits = permits.filter(
    (permit) =>
      permit["employee_id"] === form.employeeId &&
      String(permit["permission_date"] ?? "").startsWith(selectedMonth),
  );
  const usedMinutes = employeeMonthPermits.reduce(
    (sum, permit) => sum + Number(permit["total_minutes"] ?? 0),
    0,
  );
  const hoursBalance = Math.max(Number(form.hoursPerMonth || 0) - usedMinutes / 60, 0);

  const branches = unique(employees.map((employee) => employee["branch"]));
  const departments = unique(employees.map((employee) => employee["department"]));
  const employeeNames = employees.map((employee) => String(employee["full_name"] ?? ""));

  const filteredRows = useMemo(() => {
    const needle = tableSearch.trim().toLocaleLowerCase("ar");
    return permits.filter((row) => {
      const matches = [
        ["branch", appliedFilters.branch],
        ["department", appliedFilters.department],
        ["main_department", appliedFilters.mainDepartment],
        ["sector", appliedFilters.sector],
        ["career_path", appliedFilters.careerPath],
        ["employee_name", appliedFilters.employeeName],
        ["emp_no", appliedFilters.empNo],
        ["national_id", appliedFilters.nationalId],
        ["kind", appliedFilters.kind],
        ["permit_type", appliedFilters.permitType],
      ].every(([key, value]) => !value || String(row[String(key)] ?? "") === value);
      const date = String(row["permission_date"] ?? "");
      const inRange =
        (!appliedFilters.fromDate || date >= appliedFilters.fromDate) &&
        (!appliedFilters.toDate || date <= appliedFilters.toDate);
      const inSearch =
        !needle ||
        [
          row["employee_name"],
          row["emp_no"],
          row["branch"],
          row["department"],
          row["kind"],
          row["permit_type"],
          row["status"],
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("ar")
            .includes(needle),
        );
      return matches && inRange && inSearch;
    });
  }, [appliedFilters, permits, tableSearch]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  function updateForm<K extends keyof PermitForm>(key: K, value: PermitForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof PermitFilters>(key: K, value: PermitFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeKind(kind: string) {
    setForm((current) => ({
      ...current,
      kind,
      permitType: permitTypes[kind]?.[0] ?? "",
    }));
  }

  async function submitPermit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee || !form.permissionDate || !form.permitType) {
      toast.error("أكمل بيانات الموظف ونوع الإذن والتاريخ");
      return;
    }
    let rowMutationStarted = false;
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("انتهت جلسة تسجيل الدخول");
      let attachmentPath: string | null = null;
      if (attachmentFile) {
        const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        attachmentPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
          .from("permit-attachments")
          .upload(attachmentPath, attachmentFile, { upsert: false });
        if (error) throw error;
      }

      rowMutationStarted = true;
      await savePermit.mutateAsync({
        employee_id: selectedEmployee["id"],
        employee_name: selectedEmployee["full_name"],
        emp_no: selectedEmployee["emp_no"],
        national_id: selectedEmployee["national_id"],
        branch: selectedEmployee["branch"],
        department: selectedEmployee["department"],
        main_department: "الإدارة العامة",
        sector: "القطاع الإداري",
        career_path: "المسار الإداري",
        kind: form.kind,
        permit_type: form.permitType,
        permission_date: form.permissionDate,
        status: "قيد التنفيذ",
        requested_by: user.email ?? "مدير النظام",
        allowed_per_month: Number(form.allowedPerMonth),
        hours_per_month: Number(form.hoursPerMonth),
        scheduled_morning: "08:00",
        scheduled_evening: "17:00",
        notes: form.notes,
        attachment_name: form.attachmentName || null,
        attachment_path: attachmentPath,
      });
      setForm(initialForm);
      setAttachmentFile(null);
      setTab("search");
    } catch (error) {
      if (!rowMutationStarted) {
        toast.error(`تعذر حفظ المرفق: ${(error as Error).message}`);
      }
    }
  }

  function applySearch() {
    setAppliedFilters(filters);
    setPage(1);
  }

  function clearSearch() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setTableSearch("");
    setPage(1);
  }

  function exportCsv() {
    const body = filteredRows.map((row) =>
      [
        row["employee_name"],
        row["emp_no"],
        row["branch"],
        row["department"],
        row["created_at"],
        row["kind"],
        row["status"],
        row["requested_by"],
        row["permit_type"],
        row["permission_date"],
        row["scheduled_morning"],
        row["actual_morning"],
        row["scheduled_evening"],
        row["actual_evening"],
        row["total_minutes"],
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = `\uFEFF${tableColumns.map(escapeCsv).join(",")}\n${body.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "employee-permits.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div>
        <Breadcrumbs trail={["شؤون الموظفين", "الأذونات"]} />
        <PageBanner
          icon="approval"
          title="الأذونات"
          subtitle="إضافة ومتابعة أذونات التأخير والانصراف المبكر للموظفين"
          actions={
            <Btn icon="add" variant="onDark" onClick={() => setTab("create")}>
              إذن جديد
            </Btn>
          }
        />

        <PermitTabs tab={tab} onChange={setTab} />

        {tab === "create" && (
          <form onSubmit={submitPermit} className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard
                icon="event_repeat"
                label="عدد الأذونات المسموح شهريًا"
                value={new Intl.NumberFormat("en-US").format(Number(form.allowedPerMonth))}
                hint="حسب لائحة الأذونات"
              />
              <StatCard
                icon="fact_check"
                label="عدد الأذونات المستخدمة هذا الشهر"
                value={new Intl.NumberFormat("en-US").format(employeeMonthPermits.length)}
                hint={selectedEmployee ? "للموظف المحدد" : "اختر موظفًا لعرض الرصيد"}
                tone="teal"
              />
              <StatCard
                icon="schedule"
                label="رصيد الساعات المتبقي"
                value={`${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(hoursBalance)} ساعة`}
                hint={`من أصل ${form.hoursPerMonth || "0"} ساعات شهريًا`}
                tone="amber"
              />
            </div>

            <Card title="بيانات الإذن" icon="edit_calendar">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldLabel label="الموظف" required>
                  <div className="relative">
                    <select
                      value={form.employeeId}
                      onChange={(event) => updateForm("employeeId", event.target.value)}
                      className={`${controlClass} appearance-none pe-9`}
                    >
                      <option value="">اختر الموظف...</option>
                      {employees.map((employee) => (
                        <option key={String(employee["id"])} value={String(employee["id"])}>
                          {String(employee["emp_no"])} · {String(employee["full_name"])}
                        </option>
                      ))}
                    </select>
                    <MaterialIcon
                      name="expand_more"
                      size={18}
                      className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
                    />
                  </div>
                </FieldLabel>
                <FieldLabel label="النوع" required>
                  <SelectControl value={form.kind} onChange={changeKind} options={kindOptions} />
                </FieldLabel>
                <FieldLabel label="نوع الإذن" required>
                  <SelectControl
                    value={form.permitType}
                    onChange={(value) => updateForm("permitType", value)}
                    options={permitTypes[form.kind] ?? []}
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ" required>
                  <input
                    type="date"
                    value={form.permissionDate}
                    onChange={(event) => updateForm("permissionDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="عدد مرات الإذن شهريًا">
                  <input
                    type="number"
                    min="1"
                    value={form.allowedPerMonth}
                    onChange={(event) => updateForm("allowedPerMonth", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="رصيد الساعات الشهري">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.hoursPerMonth}
                    onChange={(event) => updateForm("hoursPerMonth", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="ملاحظات">
                  <input
                    value={form.notes}
                    onChange={(event) => updateForm("notes", event.target.value)}
                    placeholder="أضف ملاحظة مختصرة"
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="المرفقات">
                  <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/45 bg-primary/5 px-3 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10">
                    <MaterialIcon name="cloud_upload" size={19} />
                    <span className="max-w-48 truncate">
                      {form.attachmentName || "اختر ملفًا للإرفاق"}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file && file.size > 10 * 1024 * 1024) {
                          toast.error("حجم المرفق يجب ألا يتجاوز 10 ميجابايت");
                          event.target.value = "";
                          setAttachmentFile(null);
                          updateForm("attachmentName", "");
                          return;
                        }
                        setAttachmentFile(file);
                        updateForm("attachmentName", file?.name ?? "");
                      }}
                    />
                  </label>
                </FieldLabel>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Btn
                  variant="ghost"
                  onClick={() => {
                    setForm(initialForm);
                    setAttachmentFile(null);
                  }}
                  icon="restart_alt"
                >
                  إعادة تعيين
                </Btn>
                <Btn type="submit" variant="teal" icon="save">
                  {savePermit.isPending ? "جارٍ الحفظ..." : "حفظ الإذن"}
                </Btn>
              </div>
            </Card>
          </form>
        )}

        {tab === "search" && (
          <div className="mt-4 space-y-4">
            <Card title="البحث المتقدم" icon="tune">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldLabel label="الفرع">
                  <SelectControl
                    value={filters.branch}
                    onChange={(value) => updateFilter("branch", value)}
                    options={branches}
                    placeholder="كل الفروع"
                  />
                </FieldLabel>
                <FieldLabel label="القسم">
                  <SelectControl
                    value={filters.department}
                    onChange={(value) => updateFilter("department", value)}
                    options={departments}
                    placeholder="كل الأقسام"
                  />
                </FieldLabel>
                <FieldLabel label="القسم الرئيسي">
                  <SelectControl
                    value={filters.mainDepartment}
                    onChange={(value) => updateFilter("mainDepartment", value)}
                    options={["الإدارة العامة"]}
                    placeholder="كل الأقسام الرئيسية"
                  />
                </FieldLabel>
                <FieldLabel label="القطاع">
                  <SelectControl
                    value={filters.sector}
                    onChange={(value) => updateFilter("sector", value)}
                    options={["القطاع الإداري"]}
                    placeholder="كل القطاعات"
                  />
                </FieldLabel>
                <FieldLabel label="المسار">
                  <SelectControl
                    value={filters.careerPath}
                    onChange={(value) => updateFilter("careerPath", value)}
                    options={["المسار الإداري"]}
                    placeholder="كل المسارات"
                  />
                </FieldLabel>
                <FieldLabel label="اسم الموظف">
                  <SelectControl
                    value={filters.employeeName}
                    onChange={(value) => updateFilter("employeeName", value)}
                    options={employeeNames}
                    placeholder="كل الموظفين"
                  />
                </FieldLabel>
                <FieldLabel label="الرقم الوظيفي">
                  <input
                    value={filters.empNo}
                    onChange={(event) => updateFilter("empNo", event.target.value)}
                    placeholder="أدخل الرقم الوظيفي"
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="رقم الهوية">
                  <input
                    value={filters.nationalId}
                    onChange={(event) => updateFilter("nationalId", event.target.value)}
                    placeholder="أدخل رقم الهوية"
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="النوع">
                  <SelectControl
                    value={filters.kind}
                    onChange={(value) => updateFilter("kind", value)}
                    options={kindOptions}
                    placeholder="كل الأنواع"
                  />
                </FieldLabel>
                <FieldLabel label="نوع الإذن">
                  <SelectControl
                    value={filters.permitType}
                    onChange={(value) => updateFilter("permitType", value)}
                    options={unique(Object.values(permitTypes).flat())}
                    placeholder="كل أنواع الأذونات"
                  />
                </FieldLabel>
                <FieldLabel label="تاريخ الإذن من">
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) => updateFilter("fromDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="تاريخ الإذن إلى">
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(event) => updateFilter("toDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
              </div>
              <div className="mt-5 flex justify-center gap-2 border-t border-border pt-4">
                <Btn icon="search" onClick={applySearch}>
                  بحث
                </Btn>
                <Btn icon="filter_alt_off" variant="ghost" onClick={clearSearch}>
                  مسح الفلاتر
                </Btn>
              </div>
            </Card>

            <Card padded={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="me-auto">
                  <h2 className="flex items-center gap-2 text-sm font-extrabold">
                    <MaterialIcon name="table_rows" size={19} className="text-primary" filled />
                    نتائج الأذونات
                  </h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {new Intl.NumberFormat("en-US").format(filteredRows.length)} سجل مطابق
                  </p>
                </div>
                <div className="relative">
                  <input
                    value={tableSearch}
                    onChange={(event) => {
                      setTableSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="بحث سريع..."
                    className={`${controlClass} h-9 w-52 pe-9`}
                  />
                  <MaterialIcon
                    name="search"
                    size={17}
                    className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  title="طباعة / PDF"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-destructive transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="picture_as_pdf" size={18} />
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  title="تصدير Excel"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-teal transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="table_view" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  title="طباعة"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-primary transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="print" size={18} />
                </button>
              </div>

              {permitsQuery.isError ? (
                <div className="m-5 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  <MaterialIcon name="error" size={20} filled />
                  <div>
                    <p className="font-extrabold">تعذر تحميل بيانات الأذونات</p>
                    <p className="mt-1 text-[12px] font-semibold opacity-80">
                      تأكد من تطبيق تحديث قاعدة البيانات الخاص بشاشة الأذونات.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1900px] border-collapse text-right">
                    <thead>
                      <tr className="bg-topbar text-topbar-foreground">
                        {tableColumns.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap border-l border-white/10 px-3 py-3 text-[11px] font-extrabold last:border-l-0"
                          >
                            <span className="flex items-center gap-1.5">
                              <MaterialIcon
                                name="filter_alt"
                                size={13}
                                className="text-topbar-accent"
                              />
                              {column}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!permitsQuery.isLoading && pageRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={tableColumns.length}
                            className="px-4 py-16 text-center text-sm font-bold text-muted-foreground"
                          >
                            <MaterialIcon
                              name="event_busy"
                              size={34}
                              className="mb-2 block text-border"
                            />
                            لا توجد أذونات مطابقة للفلاتر الحالية
                          </td>
                        </tr>
                      )}
                      {permitsQuery.isLoading && (
                        <tr>
                          <td
                            colSpan={tableColumns.length}
                            className="px-4 py-16 text-center text-sm font-bold text-muted-foreground"
                          >
                            <MaterialIcon
                              name="progress_activity"
                              size={28}
                              className="mb-2 inline-block animate-spin text-primary"
                            />
                            <span className="block">جارٍ تحميل الأذونات...</span>
                          </td>
                        </tr>
                      )}
                      {pageRows.map((row) => (
                        <tr
                          key={String(row["id"])}
                          className="border-b border-border odd:bg-secondary/35 hover:bg-accent/50"
                        >
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-extrabold">
                            {String(row["employee_name"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["emp_no"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["branch"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["department"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {dateAr(row["created_at"])}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["kind"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {statusChip(String(row["status"] ?? "قيد التنفيذ"))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["requested_by"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {String(row["permit_type"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                            {dateAr(row["permission_date"])}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-semibold">
                            {String(row["scheduled_morning"] ?? "—").slice(0, 5)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-semibold">
                            {String(row["actual_morning"] ?? "—").slice(0, 5)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-semibold">
                            {String(row["scheduled_evening"] ?? "—").slice(0, 5)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-semibold">
                            {String(row["actual_evening"] ?? "—").slice(0, 5)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-black text-primary">
                            {minutesAr(row["total_minutes"])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[12px] font-bold">
                <div className="flex items-center gap-1">
                  {[5, 10, 20].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      className={`grid size-8 place-items-center rounded-lg transition-colors ${
                        pageSize === size
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {new Intl.NumberFormat("en-US").format(size)}
                    </button>
                  ))}
                </div>
                <span className="text-muted-foreground">
                  صفحة {new Intl.NumberFormat("en-US").format(page)} من{" "}
                  {new Intl.NumberFormat("en-US").format(pages)}
                </span>
                <div className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <MaterialIcon name="chevron_right" size={18} />
                  </button>
                  <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                    {new Intl.NumberFormat("en-US").format(page)}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pages}
                    onClick={() => setPage((current) => Math.min(current + 1, pages))}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <MaterialIcon name="chevron_left" size={18} />
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
