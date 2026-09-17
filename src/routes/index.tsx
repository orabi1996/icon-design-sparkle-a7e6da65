/**
 * People Insight Studio – HRMS Executive Dashboard
 * لوحة الموارد البشرية التنفيذية
 * Real-time customizable workforce, attendance, operations, and executive analytics.
 * All numerals formatted using Western English digits (0-9).
 */
import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRows } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";

import type {
  GlobalFilters,
  DashboardLayout,
  DrillDownData,
  EmployeeRecord,
  AttendanceItem,
} from "@/components/dashboard/types";
import { WIDGET_REGISTRY } from "@/components/dashboard/registry";
import { GlobalFilterBar } from "@/components/dashboard/filters/GlobalFilterBar";
import { DrillDownDrawer } from "@/components/dashboard/drilldown/DrillDownDrawer";
import { DashboardStudioDrawer } from "@/components/dashboard/builder/DashboardStudioDrawer";
import { DashboardSwitcher } from "@/components/dashboard/builder/DashboardSwitcher";
import {
  loadDashboards,
  saveDashboards,
  getActiveDashboardId,
  setActiveDashboardId,
  DEFAULT_DASHBOARDS,
} from "@/components/dashboard/services/dashboardStorage";
import {
  enrichEmployee,
  filterEmployees,
  num,
} from "@/components/dashboard/services/analyticsData";
import { exportToExcel } from "@/components/dashboard/export/exportUtils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "People Insight Studio | لوحة الموارد البشرية التنفيذية" },
      {
        name: "description",
        content:
          "متابعة لحظية للقوى العاملة والحضور وسير العمل والمؤشرات الرئيسية بنظام Google Material Design 3.",
      },
      { property: "og:title", content: "People Insight Studio – لوحة الموارد البشرية التنفيذية" },
      {
        property: "og:description",
        content: "تحليلات تنفيذية ومؤشرات مباشرة للقوى العاملة والحضور والطلبات والمستويات الوظيفية.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PeopleInsightStudioPage,
});

function PeopleInsightStudioPage() {
  const queryClient = useQueryClient();

  // User session
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string }>({
    email: "admin@expert-hr.sa",
    role: "مدير تنفيذي (صلاحيات كاملة)",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setCurrentUser({
          email: data.session.user.email,
          role: "مدير النظام التنفيذي",
        });
      }
    });
  }, []);

  // Theme & Edit Mode
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">("light");
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isDesignMode, setIsDesignMode] = useState(false);

  // Apply dark mode class to document
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else if (themeMode === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }
  }, [themeMode]);

  // Dashboards state
  const [dashboards, setDashboards] = useState<DashboardLayout[]>(() => loadDashboards());
  const [activeDashboardId, setActiveId] = useState<string>(() => getActiveDashboardId());

  const activeDashboard = useMemo(() => {
    return (
      dashboards.find((d) => d.id === activeDashboardId) ||
      dashboards[0] ||
      DEFAULT_DASHBOARDS[0]!
    );
  }, [dashboards, activeDashboardId]);

  // Global Filters state
  const [filters, setFilters] = useState<GlobalFilters>(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return {
      branch: "all",
      department: "all",
      sector: "all",
      status: "all",
      jobLevel: "all",
      jobCategory: "all",
      nationality: "all",
      datePreset: "this_month",
      fromDate: thirtyDaysAgo.toISOString().slice(0, 10),
      toDate: today.toISOString().slice(0, 10),
      search: "",
    };
  });

  // DrillDown Drawer state
  const [drillDownData, setDrillDownData] = useState<DrillDownData>({
    isOpen: false,
    title: "",
    count: 0,
    metricKey: "",
    employees: [],
  });

  // Last sync timestamp
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  // Fetch real data from Supabase
  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const attendanceQuery = useRows("attendance_records", {
    orderBy: "work_date",
    ascending: false,
    limit: 5000,
  });
  const leaveRequestsQuery = useRows("leave_requests", {
    orderBy: "created_at",
    ascending: false,
  });
  const requestsQuery = useRows("requests", { orderBy: "created_at", ascending: false });
  const loansQuery = useRows("loans", { orderBy: "created_at", ascending: false });
  const payrollRunsQuery = useRows("payroll_runs", { orderBy: "year", ascending: false });

  const isInitialLoading =
    employeesQuery.isLoading ||
    attendanceQuery.isLoading ||
    leaveRequestsQuery.isLoading;

  const hasError =
    employeesQuery.isError ||
    attendanceQuery.isError ||
    leaveRequestsQuery.isError;

  const rawEmployees = employeesQuery.data ?? [];
  const rawAttendance = (attendanceQuery.data ?? []) as AttendanceItem[];
  const rawLeaveRequests = leaveRequestsQuery.data ?? [];
  const rawRequests = requestsQuery.data ?? [];
  const rawLoans = loansQuery.data ?? [];
  const rawPayrollRuns = payrollRunsQuery.data ?? [];

  // Update sync timestamp when data arrives
  useEffect(() => {
    if (!employeesQuery.isFetching) {
      setLastSyncTime(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
  }, [employeesQuery.isFetching]);

  // Enrich employees with sectors, job levels, and categories
  const allEmployees = useMemo(() => {
    return rawEmployees.map((emp) =>
      enrichEmployee(emp, rawAttendance, rawLeaveRequests)
    );
  }, [rawEmployees, rawAttendance, rawLeaveRequests]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return filterEmployees(allEmployees, filters);
  }, [allEmployees, filters]);

  // Refresh handler
  const handleRefresh = async () => {
    await Promise.all([
      employeesQuery.refetch(),
      attendanceQuery.refetch(),
      leaveRequestsQuery.refetch(),
      requestsQuery.refetch(),
      loansQuery.refetch(),
      payrollRunsQuery.refetch(),
    ]);
  };

  // Switch dashboard
  const handleSelectDashboard = (id: string) => {
    setActiveId(id);
    setActiveDashboardId(id);
  };

  // Create new dashboard
  const handleCreateDashboard = (newBoard: DashboardLayout) => {
    const updated = [...dashboards, newBoard];
    setDashboards(updated);
    saveDashboards(updated);
    handleSelectDashboard(newBoard.id);
  };

  // Update active dashboard layout
  const handleUpdateActiveDashboard = (updatedBoard: DashboardLayout) => {
    const updated = dashboards.map((d) => (d.id === updatedBoard.id ? updatedBoard : d));
    setDashboards(updated);
    saveDashboards(updated);
  };

  // Auto-refresh timer based on dashboard refreshInterval setting
  useEffect(() => {
    const intervalSec = activeDashboard.refreshInterval || 0;
    if (intervalSec <= 0) {
      return;
    }
    const timer = setInterval(() => {
      handleRefresh();
    }, intervalSec * 1000);
    return () => {
      clearInterval(timer);
    };
  }, [activeDashboard.refreshInterval]);

  // Move widget in design mode
  const handleMoveWidget = (id: string, delta: number) => {
    const idx = activeDashboard.widgets.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= activeDashboard.widgets.length) return;
    const items = [...activeDashboard.widgets];
    const temp = items[targetIdx]!;
    items[targetIdx] = items[idx]!;
    items[idx] = temp;
    handleUpdateActiveDashboard({ ...activeDashboard, widgets: items });
  };

  // Change widget colSpan in design mode
  const handleChangeWidgetColSpan = (id: string, colSpan: number) => {
    const items = activeDashboard.widgets.map((w) =>
      w.id === id ? { ...w, colSpan } : w
    );
    handleUpdateActiveDashboard({ ...activeDashboard, widgets: items });
  };

  // Hide widget from design mode
  const handleHideWidget = (id: string) => {
    const items = activeDashboard.widgets.map((w) =>
      w.id === id ? { ...w, hidden: true } : w
    );
    handleUpdateActiveDashboard({ ...activeDashboard, widgets: items });
  };

  // Reset to default dashboards
  const handleResetDashboards = () => {
    if (confirm("هل ترغب في استعادة اللوحات الافتراضية؟ سيتم حذف التخصيصات.")) {
      setDashboards(DEFAULT_DASHBOARDS);
      saveDashboards(DEFAULT_DASHBOARDS);
      handleSelectDashboard(DEFAULT_DASHBOARDS[0]!.id);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    setFilters({
      branch: "all",
      department: "all",
      sector: "all",
      status: "all",
      jobLevel: "all",
      jobCategory: "all",
      nationality: "all",
      datePreset: "this_month",
      fromDate: thirtyDaysAgo.toISOString().slice(0, 10),
      toDate: today.toISOString().slice(0, 10),
      search: "",
    });
  };

  // Export entire dashboard summary to Excel
  const handleExportDashboard = () => {
    exportToExcel(
      `لوحة_التحكم_التنفيذية_${activeDashboard.name}`,
      filteredEmployees,
      [
        { header: "الرقم الوظيفي", key: "emp_no" },
        { header: "اسم الموظف", key: "full_name" },
        { header: "الفرع", key: "branch" },
        { header: "القسم", key: "department" },
        { header: "القطاع", key: "sector" },
        { header: "المستوى الوظيفي", key: "job_level" },
        { header: "الفئة الوظيفية", key: "job_category" },
        { header: "الجنسية", key: "nationality" },
        { header: "حالة الدوام اليوم", key: "attendance_status" },
        { header: "الحالة الوظيفية", key: "status" },
        { header: "الراتب الأساسي", key: "basic_salary" },
      ],
      activeDashboard.name
    );
  };

  return (
    <AppShell>
      <div
        className={`space-y-6 pb-12 transition-all duration-300 pl-16 ${
          isStudioOpen ? "lg:pl-[384px]" : "lg:pl-16"
        }`}
        dir="rtl"
      >


        {/* Global Filter Bar */}
        <GlobalFilterBar
          filters={filters}
          onChange={setFilters}
          onReset={handleResetFilters}
          employees={allEmployees}
        />

        {/* Loading Skeleton */}
        {isInitialLoading && (
          <div className="space-y-4">
            <div className="h-28 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-64 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-64 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          </div>
        )}

        {/* Error State */}
        {hasError && !isInitialLoading && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 space-y-3">
            <div className="flex items-center gap-3">
              <MaterialIcon name="error" size={24} className="text-rose-600" />
              <div>
                <h3 className="text-sm font-black">تعذر تحميل بيانات اللوحة التنفيذية</h3>
                <p className="text-xs">
                  حدث خطأ أثناء الاتصال بقاعدة البيانات. يمكنك المحاولة مجدداً.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRefresh}
              className="rounded-xl font-bold"
            >
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isInitialLoading && !hasError && filteredEmployees.length === 0 && (
          <div className="rounded-3xl border border-border bg-card p-12 text-center shadow-xs text-card-foreground space-y-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mx-auto">
              <MaterialIcon name="filter_list_off" size={28} />
            </span>
            <h3 className="text-sm font-black text-foreground">
              لا توجد بيانات مطابقة للفلاتر المحددة
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              جرب تغيير خيارات الفلترة أو إعادة تعيين الفلاتر الشاملة لعرض جميع موظفي المنشأة.
            </p>
            <Button
              type="button"
              onClick={handleResetFilters}
              className="rounded-xl font-bold"
            >
              إعادة تعيين الفلاتر
            </Button>
          </div>
        )}

        {/* Main 12-Column Widgets Grid */}
        {!isInitialLoading && !hasError && (
          <div className="grid grid-cols-12 gap-5">
            {activeDashboard.widgets
              .filter((w) => !w.hidden)
              .map((widget) => {
                const reg = WIDGET_REGISTRY[widget.type];
                if (!reg) return null;

                const colClass =
                  widget.colSpan === 12
                    ? "col-span-12"
                    : widget.colSpan === 8
                    ? "col-span-12 lg:col-span-8"
                    : widget.colSpan === 6
                    ? "col-span-12 lg:col-span-6"
                    : widget.colSpan === 4
                    ? "col-span-12 md:col-span-6 lg:col-span-4"
                    : widget.colSpan === 3
                    ? "col-span-12 sm:col-span-6 lg:col-span-3"
                    : "col-span-12";

                const WidgetComponent = reg.component;

                return (
                  <div
                    key={widget.id}
                    className={`${colClass} ${
                      isDesignMode
                        ? "relative rounded-3xl border-2 border-dashed border-blue-400/80 bg-blue-50/15 p-2 dark:border-blue-500/60 dark:bg-blue-950/20 transition-all shadow-xs"
                        : "transition-all"
                    }`}
                  >
                    {/* Design Mode Interactive Control Bar */}
                    {isDesignMode && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200 bg-white/95 px-3 py-1.5 text-xs shadow-xs dark:border-blue-900/60 dark:bg-slate-900/95">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">
                            <MaterialIcon name="drag_indicator" size={16} />
                          </span>
                          <span className="font-black text-slate-800 dark:text-slate-100">
                            {widget.title}
                          </span>
                          <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] font-bold font-mono">
                            {widget.colSpan} أعمدة
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Quick Column Width Resizing */}
                          <span className="text-[10px] text-slate-400 ms-1 font-bold">العرض:</span>
                          {[3, 4, 6, 8, 12].map((span) => (
                            <button
                              key={span}
                              type="button"
                              onClick={() => handleChangeWidgetColSpan(widget.id, span)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                                widget.colSpan === span
                                  ? "bg-[#0b57d0] text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                              title={`تغيير العرض إلى ${span} أعمدة`}
                            >
                              {span}
                            </button>
                          ))}

                          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                          {/* Move Left / Right */}
                          <button
                            type="button"
                            onClick={() => handleMoveWidget(widget.id, -1)}
                            className="grid size-6 place-items-center rounded hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-800 cursor-pointer"
                            title="تحريك للخلف"
                          >
                            <MaterialIcon name="chevron_right" size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveWidget(widget.id, 1)}
                            className="grid size-6 place-items-center rounded hover:bg-slate-100 text-slate-500 dark:hover:bg-slate-800 cursor-pointer"
                            title="تحريك للأمام"
                          >
                            <MaterialIcon name="chevron_left" size={16} />
                          </button>

                          {/* Hide Widget */}
                          <button
                            type="button"
                            onClick={() => handleHideWidget(widget.id)}
                            className="grid size-6 place-items-center rounded hover:bg-rose-50 text-rose-500 dark:hover:bg-rose-950/50 cursor-pointer ms-1"
                            title="إخفاء من اللوحة"
                          >
                            <MaterialIcon name="visibility_off" size={15} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actual Widget Component */}
                    <WidgetComponent
                      widget={widget}
                      filters={filters}
                      employees={filteredEmployees}
                      allEmployees={allEmployees}
                      attendance={rawAttendance}
                      leaveRequests={rawLeaveRequests}
                      requests={rawRequests}
                      loans={rawLoans}
                      payrollRuns={rawPayrollRuns}
                      isEditing={isDesignMode}
                      onDrillDown={(d) => setDrillDownData({ ...d, isOpen: true })}
                    />
                  </div>
                );
              })}
          </div>
        )}

        {/* Drill Down Drawer */}
        <DrillDownDrawer
          data={drillDownData}
          onClose={() => setDrillDownData((prev) => ({ ...prev, isOpen: false }))}
        />

        {/* Dashboard Studio Designer (Left Vertical Navigation Rail + Side Drawer) */}
        <DashboardStudioDrawer
          isOpen={isStudioOpen}
          onOpenChange={setIsStudioOpen}
          dashboard={activeDashboard}
          onUpdateDashboard={handleUpdateActiveDashboard}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          isDesignMode={isDesignMode}
          onDesignModeChange={setIsDesignMode}
          dashboards={dashboards}
          activeDashboardId={activeDashboardId}
          onSelectDashboard={handleSelectDashboard}
          onCreateDashboard={handleCreateDashboard}
          onResetDashboards={handleResetDashboards}
          onExportDashboard={handleExportDashboard}
          onRefresh={handleRefresh}
          isFetching={employeesQuery.isFetching}
        />
      </div>
    </AppShell>
  );
}
