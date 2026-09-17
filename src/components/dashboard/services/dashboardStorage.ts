/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { DashboardLayout } from "../types";

export const DEFAULT_DASHBOARDS: DashboardLayout[] = [
  {
    id: "executive",
    name: "لوحة الإدارة التنفيذية",
    nameEn: "Executive Dashboard",
    description: "متابعة شاملة للقوى العاملة، مؤشرات الحضور المباشر، الطلبات المعلقة، وتوزيعات الأقسام والجنسيات.",
    isDefault: true,
    icon: "dashboard",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
    widgets: [
      {
        id: "w-att",
        type: "live_attendance",
        title: "حضور وانصراف اليوم المباشر",
        colSpan: 12,
      },
      {
        id: "w-status",
        type: "employee_status",
        title: "مؤشرات حالات القوى العاملة",
        colSpan: 12,
      },
      {
        id: "w-requests",
        type: "pending_requests",
        title: "مركز الطلبات المعلقة والموافقات",
        colSpan: 6,
      },
      {
        id: "w-nat",
        type: "nationalities",
        title: "الجنسيات ومؤشر السعودة والتوطين",
        colSpan: 6,
        settings: { saudizationEnabled: true, chartType: "donut" },
      },
      {
        id: "w-dept",
        type: "department_distribution",
        title: "توزيع الموظفين حسب الأقسام",
        colSpan: 6,
        settings: { limit: 6, showPercent: true },
      },
      {
        id: "w-levels",
        type: "job_levels",
        title: "توزيع المستويات الوظيفية",
        colSpan: 6,
        settings: { chartType: "bar" },
      },
      {
        id: "w-payroll",
        type: "payroll_summary",
        title: "ملخص الأجور ومسيرات الرواتب",
        colSpan: 12,
      },
      {
        id: "w-explorer",
        type: "data_explorer",
        title: "مستكشف البيانات التحليلي (Data Explorer)",
        colSpan: 12,
      },
    ],
  },
  {
    id: "operations",
    name: "لوحة عمليات الموارد البشرية",
    nameEn: "HR Operations Dashboard",
    description: "متابعة عمليات التشغيل اليومية، فئات الوظائف، القطاعات، والطلبات.",
    icon: "engineering",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
    widgets: [
      {
        id: "w-att-op",
        type: "live_attendance",
        title: "حضور وانصراف اليوم",
        colSpan: 12,
      },
      {
        id: "w-requests-op",
        type: "pending_requests",
        title: "مركز الطلبات المعلقة",
        colSpan: 6,
      },
      {
        id: "w-dept-op",
        type: "department_distribution",
        title: "توزيع الموظفين حسب الأقسام",
        colSpan: 6,
      },
      {
        id: "w-categories-op",
        type: "job_categories",
        title: "توزيع الفئات الوظيفية",
        colSpan: 6,
      },
      {
        id: "w-sectors-op",
        type: "sectors",
        title: "توزيع القطاعات الوظيفية",
        colSpan: 6,
      },
      {
        id: "w-explorer-op",
        type: "data_explorer",
        title: "مستكشف البيانات التحليلي",
        colSpan: 12,
      },
    ],
  },
  {
    id: "finance",
    name: "لوحة الرواتب والمالية",
    nameEn: "Payroll & Finance Dashboard",
    description: "متابعة تكاليف الأجور والرواتب ومسيرات الصرف والسلف والقروض.",
    icon: "payments",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-17T09:00:00.000Z",
    widgets: [
      {
        id: "w-payroll-fin",
        type: "payroll_summary",
        title: "ملخص الأجور ومسيرات الرواتب",
        colSpan: 12,
      },
      {
        id: "w-status-fin",
        type: "employee_status",
        title: "حالات الموظفين والأثر المالي",
        colSpan: 12,
      },
      {
        id: "w-dept-fin",
        type: "department_distribution",
        title: "توزيع الموظفين والأقسام",
        colSpan: 6,
      },
      {
        id: "w-requests-fin",
        type: "pending_requests",
        title: "السلف وطلبات الصرف المعلقة",
        colSpan: 6,
      },
      {
        id: "w-explorer-fin",
        type: "data_explorer",
        title: "مستكشف البيانات التحليلي",
        colSpan: 12,
      },
    ],
  },
];

const STORAGE_KEY = "hrms_custom_dashboards";
const ACTIVE_DASHBOARD_KEY = "hrms_active_dashboard_id";

/**
 * Load all dashboards from localStorage or defaults, with async sync to Supabase app_settings
 */
export function loadDashboards(): DashboardLayout[] {
  if (typeof window === "undefined") return DEFAULT_DASHBOARDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to load dashboards from localStorage:", err);
  }
  return DEFAULT_DASHBOARDS;
}

/**
 * Save dashboards to localStorage and asynchronously sync to Supabase app_settings
 */
export async function saveDashboards(dashboards: DashboardLayout[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));

    // Also persist to Supabase app_settings in background
    const jsonString = JSON.stringify(dashboards);
    const { data: existing } = await (supabase as any)
      .from("app_settings")
      .select("id")
      .eq("section", "dashboard")
      .eq("key", "dashboards_config")
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
          key: "dashboards_config",
          value: jsonString,
        });
    }
  } catch (err) {
    console.error("Failed to save dashboards:", err);
  }
}

/**
 * Get active dashboard ID
 */
export function getActiveDashboardId(): string {
  if (typeof window === "undefined") return "executive";
  return localStorage.getItem(ACTIVE_DASHBOARD_KEY) || "executive";
}

/**
 * Set active dashboard ID
 */
export function setActiveDashboardId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_DASHBOARD_KEY, id);
}
