import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, type Row } from "@/lib/hr-db";
import { useCompanyWorkspace } from "@/components/hr/CompanyWorkspace";
import { transitionEmployeeStatusFn } from "@/lib/employee.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/")({
  head: () => ({
    meta: [
      { title: "شؤون الموظفين | قائمة الموظفين" },
      {
        name: "description",
        content: "البحث المتقدم في بيانات الموظفين واستعراض الحضور والانصراف والبيانات المالية.",
      },
      { property: "og:title", content: "شؤون الموظفين | قائمة الموظفين" },
      { property: "og:description", content: "قائمة الموظفين والبحث التفصيلي في البيانات الوظيفية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffList,
});

type Filters = {
  employeeName: string;
  employeeNumber: string;
  nationalId: string;
  branch: string;
  department: string;
  mainDepartment: string;
  jobTitle: string;
  specialization: string;
  careerPath: string;
  sector: string;
  status: string;
  hireFrom: string;
  hireTo: string;
  startFrom: string;
  startTo: string;
};

type TableColumn = {
  key: string;
  label: string;
  value: (row: Row) => string;
  type?: "text" | "date" | "action";
};

const emptyFilters: Filters = {
  employeeName: "",
  employeeNumber: "",
  nationalId: "",
  branch: "",
  department: "",
  mainDepartment: "",
  jobTitle: "",
  specialization: "",
  careerPath: "",
  sector: "",
  status: "",
  hireFrom: "",
  hireTo: "",
  startFrom: "",
  startTo: "",
};

const inputClass =
  "h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const selectClass = inputClass + " appearance-none pe-8 cursor-pointer";

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("ar");

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll(String.fromCharCode(39), "&#039;");

const uniqueValues = (rows: Row[], key: string) =>
  [...new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ar"),
  );

function FilterField({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  options?: string[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-right text-[12px] font-bold text-slate-900">{label}</span>
      {options ? (
        <span className="relative block">
          <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
            <option value="">اختر ....</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <MaterialIcon
            name="arrow_drop_down"
            size={17}
            className="pointer-events-none absolute inset-y-0 left-2 my-auto h-fit text-slate-700"
          />
        </span>
      ) : (
        <span className="relative block">
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
          {type === "date" && (
            <MaterialIcon
              name="calendar_month"
              size={15}
              className="pointer-events-none absolute inset-y-0 left-2 my-auto h-fit text-slate-800"
            />
          )}
        </span>
      )}
    </label>
  );
}

function StaffList() {
  const { data: employees = [], isLoading, isError } = useRows("employees", {
    orderBy: "emp_no",
    ascending: true,
  });
  const { data: departments = [] } = useRows("departments", {
    orderBy: "name",
    ascending: true,
  });

  const queryClient = useQueryClient();
  const workspace = useCompanyWorkspace();
  const company = workspace.selectedCompany;

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // Lifecycle transition modal state
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Row | null>(null);
  const [targetStatus, setTargetStatus] = useState<
    "active" | "probation" | "suspended" | "on_leave" | "terminated" | "resigned"
  >("active");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionNotes, setTransitionNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingTransition, setIsSubmittingTransition] = useState(false);

  const handleOpenLifecycle = (emp: Row) => {
    setSelectedEmp(emp);
    const currentSt = String(emp["employment_status"] ?? emp["status"] ?? "active").toLowerCase();
    setTargetStatus(currentSt === "active" ? "suspended" : "active");
    setTransitionReason("");
    setTransitionNotes("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setIsLifecycleModalOpen(true);
  };

  const handleSaveTransition = async () => {
    if (!selectedEmp) return;
    const empId = String(selectedEmp["id"] ?? "");
    if (!empId) {
      toast.error("معرف الموظف غير صالح");
      return;
    }
    if (!transitionReason.trim()) {
      toast.error("سبب تغيير الحالة التشغيلية إلزامي (3 أحرف على الأقل)");
      return;
    }
    if (!company?.tenant_id || !company?.id) {
      toast.error("يرجى اختيار شركة من مساحة العمل");
      return;
    }

    setIsSubmittingTransition(true);
    try {
      await transitionEmployeeStatusFn({
        data: {
          tenantId: company.tenant_id,
          companyId: company.id,
          employeeId: empId,
          targetStatus,
          reason: transitionReason.trim(),
          notes: transitionNotes.trim() || undefined,
          effectiveDate,
        },
      });
      toast.success("تم تحديث الحالة التشغيلية للموظف وتسجيلها في السجل التاريخي بنجاح");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setIsLifecycleModalOpen(false);
    } catch (err: any) {
      toast.error(`تعذر تحديث الحالة: ${err.message}`);
    } finally {
      setIsSubmittingTransition(false);
    }
  };

  const optionSets = useMemo(
    () => ({
      branches: uniqueValues(employees, "branch"),
      departments: [
        ...new Set([
          ...departments.map((row) => String(row["name"] ?? "").trim()).filter(Boolean),
          ...uniqueValues(employees, "department"),
        ]),
      ].sort((a, b) => a.localeCompare(b, "ar")),
      mainDepartments: uniqueValues(employees, "main_department"),
      jobTitles: uniqueValues(employees, "job_title"),
      specializations: uniqueValues(employees, "specialization"),
      careerPaths: uniqueValues(employees, "career_path"),
      sectors: uniqueValues(employees, "sector"),
      statuses: uniqueValues(employees, "status"),
    }),
    [departments, employees],
  );

  const tableColumns: TableColumn[] = useMemo(
    () => [
      { key: "emp_no", label: "الرقم الوظيفي", value: (row) => String(row["emp_no"] ?? "") },
      { key: "full_name", label: "اسم الموظف", value: (row) => String(row["full_name"] ?? "") },
      { key: "branch", label: "الفرع", value: (row) => String(row["branch"] ?? "") },
      { key: "department", label: "القسم", value: (row) => String(row["department"] ?? "") },
      { key: "sector", label: "القطاع", value: (row) => String(row["sector"] ?? "") },
      { key: "career_path", label: "المسار", value: (row) => String(row["career_path"] ?? "") },
      { key: "job_title", label: "الوظيفة الحالية", value: (row) => String(row["job_title"] ?? "") },
      {
        key: "specialization",
        label: "التخصص",
        value: (row) => String(row["specialization"] ?? ""),
      },
      {
        key: "main_department",
        label: "القسم الرئيسي",
        value: (row) => String(row["main_department"] ?? ""),
      },
      {
        key: "employment_category",
        label: "الفئة الوظيفية",
        value: (row) => String(row["employment_category"] ?? row["job_level"] ?? ""),
      },
      {
        key: "status",
        label: "الحالة التشغيلية",
        value: (row) => String(row["status"] ?? row["employment_status"] ?? "نشط"),
      },
      {
        key: "hire_date",
        label: "تاريخ التعيين",
        value: (row) => String(row["hire_date"] ?? ""),
        type: "date",
      },
      {
        key: "start_date",
        label: "تاريخ المباشرة",
        value: (row) => String(row["start_date"] ?? ""),
        type: "date",
      },
      {
        key: "attendance",
        label: "الحضور والانصراف",
        value: () => "",
        type: "action",
      },
      {
        key: "financial",
        label: "البيانات المالية",
        value: () => "",
        type: "action",
      },
      {
        key: "lifecycle",
        label: "إدارة الحالة",
        value: () => "",
        type: "action",
      },
    ],
    [],
  );

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setGlobalSearch("");
    setColumnFilters({});
    setPage(1);
  };

  const searchedRows = useMemo(() => {
    if (!appliedFilters) return [];

    return employees.filter((row) => {
      const textMatches =
        (!appliedFilters.employeeName ||
          normalize(row["full_name"]).includes(normalize(appliedFilters.employeeName))) &&
        (!appliedFilters.employeeNumber ||
          normalize(row["emp_no"]).includes(normalize(appliedFilters.employeeNumber))) &&
        (!appliedFilters.nationalId ||
          normalize(row["national_id"]).includes(normalize(appliedFilters.nationalId)));

      const selectMatches =
        (!appliedFilters.branch || String(row["branch"] ?? "") === appliedFilters.branch) &&
        (!appliedFilters.department ||
          String(row["department"] ?? "") === appliedFilters.department) &&
        (!appliedFilters.mainDepartment ||
          String(row["main_department"] ?? "") === appliedFilters.mainDepartment) &&
        (!appliedFilters.jobTitle || String(row["job_title"] ?? "") === appliedFilters.jobTitle) &&
        (!appliedFilters.specialization ||
          String(row["specialization"] ?? "") === appliedFilters.specialization) &&
        (!appliedFilters.careerPath ||
          String(row["career_path"] ?? "") === appliedFilters.careerPath) &&
        (!appliedFilters.sector || String(row["sector"] ?? "") === appliedFilters.sector) &&
        (!appliedFilters.status || String(row["status"] ?? "") === appliedFilters.status);

      const hireDate = String(row["hire_date"] ?? "");
      const startDate = String(row["start_date"] ?? "");
      const dateMatches =
        (!appliedFilters.hireFrom || hireDate >= appliedFilters.hireFrom) &&
        (!appliedFilters.hireTo || hireDate <= appliedFilters.hireTo) &&
        (!appliedFilters.startFrom || startDate >= appliedFilters.startFrom) &&
        (!appliedFilters.startTo || startDate <= appliedFilters.startTo);

      return textMatches && selectMatches && dateMatches;
    });
  }, [appliedFilters, employees]);

  const visibleRows = useMemo(() => {
    const general = normalize(globalSearch);
    return searchedRows.filter((row) => {
      if (general && !tableColumns.some((column) => normalize(column.value(row)).includes(general))) {
        return false;
      }
      return tableColumns.every((column) => {
        const filter = normalize(columnFilters[column.key]);
        return !filter || normalize(column.value(row)).includes(filter);
      });
    });
  }, [columnFilters, globalSearch, searchedRows, tableColumns]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setTableSearch = (value: string) => {
    setGlobalSearch(value);
    setPage(1);
  };

  const setColumnSearch = (key: string, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const exportColumns = tableColumns.filter((column) => column.type !== "action");
    const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
    const csv = [
      exportColumns.map((column) => quote(column.label)).join(","),
      ...visibleRows.map((row) => exportColumns.map((column) => quote(column.value(row))).join(",")),
    ].join("\n");
    downloadFile("\uFEFF" + csv, "employees.csv", "text/csv;charset=utf-8");
  };

  const exportJson = () => {
    const rows = visibleRows.map((row) =>
      Object.fromEntries(
        tableColumns
          .filter((column) => column.type !== "action")
          .map((column) => [column.label, column.value(row)]),
      ),
    );
    downloadFile(JSON.stringify(rows, null, 2), "employees.json", "application/json;charset=utf-8");
  };

  const printResults = () => {
    const exportColumns = tableColumns.filter((column) => column.type !== "action");
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    const header = exportColumns.map((column) => "<th>" + escapeHtml(column.label) + "</th>").join("");
    const body = visibleRows
      .map(
        (row) =>
          "<tr>" +
          exportColumns.map((column) => "<td>" + escapeHtml(column.value(row)) + "</td>").join("") +
          "</tr>",
      )
      .join("");
    printWindow.document.write(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>قائمة الموظفين</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{text-align:center;font-size:20px}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#004a73;color:white}th,td{border:1px solid #aaa;padding:7px;text-align:center}</style></head><body><h1>قائمة الموظفين</h1><table><thead><tr>' +
        header +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></body></html>",
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="mt-4" dir="rtl">
      <form
        onSubmit={submitSearch}
        className="rounded-2xl border border-border bg-card p-5 shadow-xs"
      >
        <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <FilterField
            label="اسم الموظف"
            value={filters.employeeName}
            onChange={(value) => updateFilter("employeeName", value)}
          />
          <FilterField
            label="الرقم الوظيفي"
            value={filters.employeeNumber}
            onChange={(value) => updateFilter("employeeNumber", value)}
          />
          <FilterField
            label="رقم الهوية"
            value={filters.nationalId}
            onChange={(value) => updateFilter("nationalId", value)}
          />
          <FilterField
            label="الفرع"
            value={filters.branch}
            onChange={(value) => updateFilter("branch", value)}
            options={optionSets.branches}
          />
          <FilterField
            label="القسم"
            value={filters.department}
            onChange={(value) => updateFilter("department", value)}
            options={optionSets.departments}
          />

          <FilterField
            label="القسم الرئيسي"
            value={filters.mainDepartment}
            onChange={(value) => updateFilter("mainDepartment", value)}
            options={optionSets.mainDepartments}
          />
          <FilterField
            label="الوظيفة الحالية"
            value={filters.jobTitle}
            onChange={(value) => updateFilter("jobTitle", value)}
            options={optionSets.jobTitles}
          />
          <FilterField
            label="التخصص"
            value={filters.specialization}
            onChange={(value) => updateFilter("specialization", value)}
            options={optionSets.specializations}
          />
          <FilterField
            label="المسار"
            value={filters.careerPath}
            onChange={(value) => updateFilter("careerPath", value)}
            options={optionSets.careerPaths}
          />
          <FilterField
            label="القطاع"
            value={filters.sector}
            onChange={(value) => updateFilter("sector", value)}
            options={optionSets.sectors}
          />

          <FilterField
            label="حالة الموظف"
            value={filters.status}
            onChange={(value) => updateFilter("status", value)}
            options={optionSets.statuses}
          />
          <FilterField
            label="تاريخ التعيين من"
            value={filters.hireFrom}
            onChange={(value) => updateFilter("hireFrom", value)}
            type="date"
          />
          <FilterField
            label="تاريخ التعيين إلى"
            value={filters.hireTo}
            onChange={(value) => updateFilter("hireTo", value)}
            type="date"
          />
          <FilterField
            label="تاريخ المباشرة من"
            value={filters.startFrom}
            onChange={(value) => updateFilter("startFrom", value)}
            type="date"
          />
          <FilterField
            label="تاريخ المباشرة إلى"
            value={filters.startTo}
            onChange={(value) => updateFilter("startTo", value)}
            type="date"
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="submit"
            className="flex min-w-32 items-center justify-center gap-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] px-8 py-2.5 text-xs font-black text-white shadow-xs transition cursor-pointer"
          >
            بحث
            <MaterialIcon name="search" size={17} />
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3" dir="rtl">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={globalSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="ابحث في النتائج..."
              disabled={!appliedFilters}
              className="h-9 w-60 rounded-xl border border-input bg-background ps-9 pe-3 text-[12px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted/50"
            />
            <MaterialIcon
              name="search"
              size={17}
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
            />
          </div>
          {appliedFilters && (
            <span className="text-xs font-mono font-bold text-muted-foreground">
              ({visibleRows.length} موظف)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={printResults}
            disabled={!appliedFilters || visibleRows.length === 0}
            title="تصدير PDF / طباعة"
            className="grid size-9 place-items-center rounded-xl border border-input bg-background text-foreground shadow-2xs hover:bg-muted transition cursor-pointer disabled:opacity-40"
          >
            <MaterialIcon name="print" size={18} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!appliedFilters || visibleRows.length === 0}
            title="تصدير Excel"
            className="grid size-9 place-items-center rounded-xl border border-input bg-background text-foreground shadow-2xs hover:bg-muted transition cursor-pointer disabled:opacity-40"
          >
            <MaterialIcon name="table_view" size={18} />
          </button>
          <button
            type="button"
            onClick={exportJson}
            disabled={!appliedFilters || visibleRows.length === 0}
            title="تصدير البيانات JSON"
            className="grid size-9 place-items-center rounded-xl border border-input bg-background text-foreground shadow-2xs hover:bg-muted transition cursor-pointer disabled:opacity-40"
          >
            <MaterialIcon name="database" size={18} />
          </button>
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1780px] border-collapse text-center text-[11px]">
            <thead>
              <tr className="bg-muted/60 text-foreground border-b border-border">
                {tableColumns.map((column) => (
                  <th
                    key={column.key}
                    className="h-10 whitespace-nowrap border-l border-border px-2 font-extrabold"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <MaterialIcon name="filter_alt" size={15} className="text-muted-foreground" />
                      {column.label}
                    </span>
                  </th>
                ))}
              </tr>
              <tr className="bg-card border-b border-border/80">
                {tableColumns.map((column) => (
                  <th key={column.key} className="h-9 border-l border-border/60 p-1">
                    {column.type !== "action" && (
                      <span className="relative block">
                        <input
                          type={column.type === "date" ? "date" : "text"}
                          value={columnFilters[column.key] ?? ""}
                          onChange={(event) => setColumnSearch(column.key, event.target.value)}
                          disabled={!appliedFilters}
                          className="h-7 w-full border-0 bg-transparent px-1 pe-6 text-[10px] font-normal outline-none disabled:bg-slate-50"
                        />
                        <MaterialIcon
                          name={column.type === "date" ? "calendar_month" : "search"}
                          size={13}
                          className="pointer-events-none absolute inset-y-0 left-1 my-auto h-fit text-slate-500"
                        />
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr>
                  <td colSpan={tableColumns.length} className="h-24 text-sm font-semibold text-red-600">
                    تعذر تحميل بيانات الموظفين
                  </td>
                </tr>
              ) : isLoading && appliedFilters ? (
                <tr>
                  <td colSpan={tableColumns.length} className="h-24 text-sm text-slate-500">
                    جاري تحميل البيانات...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length} className="h-24 text-sm text-slate-500">
                    No data
                  </td>
                </tr>
              ) : (
                pageRows.map((row, rowIndex) => (
                  <tr
                    key={String(row["id"] ?? row["emp_no"] ?? rowIndex)}
                    className="border-b border-border/60 transition-colors odd:bg-card even:bg-muted/25 hover:bg-primary/5"
                  >
                    {tableColumns.map((column) => (
                      <td key={column.key} className="h-10 whitespace-nowrap border-l border-border/60 px-2.5 text-foreground font-medium">
                        {column.key === "attendance" ? (
                          <button
                            type="button"
                            title="عرض الحضور والانصراف"
                            className="text-[#0b57d0] hover:text-[#0842a0] transition hover:scale-110 cursor-pointer"
                          >
                            <MaterialIcon name="schedule" size={17} />
                          </button>
                        ) : column.key === "financial" ? (
                          <Link
                            to="/payroll"
                            title="عرض البيانات المالية"
                            className="inline-flex text-[#0b57d0] hover:text-[#0842a0] transition hover:scale-110 cursor-pointer"
                          >
                            <MaterialIcon name="payments" size={17} />
                          </Link>
                        ) : column.key === "lifecycle" ? (
                          <button
                            type="button"
                            onClick={() => handleOpenLifecycle(row)}
                            title="تعديل الحالة التشغيلية (إنهاء الخدمة، إيقاف، تثبيت)"
                            className="inline-flex text-primary hover:text-primary/80 transition hover:scale-110 cursor-pointer p-1"
                          >
                            <MaterialIcon name="manage_accounts" size={18} />
                          </button>
                        ) : column.key === "status" ? (
                          (() => {
                            const st = String(row["status"] ?? row["employment_status"] ?? "نشط");
                            let badgeCls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
                            if (st.includes("تجربة") || st === "probation") badgeCls = "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
                            else if (st.includes("موقوف") || st === "suspended") badgeCls = "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300";
                            else if (st.includes("منتهي") || st === "terminated") badgeCls = "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
                            else if (st.includes("مستقيل") || st === "resigned") badgeCls = "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                            else if (st.includes("إجازة") || st === "on_leave") badgeCls = "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300";
                            return (
                              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold", badgeCls)}>
                                {st}
                              </span>
                            );
                          })()
                        ) : column.key === "emp_no" || column.key === "national_id" ? (
                          <span className="font-mono">{column.value(row) || "—"}</span>
                        ) : (
                          column.value(row) || "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage <= 1}
            className="grid size-8 place-items-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-30 cursor-pointer"
          >
            <MaterialIcon name="chevron_right" size={19} />
          </button>
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground font-mono font-bold shadow-2xs">
            {currentPage}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage >= totalPages}
            className="grid size-8 place-items-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-30 cursor-pointer"
          >
            <MaterialIcon name="chevron_left" size={19} />
          </button>
          <span className="font-mono text-muted-foreground me-2">
            صفحة {currentPage} من {totalPages} ({visibleRows.length} موظف)
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground me-1.5">لكل صفحة:</span>
          {[10, 25, 50, 100].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                setPageSize(size);
                setPage(1);
              }}
              className={cn(
                "grid size-8 place-items-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer",
                pageSize === size
                  ? "bg-secondary text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Lifecycle Transition Modal */}
      {isLifecycleModalOpen && selectedEmp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          dir="rtl"
        >
          <div className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <MaterialIcon name="manage_accounts" size={20} className="text-primary" />
                إدارة الحالة التشغيلية للموظف
              </h3>
              <button
                type="button"
                onClick={() => setIsLifecycleModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            {/* Employee summary */}
            <div className="mb-4 rounded-xl bg-muted/40 p-3 border border-border/80 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground">اسم الموظف:</span>
                <span className="font-bold text-foreground">{String(selectedEmp["full_name"] ?? "")}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted-foreground">الرقم الوظيفي:</span>
                <span className="font-mono font-bold text-primary">{String(selectedEmp["emp_no"] ?? "")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">الحالة الحالية:</span>
                <span className="font-bold text-foreground">
                  {String(selectedEmp["status"] ?? selectedEmp["employment_status"] ?? "نشط")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">الحالة المستهدفة *</span>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as any)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                >
                  <option value="active">نشط (على رأس العمل)</option>
                  <option value="probation">تحت التجربة</option>
                  <option value="suspended">موقوف عن العمل</option>
                  <option value="on_leave">في إجازة</option>
                  <option value="terminated">إنهاء خدمة (حفظ تاريخي)</option>
                  <option value="resigned">مستقيل (حفظ تاريخي)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">تاريخ السريان *</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                />
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-foreground">سبب تغيير الحالة *</span>
                <input
                  type="text"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  placeholder="مثال: انتهاء فترة التجربة بنجاح / انتهاء مدة العقد / قرار إداري"
                  className="h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                />
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-foreground">ملاحظات إضافية (اختياري)</span>
                <textarea
                  rows={2}
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                  placeholder="أي تفاصيل أو مراجع إدارية للقرار..."
                  className="w-full rounded-xl border border-input bg-background p-2 text-[12px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MaterialIcon name="verified_user" size={14} className="text-emerald-600" />
                يتم تسجيل التغيير في سجل الحركات التاريخية
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLifecycleModalOpen(false)}
                  className="px-4 h-9 rounded-xl border border-input text-foreground text-xs font-bold hover:bg-muted transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveTransition}
                  disabled={isSubmittingTransition}
                  className="px-5 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs transition disabled:opacity-50"
                >
                  {isSubmittingTransition ? "جاري الحفظ..." : "تطبيق الحالة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
