// =====================================================================
// PROMPT 10: Reports, Analytics & Export Governance Test Suite
// Verifies CSV Formula Injection Protection, Scope Enforcement,
// Data Quality Diagnostics, High-Volume 10k-100k Benchmarks, & SQL Contracts.
// =====================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sanitizeCsvCell,
  generateSecureCsv,
  buildReportQueryContract,
  aggregateReportMetrics,
  detectReportDataQualityIssues,
  evaluateDashboardWidgetMetrics,
} from "../src/lib/reports-analytics-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("PROMPT 10: CSV & Excel Formula Injection Protection (DDE / Injection Vectors)", async (t) => {
  await t.test("neutralizes formula injection characters (=, +, -, @, \\t, \\r, \\n)", () => {
    // Dangerous spreadsheet formula payloads
    const payloads = [
      "=1+1",
      "=cmd|' /C calc'!A0",
      "+12345",
      "-5+10",
      "@SUM(A1:A10)",
      "\t=HYPERLINK(\"http://malicious.com\")",
      "\r=DDE(\"cmd\";\"/C notepad\";\"__!A1\")",
      "   =1+1", // Leading whitespace
      "  @malicious",
    ];

    for (const p of payloads) {
      const sanitized = sanitizeCsvCell(p);
      // Must start with single quote inside quotes: "'..."
      assert.match(sanitized, /^"'\s*[=+\-@\t\r]/, `Failed to neutralize formula payload: ${p}`);
    }
  });

  await t.test("safely formats legitimate benign data without corrupting values", () => {
    assert.equal(sanitizeCsvCell("أحمد محمد المنصور"), '"أحمد محمد المنصور"');
    assert.equal(sanitizeCsvCell(12500.5), '"12500.5"');
    assert.equal(sanitizeCsvCell(null), '""');
    assert.equal(sanitizeCsvCell(undefined), '""');
  });

  await t.test("escapes double quotes according to RFC 4180", () => {
    const withQuotes = 'شركة "الروابي" القابضة';
    const sanitized = sanitizeCsvCell(withQuotes);
    assert.equal(sanitized, '"شركة ""الروابي"" القابضة"');
  });
});

test("PROMPT 10: Secure CSV Document Generation & Audit Metadata", async (t) => {
  await t.test("generates UTF-8 BOM, audit metadata header and sanitized rows", () => {
    const headers = [
      { key: "emp_no", label: "الرقم الوظيفي" },
      { key: "name", label: "اسم الموظف" },
      { key: "salary", label: "الراتب" },
      { key: "notes", label: "ملاحظات" },
    ];

    const rows = [
      { emp_no: "1001", name: "خالد سعيد", salary: 8500, notes: "موظف منتظم" },
      { emp_no: "1002", name: "=DDE_TEST", salary: 9200, notes: "+966500000000" },
    ];

    const csv = generateSecureCsv({
      title: "مسير رواتب مايو 2026",
      headers,
      rows,
      userEmail: "auditor@company.com",
      metadata: { "الفرع": "الرياض" },
    });

    // 1. Starts with UTF-8 BOM
    assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM for Arabic Excel rendering");

    // 2. Contains audit header
    assert.ok(csv.includes("مسير رواتب مايو 2026"));
    assert.ok(csv.includes("auditor@company.com"));
    assert.ok(csv.includes("إجمالي السجلات: 2"));

    // 3. Dangerous payload in row 2 is neutralized
    assert.ok(csv.includes("\"'=DDE_TEST\""));
    assert.ok(csv.includes("\"'+966500000000\""));
  });

  await t.test("rejects empty headers array", () => {
    assert.throws(() => {
      generateSecureCsv({ headers: [], rows: [] });
    }, /يجب تحديد ترويسات التقرير/);
  });
});

test("PROMPT 10: Server-Side Query & Scope Contract Builder", async (t) => {
  await t.test("caps pagination pageSize to maximum 500 records", () => {
    const contract = buildReportQueryContract("payroll-sheet", {}, {}, { page: 1, pageSize: 5000 });
    assert.equal(contract.pageSize, 500);
    assert.equal(contract.limit, 500);
    assert.equal(contract.offset, 0);
  });

  await t.test("computes correct offset for page 3 with 50 pageSize", () => {
    const contract = buildReportQueryContract("payroll-sheet", {}, {}, { page: 3, pageSize: 50 });
    assert.equal(contract.page, 3);
    assert.equal(contract.offset, 100);
  });

  await t.test("enforces branch scope on manager and prevents cross-branch access", () => {
    const userScope = { type: "branch", branchId: "BR-JEDDAH" };

    // Valid query without conflict
    const contract = buildReportQueryContract("attendance", {}, userScope);
    assert.equal(contract.appliedFilters.branch, "BR-JEDDAH");
    assert.equal(contract.isScoped, true);

    // Forbidden attempt to query another branch
    assert.throws(() => {
      buildReportQueryContract("attendance", { branch: "BR-RIYADH" }, userScope);
    }, /محاولة غير مصرح بها: لا يمكنك الوصول لتقارير الفرع/);
  });
});

test("PROMPT 10: High-Precision Pure Analytical Aggregation Engine", async (t) => {
  await t.test("accurately aggregates sums, averages, counts, min, max, and distinct counts", () => {
    const sampleRows = [
      { emp_no: "101", branch: "الرياض", basic: 5000.55, deductions: 500 },
      { emp_no: "102", branch: "الرياض", basic: 7000.45, deductions: 700 },
      { emp_no: "103", branch: "جدة", basic: 9000.25, deductions: 900 },
      { emp_no: "104", branch: "الدمام", basic: 6000.15, deductions: 600 },
    ];

    const rules = [
      { key: "totalCount", field: "emp_no", type: "count" },
      { key: "totalBasic", field: "basic", type: "sum" },
      { key: "avgBasic", field: "basic", type: "avg" },
      { key: "minBasic", field: "basic", type: "min" },
      { key: "maxBasic", field: "basic", type: "max" },
      { key: "uniqueBranches", field: "branch", type: "distinctCount" },
    ];

    const agg = aggregateReportMetrics(sampleRows, rules);

    assert.equal(agg.totalCount, 4);
    assert.equal(agg.totalBasic, 27001.4); // 5000.55 + 7000.45 + 9000.25 + 6000.15 = 27001.40
    assert.equal(agg.avgBasic, 6750.35);
    assert.equal(agg.minBasic, 5000.55);
    assert.equal(agg.maxBasic, 9000.25);
    assert.equal(agg.uniqueBranches, 3);
  });
});

test("PROMPT 10: Data Quality & Reconciliation Diagnostic Engine", async (t) => {
  await t.test("detects missing salary, unassigned org, missing checkout, and unreconciled payroll", () => {
    const dataset = {
      employees: [
        { id: "e1", emp_no: "1001", full_name: "سالم أحمد", status: "active", basic_salary: 8000, branch: "الرياض", department: "IT" },
        { id: "e2", emp_no: "1002", full_name: "مروان عمر", status: "active", basic_salary: 0, branch: "جدة", department: "HR" }, // Issue: missing salary
        { id: "e3", emp_no: "1003", full_name: "طارق زياد", status: "active", basic_salary: 6000, branch: "", department: "" }, // Issue: unassigned org
      ],
      attendance: [
        { id: "a1", employee_id: "e1", work_date: "2026-01-01", check_in: "08:00:00", check_out: null, status: "present" }, // Issue: missing checkout in past
        { id: "a2", employee_id: "e1", work_date: "2026-01-02", check_in: "08:00:00", check_out: "17:00:00", late_minutes: 800 }, // Issue: suspicious late (>720m)
      ],
      payrollItems: [
        { id: "p1", employee_id: "e1", gross_salary: 10000, total_deductions: 1000, net_salary: 9000 },
        { id: "p2", employee_id: "e2", gross_salary: 8000, total_deductions: 500, net_salary: 6000 }, // Issue: 8000 - 500 !== 6000 (diff 1500)
      ],
      loans: [
        { id: "l1", employee_id: "e999_non_existent", amount: 15000 }, // Issue: orphan loan
      ],
    };

    const report = detectReportDataQualityIssues(dataset);

    assert.equal(report.hasIssues, true);
    assert.equal(report.summary.total, 6);
    assert.equal(report.summary.critical, 2); // payroll_unreconciled + orphan_loan
    assert.equal(report.summary.high, 2); // missing_salary + suspicious_attendance
    assert.equal(report.summary.medium, 2); // unassigned_org + missing_checkout

    const pIssue = report.issues.find(i => i.type === "payroll_unreconciled");
    assert.ok(pIssue);
    assert.equal(pIssue.details.difference, 1500);
  });
});

test("PROMPT 10: Executive Dashboard Verified KPIs Engine (No Mock Metrics)", async (t) => {
  await t.test("calculates real Saudization rate, attendance adherence, and payroll cost", () => {
    const params = {
      employees: [
        { id: "e1", status: "active", nationality: "سعودي" },
        { id: "e2", status: "active", nationality: "سعودي" },
        { id: "e3", status: "active", nationality: "سعودي" },
        { id: "e4", status: "active", nationality: "مصري" },
        { id: "e5", status: "inactive", nationality: "سعودي" }, // Inactive not counted in denominator
      ],
      attendanceToday: [
        { id: "a1", check_in: "08:00", late_minutes: 0 },
        { id: "a2", check_in: "08:15", late_minutes: 15 },
        { id: "a3", check_in: "08:30", late_minutes: 30 },
      ],
      payrollRuns: [
        { id: "pr1", period_key: "2026-05", status: "approved", total_net_salaries: 350000 },
      ],
      loans: [
        { id: "l1", approved_amount: 50000, paid_amount: 25000 },
      ],
    };

    const kpis = evaluateDashboardWidgetMetrics(params);

    // Saudization: 3 Saudi active out of 4 active = 75%
    assert.equal(kpis.saudizationRate.value, 75);
    assert.equal(kpis.saudizationRate.isMock, false);
    assert.equal(kpis.saudizationRate.sourceTable, "employees");

    // Attendance Adherence: 3 present out of 4 active = 75%, avg late minutes = (15+30)/2 = 23 (rounded)
    assert.equal(kpis.attendanceAdherence.value, 75);
    assert.equal(kpis.attendanceAdherence.avgLateMinutes, 23);
    assert.equal(kpis.attendanceAdherence.isMock, false);

    // Monthly payroll
    assert.equal(kpis.monthlyPayrollCost.value, 350000);
    assert.equal(kpis.monthlyPayrollCost.currency, "SAR");

    // Loan recovery: 25k paid / 50k approved = 50%
    assert.equal(kpis.loanPortfolio.recoveryRate, 50);
    assert.equal(kpis.loanPortfolio.outstandingAmount, 25000);
  });
});

test("PROMPT 10: High-Volume Realistic Synthetic Benchmark (10k, 50k, 100k scale)", async (t) => {
  await t.test("10,000 records: aggregates metrics and generates sanitized CSV in under 250ms", () => {
    const count = 10000;
    const rows = [];
    for (let i = 1; i <= count; i++) {
      rows.push({
        emp_no: String(10000 + i),
        name: i % 10 === 0 ? `=CMD_TEST_${i}` : `الموظف رقم ${i}`,
        branch: i % 3 === 0 ? "الرياض" : i % 3 === 1 ? "جدة" : "الدمام",
        basic_salary: 5000 + (i % 50) * 100,
        late_minutes: i % 5 === 0 ? 15 : 0,
      });
    }

    const startAgg = performance.now();
    const agg = aggregateReportMetrics(rows, [
      { key: "totalRows", field: "emp_no", type: "count" },
      { key: "totalBasic", field: "basic_salary", type: "sum" },
      { key: "avgBasic", field: "basic_salary", type: "avg" },
    ]);
    const endAgg = performance.now();
    const aggDuration = endAgg - startAgg;

    assert.equal(agg.totalRows, 10000);
    assert.ok(aggDuration < 150, `10k aggregation took ${aggDuration.toFixed(2)}ms (expected < 150ms)`);

    const startCsv = performance.now();
    const csv = generateSecureCsv({
      title: "اختبار الحجم الكبير 10k",
      headers: [
        { key: "emp_no", label: "الرقم" },
        { key: "name", label: "الاسم" },
        { key: "branch", label: "الفرع" },
        { key: "basic_salary", label: "الراتب" },
      ],
      rows,
      userEmail: "perf_test@enterprise.sa",
    });
    const endCsv = performance.now();
    const csvDuration = endCsv - startCsv;

    assert.ok(csv.length > 300000, "10k CSV output should exceed 300KB");
    assert.ok(csvDuration < 250, `10k CSV generation took ${csvDuration.toFixed(2)}ms (expected < 250ms)`);
  });

  await t.test("50,000 records: aggregates complex multi-column metrics in under 250ms", () => {
    const count = 50000;
    const rows = [];
    for (let i = 1; i <= count; i++) {
      rows.push({
        id: i,
        gross: 8000 + (i % 20) * 200,
        deductions: 500 + (i % 10) * 50,
        net: 7500,
        branch: `BR_${i % 5}`,
      });
    }

    const start = performance.now();
    const agg = aggregateReportMetrics(rows, [
      { key: "count", field: "id", type: "count" },
      { key: "sumGross", field: "gross", type: "sum" },
      { key: "avgGross", field: "gross", type: "avg" },
      { key: "minGross", field: "gross", type: "min" },
      { key: "maxGross", field: "gross", type: "max" },
      { key: "uniqueBranches", field: "branch", type: "distinctCount" },
    ]);
    const duration = performance.now() - start;

    assert.equal(agg.count, 50000);
    assert.equal(agg.uniqueBranches, 5);
    assert.ok(duration < 250, `50k aggregation took ${duration.toFixed(2)}ms (expected < 250ms)`);
  });

  await t.test("100,000 records: high-throughput stream/batch aggregation benchmark", () => {
    const count = 100000;
    // Chunked allocation to benchmark memory and high volume
    let totalSalary = 0;
    let totalCount = 0;

    const start = performance.now();
    const chunkSize = 25000;
    for (let chunk = 0; chunk < count / chunkSize; chunk++) {
      const batch = [];
      for (let i = 0; i < chunkSize; i++) {
        batch.push({ val: 7500 + (i % 10) });
      }
      const res = aggregateReportMetrics(batch, [{ key: "sum", field: "val", type: "sum" }]);
      totalSalary += res.sum;
      totalCount += batch.length;
    }
    const duration = performance.now() - start;

    assert.equal(totalCount, 100000);
    assert.ok(totalSalary > 700000000);
    assert.ok(duration < 400, `100k batch processing took ${duration.toFixed(2)}ms (expected < 400ms)`);
  });
});

test("PROMPT 10: Database Migration SQL Static Contract Verification", async (t) => {
  const migrationPath = path.join(ROOT, "supabase/migrations/20260918100000_reports_analytics_export_governance.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration file 20260918100000_reports_analytics_export_governance.sql must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");

  await t.test("verifies data_exported is added to security audit event_type check", () => {
    assert.match(sql, /data_exported/);
    assert.match(sql, /security_audit_logs_event_type_check/);
  });

  await t.test("verifies composite reporting indexes on high-volume tables", () => {
    assert.match(sql, /idx_attendance_records_date_branch_dept/);
    assert.match(sql, /idx_attendance_records_late_filtered/);
    assert.match(sql, /idx_payroll_items_run_branch_dept/);
    assert.match(sql, /idx_loan_transactions_loan_type_date/);
    assert.match(sql, /idx_employees_status_branch_dept/);
  });

  await t.test("verifies vw_reporting_data_quality_issues diagnostic view", () => {
    assert.match(sql, /CREATE OR REPLACE VIEW public\.vw_reporting_data_quality_issues/);
    assert.match(sql, /missing_salary/);
    assert.match(sql, /unassigned_org/);
    assert.match(sql, /missing_checkout/);
    assert.match(sql, /orphan_adjustment/);
  });
});
