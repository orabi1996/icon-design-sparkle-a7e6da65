import { MaterialIcon } from "@/components/MaterialIcon";
import type { GlobalFilters, DatePresetKey, EmployeeRecord } from "../types";
import { getActiveFilterCount, num } from "../services/analyticsData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const selectedLabel = options.find((o) => o.value === value)?.label || options[0]?.label;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`h-9 w-auto min-w-[130px] rounded-2xl border px-3 text-xs font-bold transition-all shadow-2xs gap-1.5 focus:ring-1 focus:ring-primary ${
          isSelected
            ? "border-primary bg-primary/10 text-primary dark:bg-primary/20 ring-1 ring-primary/30 font-black"
            : "border-border bg-card text-foreground hover:bg-accent/50"
        }`}
      >
        <MaterialIcon
          name={icon}
          size={16}
          className={isSelected ? "text-primary" : "text-muted-foreground"}
          filled={isSelected}
        />
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent dir="rtl" className="max-h-64 rounded-2xl shadow-xl">
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="text-xs font-bold cursor-pointer rounded-xl"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    <Card className="rounded-3xl border-border/80 bg-card p-4 md:p-5 shadow-xs space-y-3.5">
      {/* Top row: Filter selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Section Badge */}
          <div className="flex items-center gap-2 pe-3 font-black text-xs text-foreground border-e border-border">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
              <MaterialIcon name="tune" size={17} filled />
            </span>
            <span>الفلاتر الشاملة</span>
            {activeCount > 0 && (
              <Badge
                variant="default"
                className="px-2 py-0.5 text-[10.5px] font-black font-mono rounded-full"
              >
                {num(activeCount)}
              </Badge>
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
          <Button
            variant="destructive"
            size="sm"
            onClick={onReset}
            className="h-8 rounded-2xl text-xs font-bold gap-1.5 shadow-2xs cursor-pointer"
          >
            <MaterialIcon name="restart_alt" size={16} />
            <span>إعادة تعيين</span>
            <Badge
              variant="secondary"
              className="px-1.5 py-0 text-[10px] font-mono font-bold bg-white/20 text-white border-0"
            >
              {num(activeCount)}
            </Badge>
          </Button>
        )}
      </div>

      {/* Bottom row: Date Presets & Custom Date Inputs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/70">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-black text-muted-foreground pe-1">
            <MaterialIcon name="calendar_month" size={17} className="text-primary" />
            <span>فترة المؤشرات:</span>
          </span>

          {/* shadcn Tabs for Segmented Control */}
          <Tabs
            value={filters.datePreset}
            onValueChange={(val) => handleDatePresetChange(val as DatePresetKey)}
          >
            <TabsList className="h-9 rounded-2xl bg-muted/80 p-1 border border-border/50">
              {DATE_PRESETS.map((p) => (
                <TabsTrigger
                  key={p.key}
                  value={p.key}
                  className="rounded-xl px-3 py-1 text-xs font-bold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs font-bold cursor-pointer"
                >
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-1 shadow-2xs">
          <MaterialIcon name="date_range" size={16} className="text-primary" />
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <span>من:</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", fromDate: e.target.value })
              }
              className="bg-transparent font-mono font-bold text-xs text-foreground focus:outline-none"
            />
          </label>
          <span className="text-border">|</span>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <span>إلى:</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: "custom", toDate: e.target.value })
              }
              className="bg-transparent font-mono font-bold text-xs text-foreground focus:outline-none"
            />
          </label>
        </div>
      </div>
    </Card>
  );
}
