/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DashboardLayout, WidgetConfig, WidgetType, CustomWidgetDefinition } from "../types";
import { WIDGET_REGISTRY } from "../registry";
import {
  loadCustomWidgets,
  saveCustomWidget,
  deleteCustomWidget,
} from "../services/customWidgetsStorage";
import { CustomWidgetDialog } from "./CustomWidgetDialog";

export interface DashboardStudioDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: DashboardLayout;
  onUpdateDashboard: (updated: DashboardLayout) => void;
  themeMode: "light" | "dark" | "system";
  onThemeModeChange: (mode: "light" | "dark" | "system") => void;
  isDesignMode: boolean;
  onDesignModeChange: (mode: boolean) => void;
  dashboards?: DashboardLayout[];
  activeDashboardId?: string;
  onSelectDashboard?: (id: string) => void;
  onCreateDashboard?: (newBoard: DashboardLayout) => void;
  onResetDashboards?: () => void;
  onExportDashboard?: () => void;
  onRefresh?: () => void;
  isFetching?: boolean;
}

export type StudioTab = "elements" | "layers" | "settings" | "appearance";

interface ElementMeta {
  type: WidgetType;
  title: string;
  icon: string;
  category: string;
  description: string;
  defaultColSpan: number;
  isCustom?: boolean;
  customId?: string;
  definition?: CustomWidgetDefinition;
}

const ALL_ELEMENTS: ElementMeta[] = [
  {
    type: "employee_status",
    title: "حالات الموظفين والمسيرات",
    icon: "badge",
    category: "القوى العاملة",
    description: "مؤشرات تفصيلية للموظفين النشطين والمجازين والموقوفين",
    defaultColSpan: 12,
  },
  {
    type: "live_attendance",
    title: "شريط الحضور اللحظي لليوم",
    icon: "fingerprint",
    category: "الحضور والانصراف",
    description: "متابعة فورية للحضور، الغياب، التأخير، والانصراف المبكر",
    defaultColSpan: 12,
  },
  {
    type: "job_levels",
    title: "توزيع المستويات الوظيفية",
    icon: "leaderboard",
    category: "الهيكل والوظائف",
    description: "تحليل الكوادر حسب المستويات القيادية والإشرافية والتنفيذية",
    defaultColSpan: 6,
  },
  {
    type: "job_categories",
    title: "توزيع الفئات الوظيفية",
    icon: "category",
    category: "الهيكل والوظائف",
    description: "تصنيف الموظفين حسب الفئات (إداري، تقني، تشغيلي، عمالة)",
    defaultColSpan: 6,
  },
  {
    type: "nationalities",
    title: "توزيع الجنسيات والتوطين",
    icon: "public",
    category: "التحليلات والمؤشرات",
    description: "إحصائية جنسيات الموظفين مع رسم Donut لمعدل السعودة",
    defaultColSpan: 6,
  },
  {
    type: "sectors",
    title: "قطاعات الوظائف الحالية",
    icon: "lan",
    category: "الهيكل والوظائف",
    description: "توزيع القوى العاملة على القطاعات التنظيمية الكبرى",
    defaultColSpan: 6,
  },
  {
    type: "department_distribution",
    title: "أكبر الأقسام من حيث العدد",
    icon: "domain",
    category: "الهيكل والوظائف",
    description: "قائمة ترتيب الأقسام تنازلياً مع أشرطة التقدم والنسب",
    defaultColSpan: 6,
  },
  {
    type: "pending_requests",
    title: "مركز الطلبات المعلقة",
    icon: "pending_actions",
    category: "العمليات والموافقات",
    description: "متابعة طلبات الإجازات والسلف وتنبيهات التأخير",
    defaultColSpan: 6,
  },
  {
    type: "payroll_summary",
    title: "ملخص الأجور ومسيرات الرواتب",
    icon: "payments",
    category: "المالية والأجور",
    description: "إجمالي الرواتب، صافي المستحق، والاستقطاعات الشهرية",
    defaultColSpan: 12,
  },
  {
    type: "data_explorer",
    title: "مستكشف البيانات التحليلي",
    icon: "manage_search",
    category: "التقارير المتقدمة",
    description: "جدول تفاعلي مع فرز وفلترة وتصدير فوري للبيانات",
    defaultColSpan: 12,
  },
];

export function DashboardStudioDrawer({
  isOpen,
  onOpenChange,
  dashboard,
  onUpdateDashboard,
  themeMode,
  onThemeModeChange,
  isDesignMode,
  onDesignModeChange,
  dashboards,
  activeDashboardId,
  onSelectDashboard,
  onCreateDashboard,
  onResetDashboards,
  onExportDashboard,
  onRefresh,
  isFetching,
}: DashboardStudioDrawerProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("elements");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    dashboard.widgets[0]?.id ?? null
  );

  // Custom widgets library state
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDefinition[]>(() => loadCustomWidgets());
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [editingCustomWidget, setEditingCustomWidget] = useState<CustomWidgetDefinition | null>(null);

  // Drag-and-drop state for layers tab
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Settings form local state
  const [dashboardName, setDashboardName] = useState(dashboard.name);
  const [refreshInterval, setRefreshInterval] = useState<number>(dashboard.refreshInterval || 0);
  const [scope, setScope] = useState<"all" | "executives" | "managers" | "private">(
    dashboard.scope || "all"
  );
  const [showSaveFeedback, setShowSaveFeedback] = useState(false);

  // Selected widget object
  const selectedWidget = useMemo(
    () => dashboard.widgets.find((w) => w.id === selectedWidgetId),
    [dashboard.widgets, selectedWidgetId]
  );

  // Active widgets count (non-hidden)
  const activeCount = useMemo(
    () => dashboard.widgets.filter((w) => !w.hidden).length,
    [dashboard.widgets]
  );

  // Merge built-in elements with custom public elements
  const allAvailableElements: ElementMeta[] = useMemo(() => {
    const customMeta: ElementMeta[] = customWidgets.map((cw) => ({
      type: "custom",
      title: cw.title,
      icon: cw.icon,
      category: cw.category,
      description: cw.description || "",
      defaultColSpan: cw.defaultColSpan,
      isCustom: true,
      customId: cw.id,
      definition: cw,
    }));
    return [...ALL_ELEMENTS, ...customMeta];
  }, [customWidgets]);

  // Filtered elements in library
  const filteredElements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allAvailableElements;
    return allAvailableElements.filter(
      (el) =>
        el.title.toLowerCase().includes(q) ||
        el.category.toLowerCase().includes(q) ||
        el.description.toLowerCase().includes(q)
    );
  }, [searchQuery, allAvailableElements]);

  // Check if an element is currently enabled and visible
  const isElementActive = (el: ElementMeta) => {
    if (el.isCustom && el.customId) {
      return dashboard.widgets.some(
        (w) =>
          w.type === "custom" &&
          (w.settings?.customWidgetId === el.customId ||
            w.settings?.customDefinition?.id === el.customId) &&
          !w.hidden
      );
    }
    const existing = dashboard.widgets.find((w) => w.type === el.type);
    return existing ? !existing.hidden : false;
  };

  // Toggle element on/off directly from 2-column grid
  const handleToggleElement = (element: ElementMeta) => {
    if (element.isCustom && element.customId) {
      const existingIndex = dashboard.widgets.findIndex(
        (w) =>
          w.type === "custom" &&
          (w.settings?.customWidgetId === element.customId ||
            w.settings?.customDefinition?.id === element.customId)
      );

      if (existingIndex !== -1) {
        const updatedWidgets = [...dashboard.widgets];
        const target = updatedWidgets[existingIndex]!;
        updatedWidgets[existingIndex] = {
          ...target,
          hidden: !target.hidden,
        };
        onUpdateDashboard({ ...dashboard, widgets: updatedWidgets });
        if (target.hidden) setSelectedWidgetId(target.id);
      } else {
        const newWidget: WidgetConfig = {
          id: `w-cw-${element.customId}-${Date.now()}`,
          type: "custom",
          title: element.title,
          colSpan: element.defaultColSpan || 6,
          hidden: false,
          settings: {
            customWidgetId: element.customId,
            customDefinition: element.definition,
          },
        };
        onUpdateDashboard({
          ...dashboard,
          widgets: [...dashboard.widgets, newWidget],
        });
        setSelectedWidgetId(newWidget.id);
      }
      return;
    }

    const existingIndex = dashboard.widgets.findIndex((w) => w.type === element.type);

    if (existingIndex !== -1) {
      const updatedWidgets = [...dashboard.widgets];
      const target = updatedWidgets[existingIndex]!;
      updatedWidgets[existingIndex] = {
        ...target,
        hidden: !target.hidden,
      };
      onUpdateDashboard({
        ...dashboard,
        widgets: updatedWidgets,
      });
      if (target.hidden) {
        setSelectedWidgetId(target.id);
      }
    } else {
      const reg = WIDGET_REGISTRY[element.type];
      const newWidget: WidgetConfig = {
        id: `w-${element.type}-${Date.now()}`,
        type: element.type,
        title: element.title || reg?.title || "عنصر جديد",
        colSpan: element.defaultColSpan || reg?.defaultColSpan || 6,
        hidden: false,
        settings: {},
      };
      onUpdateDashboard({
        ...dashboard,
        widgets: [...dashboard.widgets, newWidget],
      });
      setSelectedWidgetId(newWidget.id);
    }
  };

  // Custom widget management
  const handleSaveCustomWidget = async (saved: CustomWidgetDefinition) => {
    const updated = await saveCustomWidget(saved);
    setCustomWidgets(updated);

    // If active dashboard contains this widget, update its title & definition
    const updatedWidgets = dashboard.widgets.map((w) => {
      if (
        w.type === "custom" &&
        (w.settings?.customWidgetId === saved.id ||
          w.settings?.customDefinition?.id === saved.id)
      ) {
        return {
          ...w,
          title: saved.title,
          colSpan: saved.defaultColSpan,
          settings: {
            ...w.settings,
            customWidgetId: saved.id,
            customDefinition: saved,
          },
        };
      }
      return w;
    });
    onUpdateDashboard({ ...dashboard, widgets: updatedWidgets });
  };

  const handleDeleteCustomWidget = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("هل ترغب في حذف هذا العنصر المخصص نهائياً من النظام؟")) {
      const updated = await deleteCustomWidget(id);
      setCustomWidgets(updated);
      onUpdateDashboard({
        ...dashboard,
        widgets: dashboard.widgets.filter(
          (w) =>
            w.settings?.customWidgetId !== id &&
            w.settings?.customDefinition?.id !== id
        ),
      });
    }
  };

  const handleEditCustomWidget = (e: React.MouseEvent, cw: CustomWidgetDefinition) => {
    e.stopPropagation();
    setEditingCustomWidget(cw);
    setCustomDialogOpen(true);
  };

  // Move layer up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const items = [...dashboard.widgets];
    const temp = items[index - 1]!;
    items[index - 1] = items[index]!;
    items[index] = temp;
    onUpdateDashboard({ ...dashboard, widgets: items });
  };

  // Move layer down
  const handleMoveDown = (index: number) => {
    if (index === dashboard.widgets.length - 1) return;
    const items = [...dashboard.widgets];
    const temp = items[index + 1]!;
    items[index + 1] = items[index]!;
    items[index] = temp;
    onUpdateDashboard({ ...dashboard, widgets: items });
  };

  // Toggle hide on layer
  const handleToggleHide = (id: string) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === id ? { ...w, hidden: !w.hidden } : w
      ),
    });
  };

  // Remove widget from layer
  const handleRemoveWidget = (id: string) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.filter((w) => w.id !== id),
    });
    if (selectedWidgetId === id) {
      setSelectedWidgetId(null);
    }
  };

  // Change colSpan of widget
  const handleChangeColSpan = (id: string, colSpan: number) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === id ? { ...w, colSpan } : w
      ),
    });
  };

  // Update selected widget settings
  const handleUpdateSelectedSettings = (patch: Partial<WidgetConfig["settings"]>) => {
    if (!selectedWidgetId) return;
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === selectedWidgetId
          ? {
              ...w,
              settings: { ...w.settings, ...patch },
            }
          : w
      ),
    });
  };

  // Update selected widget title
  const handleUpdateSelectedTitle = (title: string) => {
    if (!selectedWidgetId) return;
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === selectedWidgetId ? { ...w, title } : w
      ),
    });
  };

  // Drag and drop handlers for layers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const items = [...dashboard.widgets];
    const draggedItem = items[draggedIndex]!;
    items.splice(draggedIndex, 1);
    items.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    onUpdateDashboard({ ...dashboard, widgets: items });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Save general settings
  const handleSaveSettings = () => {
    onUpdateDashboard({
      ...dashboard,
      name: dashboardName.trim() || dashboard.name,
      refreshInterval,
      scope,
      updatedAt: new Date().toISOString(),
    });
    setShowSaveFeedback(true);
    setTimeout(() => setShowSaveFeedback(false), 2500);
  };

  // Handle Tab click from Navigation Rail
  const handleRailTabClick = (tab: StudioTab) => {
    if (!isOpen) {
      setActiveTab(tab);
      onOpenChange(true);
    } else if (activeTab === tab) {
      onOpenChange(false);
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <>
      {/* 1. Backdrop on Mobile / Tablet */}
      {isOpen && (
        <div
          onClick={() => onOpenChange(false)}
          className="fixed left-0 right-0 top-16 md:top-[112px] bottom-0 z-20 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* 2. Side Panel Container (Fixed on the far left, docked under the header) */}
      <div
        className="fixed left-0 top-16 md:top-[112px] bottom-0 z-30 flex pointer-events-auto shadow-2xl"
        dir="rtl"
      >
        {/* ========================================================= */}
        {/* Navigation Rail رأسي ضيق بلون Navy / Dark Blue (#0f172a)  */}
        {/* ========================================================= */}
        <nav
          aria-label="شريط أدوات مصمم اللوحة"
          className="w-16 bg-[#0f172a] text-slate-400 flex flex-col items-center py-4 border-r border-slate-800 shrink-0 z-20 select-none shadow-2xl"
        >
          {/* Top: Studio Main Button */}
          <button
            type="button"
            onClick={() => onOpenChange(!isOpen)}
            title={isOpen ? "إغلاق مصمم اللوحة" : "فتح مصمم اللوحة (Studio)"}
            className={`group relative grid size-11 place-items-center rounded-2xl transition-all duration-200 mb-6 cursor-pointer ${
              isOpen
                ? "bg-[#0b57d0] text-white shadow-[0_0_15px_rgba(11,87,208,0.5)] ring-2 ring-blue-400"
                : "bg-slate-800/80 text-blue-400 hover:bg-[#0b57d0] hover:text-white"
            }`}
          >
            <MaterialIcon name="space_dashboard" size={22} filled />
            {/* Tooltip */}
            <span className="absolute right-full mr-2 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-md z-50">
              {isOpen ? "إغلاق الاستوديو" : "مصمم اللوحة (Studio)"}
            </span>
          </button>

          {/* Navigation Items (Elements, Layers, Settings) */}
          <div className="flex flex-col items-center gap-4 w-full px-1">
            {/* Tab: العناصر (Elements) */}
            <button
              type="button"
              onClick={() => handleRailTabClick("elements")}
              title="العناصر والمكتبة"
              className={`group relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all cursor-pointer ${
                isOpen && activeTab === "elements"
                  ? "bg-blue-600/20 text-white font-bold"
                  : "hover:bg-slate-800/60 hover:text-slate-200 text-slate-400"
              }`}
            >
              {/* Active Indicator Bar on Left Edge */}
              {isOpen && activeTab === "elements" && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-[#0b57d0] rounded-l-full" />
              )}
              <MaterialIcon
                name="widgets"
                size={22}
                filled={isOpen && activeTab === "elements"}
                className={isOpen && activeTab === "elements" ? "text-blue-400" : ""}
              />
              <span className="text-[10px] tracking-tight mt-1 font-medium">العناصر</span>
              {/* Active count indicator dot */}
              <span className="absolute top-1 left-2 size-2 rounded-full bg-emerald-500 ring-2 ring-[#0f172a]" />
            </button>

            {/* Tab: الطبقات (Layers) */}
            <button
              type="button"
              onClick={() => handleRailTabClick("layers")}
              title="ترتيب وإدارة الطبقات"
              className={`group relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all cursor-pointer ${
                isOpen && activeTab === "layers"
                  ? "bg-blue-600/20 text-white font-bold"
                  : "hover:bg-slate-800/60 hover:text-slate-200 text-slate-400"
              }`}
            >
              {isOpen && activeTab === "layers" && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-[#0b57d0] rounded-l-full" />
              )}
              <MaterialIcon
                name="layers"
                size={22}
                filled={isOpen && activeTab === "layers"}
                className={isOpen && activeTab === "layers" ? "text-blue-400" : ""}
              />
              <span className="text-[10px] tracking-tight mt-1 font-medium">الطبقات</span>
            </button>

            {/* Tab: الإعدادات (Settings) */}
            <button
              type="button"
              onClick={() => handleRailTabClick("settings")}
              title="إعدادات اللوحة والعناصر"
              className={`group relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all cursor-pointer ${
                isOpen && activeTab === "settings"
                  ? "bg-blue-600/20 text-white font-bold"
                  : "hover:bg-slate-800/60 hover:text-slate-200 text-slate-400"
              }`}
            >
              {isOpen && activeTab === "settings" && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-[#0b57d0] rounded-l-full" />
              )}
              <MaterialIcon
                name="tune"
                size={22}
                filled={isOpen && activeTab === "settings"}
                className={isOpen && activeTab === "settings" ? "text-blue-400" : ""}
              />
              <span className="text-[10px] tracking-tight mt-1 font-medium">الإعدادات</span>
            </button>

            {/* Quick Action: Refresh */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isFetching}
                title="تحديث بيانات اللوحة"
                className="group relative flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all hover:bg-slate-800/60 hover:text-slate-200 text-slate-400 disabled:opacity-40 cursor-pointer"
              >
                <MaterialIcon
                  name="refresh"
                  size={20}
                  className={isFetching ? "animate-spin text-blue-400" : ""}
                />
                <span className="text-[10px] tracking-tight mt-0.5 font-medium">تحديث</span>
              </button>
            )}

            {/* Quick Action: Export */}
            {onExportDashboard && (
              <button
                type="button"
                onClick={onExportDashboard}
                title="تصدير إلى Excel"
                className="group relative flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all hover:bg-slate-800/60 hover:text-slate-200 text-slate-400 cursor-pointer"
              >
                <MaterialIcon name="download" size={20} />
                <span className="text-[10px] tracking-tight mt-0.5 font-medium">تصدير</span>
              </button>
            )}
          </div>

          {/* Bottom Item: Tab: المظهر (Appearance) */}
          <div className="mt-auto flex flex-col items-center gap-3 w-full px-1 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => handleRailTabClick("appearance")}
              title="تخصيص المظهر والثيم"
              className={`group relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all cursor-pointer ${
                isOpen && activeTab === "appearance"
                  ? "bg-blue-600/20 text-white font-bold"
                  : "hover:bg-slate-800/60 hover:text-slate-200 text-slate-400"
              }`}
            >
              {isOpen && activeTab === "appearance" && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-[#0b57d0] rounded-l-full" />
              )}
              <MaterialIcon
                name="palette"
                size={22}
                filled={isOpen && activeTab === "appearance"}
                className={isOpen && activeTab === "appearance" ? "text-blue-400" : ""}
              />
              <span className="text-[10px] tracking-tight mt-1 font-medium">المظهر</span>
            </button>
          </div>
        </nav>

        {/* ========================================================= */}
        {/* Side Drawer مباشرة بجانب الـ Navigation Rail (280px-340px) */}
        {/* ========================================================= */}
        {isOpen && (
          <aside
            role="dialog"
            aria-label="لوحة مصمم المعلومات"
            className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col shrink-0 animate-in slide-in-from-left duration-200 z-10 overflow-hidden"
          >
            {/* Header: Title + Active Count Badge + Close Button */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950 dark:text-blue-300">
                  <MaterialIcon name="dashboard_customize" size={19} filled />
                </span>
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    مصمم لوحة المعلومات
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-[10px] font-extrabold font-mono text-[#0b57d0] dark:text-blue-300">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{activeCount} عناصر نشطة</span>
                    </Badge>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 transition cursor-pointer"
                title="إغلاق الدرج الجانبي"
              >
                <MaterialIcon name="close" size={18} />
              </button>
            </div>

            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* ==================================================== */}
              {/* TAB 1: العناصر (Elements / Widget Library)            */}
              {/* ==================================================== */}
              {activeTab === "elements" && (
                <div className="space-y-3.5">
                  {/* Create New Custom Element Button */}
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingCustomWidget(null);
                      setCustomDialogOpen(true);
                    }}
                    className="w-full gap-2 rounded-xl text-xs font-black shadow-xs bg-[#0b57d0] hover:bg-[#0842a0] text-white py-2.5 h-auto transition-all"
                  >
                    <MaterialIcon name="add_circle" size={17} />
                    <span>إنشاء عنصر مخصص جديد (عام للنظام)</span>
                  </Button>

                  {/* Search Box */}
                  <div className="relative">
                    <MaterialIcon
                      name="search"
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث في العناصر..."
                      className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pe-9 ps-8 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#0b57d0] focus:outline-none dark:border-slate-800 dark:bg-slate-800/80 dark:text-white"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <MaterialIcon name="cancel" size={16} />
                      </button>
                    )}
                  </div>

                  {/* Section Title */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      العناصر المتاحة ({filteredElements.length})
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      انقر لتفعيل / تعطيل العنصر
                    </span>
                  </div>

                  {/* 2-Column Grid of Widget Cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {filteredElements.map((el) => {
                      const active = isElementActive(el);
                      const elementKey = el.isCustom ? `cw-${el.customId}` : el.type;
                      return (
                        <div
                          key={elementKey}
                          className={`relative flex flex-col items-start p-3 rounded-2xl border text-right transition-all duration-150 cursor-pointer select-none ${
                            active
                              ? "border-[#0b57d0] bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40 shadow-xs ring-1 ring-[#0b57d0]/30"
                              : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-300"
                          }`}
                          onClick={() => handleToggleElement(el)}
                        >
                          {/* Top: Icon + Active Checkmark */}
                          <div className="w-full flex items-center justify-between mb-2">
                            <span
                              className={`grid size-8 place-items-center rounded-xl transition ${
                                active
                                  ? "bg-[#0b57d0] text-white"
                                  : "bg-white text-slate-400 border border-slate-200 dark:border-slate-700 dark:bg-slate-800"
                              }`}
                            >
                              <MaterialIcon name={el.icon} size={18} filled={active} />
                            </span>

                            {active ? (
                              <span className="flex items-center justify-center size-5 rounded-full bg-[#0b57d0] text-white shadow-xs">
                                <MaterialIcon name="check" size={13} />
                              </span>
                            ) : (
                              <span className="flex items-center justify-center size-5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400">
                                <MaterialIcon name="add" size={12} />
                              </span>
                            )}
                          </div>

                          {/* Widget Title */}
                          <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight line-clamp-2">
                            {el.title}
                          </h4>

                          {/* Footer: Category + Public Badge + Custom Actions */}
                          <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 gap-1">
                            <span className="text-[10px] font-medium text-slate-400 line-clamp-1">
                              {el.category}
                            </span>

                            {el.isCustom && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300">
                                  عام
                                </span>
                                {el.definition && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleEditCustomWidget(e, el.definition!)}
                                    title="تعديل هذا العنصر المخصص"
                                    className="size-5 grid place-items-center rounded text-slate-400 hover:text-[#0b57d0] hover:bg-blue-100 dark:hover:bg-blue-950 transition cursor-pointer"
                                  >
                                    <MaterialIcon name="edit" size={12} />
                                  </button>
                                )}
                                {el.customId && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteCustomWidget(e, el.customId!)}
                                    title="حذف هذا العنصر"
                                    className="size-5 grid place-items-center rounded text-slate-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-950 transition cursor-pointer"
                                  >
                                    <MaterialIcon name="delete" size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredElements.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                      <MaterialIcon name="search_off" size={24} className="mx-auto text-slate-300" />
                      <p>لا توجد عناصر مطابقة لبحثك</p>
                    </div>
                  )}
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 2: الطبقات (Layers / Reorder & Visibility)        */}
              {/* ==================================================== */}
              {activeTab === "layers" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      ترتيب العناصر داخل اللوحة ({dashboard.widgets.length})
                    </span>
                    <span className="text-[10px] text-slate-400">اسحب للترتيب</span>
                  </div>

                  <div className="space-y-2">
                    {dashboard.widgets.map((w, index) => {
                      const reg = WIDGET_REGISTRY[w.type];
                      const isSelected = selectedWidgetId === w.id;
                      return (
                        <div
                          key={w.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all ${
                            isSelected
                              ? "border-[#0b57d0] bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30"
                              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                          } ${w.hidden ? "opacity-50" : ""} ${
                            draggedIndex === index ? "opacity-30 border-dashed border-blue-400" : ""
                          }`}
                        >
                          {/* Drag Handle & Info */}
                          <div
                            className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                            onClick={() => {
                              setSelectedWidgetId(w.id);
                              setActiveTab("settings");
                            }}
                          >
                            <span className="cursor-grab text-slate-400 hover:text-slate-600">
                              <MaterialIcon name="drag_indicator" size={16} />
                            </span>
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0b57d0] dark:bg-blue-950">
                              <MaterialIcon name={reg?.icon || "widgets"} size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                                {w.title}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {w.colSpan === 12
                                  ? "عرض كامل (12)"
                                  : w.colSpan === 6
                                  ? "نصف الشاشة (6)"
                                  : `عرض (${w.colSpan})`}
                              </p>
                            </div>
                          </div>

                          {/* Actions: Size + Move Up/Down + Hide/Show + Remove */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Move Up */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveUp(index)}
                              className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-20 dark:hover:bg-slate-800 cursor-pointer"
                              title="تحريك لأعلى"
                            >
                              <MaterialIcon name="arrow_upward" size={14} />
                            </button>

                            {/* Move Down */}
                            <button
                              type="button"
                              disabled={index === dashboard.widgets.length - 1}
                              onClick={() => handleMoveDown(index)}
                              className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-20 dark:hover:bg-slate-800 cursor-pointer"
                              title="تحريك لأسفل"
                            >
                              <MaterialIcon name="arrow_downward" size={14} />
                            </button>

                            {/* Hide / Show */}
                            <button
                              type="button"
                              onClick={() => handleToggleHide(w.id)}
                              className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title={w.hidden ? "إظهار العنصر" : "إخفاء العنصر"}
                            >
                              <MaterialIcon
                                name={w.hidden ? "visibility_off" : "visibility"}
                                size={14}
                              />
                            </button>

                            {/* Remove */}
                            <button
                              type="button"
                              onClick={() => handleRemoveWidget(w.id)}
                              className="grid size-6 place-items-center rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer"
                              title="حذف من اللوحة"
                            >
                              <MaterialIcon name="delete" size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 3: الإعدادات (Settings)                           */}
              {/* ==================================================== */}
              {activeTab === "settings" && (
                <div className="space-y-4">
                  {/* General Dashboard Settings */}
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="text-[11px] font-extrabold text-[#0b57d0] dark:text-blue-400 block">
                      إعدادات لوحة المعلومات
                    </span>

                    {/* Dashboard Switcher & Create */}
                    {dashboards && onSelectDashboard && (
                      <div className="space-y-1.5 pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          اللوحة الحالية
                        </label>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={activeDashboardId || dashboard.id}
                            onChange={(e) => onSelectDashboard(e.target.value)}
                            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                          >
                            {dashboards.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} {d.isDefault ? "(افتراضية)" : ""}
                              </option>
                            ))}
                          </select>
                          {onCreateDashboard && (
                            <button
                              type="button"
                              onClick={() => {
                                const name = prompt("أدخل اسم لوحة المعلومات الجديدة:")?.trim();
                                if (name) {
                                  onCreateDashboard({
                                    id: `dash-${Date.now()}`,
                                    name,
                                    widgets: [...dashboard.widgets],
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
                                  });
                                }
                              }}
                              className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] hover:bg-[#0b57d0] hover:text-white dark:bg-blue-950 dark:text-blue-300 transition cursor-pointer shrink-0"
                              title="إنشاء لوحة جديدة"
                            >
                              <MaterialIcon name="add" size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dashboard Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اسم لوحة المعلومات
                      </label>
                      <input
                        type="text"
                        value={dashboardName}
                        onChange={(e) => setDashboardName(e.target.value)}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    {/* Auto Refresh Interval */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        معدل التحديث التلقائي
                      </label>
                      <select
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                      >
                        <option value={0}>تحديث يدوي فقط</option>
                        <option value={30}>كل 30 ثانية</option>
                        <option value={60}>كل 1 دقيقة</option>
                        <option value={300}>كل 5 دقائق</option>
                      </select>
                    </div>

                    {/* Permissions & Visibility Scope */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        نطاق الظهور والصلاحيات
                      </label>
                      <select
                        value={scope}
                        onChange={(e) => setScope(e.target.value as any)}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                      >
                        <option value="all">متاح للجميع (عام)</option>
                        <option value="executives">الإدارة العليا والتنفيذية</option>
                        <option value="managers">مدراء الأقسام والمشرفين</option>
                        <option value="private">خاص بي فقط</option>
                      </select>
                    </div>

                    {/* Save Settings Button */}
                    <Button
                      type="button"
                      onClick={handleSaveSettings}
                      className="w-full gap-1.5 rounded-xl text-xs font-black shadow-xs mt-2"
                    >
                      <MaterialIcon name="save" size={16} />
                      <span>حفظ الإعدادات</span>
                    </Button>

                    {showSaveFeedback && (
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                        <MaterialIcon name="check_circle" size={14} />
                        <span>تم حفظ إعدادات اللوحة بنجاح!</span>
                      </div>
                    )}
                  </div>

                  {/* Selected Widget Specific Settings */}
                  {selectedWidget && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300 block">
                        تخصيص: {selectedWidget.title}
                      </span>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          عنوان العنصر باللوحة
                        </label>
                        <input
                          type="text"
                          value={selectedWidget.title}
                          onChange={(e) => handleUpdateSelectedTitle(e.target.value)}
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          عرض العنصر في الشبكة (أعمدة)
                        </label>
                        <select
                          value={selectedWidget.colSpan}
                          onChange={(e) =>
                            handleChangeColSpan(selectedWidget.id, Number(e.target.value))
                          }
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                        >
                          <option value={12}>عرض كامل (12 عموداً)</option>
                          <option value={8}>ثلثا الشاشة (8 أعمدة)</option>
                          <option value={6}>نصف الشاشة (6 أعمدة)</option>
                          <option value={4}>ثلث الشاشة (4 أعمدة)</option>
                          <option value={3}>ربع الشاشة (3 أعمدة)</option>
                        </select>
                      </div>

                      {/* Specialized settings */}
                      {selectedWidget.type === "nationalities" && (
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200 pt-1">
                          <input
                            type="checkbox"
                            checked={selectedWidget.settings?.saudizationEnabled !== false}
                            onChange={(e) =>
                              handleUpdateSelectedSettings({
                                saudizationEnabled: e.target.checked,
                              })
                            }
                            className="rounded accent-[#0b57d0]"
                          />
                          <span>تفعيل مؤشر السعودة والتوطين (Donut Chart)</span>
                        </label>
                      )}

                      {selectedWidget.type === "department_distribution" && (
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            الحد الأقصى للأقسام المعروضة
                          </label>
                          <input
                            type="number"
                            min={3}
                            max={20}
                            value={selectedWidget.settings?.limit || 5}
                            onChange={(e) =>
                              handleUpdateSelectedSettings({ limit: Number(e.target.value) })
                            }
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================================================== */}
              {/* TAB 4: المظهر (Appearance / Theme)                    */}
              {/* ==================================================== */}
              {activeTab === "appearance" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                      نمط المظهر العام
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "light", label: "فاتح", icon: "light_mode" },
                        { key: "dark", label: "داكن", icon: "dark_mode" },
                        { key: "system", label: "النظام", icon: "settings_brightness" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onThemeModeChange(item.key as any)}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-bold transition cursor-pointer ${
                            themeMode === item.key
                              ? "border-[#0b57d0] bg-blue-50 text-[#0b57d0] dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 ring-1 ring-[#0b57d0]"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          <MaterialIcon
                            name={item.icon}
                            size={20}
                            filled={themeMode === item.key}
                          />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      هوية Google Material Design 3
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="size-4 rounded-full bg-[#0b57d0]" />
                      <span className="font-bold">Google Blue Executive Palette</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* بطاقة وضع التصميم والتحريك (Design & Movement Mode) أسفل الـ Drawer */}
            {/* ========================================================= */}
            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid size-7 place-items-center rounded-lg transition ${
                        isDesignMode
                          ? "bg-[#0b57d0] text-white"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <MaterialIcon name="tune" size={16} filled={isDesignMode} />
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                        وضع التصميم والتحريك
                      </h4>
                      <span
                        className={`text-[10px] font-extrabold ${
                          isDesignMode
                            ? "text-[#0b57d0] dark:text-blue-400"
                            : "text-slate-400"
                        }`}
                      >
                        {isDesignMode ? "مفعل (وضع التحرير المباشر)" : "مغلق (وضع العرض)"}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <Switch
                    checked={isDesignMode}
                    onCheckedChange={onDesignModeChange}
                  />
                </div>

                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-normal">
                  {isDesignMode
                    ? "مسموح بتحريك العناصر وتغيير أحجامها وظهور أدوات التحكم المباشرة باللوحة."
                    : "اللوحة مقفلة تماماً ضد التحريك أو تعديل المقاسات بالخطأ."}
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Custom Public Widget Dialog */}
      <CustomWidgetDialog
        isOpen={customDialogOpen}
        onClose={() => {
          setCustomDialogOpen(false);
          setEditingCustomWidget(null);
        }}
        onSave={handleSaveCustomWidget}
        initialWidget={editingCustomWidget}
      />
    </>
  );
}
