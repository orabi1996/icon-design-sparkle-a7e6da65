// =====================================================================
// PROMPT 11: Final Enterprise Integration & End-to-End Scenarios
// Tests the 5 complete business lifecycles and security attack vectors:
// 1. Hire to Payroll & SAMA WPS
// 2. Leave Request to Workflow & Leave Ledger & Payroll
// 3. Loan Disbursement to Idempotent Payroll Deduction & Settlement
// 4. Employee Transfer & Branch Scope Security
// 5. Termination & Consolidated Saudi EOS Settlement
// 6. Security Attacks & Immutability Edge Cases
// =====================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  roundCurrency,
  getDefaultStatutoryConfig,
  computeEmployeePayroll,
  reconcilePayrollTotals,
  generateWpsBankFile,
} from "../src/lib/payroll-core.mjs";

import {
  calculateLoanLedgerBalance,
  computeFullEosSettlement,
  buildLoanPayrollDeduction,
  computeEosGratuity,
  computeLeaveEncashment,
} from "../src/lib/loans-eos-core.mjs";

import {
  advanceWorkflowState,
  validateDecisionPayload,
} from "../src/lib/workflow-core.mjs";

import {
  computeBalanceFromLedger,
  calculateDeductibleDays,
  validateLeaveEligibility,
} from "../src/lib/leave-core.mjs";

import {
  buildReportQueryContract,
  detectReportDataQualityIssues,
  sanitizeCsvCell,
} from "../src/lib/reports-analytics-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("PROMPT 11: SCENARIO 1 — Hire to Payroll & SAMA WPS Bank File", async (t) => {
  // 1. Employee hired with salary components
  const newEmployee = {
    id: "emp-e2e-001",
    emp_no: "10091",
    full_name: "عبدالله بن فهد الدوسري",
    national_id: "1087654321", // Valid 10-digit Saudi ID
    nationality: "سعودي",
    status: "active",
    branch: "الرياض",
    department: "تقنية المعلومات",
    basic_salary: 10000,
    housing_allowance: 2500,
    transport_allowance: 1000,
    iban: "SA0380000000608010167519", // Valid 24-character Saudi IBAN
    bank_code: "RJHI",
  };

  // 2. Attendance with observed lateness
  const attendance = {
    work_date: "2026-05-10",
    check_in: "08:25:00", // 25 mins late
    check_out: "17:00:00",
    late_minutes: 25,
    status: "present",
  };

  // Hourly rate for 25 min lateness deduction: (basic / 30 / 8) * (25/60)
  const minuteRate = (newEmployee.basic_salary / 30 / 8) / 60;
  const latenessDeduction = Math.round((25 * minuteRate + Number.EPSILON) * 100) / 100;

  // 3. Compute deterministic payroll run with GOSI Country Pack
  const statutory = getDefaultStatutoryConfig();
  const payrollItem = computeEmployeePayroll(
    {
      ...newEmployee,
      is_saudi: true,
    },
    [
      {
        component_code: "LATENESS_DEDUCTION",
        component_type: "deduction",
        amount: latenessDeduction,
      },
    ],
    statutory
  );

  // Gross = 10000 + 2500 + 1000 = 13500
  // GOSI Base = 12500 -> 9.75% = 1218.75
  assert.equal(payrollItem.grossSalary, 13500);
  assert.equal(payrollItem.socialInsuranceEmployee, 1218.75);
  assert.equal(payrollItem.socialInsuranceCompany, 1468.75);
  assert.equal(payrollItem.netSalary, 13500 - (1218.75 + latenessDeduction));

  // 4. SAMA WPS Bank File generation
  const wps = generateWpsBankFile(
    {
      batchReference: "BATCH-202605-E2E",
      bankCode: "RJHI",
      payerIban: "SA1180000999999999999999",
      molEstId: "7001234567",
      valueDate: "2026-05-27",
    },
    [
      {
        emp_no: newEmployee.emp_no,
        national_id: newEmployee.national_id,
        employee_name: newEmployee.full_name,
        iban: newEmployee.iban,
        net_salary: payrollItem.netSalary,
        basic_salary: newEmployee.basic_salary,
        housing_allowance: newEmployee.housing_allowance,
        other_earnings: newEmployee.transport_allowance,
        deductions: payrollItem.totalDeductions,
      },
    ]
  );

  assert.ok(wps.fileContent.includes("SCR|SA1180000999999999999999|RJHI"), "WPS header must contain correct SCR record");
  assert.ok(wps.fileContent.includes(`EDR|${newEmployee.emp_no}|${newEmployee.national_id}`), "WPS detail must contain employee national ID");
  assert.ok(wps.fileContent.includes(newEmployee.iban), "WPS detail must contain employee IBAN");
  assert.equal(wps.recordCount, 1);
  assert.match(wps.fileHash, /^[a-f0-9]{64}$/, "WPS must generate a valid 64-char SHA-256 hash");
});

test("PROMPT 11: SCENARIO 2 — Leave Request to Multi-Stage Workflow & Leave Ledger", async (t) => {
  const employeeId = "emp-e2e-002";

  // 1. Initial leave ledger entries: 30 opening + 15 accrual = 45 available
  const ledgerEntries = [
    {
      employee_id: employeeId,
      transaction_type: "opening",
      amount: 30,
      effective_date: "2026-01-01",
    },
    {
      employee_id: employeeId,
      transaction_type: "accrual",
      amount: 15,
      effective_date: "2026-06-01",
    },
  ];

  const balance = computeBalanceFromLedger(ledgerEntries);
  assert.equal(balance.availableBalance, 45);

  // 2. Calculate deductible days for 10-day leave
  const daysResult = calculateDeductibleDays("2026-07-01", "2026-07-10", {
    count_weekends: true,
    annual_entitlement: 30,
  });
  assert.equal(daysResult.deductibleDays, 10);

  // 3. Validate leave eligibility
  const eligibility = validateLeaveEligibility(
    { employment_status: "active", gender: "male" },
    { annual_entitlement: 30, min_duration: 1, max_duration: 30 },
    daysResult.deductibleDays,
    balance.availableBalance
  );
  assert.equal(eligibility.eligible, true);

  // 4. Multi-stage approval workflow: Manager -> HR Director
  const stage1 = {
    id: "stage-1",
    stage_order: 1,
    code: "DIRECT_MGR",
    name_ar: "المدير المباشر",
    stage_type: "sequential",
    assignee_type: "direct_manager",
    sla_hours: 24,
  };
  const stage2 = {
    id: "stage-2",
    stage_order: 2,
    code: "HR_DIR",
    name_ar: "مدير الموارد البشرية",
    stage_type: "sequential",
    assignee_type: "hr",
    sla_hours: 48,
  };

  const requestInstance = {
    id: "req-e2e-101",
    request_number: 101,
    request_type_id: "leave_annual",
    workflow_version_id: "wf-v1",
    employee_id: employeeId,
    title: "طلب إجازة سنوية",
    request_payload: { days: 10, start_date: "2026-07-01" },
    current_stage_id: "stage-1",
    current_stage_order: 1,
    status: "pending",
    submitted_at: "2026-06-20T08:00:00Z",
  };

  // Direct Manager approves stage 1
  const step1 = advanceWorkflowState({
    requestInstance,
    currentStage: stage1,
    allStages: [stage1, stage2],
    action: "approve",
    actor: { user_id: "mgr-001", roles: ["manager"] },
  });

  assert.equal(step1.ok, true);
  assert.equal(step1.nextStatus, "pending");
  assert.equal(step1.nextStage.id, "stage-2");

  // HR Director approves stage 2
  const step2 = advanceWorkflowState({
    requestInstance: {
      ...requestInstance,
      current_stage_id: "stage-2",
      current_stage_order: 2,
    },
    currentStage: stage2,
    allStages: [stage1, stage2],
    action: "approve",
    actor: { user_id: "hr-001", roles: ["hr"] },
  });

  assert.equal(step2.ok, true);
  assert.equal(step2.nextStatus, "approved");
  assert.equal(step2.nextStage, null);

  // 5. Deduct consumption from ledger
  const finalLedger = [
    ...ledgerEntries,
    {
      employee_id: employeeId,
      transaction_type: "consumption",
      amount: -10,
      effective_date: "2026-07-01",
    },
  ];

  const finalBalance = computeBalanceFromLedger(finalLedger);
  assert.equal(finalBalance.availableBalance, 35);
});

test("PROMPT 11: SCENARIO 3 — Loan Disbursement to Idempotent Payroll Deduction & Payoff", async (t) => {
  const loanId = "loan-e2e-003";
  const employeeId = "emp-e2e-003";

  // 1. Loan disbursed: 12,000 SAR (debit transaction)
  const initialTransactions = [
    {
      loan_id: loanId,
      transaction_type: "disbursement",
      direction: "debit",
      amount: 12000,
      transaction_date: "2026-01-01",
    },
  ];

  let balance = calculateLoanLedgerBalance(initialTransactions);
  assert.equal(balance.outstandingBalance, 12000);

  // 2. Payroll run deducts installment of 1,000 SAR with Idempotency Key
  const loanRecord = { id: loanId, employee_id: employeeId, monthly_amount: 1000, approved_amount: 12000 };
  const deduction1 = buildLoanPayrollDeduction(
    loanRecord,
    initialTransactions,
    { payrollRunId: "run-2026-01", periodKey: "2026-01" }
  );

  assert.equal(deduction1.deductionAmount, 1000);
  assert.equal(deduction1.idempotencyKey, "payroll:loan:loan-e2e-003:run:run-2026-01:2026-01");

  // 3. Attempt duplicate deduction in the same payroll run -> must yield identical idempotency key
  const duplicateDeduction = buildLoanPayrollDeduction(
    loanRecord,
    initialTransactions,
    { payrollRunId: "run-2026-01", periodKey: "2026-01" }
  );

  assert.equal(duplicateDeduction.idempotencyKey, deduction1.idempotencyKey, "Database UNIQUE constraint will reject duplicate key");

  // 4. Record the installment in ledger (credit transaction)
  const updatedTransactions = [
    ...initialTransactions,
    {
      loan_id: loanId,
      transaction_type: "payroll_deduction",
      direction: "credit",
      amount: 1000,
      transaction_date: "2026-01-28",
      idempotency_key: deduction1.idempotencyKey,
    },
  ];

  balance = calculateLoanLedgerBalance(updatedTransactions);
  assert.equal(balance.outstandingBalance, 11000);
  assert.equal(balance.totalRepaid, 1000);
});

test("PROMPT 11: SCENARIO 4 — Employee Transfer & Branch Scope Security", async (t) => {
  // Manager in Branch A (Riyadh)
  const managerScopeRiyadh = {
    type: "branch",
    branchId: "BR-RIYADH",
  };

  // Employee initially in Riyadh
  const contractRiyadh = buildReportQueryContract("attendance", { branch: "BR-RIYADH" }, managerScopeRiyadh);
  assert.equal(contractRiyadh.appliedFilters.branch, "BR-RIYADH");
  assert.equal(contractRiyadh.isScoped, true);

  // Employee transfers to Jeddah
  // Riyadh manager attempts to query Jeddah reports -> must be strictly blocked!
  assert.throws(() => {
    buildReportQueryContract("attendance", { branch: "BR-JEDDAH" }, managerScopeRiyadh);
  }, /محاولة غير مصرح بها: لا يمكنك الوصول لتقارير الفرع BR-JEDDAH/);
});

test("PROMPT 11: SCENARIO 5 — Termination & Consolidated Saudi EOS Settlement", async (t) => {
  const employee = {
    id: "emp-e2e-005",
    basic_salary: 10000,
    housing_allowance: 2500,
  };

  // Full consolidated settlement integrating Gratuity (Article 84) + Leave Encashment - Loan Balance
  const settlement = computeFullEosSettlement({
    employee,
    startDate: "2020-01-01",
    lastWorkingDate: "2026-01-01", // Exactly 6 full years
    terminationReason: "contract_ended", // Article 84: 100% entitlement
    leaveBalanceDays: 15,
    loanLedgerTransactions: [
      {
        transaction_type: "disbursement",
        direction: "debit",
        amount: 5000,
      },
    ],
  });

  // 1. Wage base: 10000 + 2500 = 12,500 SAR
  assert.equal(settlement.wageBase, 12500);

  // 2. Gratuity for 6 years: (5 * 0.5 * 12500) + (1 * 1.0 * 12500) = 31250 + 12500 = 43,750 SAR
  assert.equal(settlement.gratuity.finalGratuity, 43750);

  // 3. Leave Encashment: (15 / 30) * 12500 = 6,250 SAR
  assert.equal(settlement.leaveEncashmentAmount, 6250);

  // 4. Loan Balance deduction: 5,000 SAR
  assert.equal(settlement.loanSettlementDeduction, 5000);

  // 5. Consolidated Net Settlement: 43750 + 6250 - 5000 = 45,000 SAR
  assert.equal(settlement.totalGrossEntitlements, 50000);
  assert.equal(settlement.totalDeductions, 5000);
  assert.equal(settlement.netSettlementAmount, 45000);
});

test("PROMPT 11: Security Attacks & Immutability Edge Cases", async (t) => {
  await t.test("neutralizes formula injection payloads with leading whitespace and symbols", () => {
    const dangerousPayloads = [
      "=1+1",
      "+12345",
      "-5000",
      "@SUM(A1:B10)",
      "\t=CMD|' /C calc'!A0",
      "\r=HYPERLINK(\"http://evil.com\")",
      "   =ALERT(1)",
    ];

    for (const p of dangerousPayloads) {
      const safe = sanitizeCsvCell(p);
      assert.match(safe, /^"'\s*[=+\-@\t\r]/);
    }
  });

  await t.test("detects data quality issues without silent failure", () => {
    const dataset = {
      employees: [
        { id: "e1", emp_no: "101", status: "active", basic_salary: 0, branch: "الرياض", department: "IT" }, // Missing salary
        { id: "e2", emp_no: "102", status: "active", basic_salary: 5000, branch: "", department: "" }, // Missing org
      ],
      attendance: [
        { id: "a1", work_date: "2025-01-01", check_in: "08:00", check_out: null, status: "present" }, // Missing checkout
      ],
      payrollItems: [
        { id: "p1", gross_salary: 10000, total_deductions: 1000, net_salary: 8000 }, // Discrepancy 1000
      ],
      loans: [
        { id: "l1", employee_id: "non_existent_emp", amount: 5000 }, // Orphan loan
      ],
    };

    const issues = detectReportDataQualityIssues(dataset);
    assert.equal(issues.hasIssues, true);
    assert.equal(issues.summary.total, 5);
    assert.equal(issues.summary.critical, 2); // payroll unreconciled + orphan loan
  });

  await t.test("verifies database immutability triggers exist in migration scripts", () => {
    const migrations = [
      "supabase/migrations/20260918010000_security_foundation_auth_authorization.sql",
      "supabase/migrations/20260918070000_payroll_domain_wps.sql",
      "supabase/migrations/20260918080000_loans_ledger_eos_domain.sql",
      "supabase/migrations/20260918090000_operational_modules_enterprise.sql",
    ];

    for (const m of migrations) {
      const sql = fs.readFileSync(path.join(ROOT, m), "utf8");
      assert.match(sql, /TRIGGER.*immutable/i, `Migration ${m} must define immutability trigger`);
    }
  });
});
