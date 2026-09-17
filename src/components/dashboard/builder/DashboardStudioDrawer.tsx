/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import type { DashboardLayout, WidgetConfig, WidgetType } from "../types";
import { WIDGET_REGISTRY } from "../registry";

interface DashboardStudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dashboard: DashboardLayout;
  onUpdateDashboard: (updated: DashboardLayout) => void;
  themeMode: "light" | "dark" | "system";
  onThemeModeChange: (mode: "light" | "dark" | "system") => void;
}

type StudioTab = "elements" | "layers" | "settings" | "appearance";

export function DashboardStudioDrawer({
  isOpen,
  onClose,
  dashboard,
  onUpdateDashboard,
  themeMode,
  onThemeModeChange,
}: DashboardStudioDrawerProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("layers");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    dashboard.widgets[0]?.id ?? null
  );

  if (!isOpen) return null;

  const selectedWidget = dashboard.widgets.find((w) => w.id === selectedWidgetId);

  // Add widget
  const handleAddWidget = (type: WidgetType) => {
    const reg = WIDGET_REGISTRY[type];
    const newWidget: WidgetConfig = {
      id: `w-${type}-${Date.now()}`,
      type,
      title: reg.title,
      colSpan: reg.defaultColSpan,
      settings: {},
    };
    onUpdateDashboard({
      ...dashboard,
      widgets: [...dashboard.widgets, newWidget],
    });
    setSelectedWidgetId(newWidget.id);
    setActiveTab("settings");
  };

  // Remove widget
  const handleRemoveWidget = (id: string) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.filter((w) => w.id !== id),
    });
    if (selectedWidgetId === id) {
      setSelectedWidgetId(null);
    }
  };

  // Toggle hide/show
  const handleToggleHide = (id: string) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === id ? { ...w, hidden: !w.hidden } : w
      ),
    });
  };

  // Move up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const items = [...dashboard.widgets];
    const temp = items[index - 1]!;
    items[index - 1] = items[index]!;
    items[index] = temp;
    onUpdateDashboard({ ...dashboard, widgets: items });
  };

  // Move down
  const handleMoveDown = (index: number) => {
    if (index === dashboard.widgets.length - 1) return;
    const items = [...dashboard.widgets];
    const temp = items[index + 1]!;
    items[index + 1] = items[index]!;
    items[index] = temp;
    onUpdateDashboard({ ...dashboard, widgets: items });
  };

  // Change colSpan
  const handleChangeColSpan = (id: string, colSpan: number) => {
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === id ? { ...w, colSpan } : w
      ),
    });
  };

  // Update settings of selected widget
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

  // Update title of selected widget
  const handleUpdateSelectedTitle = (title: string) => {
    if (!selectedWidgetId) return;
    onUpdateDashboard({
      ...dashboard,
      widgets: dashboard.widgets.map((w) =>
        w.id === selectedWidgetId ? { ...w, title } : w
      ),
    });
  };

  const tabs: { key: StudioTab; label: string; icon: string }[] = [
    { key: "layers", label: "الطبقات", icon: "layers" },
    { key: "elements", label: "العناصر", icon: "add_box" },
    { key: "settings", label: "الإعدادات", icon: "tune" },
    { key: "appearance", label: "المظهر", icon: "palette" },
  ];

  return (
    <aside
      role="region"
      aria-label="استوديو تخصيص اللوحة"
      className="fixed inset-y-0 start-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200"
    >
      {/* Studio Header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[#0b57d0] text-white">
            <MaterialIcon name="dashboard_customize" size={20} filled />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              استوديو تخصيص اللوحة
            </h3>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {dashboard.name}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        >
          <MaterialIcon name="close" size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        {tabs.map((t) => {
          const on = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold border-b-2 transition ${
                on
                  ? "border-[#0b57d0] text-[#0b57d0] bg-white dark:bg-slate-800 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <MaterialIcon name={t.icon} size={16} filled={on} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Tab 1: Layers (الطبقات) */}
        {activeTab === "layers" && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              ترتيب العناصر وحجم العرض (12 عموداً):
            </p>
            <div className="space-y-2">
              {dashboard.widgets.map((w, index) => {
                const reg = WIDGET_REGISTRY[w.type];
                const isSelected = selectedWidgetId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`rounded-2xl border p-3 transition ${
                      isSelected
                        ? "border-[#0b57d0] bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    } ${w.hidden ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 cursor-pointer flex-1"
                        onClick={() => {
                          setSelectedWidgetId(w.id);
                          setActiveTab("settings");
                        }}
                      >
                        <MaterialIcon
                          name={reg?.icon || "widgets"}
                          size={18}
                          className="text-[#0b57d0]"
                        />
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white">
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

                      <div className="flex items-center gap-1">
                        {/* Size selector */}
                        <select
                          value={w.colSpan}
                          onChange={(e) => handleChangeColSpan(w.id, Number(e.target.value))}
                          className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          <option value={12}>12</option>
                          <option value={6}>6</option>
                          <option value={4}>4</option>
                        </select>

                        {/* Move Up */}
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                          title="تحريك لأعلى"
                        >
                          <MaterialIcon name="arrow_upward" size={14} />
                        </button>

                        {/* Move Down */}
                        <button
                          type="button"
                          disabled={index === dashboard.widgets.length - 1}
                          onClick={() => handleMoveDown(index)}
                          className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                          title="تحريك لأسفل"
                        >
                          <MaterialIcon name="arrow_downward" size={14} />
                        </button>

                        {/* Hide / Show */}
                        <button
                          type="button"
                          onClick={() => handleToggleHide(w.id)}
                          className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={w.hidden ? "إظهار" : "إخفاء"}
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
                          className="grid size-7 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                          title="حذف الودجت"
                        >
                          <MaterialIcon name="delete" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Elements / Widget Library (العناصر) */}
        {activeTab === "elements" && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              اختر عنصراً من المكتبة لإضافته إلى اللوحة:
            </p>
            <div className="space-y-2.5">
              {(Object.keys(WIDGET_REGISTRY) as WidgetType[]).map((type) => {
                const reg = WIDGET_REGISTRY[type];
                const alreadyAdded = dashboard.widgets.some((w) => w.type === type);
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-[#0b57d0] dark:border-slate-800 dark:bg-slate-900 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950 dark:text-blue-400">
                        <MaterialIcon name={reg.icon} size={20} filled />
                      </span>
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                          {reg.title}
                        </p>
                        <p className="text-[10.5px] text-slate-400 max-w-[200px] truncate">
                          {reg.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddWidget(type)}
                      className="flex items-center gap-1 rounded-xl bg-[#0b57d0] px-3 py-1.5 text-xs font-extrabold text-white hover:bg-[#0842a0] transition"
                    >
                      <MaterialIcon name="add" size={15} />
                      <span>{alreadyAdded ? "إضافة نسخة" : "إضافة"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Widget Settings (الإعدادات) */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            {selectedWidget ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="text-xs font-bold text-slate-500">العنصر المحدد للتعديل:</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedWidget.title}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    عنوان العنصر (Title)
                  </label>
                  <input
                    type="text"
                    value={selectedWidget.title}
                    onChange={(e) => handleUpdateSelectedTitle(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:border-[#0b57d0] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    عرض العنصر بالشبكة (Grid Width)
                  </label>
                  <select
                    value={selectedWidget.colSpan}
                    onChange={(e) =>
                      handleChangeColSpan(selectedWidget.id, Number(e.target.value))
                    }
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value={12}>عرض كامل (12 عموداً)</option>
                    <option value={6}>نصف الشاشة (6 أعمدة)</option>
                    <option value={4}>ثلث الشاشة (4 أعمدة)</option>
                  </select>
                </div>

                {selectedWidget.type === "nationalities" && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedWidget.settings?.saudizationEnabled !== false}
                        onChange={(e) =>
                          handleUpdateSelectedSettings({ saudizationEnabled: e.target.checked })
                        }
                        className="rounded accent-[#0b57d0]"
                      />
                      <span>تفعيل مؤشر السعودة والتوطين (Donut Chart)</span>
                    </label>
                  </div>
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
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="py-12 text-center text-xs text-slate-400">
                يرجى اختيار عنصر من تبويب الطبقات لتعديل إعداداته
              </p>
            )}
          </div>
        )}

        {/* Tab 4: Appearance / Theme (المظهر) */}
        {activeTab === "appearance" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                وضع العرض (Theme Mode)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "light", label: "فاتح", icon: "light_mode" },
                  { key: "dark", label: "داكن", icon: "dark_mode" },
                  { key: "system", label: "تلقائي", icon: "settings_brightness" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onThemeModeChange(item.key as any)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3.5 text-xs font-bold transition ${
                      themeMode === item.key
                        ? "border-[#0b57d0] bg-blue-50 text-[#0b57d0] dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <MaterialIcon name={item.icon} size={20} filled={themeMode === item.key} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-500 mb-2">هوية Google Material Design 3:</p>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="size-4 rounded-full bg-[#0b57d0]" />
                <span className="font-bold">Google Blue Executive Palette</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Studio Footer */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-[#0b57d0] px-5 py-2 text-xs font-extrabold text-white hover:bg-[#0842a0] transition"
        >
          تم التخصيص وإغلاق الاستوديو
        </button>
      </div>
    </aside>
  );
}
