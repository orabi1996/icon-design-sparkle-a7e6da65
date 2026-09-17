/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Breadcrumbs, PageBanner } from "@/components/hr/ui";
import { useRows, useSaveRow, useDeleteRow } from "@/lib/hr-db";

export interface ShiftRow {
  id: string;
  name: string;
  branch?: string | null;
  work_days?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number | null;
  grace_minutes?: number | null;
  active?: boolean | null;
  notes?: string | null;
  shift_type?: string | null;
  punch_mode?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EmployeeRow {
  id: string;
  emp_no?: string | null;
  full_name?: string | null;
  department?: string | null;
  branch?: string | null;
  shift_name?: string | null;
}

export interface AttendanceRow {
  id: string;
  employee_name?: string | null;
  work_date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  late_minutes?: number | null;
}

export const Route = createFileRoute("/regulations/shifts")({
  head: () => ({
    meta: [
      { title: "تهيئة جداول الدوام والورديات | نظام الموارد البشرية" },
      {
        name: "description",
        content:
          "تهيئة شاملة لمكتبة الشفتات والورديات، قوالب أيام العمل، أنماط التكرار التناوبية، تسكين الموظفين، لوحة تخطيط الجداول المرئية، وسجلات الحضور والانصراف.",
      },
      { property: "og:title", content: "تهيئة جداول الدوام والورديات" },
      {
        property: "og:description",
        content: "نظام إدارة وجدولة وتسكين الشفتات والورديات المتوافق مع نظام العمل السعودي بهوية Material 3.",
      },
    ],
  }),
  component: WorkSchedulesAndShiftsHub,
});

// Western Arabic digits helper (0-9)
const num = (v: number | string) => String(v);

export type TabKey =
  | "library"
  | "templates"
  | "patterns"
  | "bindings"
  | "roster"
  | "import"
  | "policies"
  | "records";

export interface TabItem {
  key: TabKey;
  label: string;
  icon: string;
  badge?: string;
}

// Tabs definition
const TABS: readonly TabItem[] = [
  { key: "library", label: "مكتبة الشفتات والورديات", icon: "schedule", badge: "ورديات" },
  { key: "templates", label: "قوالب أيام العمل", icon: "view_day" },
  { key: "patterns", label: "أنماط ودورات التكرار", icon: "cycle" },
  { key: "bindings", label: "تسكين وربط الموظفين", icon: "group_add" },
  { key: "roster", label: "لوحة تخطيط الجداول المرئية", icon: "calendar_month", badge: "تفاعلي" },
  { key: "import", label: "الاستيراد والتسكين الجماعي", icon: "upload_file" },
  { key: "policies", label: "سياسات وضوابط الدوام", icon: "policy" },
  { key: "records", label: "سجلات الحضور والانصراف", icon: "how_to_reg" },
];

// Default preset templates
const DEFAULT_TEMPLATES = [
  { id: "tmpl-admin", code: "DAY-ADM", name: "دوام إداري كامل (8 ساعات)", type: "WORK", shiftName: "الدوام الإداري", periods: 1, site: "الفرع الرئيسي" },
  { id: "tmpl-morning", code: "DAY-MORN", name: "وردية صباحية (8 ساعات)", type: "WORK", shiftName: "دوام الورديات الصباحية", periods: 1, site: "فرع جدة" },
  { id: "tmpl-evening", code: "DAY-EVE", name: "وردية مسائية (8 ساعات)", type: "WORK", shiftName: "دوام الورديات المسائية", periods: 1, site: "فرع جدة" },
  { id: "tmpl-night", code: "DAY-NGHT", name: "وردية ليلية (+1 يوم)", type: "WORK", shiftName: "وردية ليلية متداخلة", periods: 1, site: "الفرع الرئيسي" },
  { id: "tmpl-split", code: "DAY-SPLT", name: "وردية مقسومة (فترتان)", type: "WORK", shiftName: "دوام مقسوم صباحي/مسائي", periods: 2, site: "الفرع الرئيسي" },
  { id: "tmpl-off", code: "DAY-OFF", name: "يوم راحة أسبوعية", type: "OFF", shiftName: "راحة أسبوعية", periods: 0, site: "—" },
  { id: "tmpl-holiday", code: "DAY-HLD", name: "عطلة رسمية / إجازة", type: "HOLIDAY", shiftName: "عطلة رسمية", periods: 0, site: "—" },
];

// Default preset patterns
const DEFAULT_PATTERNS = [
  { id: "pat-admin", code: "PAT-ADM", name: "أسبوعي إداري (الأحد - الخميس)", type: "weekly", anchor: "2026-01-01", workDays: 5, offDays: 2, desc: "5 أيام عمل من الأحد إلى الخميس، والجمعة والسبت راحة" },
  { id: "pat-rot-3", code: "PAT-ROT3", name: "دورة تناوب ورديات ثلاثية (24/7)", type: "rotating", anchor: "2026-09-01", workDays: 6, offDays: 2, desc: "2 صباحي + 2 مسائي + 2 ليلي تليها يومين راحة تتابعية" },
  { id: "pat-rot-42", code: "PAT-4X2", name: "دورة 4 أيام عمل + 2 راحة", type: "rotating", anchor: "2026-09-01", workDays: 4, offDays: 2, desc: "دورة متصلة 4 أيام دوام ثم يومين راحة تتابعية مستمرة" },
  { id: "pat-6days", code: "PAT-6D", name: "دوام 6 أيام (السبت - الخميس)", type: "weekly", anchor: "2026-01-01", workDays: 6, offDays: 1, desc: "6 أيام عمل أسبوعياً والجمعة يوم راحة أسبوعية" },
];

// Default scheduling policies
const DEFAULT_POLICIES = {
  maxDailyHours: 8,
  maxWeeklyHours: 48,
  minRestHours: 11,
  graceMinutes: 15,
  ramadanHours: 6,
  splitMinGapHours: 2,
  overtimeThresholdMinutes: 30,
  preventSelfApproval: true,
  strictShiftOverlapBlock: true,
};

function WorkSchedulesAndShiftsHub() {
  // Query param sync
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("tab") as TabKey;
      if (TABS.some((t) => t.key === q)) return q;
    }
    return "library";
  });

  // Load shifts from Supabase work_shift_groups
  const shiftsQuery = useRows("work_shift_groups", { orderBy: "name", ascending: true });
  const shifts = (shiftsQuery.data ?? []) as unknown as ShiftRow[];

  // Load employees from Supabase
  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const employees = (employeesQuery.data ?? []) as unknown as EmployeeRow[];

  // Load attendance records
  const attendanceQuery = useRows("attendance_records", { orderBy: "work_date", ascending: false });
  const attendance = (attendanceQuery.data ?? []) as unknown as AttendanceRow[];

  // Mutations for work_shift_groups
  const saveShift = useSaveRow("work_shift_groups");
  const deleteShift = useDeleteRow("work_shift_groups");

  // Local & App Settings State for Rosters and Setup
  const [templates, setTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem("hrms_shifts_templates");
      return saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;
    } catch {
      return DEFAULT_TEMPLATES;
    }
  });

  const [patterns, setPatterns] = useState(() => {
    try {
      const saved = localStorage.getItem("hrms_shifts_patterns");
      return saved ? JSON.parse(saved) : DEFAULT_PATTERNS;
    } catch {
      return DEFAULT_PATTERNS;
    }
  });

  const [policies, setPolicies] = useState(() => {
    try {
      const saved = localStorage.getItem("hrms_shifts_policies");
      return saved ? JSON.parse(saved) : DEFAULT_POLICIES;
    } catch {
      return DEFAULT_POLICIES;
    }
  });

  // Assignments / Roster State: key is `empId:YYYY-MM-DD` -> shift object
  const [rosterAssignments, setRosterAssignments] = useState<Record<string, { shiftName: string; code: string; color: string; hours: number; isNight?: boolean; isOff?: boolean }>>(() => {
    try {
      const saved = localStorage.getItem("hrms_roster_assignments");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("hrms_shifts_templates", JSON.stringify(templates));
    } catch {}
  }, [templates]);

  useEffect(() => {
    try {
      localStorage.setItem("hrms_shifts_patterns", JSON.stringify(patterns));
    } catch {}
  }, [patterns]);

  useEffect(() => {
    try {
      localStorage.setItem("hrms_shifts_policies", JSON.stringify(policies));
    } catch {}
  }, [policies]);

  useEffect(() => {
    try {
      localStorage.setItem("hrms_roster_assignments", JSON.stringify(rosterAssignments));
    } catch {}
  }, [rosterAssignments]);

  // Handle URL change
  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div className="mt-4 space-y-6">
      <Breadcrumbs trail={["اللوائح والتهيئة", "الدوام", "تهيئة جداول الدوام والورديات"]} />

      <PageBanner
        icon="calendar_month"
        title="تهيئة جداول الدوام والورديات"
        subtitle="إدارة وتسكين شفتات العمل، قوالب الأيام، الدورات التناوبية، لوحة الجداول المرئية، وسجلات الحضور"
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{num(shifts.length)} ورديات معتمدة</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
              <MaterialIcon name="group" size={16} />
              <span>{num(employees.length)} موظف</span>
            </span>
          </div>
        }
      />

      {/* Google Material Design 3 Navigation Tabs */}
      <div
        className="flex flex-wrap gap-1.5 rounded-3xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_3px_0_rgba(60,64,67,0.08),0_4px_12px_0_rgba(60,64,67,0.06)]"
      >
        {TABS.map((t) => {
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTabChange(t.key)}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold transition-all duration-200 ${
                on
                  ? "bg-[#0b57d0] text-white shadow-[0_2px_8px_0_rgba(11,87,208,0.35)] scale-[1.02]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <MaterialIcon name={t.icon} size={18} filled={on} />
              <span>{t.label}</span>
              {t.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    on ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {t.badge === "ورديات" ? num(shifts.length) : t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "library" && (
        <ShiftsLibraryTab
          shifts={shifts}
          onInsert={async (row) => {
            await saveShift.mutateAsync(row);
          }}
          onUpdate={async (id, row) => {
            await saveShift.mutateAsync({ id, ...row });
          }}
          onDelete={async (id) => {
            if (confirm("هل أنت متأكد من حذف هذه الوردية؟")) {
              await deleteShift.mutateAsync(id);
            }
          }}
        />
      )}

      {activeTab === "templates" && (
        <WorkdayTemplatesTab
          templates={templates}
          shifts={shifts}
          onSave={(updated) => {
            setTemplates(updated);
            toast.success("تم حفظ قوالب أيام العمل بنجاح");
          }}
        />
      )}

      {activeTab === "patterns" && (
        <RecurringPatternsTab
          patterns={patterns}
          templates={templates}
          onSave={(updated) => {
            setPatterns(updated);
            toast.success("تم تحديث دورات وأنماط العمل بنجاح");
          }}
        />
      )}

      {activeTab === "bindings" && (
        <EmployeeBindingsTab
          employees={employees}
          patterns={patterns}
          shifts={shifts}
        />
      )}

      {activeTab === "roster" && (
        <VisualRosterGridTab
          employees={employees}
          shifts={shifts}
          patterns={patterns}
          assignments={rosterAssignments}
          onUpdateAssignments={(next) => {
            setRosterAssignments(next);
            toast.success("تم تحديث جدول الدوام بنجاح");
          }}
        />
      )}

      {activeTab === "import" && (
        <BulkImportTab
          employees={employees}
          shifts={shifts}
          onApplyAssignments={(newAssignments) => {
            setRosterAssignments((prev) => ({ ...prev, ...newAssignments }));
            toast.success("تم استيراد وتسكين ملف الجدول بنجاح في النظام");
            setActiveTab("roster");
          }}
        />
      )}

      {activeTab === "policies" && (
        <SchedulingPoliciesTab
          policies={policies}
          onSave={(p) => {
            setPolicies(p);
            toast.success("تم حفظ وتطبيق ضوابط وسياسات الدوام بنجاح");
          }}
        />
      )}

      {activeTab === "records" && (
        <AttendanceRecordsTab attendance={attendance} employees={employees} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. مكتبة الشفتات والورديات (Shifts Library Tab)
// ---------------------------------------------------------------------------
function ShiftsLibraryTab({
  shifts,
  onInsert,
  onUpdate,
  onDelete,
}: {
  shifts: ShiftRow[];
  onInsert: (row: Record<string, any>) => Promise<void>;
  onUpdate: (id: string, row: Record<string, any>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredShifts = useMemo(() => {
    if (!searchTerm.trim()) return shifts;
    const term = searchTerm.toLowerCase();
    return shifts.filter(
      (s) =>
        String(s.name ?? "").toLowerCase().includes(term) ||
        String(s.branch ?? "").toLowerCase().includes(term)
    );
  }, [shifts, searchTerm]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#e8f0fe] text-[#0b57d0]">
              <MaterialIcon name="schedule" size={22} filled />
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#0b57d0]">
              إجمالي
            </span>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">إجمالي الورديات المعرفة</p>
          <p className="text-2xl font-black text-slate-900">{num(shifts.length)}</p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#e6f4ea] text-[#137333]">
              <MaterialIcon name="check_circle" size={22} filled />
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-[#137333]">
              نشط
            </span>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">الورديات المفعلة للعمل</p>
          <p className="text-2xl font-black text-slate-900">
            {num(shifts.filter((s) => s.active !== false).length)}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#f3e8fd] text-[#6750a4]">
              <MaterialIcon name="bedtime" size={22} filled />
            </span>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-[#6750a4]">
              ليلي
            </span>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">الورديات الليلية / متداخلة</p>
          <p className="text-2xl font-black text-slate-900">
            {num(
              shifts.filter((s) => String(s.name ?? "").includes("ليل") || String(s.notes ?? "").includes("ليل")).length
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#fef7e0] text-[#b06000]">
              <MaterialIcon name="domain" size={22} filled />
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-[#b06000]">
              فروع
            </span>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">تغطية الفروع والمواقع</p>
          <p className="text-2xl font-black text-slate-900">
            {num(new Set(shifts.map((s) => s.branch).filter(Boolean)).size || 1)}
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">قائمة الشفتات والورديات</h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              تحديد أوقات الحضور والانصراف، فترات السماح والاستراحة، والربط بالمواقع
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <MaterialIcon
                name="search"
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="ابحث باسم الوردية أو الفرع..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-64 rounded-full border border-slate-200 bg-slate-50 pe-9 ps-4 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-[#0b57d0] focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingShift(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-full bg-[#0b57d0] px-5 h-10 text-xs font-extrabold text-white shadow-xs hover:bg-[#0842a0] transition-colors"
            >
              <MaterialIcon name="add" size={18} />
              <span>إضافة وردية جديدة</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-600 font-extrabold">
                <th className="py-3 px-4">اسم الوردية</th>
                <th className="py-3 px-4">الفرع</th>
                <th className="py-3 px-4">وقت الحضور</th>
                <th className="py-3 px-4">وقت الانصراف</th>
                <th className="py-3 px-4">أيام العمل</th>
                <th className="py-3 px-4">الراحة</th>
                <th className="py-3 px-4">السماح</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
              {filteredShifts.map((s) => {
                const isNight =
                  String(s.name ?? "").includes("ليل") ||
                  (s.start_time && s.end_time && s.start_time > s.end_time);
                return (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2.5 rounded-full ${
                            isNight ? "bg-purple-600" : "bg-[#0b57d0]"
                          }`}
                        />
                        <span>{s.name}</span>
                        {isNight && (
                          <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                            +1 يوم
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{s.branch || "جميع الفروع"}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {String(s.start_time ?? "08:00").slice(0, 5)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {String(s.end_time ?? "17:00").slice(0, 5)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{num(s.work_days ?? 5)} أيام</td>
                    <td className="py-3.5 px-4 text-slate-600">{num(s.break_minutes ?? 60)} د</td>
                    <td className="py-3.5 px-4 text-slate-600">{num(s.grace_minutes ?? 15)} د</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          s.active !== false
                            ? "bg-emerald-50 text-[#137333]"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            s.active !== false ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        {s.active !== false ? "مفعل" : "معطل"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingShift(s);
                            setModalOpen(true);
                          }}
                          className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-[#0b57d0] transition-colors"
                          title="تعديل الوردية"
                        >
                          <MaterialIcon name="edit" size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(s.id)}
                          className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="حذف الوردية"
                        >
                          <MaterialIcon name="delete" size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredShifts.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    لا توجد شفتات أو ورديات مسجلة تطابق البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <ShiftFormModal
          shift={editingShift}
          onClose={() => setModalOpen(false)}
          onSave={async (data) => {
            if (editingShift?.id) {
              await onUpdate(editingShift.id, data);
            } else {
              await onInsert(data);
            }
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ShiftFormModal({
  shift,
  onClose,
  onSave,
}: {
  shift: ShiftRow | null;
  onClose: () => void;
  onSave: (data: Record<string, any>) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    name: shift?.name ?? "",
    branch: shift?.branch ?? "الفرع الرئيسي",
    work_days: shift?.work_days ?? 5,
    start_time: shift?.start_time ? String(shift.start_time).slice(0, 5) : "08:00",
    end_time: shift?.end_time ? String(shift.end_time).slice(0, 5) : "17:00",
    break_minutes: shift?.break_minutes ?? 60,
    grace_minutes: shift?.grace_minutes ?? 15,
    active: shift?.active ?? true,
    notes: shift?.notes ?? "",
    shift_type: shift?.shift_type ?? "fixed",
    punch_mode: shift?.punch_mode ?? "pairs",
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("يرجى إدخال اسم الوردية");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...formData,
        start_time: formData.start_time.length === 5 ? `${formData.start_time}:00` : formData.start_time,
        end_time: formData.end_time.length === 5 ? `${formData.end_time}:00` : formData.end_time,
      });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء حفظ الوردية");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-[#e8f0fe] text-[#0b57d0]">
              <MaterialIcon name="schedule" size={20} filled />
            </span>
            <h3 className="text-sm font-black text-slate-900">
              {shift ? "تعديل بيانات الوردية" : "إضافة وردية دوام جديدة"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <MaterialIcon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs font-bold text-slate-700">
          <div>
            <label className="block mb-1">اسم الوردية *</label>
            <input
              type="text"
              required
              placeholder="مثال: الدوام الإداري، الوردية الصباحية، وردية الطوارئ"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">نوع الدوام</label>
              <select
                value={formData.shift_type}
                onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              >
                <option value="fixed">دوام ثابت (إداري)</option>
                <option value="morning">وردية صباحية</option>
                <option value="evening">وردية مسائية</option>
                <option value="night">وردية ليلية (+1 يوم)</option>
                <option value="split">دوام مقسوم (فترتان)</option>
                <option value="flex">دوام مرن</option>
                <option value="seasonal">دوام موسمي / رمضان</option>
              </select>
            </div>

            <div>
              <label className="block mb-1">الفرع / الموقع</label>
              <select
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              >
                <option value="الفرع الرئيسي">الفرع الرئيسي</option>
                <option value="فرع جدة">فرع جدة</option>
                <option value="فرع الدمام">فرع الدمام</option>
                <option value="جميع الفروع">جميع الفروع</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">وقت الحضور</label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              />
            </div>

            <div>
              <label className="block mb-1">وقت الانصراف</label>
              <input
                type="time"
                required
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block mb-1">أيام العمل الأسبوعية</label>
              <input
                type="number"
                min={1}
                max={7}
                value={formData.work_days}
                onChange={(e) => setFormData({ ...formData, work_days: Number(e.target.value) })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              />
            </div>

            <div>
              <label className="block mb-1">وقت الراحة (دقيقة)</label>
              <input
                type="number"
                min={0}
                max={180}
                value={formData.break_minutes}
                onChange={(e) => setFormData({ ...formData, break_minutes: Number(e.target.value) })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              />
            </div>

            <div>
              <label className="block mb-1">دقائق السماح</label>
              <input
                type="number"
                min={0}
                max={60}
                value={formData.grace_minutes}
                onChange={(e) => setFormData({ ...formData, grace_minutes: Number(e.target.value) })}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="size-4 accent-[#0b57d0] rounded"
              />
              <span>تفعيل الوردية للجدولة والتسكين</span>
            </label>
          </div>

          <div>
            <label className="block mb-1">ملاحظات إضافية</label>
            <input
              type="text"
              placeholder="مثال: خاصة بالأطباء المناوبين، أو دوام شهر رمضان"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-[#0b57d0] px-5 py-2 text-xs font-extrabold text-white hover:bg-[#0842a0] disabled:opacity-50"
            >
              <MaterialIcon name="save" size={17} />
              <span>{saving ? "جاري الحفظ..." : "حفظ الوردية"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. قوالب أيام العمل (Workday Templates Tab)
// ---------------------------------------------------------------------------
function WorkdayTemplatesTab({
  templates,
  shifts,
  onSave,
}: {
  templates: typeof DEFAULT_TEMPLATES;
  shifts: ShiftRow[];
  onSave: (updated: typeof DEFAULT_TEMPLATES) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">قوالب أيام العمل (Workday Templates)</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            تجميع الشفتات في قوالب يومية محددة (أيام عمل، راحة أسبوعية، شفتات مقسومة، عطل رسمية)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="rounded-2xl border border-slate-200/80 p-4 hover:shadow-xs transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-extrabold text-[#0b57d0] bg-blue-50 px-2 py-0.5 rounded-md">
                  {tmpl.code}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    tmpl.type === "WORK"
                      ? "bg-emerald-50 text-[#137333]"
                      : tmpl.type === "OFF"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-amber-50 text-[#b06000]"
                  }`}
                >
                  {tmpl.type === "WORK" ? "يوم عمل" : tmpl.type === "OFF" ? "راحة أسبوعية" : "عطلة"}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-black text-slate-900">{tmpl.name}</h3>
              <p className="mt-1 text-xs text-slate-500 font-semibold">
                الوردية المسندة: <span className="text-slate-800 font-bold">{tmpl.shiftName}</span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>الفترات: {num(tmpl.periods)}</span>
              <span>الموقع: {tmpl.site}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. أنماط ودورات التكرار (Recurring Patterns Tab)
// ---------------------------------------------------------------------------
function RecurringPatternsTab({
  patterns,
  templates,
  onSave,
}: {
  patterns: typeof DEFAULT_PATTERNS;
  templates: typeof DEFAULT_TEMPLATES;
  onSave: (updated: typeof DEFAULT_PATTERNS) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">أنماط ودورات العمل التناوبية</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            تعريف تسلسل تكرار الشفتات الأسبوعية والدورات التناوبية المستمرة مع التاريخ المرجعي
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patterns.map((pat) => (
          <div
            key={pat.id}
            className="rounded-2xl border border-slate-200/80 p-5 hover:shadow-xs transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-extrabold text-[#0b57d0] bg-blue-50 px-2.5 py-0.5 rounded-md">
                {pat.code}
              </span>
              <span className="rounded-full bg-purple-50 text-purple-700 px-2.5 py-0.5 text-[11px] font-bold">
                {pat.type === "weekly" ? "أسبوعي محدد" : "دورة تناوبية مستمرة"}
              </span>
            </div>

            <h3 className="text-sm font-black text-slate-900">{pat.name}</h3>
            <p className="text-xs font-semibold text-slate-600 leading-relaxed">{pat.desc}</p>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs font-bold text-slate-500">
              <span>أيام العمل: {num(pat.workDays)}</span>
              <span>أيام الراحة: {num(pat.offDays)}</span>
              <span>تاريخ المرجع: {pat.anchor}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. تسكين وربط الموظفين (Employee Bindings Tab)
// ---------------------------------------------------------------------------
function EmployeeBindingsTab({
  employees,
  patterns,
  shifts,
}: {
  employees: EmployeeRow[];
  patterns: typeof DEFAULT_PATTERNS;
  shifts: ShiftRow[];
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">تسكين وربط الموظفين بالأنماط والورديات</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            ربط موظفي الأقسام والفروع بدورات العمل المحددة مع تاريخ السريان
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-extrabold">
              <th className="py-3 px-4">الموظف</th>
              <th className="py-3 px-4">الرقم الوظيفي</th>
              <th className="py-3 px-4">القسم</th>
              <th className="py-3 px-4">الفرع</th>
              <th className="py-3 px-4">نمط الدوام المسند</th>
              <th className="py-3 px-4">ساري من</th>
              <th className="py-3 px-4">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
            {employees.map((emp, i) => {
              const pat = patterns[i % patterns.length];
              return (
                <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-[#e8f0fe] text-[11px] font-black text-[#0b57d0]">
                      {String(emp.full_name ?? "؟").charAt(0)}
                    </span>
                    <span>{emp.full_name}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">{emp.emp_no}</td>
                  <td className="py-3 px-4 text-slate-600">{emp.department || "عام"}</td>
                  <td className="py-3 px-4 text-slate-600">{emp.branch || "الفرع الرئيسي"}</td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-[#0b57d0]">{pat?.name}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">2026-01-01</td>
                  <td className="py-3 px-4">
                    <span className="rounded-full bg-emerald-50 text-[#137333] px-2 py-0.5 text-[10.5px] font-bold">
                      ساري
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. لوحة تخطيط الجداول المرئية (Visual Roster Grid Tab)
// ---------------------------------------------------------------------------
function VisualRosterGridTab({
  employees,
  shifts,
  patterns,
  assignments,
  onUpdateAssignments,
}: {
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  patterns: typeof DEFAULT_PATTERNS;
  assignments: Record<string, any>;
  onUpdateAssignments: (next: Record<string, any>) => void;
}) {
  // Current anchor date for the weekly view
  const [currentDate, setCurrentDate] = useState(() => new Date("2026-09-20"));
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [deptFilter, setDeptFilter] = useState("all");

  // Compute days of the current view
  const days = useMemo(() => {
    const list: { dateStr: string; dayName: string; dayNum: string; isFriday: boolean }[] = [];
    const base = new Date(currentDate);
    const count = viewMode === "week" ? 7 : 14;
    const arabicDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    for (let i = 0; i < count; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dayIdx = d.getDay();
      list.push({
        dateStr: iso,
        dayName: arabicDays[dayIdx] ?? "",
        dayNum: `${d.getDate()} Sep`,
        isFriday: dayIdx === 5,
      });
    }
    return list;
  }, [currentDate, viewMode]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    if (deptFilter === "all") return employees;
    return employees.filter((e) => e.department === deptFilter);
  }, [employees, deptFilter]);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter((d): d is string => Boolean(d)))),
    [employees]
  );

  // Auto-generate assignments based on patterns
  const handleAutoGenerate = () => {
    const next = { ...assignments };
    const defaultShift = shifts[0] ?? { name: "الدوام الإداري", start_time: "08:00:00", end_time: "17:00:00" };

    filteredEmployees.forEach((emp, i) => {
      days.forEach((day, dIdx) => {
        const key = `${emp.id}:${day.dateStr}`;
        if (!next[key]) {
          const isWeekend = day.isFriday || (dIdx % 7 === 6);
          if (isWeekend) {
            next[key] = {
              shiftName: "راحة أسبوعية",
              code: "OFF",
              color: "#94a3b8",
              hours: 0,
              isOff: true,
            };
          } else {
            // Assign shifts rotation
            const shiftPick = shifts[i % shifts.length] ?? defaultShift;
            const isNight = String(shiftPick.name ?? "").includes("ليل");
            next[key] = {
              shiftName: shiftPick.name,
              code: isNight ? "NGHT" : "WORK",
              color: isNight ? "#7c3aed" : "#0b57d0",
              hours: 8,
              isNight,
            };
          }
        }
      });
    });

    onUpdateAssignments(next);
    toast.success("تم توليد جدول الدوام آلياً بنجاح وفق الأنماط المعتمدة");
  };

  // Toggle shift for a cell
  const handleCellClick = (empId: string, dateStr: string) => {
    const key = `${empId}:${dateStr}`;
    const cur = assignments[key];
    const next = { ...assignments };

    if (!cur || cur.isOff) {
      const s = shifts[0] ?? { name: "الدوام الإداري" };
      next[key] = { shiftName: s.name, code: "AM", color: "#0b57d0", hours: 8 };
    } else if (cur.code === "AM" && shifts.length > 1) {
      const s = shifts[1] ?? { name: "وردية مسائية" };
      next[key] = { shiftName: s.name, code: "PM", color: "#d97706", hours: 8 };
    } else if (cur.code === "PM" && shifts.length > 2) {
      const s = shifts[2] ?? { name: "وردية ليلية" };
      next[key] = { shiftName: s.name, code: "NGHT", color: "#7c3aed", hours: 8, isNight: true };
    } else {
      next[key] = { shiftName: "راحة أسبوعية", code: "OFF", color: "#94a3b8", hours: 0, isOff: true };
    }

    onUpdateAssignments(next);
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      {/* Action and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">لوحة تخطيط الجداول المرئية (Visual Roster)</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            عرض وتعيين وتعديل شفتات الموظفين تفاعلياً مع فحص التعارضات الفوري
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="all">جميع الأقسام ({num(employees.length)})</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Week / Month Toggle */}
          <div className="flex rounded-full border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                viewMode === "week" ? "bg-white text-[#0b57d0] shadow-xs" : "text-slate-500"
              }`}
            >
              أسبوع
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                viewMode === "month" ? "bg-white text-[#0b57d0] shadow-xs" : "text-slate-500"
              }`}
            >
              أسبوعان
            </button>
          </div>

          {/* Prev / Next Date */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() - 7);
                setCurrentDate(d);
              }}
              className="grid size-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
              title="الأسبوع السابق"
            >
              <MaterialIcon name="chevron_right" size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + 7);
                setCurrentDate(d);
              }}
              className="grid size-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
              title="الأسبوع التالي"
            >
              <MaterialIcon name="chevron_left" size={18} />
            </button>
          </div>

          {/* Auto-generate Button */}
          <button
            type="button"
            onClick={handleAutoGenerate}
            className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] px-4 h-9 text-xs font-extrabold text-white shadow-xs hover:bg-[#0842a0]"
          >
            <MaterialIcon name="bolt" size={16} />
            <span>توليد آلي من الأنماط</span>
          </button>

          {/* Publish Roster Button */}
          <button
            type="button"
            onClick={() => {
              toast.success("تم اعتماد ونشر جدول الدوام للموظفين بنجاح");
            }}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 h-9 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700"
          >
            <MaterialIcon name="publish" size={16} />
            <span>نشر الجدول</span>
          </button>
        </div>
      </div>

      {/* Roster Grid Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold">
              <th className="py-3 px-4 min-w-[200px] sticky right-0 z-10 bg-slate-50 border-l border-slate-200">
                الموظف / القسم
              </th>
              {days.map((d) => (
                <th
                  key={d.dateStr}
                  className={`py-3 px-2 text-center min-w-[110px] border-l border-slate-200 ${
                    d.isFriday ? "bg-slate-100/70" : ""
                  }`}
                >
                  <span className="block text-[11px] text-slate-500 font-bold">{d.dayName}</span>
                  <span className="block font-mono text-xs text-slate-900 font-black">{d.dayNum}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold">
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                {/* Pinned Employee Column */}
                <td className="py-2.5 px-4 sticky right-0 z-10 bg-white border-l border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-[#e8f0fe] text-[11px] font-black text-[#0b57d0]">
                      {String(emp.full_name ?? "؟").charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">
                        {emp.full_name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {emp.emp_no} · {emp.department || "عام"}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Day Cells */}
                {days.map((d) => {
                  const key = `${emp.id}:${d.dateStr}`;
                  const assigned = assignments[key];
                  const isOff = assigned?.isOff;

                  return (
                    <td
                      key={d.dateStr}
                      onClick={() => handleCellClick(emp.id, d.dateStr)}
                      className={`py-2 px-1.5 text-center border-l border-slate-200 cursor-pointer hover:ring-2 hover:ring-[#0b57d0]/40 transition-all ${
                        d.isFriday ? "bg-slate-50/40" : ""
                      }`}
                      title="انقر لتغيير الوردية أو التبديل للراحة"
                    >
                      {assigned ? (
                        <div
                          className={`rounded-xl py-1.5 px-2 text-[10.5px] font-bold shadow-2xs transition-transform active:scale-95 ${
                            isOff
                              ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : assigned.isNight
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : assigned.code === "PM"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-blue-100 text-[#0b57d0] border border-blue-200"
                          }`}
                        >
                          <span className="block truncate">{assigned.shiftName}</span>
                          {!isOff && (
                            <span className="block text-[9.5px] font-mono opacity-75">
                              {assigned.hours}h
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs font-mono select-none">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend and Stats Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs font-semibold text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-bold text-slate-800">دليل الشفتات:</span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-blue-500" />
            <span>دوام إداري / صباحي (8h)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-amber-500" />
            <span>وردية مسائية (8h)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-purple-600" />
            <span>وردية ليلية (+1 يوم)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-slate-400" />
            <span>راحة أسبوعية (OFF)</span>
          </span>
        </div>

        <span className="text-xs font-bold text-slate-500">
          💡 انقر على أي خانة في الجدول لتغيير الوردية أو تعيين راحة مباشرة
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. الاستيراد والتسكين الجماعي (Bulk Import Tab)
// ---------------------------------------------------------------------------
function BulkImportTab({
  employees,
  shifts,
  onApplyAssignments,
}: {
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  onApplyAssignments: (newAssignments: Record<string, any>) => void;
}) {
  const [importing, setImporting] = useState(false);

  // Template download mock
  const handleDownloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "الرقم الوظيفي,اسم الموظف,2026-09-20,2026-09-21,2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-26\n" +
      employees
        .slice(0, 5)
        .map((e) => `${e.emp_no},${e.full_name},صباحي,صباحي,صباحي,صباحي,صباحي,راحة,راحة`)
        .join("\n");
    const encoded = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", "نموذج_تسكين_الورديات.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("تم تحميل نموذج التسكين الجماعي بنجاح");
  };

  const handleSimulateUpload = () => {
    setImporting(true);
    setTimeout(() => {
      const generated: Record<string, any> = {};
      const dates = [
        "2026-09-20",
        "2026-09-21",
        "2026-09-22",
        "2026-09-23",
        "2026-09-24",
        "2026-09-25",
        "2026-09-26",
      ];
      employees.forEach((e) => {
        dates.forEach((d, idx) => {
          const isOff = idx >= 5;
          generated[`${e.id}:${d}`] = isOff
            ? { shiftName: "راحة أسبوعية", code: "OFF", color: "#94a3b8", hours: 0, isOff: true }
            : { shiftName: "الدوام الإداري", code: "AM", color: "#0b57d0", hours: 8 };
        });
      });
      onApplyAssignments(generated);
      setImporting(false);
    }, 800);
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">الاستيراد والتسكين الجماعي للورديات</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            رفع ملفات Excel و CSV لتسكين الموظفين أسبوعياً وشهرياً دفعة واحدة مع التحقق المسبق
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 h-9 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
        >
          <MaterialIcon name="download" size={17} />
          <span>تنزيل نموذج Excel فارغ</span>
        </button>
      </div>

      {/* Upload Box */}
      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center space-y-4 hover:border-[#0b57d0] transition-colors">
        <span className="grid size-14 place-items-center rounded-2xl bg-[#e8f0fe] text-[#0b57d0] mx-auto">
          <MaterialIcon name="cloud_upload" size={28} filled />
        </span>
        <div>
          <h3 className="text-sm font-black text-slate-800">اسحب ملف التسكين الجماعي هنا أو اضغط للاختيار</h3>
          <p className="text-xs text-slate-400 mt-1">يدعم ملفات بصيغة (.xlsx, .csv) حتى 10,000 سطر</p>
        </div>
        <button
          type="button"
          disabled={importing}
          onClick={handleSimulateUpload}
          className="rounded-full bg-[#0b57d0] px-6 h-10 text-xs font-extrabold text-white hover:bg-[#0842a0] transition disabled:opacity-50"
        >
          {importing ? "جاري معالجة الملف والتحقق..." : "اختيار ملف التسكين والتحقق"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. سياسات وضوابط الدوام (Scheduling Policies Tab)
// ---------------------------------------------------------------------------
function SchedulingPoliciesTab({
  policies,
  onSave,
}: {
  policies: typeof DEFAULT_POLICIES;
  onSave: (p: typeof DEFAULT_POLICIES) => void;
}) {
  const [form, setForm] = useState(policies);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">سياسات وضوابط الدوام (Labor Law Rules)</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            حدود ساعات العمل، فترات الراحة الإلزامية، شروط شهر رمضان المبارك، وقواعد كشف التعارضات
          </p>
        </div>

        <button
          type="button"
          onClick={() => onSave(form)}
          className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] px-5 h-9 text-xs font-extrabold text-white hover:bg-[#0842a0]"
        >
          <MaterialIcon name="save" size={17} />
          <span>حفظ وتطبيق السياسات</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-bold text-slate-700">
        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">الحد الأقصى لساعات العمل اليومية</label>
          <input
            type="number"
            value={form.maxDailyHours}
            onChange={(e) => setForm({ ...form, maxDailyHours: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">8 ساعات كمعيار نظام العمل السعودي</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">الحد الأقصى لساعات العمل الأسبوعية</label>
          <input
            type="number"
            value={form.maxWeeklyHours}
            onChange={(e) => setForm({ ...form, maxWeeklyHours: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">48 ساعة أسبوعياً كحد أقصى نظامي</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">أدنى فترة راحة إلزامية بين شفتين</label>
          <input
            type="number"
            value={form.minRestHours}
            onChange={(e) => setForm({ ...form, minRestHours: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">11 ساعة راحة مستمرة إلزامية بين المناوبات</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">ساعات العمل في شهر رمضان المبارك</label>
          <input
            type="number"
            value={form.ramadanHours}
            onChange={(e) => setForm({ ...form, ramadanHours: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">تخفيض ساعات الدوام إلى 6 ساعات للمسلمين</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">دقائق السماح عند الحضور والانصراف</label>
          <input
            type="number"
            value={form.graceMinutes}
            onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">فترة سماح معفاة من التأخير بالدقائق</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
          <label className="block text-slate-800 font-extrabold">الحد الأدنى للفاصل في الشفت المقسوم</label>
          <input
            type="number"
            value={form.splitMinGapHours}
            onChange={(e) => setForm({ ...form, splitMinGapHours: Number(e.target.value) })}
            className="w-full h-10 rounded-xl border border-slate-200 px-3 font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none"
          />
          <p className="text-[11px] text-slate-400 font-normal">ساعتان فاصل راحة بين فترتي الشفت المقسوم</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. سجلات الحضور والانصراف (Attendance Records Tab)
// ---------------------------------------------------------------------------
function AttendanceRecordsTab({
  attendance,
  employees,
}: {
  attendance: AttendanceRow[];
  employees: EmployeeRow[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return attendance;
    const s = search.toLowerCase();
    return attendance.filter(
      (r) =>
        String(r.employee_name ?? "").toLowerCase().includes(s) ||
        String(r.work_date ?? "").toLowerCase().includes(s)
    );
  }, [attendance, search]);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-black text-slate-900">سجلات الحضور والبصمة الفعلية</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            سجلات حضور وانصراف الموظفين ومطابقتها مع الشفتات المجدولة
          </p>
        </div>

        <div className="relative">
          <MaterialIcon
            name="search"
            size={18}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="ابحث باسم الموظف أو التاريخ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-60 rounded-full border border-slate-200 bg-slate-50 pe-9 ps-4 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-600 font-extrabold">
              <th className="py-3 px-4">الموظف</th>
              <th className="py-3 px-4">تاريخ العمل</th>
              <th className="py-3 px-4">وقت الحضور الفعلي</th>
              <th className="py-3 px-4">وقت الانصراف الفعلي</th>
              <th className="py-3 px-4">الحالة</th>
              <th className="py-3 px-4">دقائق التأخير</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
            {filtered.slice(0, 30).map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-3 px-4 font-bold text-slate-900">{r.employee_name}</td>
                <td className="py-3 px-4 font-mono text-slate-500">{r.work_date}</td>
                <td className="py-3 px-4 font-mono text-slate-900">{r.check_in || "—"}</td>
                <td className="py-3 px-4 font-mono text-slate-900">{r.check_out || "—"}</td>
                <td className="py-3 px-4">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      r.status === "حاضر"
                        ? "bg-emerald-50 text-[#137333]"
                        : r.status === "متأخر"
                        ? "bg-amber-50 text-[#b06000]"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {r.status || "حاضر"}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-slate-600">{num(r.late_minutes ?? 0)} د</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  لا توجد سجلات حضور مسجلة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
