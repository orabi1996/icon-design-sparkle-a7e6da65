import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, Btn, Card, Chip, PageBanner } from "@/components/hr/ui";
import { useRows, useSaveRow, type Row } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";
import { calculateExactServiceDuration } from "@/lib/loans-eos-core.mjs";

export const Route = createFileRoute("/end-of-service-requests")({
  head: () => ({
    meta: [
      { title: "طلبات نهاية الخدمة | شؤون الموظفين" },
      {
        name: "description",
        content: "إضافة طلبات إنهاء الخدمة والبحث فيها ومتابعة حالتها ومرفقاتها.",
      },
      { property: "og:title", content: "طلبات نهاية الخدمة | شؤون الموظفين" },
      {
        property: "og:description",
        content: "إدارة دورة طلبات نهاية الخدمة من التسجيل حتى الاعتماد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EndOfServiceRequestsPage,
});

type TabKey = "create" | "search";

type RequestForm = {
  employeeId: string;
  serviceEndDate: string;
  serviceEndType: string;
  stopReason: string;
  notes: string;
};

type SearchFilters = {
  branch: string;
  department: string;
  sector: string;
  mainDepartment: string;
  careerPath: string;
  jobLevel: string;
  currentJob: string;
  status: string;
  employee: string;
  fromDate: string;
  toDate: string;
};

type SelectOption = { value: string; label: string };

const initialForm: RequestForm = {
  employeeId: "",
  serviceEndDate: "",
  serviceEndType: "",
  stopReason: "",
  notes: "",
};

const initialFilters: SearchFilters = {
  branch: "",
  department: "",
  sector: "",
  mainDepartment: "",
  careerPath: "",
  jobLevel: "",
  currentJob: "",
  status: "",
  employee: "",
  fromDate: "",
  toDate: "",
};

const serviceEndTypes = [
  "استقالة",
  "انتهاء العقد",
  "إنهاء خدمات",
  "تقاعد",
  "فترة التجربة",
  "وفاة",
  "عجز صحي",
  "نقل كفالة",
];

const stopReasons: Record<string, string[]> = {
  استقالة: ["استقالة شخصية", "فرصة عمل أخرى", "ظروف عائلية", "العودة إلى الوطن"],
  "انتهاء العقد": ["انتهاء مدة العقد", "عدم الرغبة في التجديد", "إغلاق المشروع"],
  "إنهاء خدمات": ["أسباب إدارية", "مخالفة لائحة العمل", "إعادة هيكلة", "ضعف الأداء"],
  تقاعد: ["بلوغ سن التقاعد", "تقاعد مبكر"],
  "فترة التجربة": ["عدم اجتياز فترة التجربة", "رغبة الموظف"],
  وفاة: ["وفاة طبيعية", "حادث عمل", "أخرى"],
  "عجز صحي": ["عجز كلي", "عجز جزئي", "قرار لجنة طبية"],
  "نقل كفالة": ["نقل إلى جهة أخرى", "نقل داخلي"],
};

const requestStatuses = ["قيد المراجعة", "بانتظار المدير", "بانتظار الموارد البشرية", "معتمد", "مرفوض", "ملغي"];

const columns = [
  "رقم الطلب",
  "اسم الموظف",
  "الرقم الوظيفي",
  "الفرع",
  "القسم",
  "الوظيفة",
  "نوع نهاية الخدمة",
  "سبب الإيقاف",
  "نهاية الخدمة",
  "تاريخ التعيين",
  "حالة الطلب",
  "مرحلة الاعتماد",
  "اسم المستخدم",
  "المرفق",
] as const;

const controlClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:text-muted-foreground";

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function dateAr(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(String(value)));
}

function numberAr(value: unknown) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
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
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClass} appearance-none pe-9`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

function ReadOnlyValue({ value, placeholder }: { value: unknown; placeholder: string }) {
  return (
    <input
      disabled
      value={String(value ?? "")}
      placeholder={placeholder}
      className={controlClass}
      readOnly
    />
  );
}

function Tabs({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "create", label: "إضافة طلب نهاية الخدمة", icon: "person_remove" },
    { key: "search", label: "بحث نهاية الخدمة", icon: "manage_search" },
  ];
  return (
    <div
      className="mt-4 grid gap-1.5 rounded-2xl border border-border bg-card p-2 sm:grid-cols-2"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-extrabold transition-all ${
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

function InfoCard({
  icon,
  label,
  value,
  tone = "primary",
}: {
  icon: string;
  label: string;
  value: string;
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
        <p className="mt-1 truncate text-sm font-black text-foreground">{value}</p>
      </div>
    </div>
  );
}

function statusChip(status: string) {
  if (status === "معتمد") return <Chip label={status} tone="green" />;
  if (status === "مرفوض" || status === "ملغي") return <Chip label={status} tone="muted" />;
  if (status === "بانتظار الموارد البشرية") return <Chip label={status} tone="blue" />;
  return <Chip label={status || "قيد المراجعة"} tone="amber" />;
}

function EndOfServiceRequestsPage() {
  const [tab, setTab] = useState<TabKey>("create");
  const [form, setForm] = useState<RequestForm>(initialForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(initialFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const requestsQuery = useRows("end_of_service_requests", {
    orderBy: "request_date",
    ascending: false,
  });
  const saveRequest = useSaveRow("end_of_service_requests");

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const selectedEmployee = employees.find((employee) => employee["id"] === form.employeeId);

  const serviceYears = selectedEmployee?.["hire_date"]
    ? calculateExactServiceDuration(
        String(selectedEmployee["hire_date"]),
        form.serviceEndDate || new Date().toISOString().slice(0, 10)
      ).decimalYears
    : 0;

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar");
    return requests.filter((row) => {
      const endDate = String(row["service_end_date"] ?? "");
      const matches =
        (!appliedFilters.branch || row["branch"] === appliedFilters.branch) &&
        (!appliedFilters.department || row["department"] === appliedFilters.department) &&
        (!appliedFilters.sector || row["sector"] === appliedFilters.sector) &&
        (!appliedFilters.mainDepartment ||
          row["main_department"] === appliedFilters.mainDepartment) &&
        (!appliedFilters.careerPath || row["career_path"] === appliedFilters.careerPath) &&
        (!appliedFilters.jobLevel || row["job_level"] === appliedFilters.jobLevel) &&
        (!appliedFilters.currentJob || row["job_title"] === appliedFilters.currentJob) &&
        (!appliedFilters.status || row["request_status"] === appliedFilters.status) &&
        (!appliedFilters.employee || row["employee_id"] === appliedFilters.employee) &&
        (!appliedFilters.fromDate || endDate >= appliedFilters.fromDate) &&
        (!appliedFilters.toDate || endDate <= appliedFilters.toDate);
      const inSearch =
        !needle ||
        [
          row["request_number"],
          row["employee_name"],
          row["emp_no"],
          row["branch"],
          row["department"],
          row["job_title"],
          row["service_end_type"],
          row["stop_reason"],
          row["request_status"],
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("ar")
            .includes(needle),
        );
      return matches && inSearch;
    });
  }, [appliedFilters, requests, search]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateForm<K extends keyof RequestForm>(key: K, value: RequestForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(file: File | null) {
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("حجم المرفق يجب ألا يتجاوز 10 ميجابايت");
      return;
    }
    setAttachment(file);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee || !form.serviceEndDate || !form.serviceEndType || !form.stopReason) {
      toast.error("أكمل بيانات الموظف ونوع وسبب وتاريخ نهاية الخدمة");
      return;
    }
    const hireDate = String(selectedEmployee["hire_date"] ?? "");
    if (hireDate && form.serviceEndDate < hireDate) {
      toast.error("تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ التعيين");
      return;
    }

    let attachmentPath: string | null = null;
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("انتهت جلسة تسجيل الدخول");

      if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        attachmentPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
          .from("end-of-service-attachments")
          .upload(attachmentPath, attachment, { upsert: false });
        if (error) throw error;
      }

      await saveRequest.mutateAsync({
        request_number: `EOS-${Date.now().toString().slice(-9)}`,
        employee_id: selectedEmployee["id"],
        employee_name: selectedEmployee["full_name"],
        emp_no: selectedEmployee["emp_no"],
        national_id: selectedEmployee["national_id"],
        branch: selectedEmployee["branch"],
        department: selectedEmployee["department"],
        main_department: selectedEmployee["main_department"] ?? "الإدارة العامة",
        sector: selectedEmployee["sector"] ?? "القطاع الإداري",
        career_path:
          selectedEmployee["path"] ?? selectedEmployee["career_path"] ?? "المسار الإداري",
        job_level: selectedEmployee["job_level"] ?? "إداري",
        job_title: selectedEmployee["job_title"],
        nationality: selectedEmployee["nationality"],
        contract_type: selectedEmployee["contract_type"] ?? "عقد محدد المدة",
        hire_date: selectedEmployee["hire_date"] || null,
        contract_end_date: selectedEmployee["contract_end"] || null,
        service_end_date: form.serviceEndDate,
        service_end_type: form.serviceEndType,
        stop_reason: form.stopReason,
        notes: form.notes || null,
        attachment_name: attachment?.name ?? null,
        attachment_path: attachmentPath,
        request_status: "قيد المراجعة",
        approval_stage: "المدير المباشر",
        requested_by: user.email ?? "مدير النظام",
        created_by: user.id,
      });

      setForm(initialForm);
      setAttachment(null);
      setTab("search");
    } catch (error) {
      if (attachmentPath) {
        await supabase.storage.from("end-of-service-attachments").remove([attachmentPath]);
      }
      if (!saveRequest.isError) {
        toast.error(`تعذر حفظ الطلب: ${(error as Error).message}`);
      }
    }
  }

  function applyFilters() {
    setAppliedFilters(filters);
    setPage(1);
  }

  function clearFilters() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setSearch("");
    setPage(1);
  }

  async function openAttachment(row: Row) {
    const path = String(row["attachment_path"] ?? "");
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("end-of-service-attachments")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("تعذر فتح المرفق");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function exportCsv() {
    const body = filteredRows.map((row) =>
      [
        row["request_number"],
        row["employee_name"],
        row["emp_no"],
        row["branch"],
        row["department"],
        row["job_title"],
        row["service_end_type"],
        row["stop_reason"],
        row["service_end_date"],
        row["hire_date"],
        row["request_status"],
        row["approval_stage"],
        row["requested_by"],
        row["attachment_name"],
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = `\uFEFF${columns.map(escapeCsv).join(",")}\n${body.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "end-of-service-requests.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const branches = unique(employees.map((employee) => employee["branch"]));
  const departments = unique(employees.map((employee) => employee["department"]));
  const jobs = unique(employees.map((employee) => employee["job_title"]));
  const mainDepartments = unique(
    employees.map((employee) => employee["main_department"] ?? "الإدارة العامة"),
  );
  const sectors = unique(employees.map((employee) => employee["sector"] ?? "القطاع الإداري"));
  const paths = unique(
    employees.map(
      (employee) => employee["path"] ?? employee["career_path"] ?? "المسار الإداري",
    ),
  );
  const levels = unique(employees.map((employee) => employee["job_level"] ?? "إداري"));

  return (
    <AppShell>
      <div>
        <Breadcrumbs trail={["شؤون الموظفين", "طلبات نهاية الخدمة"]} />
        <PageBanner
          icon="person_remove"
          title="طلبات نهاية الخدمة"
          subtitle="تسجيل طلب إنهاء الخدمة ومتابعة دورة الاعتماد والمرفقات"
          actions={
            <Btn icon="add" variant="onDark" onClick={() => setTab("create")}>
              طلب جديد
            </Btn>
          }
        />

        <Tabs
          tab={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            setPage(1);
          }}
        />

        {tab === "create" && (
          <form onSubmit={submitRequest} className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <InfoCard
                icon="badge"
                label="الموظف المحدد"
                value={String(selectedEmployee?.["full_name"] ?? "اختر موظفًا")}
              />
              <InfoCard
                icon="work_history"
                label="مدة الخدمة التقريبية"
                value={
                  selectedEmployee && form.serviceEndDate
                    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(serviceYears)} سنة`
                    : "تظهر بعد تحديد تاريخ النهاية"
                }
                tone="teal"
              />
              <InfoCard
                icon="approval"
                label="حالة الطلب عند الحفظ"
                value="قيد المراجعة · المدير المباشر"
                tone="amber"
              />
            </div>

            <Card title="بيانات طلب نهاية الخدمة" icon="assignment_add">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldLabel label="اسم الموظف" required>
                  <SelectControl
                    value={form.employeeId}
                    onChange={(value) => updateForm("employeeId", value)}
                    options={employees.map((employee) => ({
                      value: String(employee["id"]),
                      label: `${String(employee["emp_no"] ?? "")} · ${String(employee["full_name"] ?? "")}`,
                    }))}
                    placeholder={employeesQuery.isLoading ? "جارٍ تحميل الموظفين..." : "اختر الموظف"}
                  />
                </FieldLabel>
                <FieldLabel label="الرقم الوظيفي">
                  <ReadOnlyValue
                    value={selectedEmployee?.["emp_no"]}
                    placeholder="الرقم الوظيفي"
                  />
                </FieldLabel>
                <FieldLabel label="القسم">
                  <ReadOnlyValue value={selectedEmployee?.["department"]} placeholder="القسم" />
                </FieldLabel>
                <FieldLabel label="الوظيفة">
                  <ReadOnlyValue value={selectedEmployee?.["job_title"]} placeholder="الوظيفة" />
                </FieldLabel>

                <FieldLabel label="تاريخ التعيين">
                  <ReadOnlyValue value={selectedEmployee?.["hire_date"]} placeholder="تاريخ التعيين" />
                </FieldLabel>
                <FieldLabel label="نوع العقد">
                  <ReadOnlyValue
                    value={selectedEmployee ? selectedEmployee["contract_type"] ?? "عقد محدد المدة" : ""}
                    placeholder="نوع العقد"
                  />
                </FieldLabel>
                <FieldLabel label="الجنسية">
                  <ReadOnlyValue value={selectedEmployee?.["nationality"]} placeholder="الجنسية" />
                </FieldLabel>
                <FieldLabel label="تاريخ نهاية العقد">
                  <ReadOnlyValue
                    value={selectedEmployee?.["contract_end"]}
                    placeholder="تاريخ نهاية العقد"
                  />
                </FieldLabel>

                <FieldLabel label="نهاية الخدمة" required>
                  <input
                    type="date"
                    value={form.serviceEndDate}
                    min={String(selectedEmployee?.["hire_date"] ?? "") || undefined}
                    onChange={(event) => updateForm("serviceEndDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="نوع إنهاء الخدمة" required>
                  <SelectControl
                    value={form.serviceEndType}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        serviceEndType: value,
                        stopReason: serviceEndTypes.includes(value)
                          ? stopReasons[value]?.[0] ?? ""
                          : "",
                      }))
                    }
                    options={serviceEndTypes.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="سبب الإيقاف" required>
                  <SelectControl
                    value={form.stopReason}
                    onChange={(value) => updateForm("stopReason", value)}
                    options={(stopReasons[form.serviceEndType] ?? []).map((value) => ({
                      value,
                      label: value,
                    }))}
                    disabled={!form.serviceEndType}
                    placeholder={form.serviceEndType ? "اختر سبب الإيقاف" : "اختر نوع إنهاء الخدمة أولاً"}
                  />
                </FieldLabel>
                <FieldLabel label="ملاحظات">
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) => updateForm("notes", event.target.value)}
                    placeholder="أضف أي ملاحظات خاصة بالطلب"
                    className={`${controlClass} h-auto min-h-11 py-3`}
                  />
                </FieldLabel>
              </div>

              <div className="mt-5 grid items-end gap-4 border-t border-border pt-4 md:grid-cols-[1fr_auto]">
                <FieldLabel label="المرفقات">
                  <label className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/45 bg-primary/5 px-4 text-center text-xs font-bold text-primary transition-colors hover:bg-primary/10">
                    <MaterialIcon name="cloud_upload" size={23} filled />
                    <span className="truncate">
                      {attachment?.name ?? "اسحب الملف هنا أو اضغط للاختيار · بحد أقصى 10 ميجابايت"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="ghost"
                    icon="restart_alt"
                    onClick={() => {
                      setForm(initialForm);
                      setAttachment(null);
                    }}
                  >
                    إعادة تعيين
                  </Btn>
                  <Btn type="submit" variant="teal" icon="save">
                    {saveRequest.isPending ? "جارٍ الحفظ..." : "حفظ الطلب"}
                  </Btn>
                </div>
              </div>
            </Card>
          </form>
        )}

        {tab === "search" && (
          <div className="mt-4 space-y-4">
            <Card title="البحث المتقدم" icon="tune">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldLabel label="الفروع">
                  <SelectControl
                    value={filters.branch}
                    onChange={(value) => updateFilter("branch", value)}
                    options={branches.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="القسم">
                  <SelectControl
                    value={filters.department}
                    onChange={(value) => updateFilter("department", value)}
                    options={departments.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="القطاع">
                  <SelectControl
                    value={filters.sector}
                    onChange={(value) => updateFilter("sector", value)}
                    options={sectors.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="القسم الرئيسي">
                  <SelectControl
                    value={filters.mainDepartment}
                    onChange={(value) => updateFilter("mainDepartment", value)}
                    options={mainDepartments.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="المسار">
                  <SelectControl
                    value={filters.careerPath}
                    onChange={(value) => updateFilter("careerPath", value)}
                    options={paths.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="المستوى الوظيفي">
                  <SelectControl
                    value={filters.jobLevel}
                    onChange={(value) => updateFilter("jobLevel", value)}
                    options={levels.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="الوظيفة الحالية">
                  <SelectControl
                    value={filters.currentJob}
                    onChange={(value) => updateFilter("currentJob", value)}
                    options={jobs.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="الحالة">
                  <SelectControl
                    value={filters.status}
                    onChange={(value) => updateFilter("status", value)}
                    options={requestStatuses.map((value) => ({ value, label: value }))}
                  />
                </FieldLabel>
                <FieldLabel label="موظف">
                  <SelectControl
                    value={filters.employee}
                    onChange={(value) => updateFilter("employee", value)}
                    options={employees.map((employee) => ({
                      value: String(employee["id"]),
                      label: `${String(employee["emp_no"] ?? "")} · ${String(employee["full_name"] ?? "")}`,
                    }))}
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ من">
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) => updateFilter("fromDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ إلى">
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(event) => updateFilter("toDate", event.target.value)}
                    className={controlClass}
                  />
                </FieldLabel>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Btn variant="ghost" icon="restart_alt" onClick={clearFilters}>
                  مسح الفلاتر
                </Btn>
                <Btn icon="search" onClick={applyFilters}>
                  بحث
                </Btn>
              </div>
            </Card>

            <Card padded={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <h2 className="me-auto flex items-center gap-2 text-sm font-bold">
                  <MaterialIcon name="table_rows" size={19} className="text-primary" filled />
                  طلبات نهاية الخدمة
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {numberAr(filteredRows.length)}
                  </span>
                </h2>
                <div className="relative">
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="ابحث باسم أو رقم الموظف..."
                    className={`${controlClass} h-9 w-56 pe-9`}
                  />
                  <MaterialIcon
                    name="search"
                    size={17}
                    className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  title="تصدير Excel / CSV"
                  onClick={exportCsv}
                  className="grid size-9 place-items-center rounded-xl bg-teal text-white hover:opacity-90"
                >
                  <MaterialIcon name="table_view" size={18} />
                </button>
                <button
                  type="button"
                  title="طباعة"
                  onClick={() => window.print()}
                  className="grid size-9 place-items-center rounded-xl bg-primary text-white hover:opacity-90"
                >
                  <MaterialIcon name="print" size={18} />
                </button>
              </div>

              {requestsQuery.isError ? (
                <div className="m-4 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-800">
                  <MaterialIcon name="database" size={23} filled />
                  <div>
                    <p className="text-sm font-extrabold">لم يتم تفعيل جدول طلبات نهاية الخدمة بعد</p>
                    <p className="text-[11px] font-semibold opacity-80">
                      طبّق تحديث قاعدة البيانات المرفق لتفعيل الحفظ والبحث.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1700px] border-collapse text-right">
                    <thead>
                      <tr className="bg-primary text-primary-foreground">
                        {columns.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap border-l border-white/10 px-3 py-3 text-[11px] font-extrabold last:border-l-0"
                          >
                            <span className="flex items-center gap-1.5">
                              {column}
                              <MaterialIcon name="filter_alt" size={13} className="text-white/60" />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requestsQuery.isLoading && (
                        <tr>
                          <td
                            colSpan={columns.length}
                            className="px-4 py-14 text-center text-sm font-bold text-muted-foreground"
                          >
                            جارٍ تحميل الطلبات...
                          </td>
                        </tr>
                      )}
                      {!requestsQuery.isLoading && pageRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={columns.length}
                            className="px-4 py-14 text-center text-sm font-bold text-muted-foreground"
                          >
                            لا توجد طلبات مطابقة للفلاتر الحالية
                          </td>
                        </tr>
                      )}
                      {pageRows.map((row) => (
                        <tr
                          key={String(row["id"])}
                          className="border-b border-border odd:bg-secondary/35 hover:bg-accent/50"
                        >
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-black text-primary">
                            {String(row["request_number"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px] font-extrabold">
                            {String(row["employee_name"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["emp_no"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["branch"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["department"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["job_title"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["service_end_type"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["stop_reason"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {dateAr(row["service_end_date"])}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {dateAr(row["hire_date"])}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {statusChip(String(row["request_status"] ?? "قيد المراجعة"))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {String(row["approval_stage"] ?? "—")}
                          </td>
                          <td className="max-w-48 truncate px-3 py-3 text-[12px]">
                            {String(row["requested_by"] ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                            {row["attachment_path"] ? (
                              <button
                                type="button"
                                title="فتح المرفق"
                                onClick={() => openAttachment(row)}
                                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 font-bold text-primary hover:bg-primary hover:text-white"
                              >
                                <MaterialIcon name="attachment" size={16} />
                                {String(row["attachment_name"] ?? "فتح")}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[11px] font-bold text-muted-foreground">
                <span>
                  صفحة {numberAr(safePage)} من {numberAr(pages)} · {numberAr(filteredRows.length)} عنصر
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40"
                  >
                    <MaterialIcon name="chevron_right" size={18} />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= pages}
                    onClick={() => setPage((current) => Math.min(pages, current + 1))}
                    className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40"
                  >
                    <MaterialIcon name="chevron_left" size={18} />
                  </button>
                </div>
                <div className="ms-auto flex items-center gap-2">
                  {[5, 10, 20].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 ${
                        pageSize === size ? "bg-primary text-primary-foreground" : "bg-secondary"
                      }`}
                    >
                      {numberAr(size)}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
