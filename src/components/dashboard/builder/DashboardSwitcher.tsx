import { useState } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardLayout } from "../types";
import { DEFAULT_DASHBOARDS } from "../services/dashboardStorage";

interface DashboardSwitcherProps {
  dashboards: DashboardLayout[];
  activeDashboardId: string;
  onSelectDashboard: (id: string) => void;
  onCreateDashboard: (newBoard: DashboardLayout) => void;
  onResetDashboards: () => void;
}

export function DashboardSwitcher({
  dashboards,
  activeDashboardId,
  onSelectDashboard,
  onCreateDashboard,
  onResetDashboards,
}: DashboardSwitcherProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [templateId, setTemplateId] = useState("executive");

  const current = dashboards.find((d) => d.id === activeDashboardId) || dashboards[0]!;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const baseTemplate =
      dashboards.find((d) => d.id === templateId) || DEFAULT_DASHBOARDS[0]!;

    const newLayout: DashboardLayout = {
      id: `custom-${Date.now()}`,
      name: newTitle.trim(),
      description: newDesc.trim() || "لوحة مؤشرات تنفيذية مخصصة",
      icon: "dashboard",
      widgets: JSON.parse(JSON.stringify(baseTemplate.widgets)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onCreateDashboard(newLayout);
    setNewTitle("");
    setNewDesc("");
    setModalOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Switcher Select */}
      <div className="relative flex items-center">
        <select
          value={activeDashboardId}
          onChange={(e) => onSelectDashboard(e.target.value)}
          className="h-9 rounded-2xl border border-slate-200 bg-white pe-8 ps-3 text-xs font-black text-slate-800 shadow-2xs hover:border-[#0b57d0] focus:border-[#0b57d0] focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        >
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.isDefault ? "(افتراضية)" : ""}
            </option>
          ))}
        </select>
        <MaterialIcon
          name="unfold_more"
          size={16}
          className="pointer-events-none absolute left-2 text-slate-400"
        />
      </div>

      {/* New Dashboard Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModalOpen(true)}
        className="gap-1.5 rounded-2xl border-primary/30 text-primary hover:bg-primary/10 font-bold text-xs"
        title="إنشاء لوحة تنفيذية جديدة"
      >
        <MaterialIcon name="add" size={16} />
        <span>لوحة جديدة</span>
      </Button>

      {/* Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl text-card-foreground text-right animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[#0b57d0] dark:bg-blue-950 dark:text-blue-400">
                  <MaterialIcon name="dashboard_customize" size={20} filled />
                </span>
                <h3 className="text-sm font-black text-foreground">
                  إنشاء لوحة معلومات جديدة
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setModalOpen(false)}
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <MaterialIcon name="close" size={18} />
              </Button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  اسم اللوحة
                </label>
                <Input
                  type="text"
                  placeholder="مثال: لوحة تقارير الإدارة الإقليمية"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="h-10 w-full rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  الوصف (اختياري)
                </label>
                <Input
                  type="text"
                  placeholder="متابعة مؤشرات الفرع أو القسم..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="h-10 w-full rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  بدء بالنسخ من قالب:
                </label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground"
                >
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl text-xs font-bold text-muted-foreground"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl px-5 text-xs font-bold"
                >
                  إنشاء وحفظ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
