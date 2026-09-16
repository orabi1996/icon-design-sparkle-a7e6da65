import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, Btn, Chip } from "@/components/hr/ui";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, type Row } from "@/lib/hr-db";
import { useCurrentIsAdmin } from "@/lib/permissions-db";

export const Route = createFileRoute("/reports/fingerprint")({
  head: () => ({
    meta: [
      { title: "تقرير بصمة الموظف | نظام الموارد البشرية" },
      {
        name: "description",
        content:
          "تقرير تفصيلي لبصمات الموظفين اليومية مع فلاتر التاريخ والبحث في كل عمود وتصدير للبيانات.",
      },
      { property: "og:title", content: "تقرير بصمة الموظف" },
      {
        property: "og:description",
        content:
          "قائمة بصمات الموظفين الخام مع الفلاتر والبحث لكل عمود وإمكانية التصدير.",
      },
    ],
  }),
  component: FingerprintReportPage,
});

const control =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25";

const STATUS_OPTIONS = [
  "بصمة حضور صباحي",
  "بصمة إنصراف صباحي",
  "بصمة حضور مسائي",
  "بصمة إنصراف مسائي",
  "بصمة راحة",
];

const STATUS_TONE: Record<string, "green" | "amber" | "muted" | "blue" | "teal"> = {
  "بصمة حضور صباحي": "green",
  "بصمة إنصراف صباحي": "amber",
  "بصمة حضور مسائي": "blue",
  "بصمة إنصراف مسائي": "muted",
  "بصمة راحة": "teal",
};

/** Format date as YYYY-MM-DD */
function fmtDate(v: unknown) {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 10);
  } catch {
    return s;
  }
}

/** Format time as HH:MM:SS (24h) */
function fmtTime(v: unknown) {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{2}:\d{2}(:\d{2})?/.test(s)) return s.length >= 8 ? s.slice(0, 8) : s + ":00";
  try {
    const d = new Date(`1970-01-01T${s}`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(11, 19);
  } catch {
    /* fall through */
  }
  return s;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function firstOfYear() {
  return `${new Date().getFullYear() - 1}-01-01`;
}

/* --------------------------------- CSV --------------------------------- */
function escapeCsv(v: unknown) {
  let raw = String(v ?? "");
  // Quoting alone does not stop spreadsheet formula execution in downloaded CSVs.
  if (/^(?:\s*[=+@-]|[\t\r\n])/.test(raw)) raw = `'${raw}`;
  raw = raw.replaceAll('"', '""');
  return `"${raw}"`;
}
function exportCsv(rows: Row[]) {
  const header = [
    "الرقم الوظيفي",
    "اسم الموظف",
    "الفرع",
    "القسم",
    "التاريخ",
    "وقت البصمة",
    "حالة البصمة",
    "اسم جهاز البصمة",
    "اسم الموقع",
  ];
  const body = rows.map((r) => [
    r["emp_no"] ?? "",
    r["employee_name"] ?? "",
    r["branch"] ?? "",
    r["department"] ?? "",
    fmtDate(r["punch_date"]),
    fmtTime(r["punch_time"]),
    r["punch_status"] ?? "",
    r["device_name"] ?? "",
    r["location_name"] ?? "",
  ]);
  const csv = `\uFEFF${[header, ...body].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `fingerprint-report-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("تم تصدير التقرير");
}

/* ================================ Page ================================ */

type ColKey =
  | "emp_no"
  | "employee_name"
  | "branch"
  | "department"
  | "punch_date"
  | "punch_time"
  | "punch_status"
  | "device_name"
  | "location_name";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "emp_no",         label: "الرقم الوظيفي" },
  { key: "employee_name",  label: "اسم الموظف" },
  { key: "branch",         label: "الفرع" },
  { key: "department",     label: "القسم" },
  { key: "punch_date",     label: "التاريخ" },
  { key: "punch_time",     label: "وقت البصمة" },
  { key: "punch_status",   label: "حالة البصمة" },
  { key: "device_name",    label: "اسم جهاز البصمة" },
  { key: "location_name",  label: "اسم الموقع" },
];

function FingerprintReportPage() {
  const admin = useCurrentIsAdmin();
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(todayISO());
  const [applied, setApplied] = useState({ from, to });
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [colFilters, setColFilters] = useState<Record<ColKey, string>>({
    emp_no: "",
    employee_name: "",
    branch: "",
    department: "",
    punch_date: "",
    punch_time: "",
    punch_status: "",
    device_name: "",
    location_name: "",
  });

  const {
    data: rows = [],
    isLoading,
    error: recordsError,
  } = useRows("fingerprint_records", {
    orderBy: "punch_date",
    from: applied.from,
    to: applied.to,
    rangeColumn: "punch_date",
  });

  const filtered = useMemo(() => {
    const t = term.trim();
    return rows.filter((r) => {
      for (const c of COLUMNS) {
        const f = colFilters[c.key];
        if (!f) continue;
        const raw =
          c.key === "punch_date"
            ? fmtDate(r[c.key])
            : c.key === "punch_time"
              ? fmtTime(r[c.key])
              : String(r[c.key] ?? "");
        if (!raw.includes(f)) return false;
      }
      if (!t) return true;
      return COLUMNS.some((c) => String(r[c.key] ?? "").includes(t));
    });
  }, [rows, term, colFilters]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const search = () => {
    if (from > to) {
      toast.error("تاريخ البداية بعد تاريخ النهاية");
      return;
    }
    setApplied({ from, to });
    setPage(1);
  };

  const dateInvalid = from > to;

  if (admin.isLoading || admin.isError || !admin.data || recordsError) {
    const message = admin.isLoading ? "جارٍ التحقق من صلاحية التقرير..." : admin.isError || recordsError
      ? "تعذّر فتح سجلات البصمة. أعد المحاولة أو تواصل مع مسؤول النظام."
      : "سجلات البصمة الخام متاحة لمسؤول الصلاحيات فقط. اطلب منه مراجعة التقرير إذا لزم الأمر.";
    return <AppShell><div className="mt-3"><Breadcrumbs trail={["التقارير", "تقارير البصمة", "تقرير بصمة الموظف"]} /></div>
      <h1 className="mt-3 text-lg font-extrabold">تقرير بصمة الموظف</h1>
      <p role={admin.isLoading ? "status" : "alert"} className="mt-4 rounded-xl border border-border bg-card p-5 text-sm font-semibold">{message}</p>
    </AppShell>;
  }

  return (
    <AppShell>
      <div className="mt-3">
        <Breadcrumbs trail={["التقارير", "تقارير البصمة", "تقرير بصمة الموظف"]} />
      </div>

      <h1 className="mt-3 flex items-center gap-2 text-lg font-extrabold text-foreground">
        <MaterialIcon name="fingerprint" size={22} className="text-primary" filled />
        تقرير بصمة الموظف
      </h1>

      {/* Date filters card */}
      <div className="mt-3 rounded-2xl border border-border bg-secondary/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-1.5 block text-[12px] font-bold text-foreground/80">
              التاريخ من
            </span>
            <div className="relative">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={control}
              />
              <MaterialIcon
                name="calendar_month"
                size={17}
                className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
              />
            </div>
          </label>
          <label>
            <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-foreground/80">
              التاريخ إلى
              {dateInvalid && (
                <span className="ms-auto inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <MaterialIcon name="warning_amber" size={14} />
                  تاريخ غير صالح
                </span>
              )}
            </span>
            <div className="relative">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${control} ${
                  dateInvalid ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200" : ""
                }`}
              />
              <MaterialIcon
                name="calendar_month"
                size={17}
                className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
              />
            </div>
          </label>
          <div className="self-end">
            <Btn icon="search" onClick={search}>
              بحث
            </Btn>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="mt-3 overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="me-auto flex items-center gap-2 text-sm font-bold">
            <MaterialIcon name="table_rows" size={19} className="text-primary" filled />
            سجلات البصمة
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {filtered.length}
            </span>
          </h2>
          <div className="relative">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="بحث"
              className={`${control} h-9 w-56 pe-9`}
            />
            <MaterialIcon
              name="search"
              size={17}
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
            />
          </div>
          {[
            { icon: "picture_as_pdf", label: "PDF", onClick: () => window.print() },
            { icon: "table_view",     label: "Excel/CSV", onClick: () => exportCsv(filtered) },
            { icon: "print",          label: "طباعة", onClick: () => window.print() },
          ].map((b) => (
            <button
              key={b.label}
              title={b.label}
              onClick={b.onClick}
              className="grid size-9 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <MaterialIcon name={b.icon} size={17} />
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-right">
            <thead>
              <tr className="bg-topbar text-topbar-foreground">
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="whitespace-nowrap px-4 py-3 text-[12.5px] font-extrabold"
                  >
                    <span className="flex items-center gap-1.5">
                      {c.label}
                      <MaterialIcon name="expand_more" size={16} className="text-white/85" />
                    </span>
                  </th>
                ))}
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
              </tr>
            </thead>

            <tbody>
              {(isLoading || pageRows.length === 0) && (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-14 text-center text-sm font-semibold text-muted-foreground"
                  >
                    {isLoading ? "جارٍ تحميل السجلات..." : "لا توجد بيانات مطابقة"}
                  </td>
                </tr>
              )}

              {pageRows.map((r) => (
                <tr
                  key={String(r["id"])}
                  className="border-b border-border transition-colors last:border-0 odd:bg-secondary/30 hover:bg-accent/40"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] font-bold text-primary">
                    {String(r["emp_no"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold">
                    {String(r["employee_name"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">
                    {String(r["branch"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">
                    {String(r["department"] ?? "—")}
                  </td>
                  <td
                    dir="ltr"
                    className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-[12.5px]"
                  >
                    {fmtDate(r["punch_date"])}
                  </td>
                  <td
                    dir="ltr"
                    className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-[12.5px] font-bold"
                  >
                    {fmtTime(r["punch_time"])}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Chip
                      label={String(r["punch_status"] ?? "—")}
                      tone={STATUS_TONE[String(r["punch_status"])] ?? "muted"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground">
                    {String(r["device_name"] ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground">
                    {String(r["location_name"] ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[12px] font-bold">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <MaterialIcon name="chevron_right" size={18} />
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const base = Math.max(1, Math.min(currentPage - 2, pages - 4));
              const n = base + i;
              return n <= pages ? (
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
              ) : null;
            })}
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={currentPage >= pages}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <MaterialIcon name="chevron_left" size={18} />
            </button>
            <span
              dir="ltr"
              className="ms-2 font-mono text-[12px] font-semibold text-muted-foreground"
            >
              Page {currentPage} of {pages}
            </span>
            <span className="ms-2 text-muted-foreground">({filtered.length} عنصر)</span>
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

    </AppShell>
  );
}
