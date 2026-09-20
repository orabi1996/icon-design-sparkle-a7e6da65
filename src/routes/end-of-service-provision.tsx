import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, Btn, Card, Chip, PageBanner } from "@/components/hr/ui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRows, type Row } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";
import { computeEosGratuity, getStatutoryEosConfig, calculateExactServiceDuration } from "@/lib/loans-eos-core.mjs";

export const Route = createFileRoute("/end-of-service-provision")({
  head: () => ({
    meta: [
      { title: "مخصص نهاية الخدمة | شؤون الموظفين" },
      {
        name: "description",
        content: "احتساب مخصصات نهاية الخدمة وترحيل القيود وفك الترحيل مع سجل تدقيق كامل.",
      },
      { property: "og:title", content: "مخصص نهاية الخدمة | شؤون الموظفين" },
      {
        property: "og:description",
        content: "منظومة احتساب وترحيل ومراجعة مخصصات نهاية الخدمة للموظفين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EndOfServiceProvisionPage,
});

type TabKey = "calculate" | "post" | "reverse";

type Filters = {
  branch: string;
  department: string;
  mainDepartment: string;
  sector: string;
  careerPath: string;
  sponsor: string;
  employeeId: string;
  employmentStatus: string;
  fromDate: string;
  toDate: string;
};

type CalculationFilters = {
  calculationDate: string;
  branch: string;
  department: string;
  mainDepartment: string;
  sector: string;
  careerPath: string;
  sponsor: string;
  employmentStatus: string;
};

type SelectOption = { value: string; label: string };

const today = new Date().toISOString().slice(0, 10);

const emptyFilters: Filters = {
  branch: "",
  department: "",
  mainDepartment: "",
  sector: "",
  careerPath: "",
  sponsor: "",
  employeeId: "",
  employmentStatus: "",
  fromDate: "",
  toDate: "",
};

const emptyCalculationFilters: CalculationFilters = {
  calculationDate: today,
  branch: "",
  department: "",
  mainDepartment: "",
  sector: "",
  careerPath: "",
  sponsor: "",
  employmentStatus: "نشط",
};

const provisionColumns = [
  "اسم الموظف",
  "الرقم الوظيفي",
  "الفرع",
  "القسم",
  "الوظيفة",
  "الوحدة الإدارية",
  "المستوى الوظيفي",
  "القسم الرئيسي",
  "القطاع",
  "اسم الكفيل",
  "المسار",
  "القيمة",
  "القيمة السابقة",
  "الصافي",
  "تاريخ التعيين",
  "تاريخ الاحتساب",
  "الحالة",
] as const;

const postingColumns = [
  "رقم القيد",
  "الفرع",
  "اسم المستخدم",
  "تاريخ الترحيل",
  "عدد الموظفين",
  "إجمالي القيد",
  "الوحدة الإدارية",
  "الحالة",
] as const;

const controlClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20";

// Generated Supabase types intentionally lag feature migrations in this project.
const eosDb = supabase as unknown as {
  from: (table: string) => {
    upsert: (values: unknown, options?: Record<string, string>) => Promise<{ error: Error | null }>;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function money(value: unknown) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))} ر.س`;
}

function numberAr(value: unknown) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function dateAr(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(String(value)));
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function employeeMainDepartment(employee: Row) {
  return String(employee["main_department"] ?? "الإدارة العامة");
}

function employeeSector(employee: Row) {
  return String(employee["sector"] ?? "القطاع الإداري");
}

function employeeCareerPath(employee: Row) {
  return String(employee["path"] ?? employee["career_path"] ?? "المسار الإداري");
}

function yearsOfService(hireDate: unknown, calculationDate: string) {
  if (!hireDate || !calculationDate) return 0;
  const start = new Date(String(hireDate));
  const end = new Date(calculationDate);
  const days = Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
  return days / 365.25;
}

function calculateProvision(employee: Row, calculationDate: string) {
  const hireDate = String(employee["hire_date"] || "");
  if (!hireDate || !calculationDate) return 0;
  const duration = calculateExactServiceDuration(hireDate, calculationDate);
  const salary = Number(employee["basic_salary"] ?? 0) + Number(employee["allowances"] ?? 0);
  const config = getStatutoryEosConfig("SA");
  const res = computeEosGratuity(config, {
    decimalYears: duration.decimalYears,
    wageBase: salary,
    terminationReason: "contract_end",
  });
  return res.finalGratuity;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">{label}</span>
      {children}
    </label>
  );
}

function SelectControl({
  value,
  onChange,
  options,
  placeholder = "اختر...",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
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

function Tabs({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "calculate", label: "مخصص نهاية الخدمة", icon: "calculate" },
    { key: "post", label: "ترحيل مخصص نهاية الخدمة", icon: "move_up" },
    { key: "reverse", label: "فك ترحيل مخصص نهاية الخدمة", icon: "undo" },
  ];
  return (
    <div
      className="mt-4 grid gap-1.5 rounded-2xl border border-border bg-card p-2 sm:grid-cols-3"
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
        <p className="mt-0.5 truncate text-lg font-black text-foreground">{value}</p>
        <p className="text-[10px] font-semibold text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function FiltersCard({
  filters,
  employees,
  onChange,
  onApply,
  onClear,
}: {
  filters: Filters;
  employees: Row[];
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const options = (values: unknown[]) => unique(values).map((value) => ({ value, label: value }));
  return (
    <Card title="البحث المتقدم" icon="tune">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FieldLabel label="الفرع">
          <SelectControl
            value={filters.branch}
            onChange={(value) => onChange("branch", value)}
            options={options(employees.map((employee) => employee["branch"]))}
          />
        </FieldLabel>
        <FieldLabel label="القسم">
          <SelectControl
            value={filters.department}
            onChange={(value) => onChange("department", value)}
            options={options(employees.map((employee) => employee["department"]))}
          />
        </FieldLabel>
        <FieldLabel label="القسم الرئيسي">
          <SelectControl
            value={filters.mainDepartment}
            onChange={(value) => onChange("mainDepartment", value)}
            options={options(employees.map(employeeMainDepartment))}
          />
        </FieldLabel>
        <FieldLabel label="القطاع">
          <SelectControl
            value={filters.sector}
            onChange={(value) => onChange("sector", value)}
            options={options(employees.map(employeeSector))}
          />
        </FieldLabel>
        <FieldLabel label="المسار">
          <SelectControl
            value={filters.careerPath}
            onChange={(value) => onChange("careerPath", value)}
            options={options(employees.map(employeeCareerPath))}
          />
        </FieldLabel>
        <FieldLabel label="الكفالة">
          <SelectControl
            value={filters.sponsor}
            onChange={(value) => onChange("sponsor", value)}
            options={options(employees.map((employee) => employee["manager_name"]))}
          />
        </FieldLabel>
        <FieldLabel label="اسم الموظف">
          <SelectControl
            value={filters.employeeId}
            onChange={(value) => onChange("employeeId", value)}
            options={employees.map((employee) => ({
              value: String(employee["id"]),
              label: `${String(employee["emp_no"] ?? "")} · ${String(employee["full_name"] ?? "")}`,
            }))}
          />
        </FieldLabel>
        <FieldLabel label="حالة الموظف">
          <SelectControl
            value={filters.employmentStatus}
            onChange={(value) => onChange("employmentStatus", value)}
            options={options(employees.map((employee) => employee["status"]))}
          />
        </FieldLabel>
        <FieldLabel label="التاريخ من">
          <input
            type="date"
            className={controlClass}
            value={filters.fromDate}
            onChange={(event) => onChange("fromDate", event.target.value)}
          />
        </FieldLabel>
        <FieldLabel label="التاريخ إلى">
          <input
            type="date"
            className={controlClass}
            value={filters.toDate}
            onChange={(event) => onChange("toDate", event.target.value)}
          />
        </FieldLabel>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Btn variant="ghost" icon="restart_alt" onClick={onClear}>
          مسح الفلاتر
        </Btn>
        <Btn variant="primary" icon="search" onClick={onApply}>
          بحث
        </Btn>
      </div>
    </Card>
  );
}

function TableToolbar({
  search,
  onSearch,
  onExport,
  total,
  title,
}: {
  search: string;
  onSearch: (value: string) => void;
  onExport: () => void;
  total: number;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <h2 className="me-auto flex items-center gap-2 text-sm font-bold">
        <MaterialIcon name="table_rows" size={19} className="text-primary" filled />
        {title}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          {numberAr(total)}
        </span>
      </h2>
      <div className="relative">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="ابحث..."
          className={`${controlClass} h-9 w-48 pe-9`}
        />
        <MaterialIcon
          name="search"
          size={17}
          className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
        />
      </div>
      <button
        type="button"
        title="Excel / CSV"
        onClick={onExport}
        className="grid size-9 place-items-center rounded-xl bg-teal text-white transition-opacity hover:opacity-90"
      >
        <MaterialIcon name="table_view" size={18} />
      </button>
      <button
        type="button"
        title="طباعة"
        onClick={() => window.print()}
        className="grid size-9 place-items-center rounded-xl bg-primary text-white transition-opacity hover:opacity-90"
      >
        <MaterialIcon name="print" size={18} />
      </button>
    </div>
  );
}

function LoadingOrEmpty({
  colSpan,
  loading,
  error,
}: {
  colSpan: number;
  loading: boolean;
  error: boolean;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-14 text-center text-sm font-semibold text-muted-foreground"
      >
        {loading
          ? "جارٍ تحميل البيانات..."
          : error
            ? "لم يتم تفعيل جداول مخصص نهاية الخدمة في قاعدة البيانات بعد"
            : "لا توجد بيانات مطابقة"}
      </td>
    </tr>
  );
}

function statusChip(status: string) {
  if (status === "مرحل" || status === "نشط") return <Chip label={status} tone="green" />;
  if (status === "تم فك الترحيل") return <Chip label={status} tone="muted" />;
  return <Chip label={status || "غير مرحل"} tone="amber" />;
}

function EndOfServiceProvisionPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("calculate");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedProvisionIds, setSelectedProvisionIds] = useState<string[]>([]);
  const [selectedPostingIds, setSelectedPostingIds] = useState<string[]>([]);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [calculationFilters, setCalculationFilters] =
    useState<CalculationFilters>(emptyCalculationFilters);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<"calculate" | "post" | "reverse" | null>(null);

  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const provisionsQuery = useRows("employee_eos_provisions", {
    orderBy: "calculation_date",
    ascending: false,
  });
  const postingsQuery = useRows("eos_provision_postings", {
    orderBy: "posted_at",
    ascending: false,
  });

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const provisions = useMemo(() => provisionsQuery.data ?? [], [provisionsQuery.data]);
  const postings = useMemo(() => postingsQuery.data ?? [], [postingsQuery.data]);

  const modalEmployees = useMemo(
    () =>
      employees.filter((employee) => {
        const hireDate = String(employee["hire_date"] ?? "");
        return (
          (!calculationFilters.branch || employee["branch"] === calculationFilters.branch) &&
          (!calculationFilters.department ||
            employee["department"] === calculationFilters.department) &&
          (!calculationFilters.mainDepartment ||
            employeeMainDepartment(employee) === calculationFilters.mainDepartment) &&
          (!calculationFilters.sector || employeeSector(employee) === calculationFilters.sector) &&
          (!calculationFilters.careerPath ||
            employeeCareerPath(employee) === calculationFilters.careerPath) &&
          (!calculationFilters.sponsor ||
            employee["manager_name"] === calculationFilters.sponsor) &&
          (!calculationFilters.employmentStatus ||
            employee["status"] === calculationFilters.employmentStatus) &&
          (!hireDate || hireDate <= calculationFilters.calculationDate)
        );
      }),
    [calculationFilters, employees],
  );

  const filteredProvisions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar");
    return provisions.filter((row) => {
      const calculationDate = String(row["calculation_date"] ?? "");
      const matchesFilters =
        (!appliedFilters.branch || row["branch"] === appliedFilters.branch) &&
        (!appliedFilters.department || row["department"] === appliedFilters.department) &&
        (!appliedFilters.mainDepartment ||
          row["main_department"] === appliedFilters.mainDepartment) &&
        (!appliedFilters.sector || row["sector"] === appliedFilters.sector) &&
        (!appliedFilters.careerPath || row["career_path"] === appliedFilters.careerPath) &&
        (!appliedFilters.sponsor || row["sponsor_name"] === appliedFilters.sponsor) &&
        (!appliedFilters.employeeId || row["employee_id"] === appliedFilters.employeeId) &&
        (!appliedFilters.employmentStatus ||
          row["employment_status"] === appliedFilters.employmentStatus) &&
        (!appliedFilters.fromDate || calculationDate >= appliedFilters.fromDate) &&
        (!appliedFilters.toDate || calculationDate <= appliedFilters.toDate);
      const matchesSearch =
        !needle ||
        [
          row["employee_name"],
          row["emp_no"],
          row["branch"],
          row["department"],
          row["job_title"],
          row["posting_status"],
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("ar")
            .includes(needle),
        );
      return matchesFilters && matchesSearch;
    });
  }, [appliedFilters, provisions, search]);

  const tabProvisions = useMemo(
    () =>
      tab === "post"
        ? filteredProvisions.filter((row) => row["posting_status"] !== "مرحل")
        : filteredProvisions,
    [filteredProvisions, tab],
  );

  const filteredPostings = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar");
    return postings.filter((row) => {
      const postedDate = String(row["posted_at"] ?? "").slice(0, 10);
      const matchesFilters =
        (!appliedFilters.branch || row["branch"] === appliedFilters.branch) &&
        (!appliedFilters.fromDate || postedDate >= appliedFilters.fromDate) &&
        (!appliedFilters.toDate || postedDate <= appliedFilters.toDate);
      const matchesSearch =
        !needle ||
        [row["entry_number"], row["branch"], row["posted_by"], row["administrative_unit"]].some(
          (value) =>
            String(value ?? "")
              .toLocaleLowerCase("ar")
              .includes(needle),
        );
      return matchesFilters && matchesSearch;
    });
  }, [appliedFilters, postings, search]);

  const activePostings = filteredPostings.filter((row) => row["status"] === "نشط");
  const visibleRows = tab === "reverse" ? activePostings : tabProvisions;
  const pages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pageRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);

  const totalProvision = provisions.reduce(
    (sum, row) => sum + Number(row["provision_value"] ?? 0),
    0,
  );
  const unpostedProvision = provisions
    .filter((row) => row["posting_status"] !== "مرحل")
    .reduce((sum, row) => sum + Number(row["difference_value"] ?? 0), 0);
  const postedTotal = postings
    .filter((row) => row["status"] === "نشط")
    .reduce((sum, row) => sum + Number(row["total_amount"] ?? 0), 0);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateCalculationFilter<K extends keyof CalculationFilters>(
    key: K,
    value: CalculationFilters[K],
  ) {
    setCalculationFilters((current) => ({ ...current, [key]: value }));
    if (key !== "calculationDate") setSelectedEmployeeIds([]);
  }

  function applyFilters() {
    setAppliedFilters(filters);
    setPage(1);
    setSelectedProvisionIds([]);
    setSelectedPostingIds([]);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setSearch("");
    setPage(1);
    setSelectedProvisionIds([]);
    setSelectedPostingIds([]);
  }

  function toggleId(id: string, selected: string[], setter: (ids: string[]) => void) {
    setter(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function calculateSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    const selectedEmployees = modalEmployees.filter((employee) =>
      selectedEmployeeIds.includes(String(employee["id"])),
    );
    if (!calculationFilters.calculationDate || selectedEmployees.length === 0) {
      toast.error("حدد تاريخ الاحتساب وموظفًا واحدًا على الأقل");
      return;
    }
    setBusyAction("calculate");
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("انتهت جلسة تسجيل الدخول");

      const postedDuplicate = selectedEmployees.find((employee) =>
        provisions.some(
          (row) =>
            row["employee_id"] === employee["id"] &&
            row["calculation_date"] === calculationFilters.calculationDate &&
            row["posting_status"] === "مرحل",
        ),
      );
      if (postedDuplicate) {
        throw new Error(
          `مخصص ${String(postedDuplicate["full_name"])} في هذا التاريخ مرحل بالفعل؛ فك الترحيل أولاً`,
        );
      }

      const rows = selectedEmployees.map((employee) => {
        const previous = provisions
          .filter(
            (row) =>
              row["employee_id"] === employee["id"] &&
              String(row["calculation_date"] ?? "") < calculationFilters.calculationDate,
          )
          .sort((a, b) =>
            String(b["calculation_date"] ?? "").localeCompare(String(a["calculation_date"] ?? "")),
          )[0];
        const provisionValue = calculateProvision(employee, calculationFilters.calculationDate);
        const previousValue = Number(previous?.["provision_value"] ?? 0);
        return {
          employee_id: employee["id"],
          employee_name: employee["full_name"],
          emp_no: employee["emp_no"],
          national_id: employee["national_id"],
          branch: employee["branch"],
          department: employee["department"],
          main_department: employeeMainDepartment(employee),
          sector: employeeSector(employee),
          career_path: employeeCareerPath(employee),
          sponsor_name: employee["manager_name"],
          job_title: employee["job_title"],
          administrative_unit: employee["manager_name"] ?? "الإدارة العامة",
          job_level: "إداري",
          employment_status: employee["status"],
          basic_salary: Number(employee["basic_salary"] ?? 0),
          allowances: Number(employee["allowances"] ?? 0),
          wage_base: Number(employee["basic_salary"] ?? 0) + Number(employee["allowances"] ?? 0),
          hire_date: employee["hire_date"] || null,
          calculation_date: calculationFilters.calculationDate,
          service_years: yearsOfService(employee["hire_date"], calculationFilters.calculationDate),
          previous_value: previousValue,
          provision_value: provisionValue,
          difference_value: provisionValue - previousValue,
          posting_status: "غير مرحل",
          calculated_by: user.email ?? "مدير النظام",
          created_by: user.id,
        };
      });

      const { error } = await eosDb
        .from("employee_eos_provisions")
        .upsert(rows, { onConflict: "employee_id,calculation_date" });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["employee_eos_provisions"] });
      toast.success(`تم احتساب مخصص نهاية الخدمة لعدد ${numberAr(rows.length)} موظف`);
      setCalculationOpen(false);
      setSelectedEmployeeIds([]);
    } catch (error) {
      toast.error(`تعذر احتساب المخصص: ${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function postSelected() {
    if (selectedProvisionIds.length === 0) {
      toast.error("حدد سجلًا واحدًا على الأقل للترحيل");
      return;
    }
    if (!window.confirm("هل تريد ترحيل السجلات المحددة وإنشاء قيد المخصص؟")) return;
    setBusyAction("post");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("انتهت جلسة تسجيل الدخول");
      const { error } = await eosDb.rpc("post_eos_provisions", {
        p_provision_ids: selectedProvisionIds,
        p_user_name: user.email ?? "مدير النظام",
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee_eos_provisions"] }),
        queryClient.invalidateQueries({ queryKey: ["eos_provision_postings"] }),
      ]);
      setSelectedProvisionIds([]);
      toast.success("تم ترحيل المخصص وإنشاء القيد بنجاح");
      setTab("reverse");
    } catch (error) {
      toast.error(`تعذر ترحيل المخصص: ${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function reverseSelected() {
    if (selectedPostingIds.length === 0) {
      toast.error("حدد قيدًا واحدًا على الأقل لفك الترحيل");
      return;
    }
    if (!window.confirm("سيتم فك الترحيل وإعادة سجلات المخصص إلى حالة غير مرحل. هل تريد المتابعة؟"))
      return;
    setBusyAction("reverse");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("انتهت جلسة تسجيل الدخول");
      for (const postingId of selectedPostingIds) {
        const { error } = await eosDb.rpc("reverse_eos_provision_posting", {
          p_posting_id: postingId,
          p_user_name: user.email ?? "مدير النظام",
          p_reason: "فك ترحيل من شاشة مخصص نهاية الخدمة",
        });
        if (error) throw error;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee_eos_provisions"] }),
        queryClient.invalidateQueries({ queryKey: ["eos_provision_postings"] }),
      ]);
      setSelectedPostingIds([]);
      toast.success("تم فك ترحيل القيود المحددة بنجاح");
    } catch (error) {
      toast.error(`تعذر فك الترحيل: ${(error as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  function exportCsv() {
    const columns = tab === "reverse" ? postingColumns : provisionColumns;
    const rows = tab === "reverse" ? activePostings : tabProvisions;
    const body = rows.map((row) =>
      (tab === "reverse"
        ? [
            row["entry_number"],
            row["branch"],
            row["posted_by"],
            row["posted_at"],
            row["employees_count"],
            row["total_amount"],
            row["administrative_unit"],
            row["status"],
          ]
        : [
            row["employee_name"],
            row["emp_no"],
            row["branch"],
            row["department"],
            row["job_title"],
            row["administrative_unit"],
            row["job_level"],
            row["main_department"],
            row["sector"],
            row["sponsor_name"],
            row["career_path"],
            row["provision_value"],
            row["previous_value"],
            row["difference_value"],
            row["hire_date"],
            row["calculation_date"],
            row["posting_status"],
          ]
      )
        .map(escapeCsv)
        .join(","),
    );
    const csv = `\uFEFF${columns.map(escapeCsv).join(",")}\n${body.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = tab === "reverse" ? "eos-postings.csv" : "eos-provisions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const selection = tab === "reverse" ? selectedPostingIds : selectedProvisionIds;
  const setSelection = tab === "reverse" ? setSelectedPostingIds : setSelectedProvisionIds;
  const currentPageIds = pageRows.map((row) => String(row["id"]));
  const allPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selection.includes(id));

  return (
    <AppShell>
      <div>
        <Breadcrumbs trail={["شؤون الموظفين", "مخصص نهاية الخدمة"]} />
        <PageBanner
          icon="account_balance_wallet"
          title="مخصص نهاية الخدمة"
          subtitle="احتساب المخصصات وترحيل القيود ومراجعة عمليات فك الترحيل"
          actions={
            tab === "calculate" ? (
              <Btn icon="add" variant="onDark" onClick={() => setCalculationOpen(true)}>
                احتساب مخصص
              </Btn>
            ) : undefined
          }
        />

        <Tabs
          tab={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            setPage(1);
            setSearch("");
            setSelectedProvisionIds([]);
            setSelectedPostingIds([]);
          }}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard
            icon="savings"
            label="إجمالي المخصص المحتسب"
            value={money(totalProvision)}
            hint={`${numberAr(provisions.length)} سجل احتساب`}
          />
          <StatCard
            icon="pending_actions"
            label="صافي بانتظار الترحيل"
            value={money(unpostedProvision)}
            hint="السجلات غير المرحلة"
            tone="amber"
          />
          <StatCard
            icon="verified"
            label="إجمالي القيود المرحلة"
            value={money(postedTotal)}
            hint={`${numberAr(activePostings.length)} قيد نشط`}
            tone="teal"
          />
        </div>

        <div className="mt-4">
          <FiltersCard
            filters={filters}
            employees={employees}
            onChange={updateFilter}
            onApply={applyFilters}
            onClear={clearFilters}
          />
        </div>

        <section
          className="mt-4 overflow-hidden rounded-2xl border border-border bg-card print:shadow-none"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <TableToolbar
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            onExport={exportCsv}
            total={visibleRows.length}
            title={tab === "reverse" ? "قيود المخصص المرحلة" : "سجل مخصصات نهاية الخدمة"}
          />

          <div className="overflow-x-auto">
            {tab !== "reverse" ? (
              <table className="w-full min-w-[1750px] border-collapse text-right">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    {tab === "post" && (
                      <th className="w-12 border-b border-white/15 px-4 py-3">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={(checked) =>
                            setSelection(
                              checked
                                ? Array.from(new Set([...selection, ...currentPageIds]))
                                : selection.filter((id) => !currentPageIds.includes(id)),
                            )
                          }
                          className="border-white data-[state=checked]:bg-white data-[state=checked]:text-primary"
                        />
                      </th>
                    )}
                    {provisionColumns.map((column) => (
                      <th
                        key={column}
                        className="whitespace-nowrap border-b border-white/15 px-3 py-3 text-[11px] font-extrabold"
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
                  {(provisionsQuery.isLoading ||
                    provisionsQuery.isError ||
                    pageRows.length === 0) && (
                    <LoadingOrEmpty
                      colSpan={provisionColumns.length + (tab === "post" ? 1 : 0)}
                      loading={provisionsQuery.isLoading}
                      error={provisionsQuery.isError}
                    />
                  )}
                  {pageRows.map((row) => (
                    <tr
                      key={String(row["id"])}
                      className="border-b border-border odd:bg-secondary/35 hover:bg-accent/50"
                    >
                      {tab === "post" && (
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedProvisionIds.includes(String(row["id"]))}
                            onCheckedChange={() =>
                              toggleId(
                                String(row["id"]),
                                selectedProvisionIds,
                                setSelectedProvisionIds,
                              )
                            }
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3 text-[12px] font-bold">
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
                        {String(row["administrative_unit"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {String(row["job_level"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {String(row["main_department"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {String(row["sector"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {String(row["sponsor_name"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {String(row["career_path"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px] font-bold text-primary">
                        {money(row["provision_value"])}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {money(row["previous_value"])}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px] font-bold">
                        {money(row["difference_value"])}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {dateAr(row["hire_date"])}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {dateAr(row["calculation_date"])}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px]">
                        {statusChip(String(row["posting_status"] ?? "غير مرحل"))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[1100px] border-collapse text-right">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="w-12 border-b border-white/15 px-4 py-3">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(checked) =>
                          setSelection(
                            checked
                              ? Array.from(new Set([...selection, ...currentPageIds]))
                              : selection.filter((id) => !currentPageIds.includes(id)),
                          )
                        }
                        className="border-white data-[state=checked]:bg-white data-[state=checked]:text-primary"
                      />
                    </th>
                    {postingColumns.map((column) => (
                      <th
                        key={column}
                        className="whitespace-nowrap border-b border-white/15 px-4 py-3 text-[11px] font-extrabold"
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
                  {(postingsQuery.isLoading || postingsQuery.isError || pageRows.length === 0) && (
                    <LoadingOrEmpty
                      colSpan={postingColumns.length + 1}
                      loading={postingsQuery.isLoading}
                      error={postingsQuery.isError}
                    />
                  )}
                  {pageRows.map((row) => (
                    <tr
                      key={String(row["id"])}
                      className="border-b border-border odd:bg-secondary/35 hover:bg-accent/50"
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedPostingIds.includes(String(row["id"]))}
                          onCheckedChange={() =>
                            toggleId(String(row["id"]), selectedPostingIds, setSelectedPostingIds)
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] font-black text-primary">
                        {String(row["entry_number"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {String(row["branch"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {String(row["posted_by"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {dateAr(row["posted_at"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {numberAr(row["employees_count"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] font-bold">
                        {money(row["total_amount"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {String(row["administrative_unit"] ?? "—")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {statusChip(String(row["status"] ?? "نشط"))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[11px] font-bold text-muted-foreground">
            <span>
              صفحة {numberAr(page)} من {numberAr(pages)} · {numberAr(visibleRows.length)} عنصر
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40"
              >
                <MaterialIcon name="chevron_right" size={18} />
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40"
              >
                <MaterialIcon name="chevron_left" size={18} />
              </button>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <span>عرض</span>
              {[5, 10, 20].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 ${pageSize === size ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {numberAr(size)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {tab === "post" && (
          <div className="sticky bottom-4 mt-4 flex justify-end print:hidden">
            <button
              type="button"
              disabled={busyAction !== null || selectedProvisionIds.length === 0}
              onClick={postSelected}
              className="flex items-center gap-2 rounded-2xl bg-teal px-6 py-3 text-sm font-extrabold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MaterialIcon name="move_up" size={20} filled />
              {busyAction === "post"
                ? "جارٍ الترحيل..."
                : `ترحيل المحدد (${numberAr(selectedProvisionIds.length)})`}
            </button>
          </div>
        )}

        {tab === "reverse" && (
          <div className="sticky bottom-4 mt-4 flex justify-end print:hidden">
            <button
              type="button"
              disabled={busyAction !== null || selectedPostingIds.length === 0}
              onClick={reverseSelected}
              className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-extrabold text-white shadow-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MaterialIcon name="undo" size={20} filled />
              {busyAction === "reverse"
                ? "جارٍ فك الترحيل..."
                : `فك ترحيل (${numberAr(selectedPostingIds.length)})`}
            </button>
          </div>
        )}
      </div>

      <Dialog open={calculationOpen} onOpenChange={setCalculationOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl p-0">
          <DialogHeader className="border-b border-border px-6 py-5 text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-primary">
              <MaterialIcon name="calculate" size={21} filled />
              احتساب مخصص نهاية الخدمة
            </DialogTitle>
            <DialogDescription className="text-right text-xs">
              اختر نطاق الموظفين وتاريخ الاحتساب، ثم حدد الموظفين المطلوب احتساب مخصصهم.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={calculateSelected} className="p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FieldLabel label="تاريخ الاحتساب">
                <input
                  type="date"
                  required
                  max={today}
                  value={calculationFilters.calculationDate}
                  onChange={(event) =>
                    updateCalculationFilter("calculationDate", event.target.value)
                  }
                  className={controlClass}
                />
              </FieldLabel>
              <FieldLabel label="الفرع">
                <SelectControl
                  value={calculationFilters.branch}
                  onChange={(value) => updateCalculationFilter("branch", value)}
                  options={unique(employees.map((employee) => employee["branch"])).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </FieldLabel>
              <FieldLabel label="القسم">
                <SelectControl
                  value={calculationFilters.department}
                  onChange={(value) => updateCalculationFilter("department", value)}
                  options={unique(employees.map((employee) => employee["department"])).map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </FieldLabel>
              <FieldLabel label="القسم الرئيسي">
                <SelectControl
                  value={calculationFilters.mainDepartment}
                  onChange={(value) => updateCalculationFilter("mainDepartment", value)}
                  options={unique(employees.map(employeeMainDepartment)).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </FieldLabel>
              <FieldLabel label="القطاع">
                <SelectControl
                  value={calculationFilters.sector}
                  onChange={(value) => updateCalculationFilter("sector", value)}
                  options={unique(employees.map(employeeSector)).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </FieldLabel>
              <FieldLabel label="المسار">
                <SelectControl
                  value={calculationFilters.careerPath}
                  onChange={(value) => updateCalculationFilter("careerPath", value)}
                  options={unique(employees.map(employeeCareerPath)).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </FieldLabel>
              <FieldLabel label="الكفالة">
                <SelectControl
                  value={calculationFilters.sponsor}
                  onChange={(value) => updateCalculationFilter("sponsor", value)}
                  options={unique(employees.map((employee) => employee["manager_name"])).map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </FieldLabel>
              <FieldLabel label="حالة الموظف">
                <SelectControl
                  value={calculationFilters.employmentStatus}
                  onChange={(value) => updateCalculationFilter("employmentStatus", value)}
                  options={unique(employees.map((employee) => employee["status"])).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </FieldLabel>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-4 py-3">
                <Checkbox
                  checked={
                    modalEmployees.length > 0 &&
                    modalEmployees.every((employee) =>
                      selectedEmployeeIds.includes(String(employee["id"])),
                    )
                  }
                  onCheckedChange={(checked) =>
                    setSelectedEmployeeIds(
                      checked ? modalEmployees.map((employee) => String(employee["id"])) : [],
                    )
                  }
                />
                <span className="text-xs font-extrabold">الموظفون</span>
                <span className="ms-auto rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                  تم تحديد {numberAr(selectedEmployeeIds.length)} من{" "}
                  {numberAr(modalEmployees.length)}
                </span>
              </div>
              <div className="grid max-h-56 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
                {modalEmployees.map((employee) => {
                  const id = String(employee["id"]);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-secondary"
                    >
                      <Checkbox
                        checked={selectedEmployeeIds.includes(id)}
                        onCheckedChange={() =>
                          toggleId(id, selectedEmployeeIds, setSelectedEmployeeIds)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-extrabold">
                          {String(employee["full_name"] ?? "")}
                        </span>
                        <span className="block truncate text-[10px] font-semibold text-muted-foreground">
                          {String(employee["emp_no"] ?? "")} ·{" "}
                          {String(employee["job_title"] ?? "بدون مسمى")}
                        </span>
                      </span>
                      <span className="ms-auto text-[10px] font-bold text-primary">
                        {money(calculateProvision(employee, calculationFilters.calculationDate))}
                      </span>
                    </label>
                  );
                })}
                {!employeesQuery.isLoading && modalEmployees.length === 0 && (
                  <p className="col-span-full py-8 text-center text-xs font-semibold text-muted-foreground">
                    لا يوجد موظفون مطابقون للنطاق المحدد
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Btn variant="ghost" icon="close" onClick={() => setCalculationOpen(false)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="teal" icon="add">
                {busyAction === "calculate" ? "جارٍ الاحتساب..." : "إضافة الاحتساب"}
              </Btn>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
