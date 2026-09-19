// Type definitions for PROMPT 10 Reports & Analytics Pure Domain Engine

export interface CsvHeader {
  key: string;
  label: string;
}

export interface GenerateSecureCsvOptions {
  title?: string;
  headers: CsvHeader[];
  rows: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  userEmail?: string;
  generatedAt?: string;
}

export interface UserScope {
  type?: "all" | "branch" | "department" | "self" | undefined;
  branchId?: string | undefined;
  departmentId?: string | undefined;
  targetEmpNo?: string | undefined;
}

export interface QueryPagination {
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ReportQueryContract {
  reportId: string;
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  appliedFilters: Record<string, unknown>;
  isScoped: boolean;
  scopeNotice: string | null;
}

export interface AggregationRule {
  key: string;
  field: string;
  type: "count" | "sum" | "avg" | "min" | "max" | "distinctCount";
}

export interface DataQualityIssue {
  id: string;
  type: "missing_salary" | "unassigned_org" | "missing_checkout" | "suspicious_attendance" | "payroll_unreconciled" | "orphan_loan";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  recordId: string | number | undefined;
  details: Record<string, string | number | boolean | null>;
}

export interface DataQualityReport {
  hasIssues: boolean;
  issues: DataQualityIssue[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
  };
}

export interface DashboardMetricParams {
  employees?: Array<Record<string, unknown>>;
  attendanceToday?: Array<Record<string, unknown>>;
  payrollRuns?: Array<Record<string, unknown>>;
  loans?: Array<Record<string, unknown>>;
}

export interface DashboardMetricsResult {
  saudizationRate: {
    metricId: string;
    displayName: string;
    value: number;
    unit: string;
    saudiCount: number;
    totalActive: number;
    isMock: boolean;
    sourceTable: string;
  };
  attendanceAdherence: {
    metricId: string;
    displayName: string;
    value: number;
    unit: string;
    presentCount: number;
    lateCount: number;
    avgLateMinutes: number;
    isMock: boolean;
    sourceTable: string;
  };
  monthlyPayrollCost: {
    metricId: string;
    displayName: string;
    value: number;
    currency: string;
    periodKey: string;
    isMock: boolean;
    sourceTable: string;
  };
  loanPortfolio: {
    metricId: string;
    displayName: string;
    outstandingAmount: number;
    recoveryRate: number;
    currency: string;
    isMock: boolean;
    sourceTable: string;
  };
}

export function sanitizeCsvCell(value: unknown): string;
export function generateSecureCsv(options: GenerateSecureCsvOptions): string;
export function buildReportQueryContract(
  reportId: string,
  filters?: Record<string, unknown>,
  userScope?: UserScope,
  pagination?: QueryPagination
): ReportQueryContract;
export function aggregateReportMetrics(
  rows: Record<string, unknown>[],
  rules: AggregationRule[]
): Record<string, number>;
export function detectReportDataQualityIssues(dataset: {
  employees?: Array<Record<string, unknown>>;
  attendance?: Array<Record<string, unknown>>;
  payrollItems?: Array<Record<string, unknown>>;
  loans?: Array<Record<string, unknown>>;
}): DataQualityReport;
export function evaluateDashboardWidgetMetrics(
  params: DashboardMetricParams
): DashboardMetricsResult;
