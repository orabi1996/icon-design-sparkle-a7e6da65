// =====================================================================
// PROMPT 10: Reports & Analytics Server Functions
// Server-Side Scoped Querying, Formula-Injection-Safe Export,
// Data Quality Diagnostics, and Verifiable Dashboard Metrics.
// =====================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  generateSecureCsv,
  buildReportQueryContract,
  detectReportDataQualityIssues,
  evaluateDashboardWidgetMetrics,
  type CsvHeader,
} from "./reports-analytics-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

// Maps report family IDs to authoritative database tables and permission resources
const REPORT_CONFIG: Record<
  string,
  { table: string; resource: string; defaultSort: string; isSensitive?: boolean }
> = {
  "payroll-sheet": { table: "payroll_items", resource: "payroll", defaultSort: "created_at", isSensitive: true },
  "payroll-adjustments": { table: "payroll_adjustments", resource: "payroll", defaultSort: "created_at", isSensitive: true },
  "bank-statement": { table: "payroll_items", resource: "payroll", defaultSort: "created_at", isSensitive: true },
  "financial-data": { table: "employees", resource: "financial", defaultSort: "emp_no", isSensitive: true },
  "loans-balance": { table: "loans", resource: "financial", defaultSort: "created_at", isSensitive: true },
  "loans-data": { table: "loan_transactions", resource: "financial", defaultSort: "transaction_date", isSensitive: true },
  "attendance": { table: "attendance_records", resource: "attendance", defaultSort: "work_date" },
  "attendance-detailed": { table: "attendance_records", resource: "attendance", defaultSort: "work_date" },
  "daily-late": { table: "attendance_records", resource: "attendance", defaultSort: "work_date" },
  "absence-daily": { table: "attendance_records", resource: "attendance", defaultSort: "work_date" },
  "basic-data": { table: "employees", resource: "employees", defaultSort: "emp_no" },
  "employee-contracts-report": { table: "employees", resource: "employees", defaultSort: "emp_no" },
  "employee-leaves": { table: "leave_requests", resource: "leaves", defaultSort: "start_date" },
  "archive": { table: "archived_documents", resource: "archive", defaultSort: "created_at", isSensitive: true },
};

/**
 * 1. Server-Side Scoped & Paginated Report Query
 */
export const queryReportDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        reportId: z.string(),
        filters: z.record(z.unknown()).default({}),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        sortColumn: z.string().optional(),
        sortAscending: z.boolean().default(false),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const config = REPORT_CONFIG[data.reportId] || {
      table: "employees",
      resource: "employees",
      defaultSort: "id",
    };

    // 1. Authorize user and determine geographic / department scope
    const user = await requirePermission(context, config.resource, "read");
    const db = await getAdminDb();

    const userScope = {
      type: user.role === "admin" ? ("all" as const) : user.branchScopes.length ? ("branch" as const) : ("all" as const),
      branchId: user.branchScopes[0] ?? undefined,
      departmentId: user.departmentScopes[0] ?? undefined,
      targetEmpNo: user.empNo ?? undefined,
    };

    // 2. Build deterministic query contract with scoped limits
    const contract = buildReportQueryContract(data.reportId, data.filters, userScope, {
      page: data.page,
      pageSize: data.pageSize,
    });

    // 3. Build PostgREST query
    let query = db.from(config.table).select("*", { count: "exact" });

    // Apply filters
    const f = contract.appliedFilters;
    if (f["branch"]) query = query.eq("branch", f["branch"]);
    if (f["department"]) query = query.eq("department", f["department"]);
    if (f["status"]) query = query.eq("status", f["status"]);
    if (f["dateFrom"]) query = query.gte("work_date", f["dateFrom"]);
    if (f["dateTo"]) query = query.lte("work_date", f["dateTo"]);
    if (f["payrollRunId"]) query = query.eq("payroll_run_id", f["payrollRunId"]);

    // Apply sorting & pagination range
    const sortCol = data.sortColumn || config.defaultSort;
    query = query
      .order(sortCol, { ascending: data.sortAscending })
      .range(contract.offset, contract.offset + contract.limit - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(`فشل استعلام بيانات التقرير: ${error.message}`);

    return {
      success: true,
      reportId: data.reportId,
      rows: (rows as Array<Record<string, any>>) || [],
      totalCount: count || 0,
      page: contract.page,
      pageSize: contract.pageSize,
      isScoped: contract.isScoped,
      scopeNotice: contract.scopeNotice,
    };
  });

/**
 * 2. Export Report Securely (with Formula Injection Protection & Security Audit)
 */
export const exportReportSecureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        reportId: z.string(),
        reportTitle: z.string().default("تقرير النظام"),
        filters: z.record(z.unknown()).default({}),
        headers: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
          })
        ),
        format: z.enum(["csv", "xlsx"]).default("csv"),
        maxRecords: z.number().int().min(1).max(5000).default(2000),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const config = REPORT_CONFIG[data.reportId] || {
      table: "employees",
      resource: "employees",
      defaultSort: "id",
    };

    // 1. Enforce export permission on the resource
    const user = await requirePermission(context, config.resource, "export");
    const db = await getAdminDb();

    const userScope = {
      type: user.role === "admin" ? ("all" as const) : user.branchScopes.length ? ("branch" as const) : ("all" as const),
      branchId: user.branchScopes[0] ?? undefined,
      departmentId: user.departmentScopes[0] ?? undefined,
      targetEmpNo: user.empNo ?? undefined,
    };

    // 2. Query scoped rows up to maxRecords limit
    const contract = buildReportQueryContract(data.reportId, data.filters, userScope, {
      page: 1,
      pageSize: data.maxRecords,
    });

    let query = db.from(config.table).select("*");
    const f = contract.appliedFilters;
    if (f["branch"]) query = query.eq("branch", f["branch"]);
    if (f["department"]) query = query.eq("department", f["department"]);
    if (f["status"]) query = query.eq("status", f["status"]);
    if (f["dateFrom"]) query = query.gte("work_date", f["dateFrom"]);
    if (f["dateTo"]) query = query.lte("work_date", f["dateTo"]);
    if (f["payrollRunId"]) query = query.eq("payroll_run_id", f["payrollRunId"]);

    query = query
      .order(config.defaultSort, { ascending: false })
      .limit(data.maxRecords);

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استخراج بيانات التصدير: ${error.message}`);

    const safeRows = (rows as Record<string, unknown>[]) || [];

    // 3. Generate sanitized CSV with formula injection prevention
    const csvContent = generateSecureCsv({
      title: data.reportTitle,
      headers: data.headers as CsvHeader[],
      rows: safeRows,
      userEmail: user.email,
      metadata: {
        "نطاق التصدير": contract.isScoped ? (contract.scopeNotice || "مقيد") : "شامل كافة الفروع",
        "عدد السجلات المستخرجة": safeRows.length,
      },
    });

    // 4. Log security audit event for data export
    await logSecurityAudit(db, {
      eventType: "data_exported",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: config.resource,
      action: "export",
      details: {
        reportId: data.reportId,
        format: data.format,
        recordCount: safeRows.length,
        filters: contract.appliedFilters,
        isScoped: contract.isScoped,
      },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${data.reportId}-${timestamp}.csv`;

    return {
      success: true,
      filename,
      rowCount: safeRows.length,
      csvContent,
      isScoped: contract.isScoped,
    };
  });

/**
 * 3. Live Data Quality & Reconciliation Diagnostic Function
 */
export const getReportingDataQualityIssuesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Requires authenticated HR/Admin staff
    await requirePermission(context, "reports.archive", "read");
    const db = await getAdminDb();

    // Query from database view or run pure engine over active sample
    const { data: dbIssues, error } = await db
      .from("vw_reporting_data_quality_issues")
      .select("*")
      .limit(200);

    if (error) {
      // Fallback to pure domain scanner if view is not yet compiled
      const { data: empSample } = await db.from("employees").select("*").limit(500);
      const { data: attSample } = await db.from("attendance_records").select("*").limit(500);
      const { data: paySample } = await db.from("payroll_items").select("*").limit(500);
      const { data: loanSample } = await db.from("loans").select("*").limit(500);

      const pureResult = detectReportDataQualityIssues({
        employees: (empSample as Record<string, unknown>[]) || [],
        attendance: (attSample as Record<string, unknown>[]) || [],
        payrollItems: (paySample as Record<string, unknown>[]) || [],
        loans: (loanSample as Record<string, unknown>[]) || [],
      });

      const safeIssues = pureResult.issues.map((i) => ({
        id: String(i.id),
        type: i.type,
        severity: i.severity,
        description: i.description,
        recordId: i.recordId != null ? String(i.recordId) : null,
        details: Object.fromEntries(
          Object.entries(i.details).map(([k, v]) => [
            k,
            typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : v == null ? null : String(v),
          ])
        ),
      }));

      return {
        success: true,
        source: "domain_engine_fallback",
        hasIssues: pureResult.hasIssues,
        issues: safeIssues,
        summary: pureResult.summary,
      };
    }

    const issues = (dbIssues || []).map((row: any) => {
      const details: Record<string, string | number | boolean | null> = {};
      if (row.details && typeof row.details === "object") {
        for (const [k, v] of Object.entries(row.details)) {
          details[k] =
            typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : v == null ? null : String(v);
        }
      }
      return {
        id: `${row.issue_type}-${row.record_id}`,
        type: row.issue_type,
        severity: row.severity,
        description: row.description_ar,
        recordId: row.record_id != null ? String(row.record_id) : null,
        details,
      };
    });

    return {
      success: true,
      source: "database_view",
      hasIssues: issues.length > 0,
      issues,
      summary: {
        total: issues.length,
        critical: issues.filter((i: any) => i.severity === "critical").length,
        high: issues.filter((i: any) => i.severity === "high").length,
        medium: issues.filter((i: any) => i.severity === "medium").length,
      },
    };
  });

/**
 * 4. Executive Dashboard Verified KPIs Function
 */
export const getExecutiveDashboardMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context, "organization", "read");
    const db = await getAdminDb();

    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      { data: employees },
      { data: attendanceToday },
      { data: payrollRuns },
      { data: loans },
    ] = await Promise.all([
      db.from("employees").select("id, emp_no, full_name, status, nationality, branch, department"),
      db.from("attendance_records").select("id, employee_id, work_date, check_in, check_out, late_minutes, status").eq("work_date", todayStr),
      db.from("payroll_runs").select("id, period_key, status, total_net_salaries").order("created_at", { ascending: false }).limit(3),
      db.from("loans").select("id, employee_id, amount, approved_amount, paid_amount, status"),
    ]);

    const metrics = evaluateDashboardWidgetMetrics({
      employees: (employees as Record<string, unknown>[]) || [],
      attendanceToday: (attendanceToday as Record<string, unknown>[]) || [],
      payrollRuns: (payrollRuns as Record<string, unknown>[]) || [],
      loans: (loans as Record<string, unknown>[]) || [],
    });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      metrics,
    };
  });
