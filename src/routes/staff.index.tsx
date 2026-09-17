import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, type Row } from "@/lib/hr-db";
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

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

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
    </div>
  );
}
