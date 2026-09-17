import { MaterialIcon } from "@/components/MaterialIcon";
import type { GlobalFilters, DatePresetKey, EmployeeRecord } from "../types";
import { getActiveFilterCount } from "../services/analyticsData";

interface GlobalFilterBarProps {
  filters: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
  onReset: () => void;
  employees: EmployeeRecord[];
}

const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "this_week", label: "هذا الأسبوع" },
  { key: "last_week", label: "الأسبوع السابق" },
  { key: "this_month", label: "هذا الشهر" },
  { key: "last_month", label: "الشهر السابق" },
  { key: "this_year", label: "هذا العام" },
  { key: "custom", label: "مخصص" },
];

export function GlobalFilterBar({
  filters,
  onChange,
  onReset,
  employees,
}: GlobalFilterBarProps) {
  const activeCount = getActiveFilterCount(filters);

  // Extract unique options dynamically from actual data
  const branches = Array.from(new Set(employees.map((e) => e.branch).filter(Boolean))) as string[];
  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))) as string[];
  const sectors = Array.from(new Set(employees.map((e) => e.sector).filter(Boolean))) as string[];
  const nationalities = Array.from(new Set(employees.map((e) => e.nationality).filter(Boolean))) as string[];
  const jobLevels = Array.from(new Set(employees.map((e) => e.job_level).filter(Boolean))) as string[];
  const jobCategories = Array.from(new Set(employees.map((e) => e.job_category).filter(Boolean))) as string[];

  const handleDatePresetChange = (preset: DatePresetKey) => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    let from = filters.fromDate;
    let to = iso(today);

    if (preset === "today") {
      from = iso(today);
      to = iso(today);
    } else if (preset === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      from = iso(y);
      to = iso(y);
    } else if (preset === "this_week") {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      from = iso(w);
      to = iso(today);
    } else if (preset === "last_week") {
      const w1 = new Date(today);
      w1.setDate(w1.getDate() - 14);
      const w2 = new Date(today);
      w2.setDate(w2.getDate() - 7);
      from = iso(w1);
      to = iso(w2);
    } else if (preset === "this_month") {
      const m = new Date(today);
      m.setDate(m.getDate() - 30);
      from = iso(m);
      to = iso(today);
    } else if (preset === "last_month") {
      const m1 = new Date(today);
      m1.setDate(m1.getDate() - 60);
      const m2 = new Date(today);
      m2.setDate(m2.getDate() - 30);
      from = iso(m1);
      to = iso(m2);
    } else if (preset === "this_year") {
      const yr = new Date(today);
      yr.setDate(yr.getDate() - 365);
      from = iso(yr);
      to = iso(today);
    }

    onChange({
      ...filters,
      datePreset: preset,
      fromDate: from,
      toDate: to,
    });
  };

  const selectClasses =
    "h-9 rounded-full border border-slate-200/90 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:border-[#0b57d0] focus:border-[#0b57d0] focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200";

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
      {/* Top row: Filter selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 pe-2 font-black text-xs text-slate-800 dark:text-slate-200 border-e border-slate-200 dark:border-slate-800">
            <MaterialIcon name="filter_alt" size={19} className="text-[#0b57d0]" filled />
            <span>الفلاتر الشاملة</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-[#0b57d0] px-2 py-0.5 text-[10.5px] font-black text-white">
                {activeCount}
              </span>
            )}
          </div>

          {/* Branch Filter */}
          <select
            value={filters.branch}
            onChange={(e) => onChange({ ...filters, branch: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع الفروع</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={filters.department}
            onChange={(e) => onChange({ ...filters, department: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع الأقسام</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Sector Filter */}
          <select
            value={filters.sector}
            onChange={(e) => onChange({ ...filters, sector: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع القطاعات</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Employment Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className={selectClasses}
          >
            <option value="all">كل الحالات الوظيفية</option>
            <option value="نشط">الموظفون المفعلون (نشط)</option>
            <option value="موقوف">الموقوفون مؤقتاً</option>
            <option value="منتهي الخدمة">منتهي الخدمة / استقالة</option>
          </select>

          {/* Job Level Filter */}
          <select
            value={filters.jobLevel}
            onChange={(e) => onChange({ ...filters, jobLevel: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع المستويات الوظيفية</option>
            {jobLevels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {/* Job Category Filter */}
          <select
            value={filters.jobCategory}
            onChange={(e) => onChange({ ...filters, jobCategory: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع الفئات الوظيفية</option>
            {jobCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Nationality Filter */}
          <select
            value={filters.nationality}
            onChange={(e) => onChange({ ...filters, nationality: e.target.value })}
            className={selectClasses}
          >
            <option value="all">جميع الجنسيات</option>
            {nationalities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Reset button */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 transition"
          >
            <MaterialIcon name="restart_alt" size={16} />
            <span>إعادة تعيين ({activeCount})</span>
          </button>
        )}
      </div>

      {/* Bottom row: Date Presets & Custom Date Inputs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 pe-1">
            <MaterialIcon name="date_range" size={16} className="text-[#0b57d0]" />
            <span>فترة المؤشرات:</span>
          </span>
          {DATE_PRESETS.map((p) => {
            const on = filters.datePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handleDatePresetChange(p.key)}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${
                  on
                    ? "bg-[#0b57d0] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>من:</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", fromDate: e.target.value })
              }
              className="h-8 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>إلى:</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", toDate: e.target.value })
              }
              className="h-8 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
