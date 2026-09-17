/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { CustomWidgetDefinition } from "../types";

export const DEFAULT_CUSTOM_WIDGETS: CustomWidgetDefinition[] = [
  {
    id: "cw-branch-distribution",
    title: "توزيع الموظفين حسب الفروع",
    description: "مقارنة أعداد الكوادر البشرية الموزعة على فروع المنشأة ومراكز العمل.",
    category: "القوى العاملة",
    icon: "storefront",
    defaultColSpan: 6,
    isPublic: true,
    dataSource: "employees",
    metricType: "count",
    dimension: "branch",
    chartType: "horizontal_bar",
    limit: 6,
    toneColor: "#0b57d0",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
  },
  {
    id: "cw-loans-by-dept",
    title: "إجمالي السلف حسب الأقسام",
    description: "مجموع مبالغ السلف والقروض الممنوحة لموظفي كل قسم تنظيمي.",
    category: "المالية والأجور",
    icon: "payments",
    defaultColSpan: 6,
    isPublic: true,
    dataSource: "loans",
    metricType: "sum",
    valueField: "amount",
    dimension: "department",
    chartType: "donut",
    limit: 5,
    toneColor: "#b06000",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
  },
  {
    id: "cw-leaves-by-type",
    title: "طلبات الإجازات حسب النوع",
    description: "توزيع طلبات الإجازات المسجلة حسب نوع الإجازة (سنوية، مرضية، اضطرارية).",
    category: "العمليات والموافقات",
    icon: "beach_access",
    defaultColSpan: 6,
    isPublic: true,
    dataSource: "leave_requests",
    metricType: "count",
    dimension: "type",
    chartType: "progress_list",
    limit: 6,
    toneColor: "#137333",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
  },
];

const CUSTOM_WIDGETS_STORAGE_KEY = "hrms_custom_widgets_library";

/**
 * Load all custom widgets from localStorage or initial defaults
 */
export function loadCustomWidgets(): CustomWidgetDefinition[] {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_WIDGETS;
  try {
    const raw = localStorage.getItem(CUSTOM_WIDGETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to load custom widgets from localStorage:", err);
  }
  return DEFAULT_CUSTOM_WIDGETS;
}

/**
 * Persist custom widgets to localStorage and background sync to Supabase app_settings
 */
export async function saveAllCustomWidgets(
  widgets: CustomWidgetDefinition[]
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_WIDGETS_STORAGE_KEY, JSON.stringify(widgets));

    // Also persist to Supabase app_settings table in background
    const jsonString = JSON.stringify(widgets);
    const { data: existing } = await (supabase as any)
      .from("app_settings")
      .select("id")
      .eq("section", "dashboard")
      .eq("key", "custom_widgets_library")
      .maybeSingle();

    if (existing?.id) {
      await (supabase as any)
        .from("app_settings")
        .update({ value: jsonString, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await (supabase as any)
        .from("app_settings")
        .insert({
          section: "dashboard",
          key: "custom_widgets_library",
          value: jsonString,
        });
    }
  } catch (err) {
    console.error("Failed to save custom widgets to Supabase app_settings:", err);
  }
}

/**
 * Add or update a custom widget
 */
export async function saveCustomWidget(
  widget: CustomWidgetDefinition
): Promise<CustomWidgetDefinition[]> {
  const current = loadCustomWidgets();
  const existingIdx = current.findIndex((w) => w.id === widget.id);
  let updated: CustomWidgetDefinition[];

  if (existingIdx !== -1) {
    updated = [...current];
    updated[existingIdx] = {
      ...widget,
      updatedAt: new Date().toISOString(),
    };
  } else {
    updated = [widget, ...current];
  }

  await saveAllCustomWidgets(updated);
  return updated;
}

/**
 * Delete a custom widget by id
 */
export async function deleteCustomWidget(
  id: string
): Promise<CustomWidgetDefinition[]> {
  const current = loadCustomWidgets();
  const updated = current.filter((w) => w.id !== id);
  await saveAllCustomWidgets(updated);
  return updated;
}

/**
 * Find custom widget by id
 */
export function getCustomWidgetById(
  id: string
): CustomWidgetDefinition | undefined {
  const all = loadCustomWidgets();
  return all.find((w) => w.id === id);
}
