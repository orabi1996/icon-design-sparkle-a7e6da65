import { MaterialIcon } from "@/components/MaterialIcon";
import type { GlobalFilters, DatePresetKey, EmployeeRecord } from "../types";
import { getActiveFilterCount, num } from "../services/analyticsData";

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

function FilterDropdown({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  icon: string;
}) {
  const isSelected = value !== "all";
  return (
    <div className="relative inline-flex items-center">
      <div
        className={`flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition-all shadow-2xs ${
          isSelected
            ? "border-[#0b57d0] bg-blue-50/90 text-[#0b57d0] dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-[#0b57d0]/30"
            : "border-slate-200/90 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300"
        }`}
      >
        <MaterialIcon
          name={icon}
          size={16}
          className={isSelected ? "text-[#0b57d0] dark:text-blue-400" : "text-slate-400"}
          filled={isSelected}
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent pr-1 pl-5 text-xs font-bold text-inherit focus:outline-none"
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <MaterialIcon
          name="expand_more"
          size={16}
          className="pointer-events-none absolute left-2 text-slate-400"
        />
      </div>
    </div>
  );
}

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

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-4 md:p-5 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)] dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
      {/* Top row: Filter selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Section Badge */}
          <div className="flex items-center gap-2 pe-3 font-black text-xs text-slate-800 dark:text-slate-200 border-e border-slate-200 dark:border-slate-800">
            <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-[#0b57d0] dark:bg-blue-950/60 dark:text-blue-400">
              <MaterialIcon name="tune" size={17} filled />
            </span>
            <span>الفلاتر الشاملة</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-[#0b57d0] px-2 py-0.5 text-[10.5px] font-black font-mono text-white">
                {num(activeCount)}
              </span>
            )}
          </div>

          {/* Branch Filter */}
          <FilterDropdown
            value={filters.branch}
            onChange={(val) => onChange({ ...filters, branch: val })}
            icon="storefront"
            options={[
              { value: "all", label: "جميع الفروع" },
              ...branches.map((b) => ({ value: b, label: b })),
            ]}
          />

          {/* Department Filter */}
          <FilterDropdown
            value={filters.department}
            onChange={(val) => onChange({ ...filters, department: val })}
            icon="domain"
            options={[
              { value: "all", label: "جميع الأقسام" },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
          />

          {/* Sector Filter */}
          <FilterDropdown
            value={filters.sector}
            onChange={(val) => onChange({ ...filters, sector: val })}
            icon="corporate_fare"
            options={[
              { value: "all", label: "جميع القطاعات" },
              ...sectors.map((s) => ({ value: s, label: s })),
            ]}
          />

          {/* Employment Status Filter */}
          <FilterDropdown
            value={filters.status}
            onChange={(val) => onChange({ ...filters, status: val })}
            icon="badge"
            options={[
              { value: "all", label: "كل الحالات الوظيفية" },
              { value: "نشط", label: "الموظفون المفعلون (نشط)" },
              { value: "موقوف", label: "الموقوفون مؤقتاً" },
              { value: "منتهي الخدمة", label: "منتهي الخدمة / استقالة" },
            ]}
          />

          {/* Job Level Filter */}
          <FilterDropdown
            value={filters.jobLevel}
            onChange={(val) => onChange({ ...filters, jobLevel: val })}
            icon="leaderboard"
            options={[
              { value: "all", label: "جميع المستويات الوظيفية" },
              ...jobLevels.map((l) => ({ value: l, label: l })),
            ]}
          />

          {/* Job Category Filter */}
          <FilterDropdown
            value={filters.jobCategory}
            onChange={(val) => onChange({ ...filters, jobCategory: val })}
            icon="category"
            options={[
              { value: "all", label: "جميع الفئات الوظيفية" },
              ...jobCategories.map((c) => ({ value: c, label: c })),
            ]}
          />

          {/* Nationality Filter */}
          <FilterDropdown
            value={filters.nationality}
            onChange={(val) => onChange({ ...filters, nationality: val })}
            icon="public"
            options={[
              { value: "all", label: "جميع الجنسيات" },
              ...nationalities.map((n) => ({ value: n, label: n })),
            ]}
          />
        </div>

        {/* Reset button */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50/90 px-3.5 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300 transition shadow-2xs cursor-pointer"
          >
            <MaterialIcon name="restart_alt" size={16} />
            <span>إعادة تعيين ({num(activeCount)})</span>
          </button>
        )}
      </div>

      {/* Bottom row: Date Presets & Custom Date Inputs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300 pe-1">
            <MaterialIcon name="calendar_month" size={17} className="text-[#0b57d0]" />
            <span>فترة المؤشرات:</span>
          </span>

          {/* Segmented Control Pill Track */}
          <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/70 border border-slate-200/50 dark:border-slate-700/50">
            {DATE_PRESETS.map((p) => {
              const on = filters.datePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleDatePresetChange(p.key)}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                    on
                      ? "bg-white text-[#0b57d0] shadow-2xs dark:bg-slate-900 dark:text-blue-400 font-black ring-1 ring-black/5"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 px-3 py-1 dark:border-slate-800 dark:bg-slate-800/60 shadow-2xs">
          <MaterialIcon name="date_range" size={16} className="text-[#0b57d0]" />
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>من:</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", fromDate: e.target.value })
              }
              className="bg-transparent font-mono font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </label>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>إلى:</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", toDate: e.target.value })
              }
              className="bg-transparent font-mono font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
