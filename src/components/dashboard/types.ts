/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from "react";

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export interface GlobalFilters {
  branch: string;
  department: string;
  sector: string;
  status: string;
  jobLevel: string;
  jobCategory: string;
  nationality: string;
  datePreset: DatePresetKey;
  fromDate: string;
  toDate: string;
  search: string;
}

export type WidgetType =
  | "live_attendance"
  | "employee_status"
  | "pending_requests"
  | "department_distribution"
  | "job_levels"
  | "nationalities"
  | "job_categories"
  | "sectors"
  | "data_explorer"
  | "payroll_summary"
  | "custom";

export type CustomChartType =
  | "kpi_card"
  | "bar"
  | "horizontal_bar"
  | "pie"
  | "donut"
  | "progress_list"
  | "table";

export type CustomDataSource =
  | "employees"
  | "attendance"
  | "leave_requests"
  | "requests"
  | "loans"
  | "payroll_runs";

export type CustomMetricType = "count" | "sum" | "avg" | "percent";

export interface CustomWidgetDefinition {
  id: string;
  title: string;
  description?: string | undefined;
  category: string;
  icon: string;
  defaultColSpan: number;
  isPublic: boolean;
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;

  dataSource: CustomDataSource;
  metricType: CustomMetricType;
  valueField?: string | undefined;
  dimension?: string | undefined;
  chartType: CustomChartType;

  filterCriteria?: {
    status?: string | undefined;
    branch?: string | undefined;
    department?: string | undefined;
    sector?: string | undefined;
    minAmount?: number | undefined;
  } | undefined;
  limit?: number | undefined;
  toneColor?: string | undefined;
}

export interface WidgetSettings {
  title?: string | undefined;
  dimension?: "department" | "branch" | "nationality" | "jobLevel" | "jobCategory" | "sector" | string | undefined;
  chartType?: "bar" | "horizontal_bar" | "pie" | "donut" | "area" | "line" | CustomChartType | undefined;
  limit?: number | undefined;
  showPercent?: boolean | undefined;
  showDataLabels?: boolean | undefined;
  saudizationEnabled?: boolean | undefined;
  sortBy?: "count" | "name" | "amount" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
  customWidgetId?: string | undefined;
  customDefinition?: CustomWidgetDefinition | undefined;
  [key: string]: any;
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  colSpan: number; // 1 to 12 in 12-col grid
  hidden?: boolean;
  settings?: WidgetSettings;
}

export interface DashboardLayout {
  id: string;
  name: string;
  nameEn?: string;
  description?: string;
  isDefault?: boolean;
  icon?: string;
  widgets: WidgetConfig[];
  refreshInterval?: number; // seconds, 0 = manual
  scope?: "all" | "executives" | "managers" | "private";
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeRecord {
  id: string;
  emp_no?: string | null;
  full_name?: string | null;
  national_id?: string | null;
  job_title?: string | null;
  department?: string | null;
  branch?: string | null;
  nationality?: string | null;
  gender?: string | null;
  basic_salary?: number | null;
  allowances?: number | null;
  hire_date?: string | null;
  contract_end?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  manager_name?: string | null;
  // Computed / inferred fields
  sector?: string;
  job_level?: string;
  job_category?: string;
  attendance_status?: string;
  check_in?: string | null;
  check_out?: string | null;
  late_minutes?: number;
  shift_name?: string;
}

export interface AttendanceItem {
  id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  work_date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  late_minutes?: number | null;
}

export interface DrillDownData {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  count: number;
  metricKey: string;
  employees: EmployeeRecord[];
  filterDescription?: string;
}

export interface WidgetRegistryItem {
  type: WidgetType;
  title: string;
  category: "attendance" | "workforce" | "requests" | "analytics" | "finance";
  description: string;
  icon: string;
  defaultColSpan: number;
  availableChartTypes?: ("bar" | "horizontal_bar" | "pie" | "donut" | "area" | "line")[];
  component: (props: WidgetProps) => ReactNode;
}

export interface WidgetProps {
  widget: WidgetConfig;
  filters: GlobalFilters;
  employees: EmployeeRecord[];
  allEmployees: EmployeeRecord[];
  attendance: AttendanceItem[];
  leaveRequests: any[];
  requests: any[];
  loans: any[];
  payrollRuns: any[];
  isEditing?: boolean;
  onDrillDown: (data: Omit<DrillDownData, "isOpen">) => void;
  onUpdateSettings?: (settings: WidgetSettings) => void;
}
