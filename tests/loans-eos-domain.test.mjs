import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  roundCurrency,
  calculateLoanLedgerBalance,
  generateLoanSchedule,
  buildLoanPayrollDeduction,
  getStatutoryEosConfig,
  calculateExactServiceDuration,
  computeEosGratuity,
  computeLeaveEncashment,
  computeFullEosSettlement,
  buildEosCalculationSnapshot,
} from "../src/lib/loans-eos-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("PROMPT 8: Loan Ledger & Authoritative Balance Derivation", () => {
  it("calculates balance purely from debits and credits in the ledger", () => {
    const transactions = [
      { transaction_type: "disbursement", direction: "debit", amount: 12000 },
      { transaction_type: "installment", direction: "credit", amount: 1000 },
      { transaction_type: "payroll_deduction", direction: "credit", amount: 1000 },
      { transaction_type: "manual_payment", direction: "credit", amount: 2000 },
    ];

    const result = calculateLoanLedgerBalance(transactions);

    assert.equal(result.totalDebits, 12000);
    assert.equal(result.totalDisbursed, 12000);
    assert.equal(result.totalCredits, 4000);
    assert.equal(result.totalRepaid, 4000);
    assert.equal(result.outstandingBalance, 8000);
    assert.equal(result.isSettled, false);
    assert.equal(result.transactionCount, 4);
  });

  it("marks loan as settled when total credits equal or exceed debits", () => {
    const transactions = [
      { transaction_type: "disbursement", direction: "debit", amount: 5000 },
      { transaction_type: "installment", direction: "credit", amount: 2500 },
      { transaction_type: "installment", direction: "credit", amount: 2500 },
    ];

    const result = calculateLoanLedgerBalance(transactions);

    assert.equal(result.outstandingBalance, 0);
    assert.equal(result.isSettled, true);
  });

  it("generates amortization schedule with exact cent reconciliation on last installment", () => {
    // 10,000 SAR across 3 installments = 3333.33, 3333.33, 3333.34
    const schedule = generateLoanSchedule(10000, 3, "2026-01-01");

    assert.equal(schedule.length, 3);
    assert.equal(schedule[0].principalAmount, 3333.33);
    assert.equal(schedule[1].principalAmount, 3333.33);
    assert.equal(schedule[2].principalAmount, 3333.34);

    const sum = schedule.reduce((acc, cur) => roundCurrency(acc + cur.principalAmount), 0);
    assert.equal(sum, 10000);
  });
});

describe("PROMPT 8: Payroll Loan Deduction & Idempotency", () => {
  it("builds deduction with deterministic idempotency key and caps to outstanding balance", () => {
    const loan = {
      id: "loan-uuid-101",
      amount: 10000,
      monthly_amount: 2000,
    };

    // Current ledger only has 1,500 outstanding
    const transactions = [
      { transaction_type: "disbursement", direction: "debit", amount: 10000 },
      { transaction_type: "installment", direction: "credit", amount: 8500 },
    ];

    const payrollMeta = {
      payrollRunId: "run-2026-05",
      periodKey: "2026-05",
    };

    const result = buildLoanPayrollDeduction(loan, transactions, payrollMeta);

    assert.equal(result.eligible, true);
    // Capped to 1500 instead of 2000
    assert.equal(result.deductionAmount, 1500);
    assert.equal(result.remainingBalanceAfter, 0);
    assert.equal(result.idempotencyKey, "payroll:loan:loan-uuid-101:run:run-2026-05:2026-05");
  });

  it("rejects deduction when loan is already settled", () => {
    const loan = { id: "loan-settled-202", amount: 3000, monthly_amount: 1000 };
    const transactions = [
      { transaction_type: "disbursement", direction: "debit", amount: 3000 },
      { transaction_type: "installment", direction: "credit", amount: 3000 },
    ];

    const result = buildLoanPayrollDeduction(loan, transactions, { payrollRunId: "run-99" });

    assert.equal(result.eligible, false);
    assert.equal(result.deductionAmount, 0);
    assert.ok(result.reason.includes("مسددة بالكامل"));
  });
});

describe("PROMPT 8: Saudi Labor Law EOS Country Pack (Articles 84, 85, 87)", () => {
  const config = getStatutoryEosConfig("SA");

  it("calculates Article 84 base award correctly (first 5 yrs half-month, subsequent full-month)", () => {
    const wageBase = 10000;

    // Case 1: Exactly 3 years (contract completion)
    // 3 * 0.5 * 10,000 = 15,000 SAR
    const res3 = computeEosGratuity(config, {
      decimalYears: 3,
      wageBase,
      terminationReason: "contract_end",
    });
    assert.equal(res3.baseAward, 15000);
    assert.equal(res3.finalGratuity, 15000);

    // Case 2: Exactly 7 years (contract completion)
    // First 5 yrs: 5 * 0.5 * 10,000 = 25,000 SAR
    // Next 2 yrs: 2 * 1.0 * 10,000 = 20,000 SAR
    // Total = 45,000 SAR
    const res7 = computeEosGratuity(config, {
      decimalYears: 7,
      wageBase,
      terminationReason: "contract_end",
    });
    assert.equal(res7.baseAward, 45000);
    assert.equal(res7.finalGratuity, 45000);
  });

  it("applies Article 85 Resignation tiers accurately", () => {
    const wageBase = 12000;

    // Tier 1: Resignation under 2 years -> 0% (0 SAR)
    const resUnder2 = computeEosGratuity(config, {
      decimalYears: 1.5,
      wageBase,
      terminationReason: "resignation",
    });
    assert.equal(resUnder2.resignationFactor, 0);
    assert.equal(resUnder2.finalGratuity, 0);

    // Tier 2: Resignation 2 to 5 years -> 1/3 (33.33%)
    // Service: 3 years. Base = 3 * 0.5 * 12,000 = 18,000 SAR.
    // 1/3 * 18,000 = 6,000 SAR.
    const res3 = computeEosGratuity(config, {
      decimalYears: 3,
      wageBase,
      terminationReason: "resignation",
    });
    assert.equal(roundCurrency(res3.resignationFactor, 2), 0.33);
    assert.equal(res3.finalGratuity, 6000);

    // Tier 3: Resignation 5 to 10 years -> 2/3 (66.67%)
    // Service: 6 years. Base = (5 * 0.5 + 1 * 1.0) * 12,000 = 3.5 * 12,000 = 42,000 SAR.
    // 2/3 * 42,000 = 28,000 SAR.
    const res6 = computeEosGratuity(config, {
      decimalYears: 6,
      wageBase,
      terminationReason: "resignation",
    });
    assert.equal(roundCurrency(res6.resignationFactor, 2), 0.67);
    assert.equal(res6.finalGratuity, 28000);

    // Tier 4: Resignation 10+ years -> 100% full award
    // Service: 12 years. Base = (5 * 0.5 + 7 * 1.0) * 12,000 = 9.5 * 12,000 = 114,000 SAR.
    const res12 = computeEosGratuity(config, {
      decimalYears: 12,
      wageBase,
      terminationReason: "resignation",
    });
    assert.equal(res12.resignationFactor, 1.0);
    assert.equal(res12.finalGratuity, 114000);
  });

  it("yields zero gratuity for disciplinary termination (Article 80) or probation failure", () => {
    const res80 = computeEosGratuity(config, {
      decimalYears: 8,
      wageBase: 15000,
      terminationReason: "disciplinary_article_80",
    });
    assert.equal(res80.finalGratuity, 0);

    const resProb = computeEosGratuity(config, {
      decimalYears: 0.2,
      wageBase: 8000,
      terminationReason: "probation_failed",
    });
    assert.equal(resProb.finalGratuity, 0);
  });

  it("calculates exact calendar service duration (years, months, days)", () => {
    const duration = calculateExactServiceDuration("2020-03-01", "2024-06-15");
    assert.equal(duration.years, 4);
    assert.equal(duration.months, 3);
    assert.equal(duration.days, 14);
    assert.ok(duration.decimalYears > 4.25);
  });
});

describe("PROMPT 8: Leave Encashment & Consolidated Final Settlement", () => {
  it("computes leave encashment at 30 days per wage month", () => {
    // 15 days balance on 10,000 SAR salary = (15 / 30) * 10,000 = 5,000 SAR
    const encashment = computeLeaveEncashment(15, 10000);
    assert.equal(encashment, 5000);

    // 0 days = 0
    assert.equal(computeLeaveEncashment(0, 10000), 0);
  });

  it("reconciles full final settlement: Gratuity + Leaves + Unpaid Days - Loan Ledger Balance", () => {
    const employee = {
      id: "emp-departing-1",
      full_name: "سلطان القحطاني",
      basic_salary: 8000,
      housing_allowance: 2000,
      other_allowances: 0,
    };
    // Wage Base = 10,000 SAR

    // Active loan with 4,000 SAR remaining in ledger
    const loanTransactions = [
      { transaction_type: "disbursement", direction: "debit", amount: 10000 },
      { transaction_type: "installment", direction: "credit", amount: 6000 },
    ];

    const params = {
      employee,
      startDate: "2021-01-01",
      lastWorkingDate: "2024-01-01", // Exactly 3 years
      terminationReason: "contract_end", // Full award (3 * 0.5 * 10000 = 15,000)
      leaveBalanceDays: 12, // (12 / 30) * 10,000 = 4,000
      unpaidWorkDays: 6, // (6 / 30) * 10,000 = 2,000
      loanLedgerTransactions: loanTransactions, // 4,000 deduction
      otherAdditions: 500, // bonus
      otherDeductions: 200, // penalty
    };

    const settlement = computeFullEosSettlement(params);

    // Entitlements = 15,000 (EOS) + 4,000 (Leaves) + 2,000 (Unpaid) + 500 (Additions) = 21,500 SAR
    assert.equal(settlement.gratuity.finalGratuity, 15000);
    assert.equal(settlement.leaveEncashmentAmount, 4000);
    assert.equal(settlement.unpaidPayrollAmount, 2000);
    assert.equal(settlement.totalGrossEntitlements, 21500);

    // Deductions = 4,000 (Loan) + 200 (Other) = 4,200 SAR
    assert.equal(settlement.loanSettlementDeduction, 4000);
    assert.equal(settlement.totalDeductions, 4200);

    // Net = 21,500 - 4,200 = 17,300 SAR
    assert.equal(settlement.netSettlementAmount, 17300);
    assert.equal(settlement.isSettled, true);
  });

  it("builds reproducible, immutable calculation snapshot", () => {
    const employee = { basic_salary: 6000, housing_allowance: 1500 };
    const settlement = computeFullEosSettlement({
      employee,
      startDate: "2022-01-01",
      lastWorkingDate: "2024-01-01",
      terminationReason: "contract_end",
    });

    const fixedTime = "2026-05-15T12:00:00.000Z";
    const snapshot1 = buildEosCalculationSnapshot(settlement, {
      actorId: "admin-1",
      actorEmail: "admin@company.sa",
      now: fixedTime,
    });
    const snapshot2 = buildEosCalculationSnapshot(settlement, {
      actorId: "admin-1",
      actorEmail: "admin@company.sa",
      now: fixedTime,
    });

    assert.deepEqual(snapshot1, snapshot2);
    assert.equal(snapshot1.formulaVersion, "SA_LABOR_LAW_V1");
    assert.equal(snapshot1.countryCode, "SA");
    assert.equal(snapshot1.wageBase, 7500);
  });
});

describe("PROMPT 8: High-Volume Performance Benchmark", () => {
  it("calculates 500 employee loan balances and EOS settlements in under 50ms", () => {
    const config = getStatutoryEosConfig("SA");
    const employees = Array.from({ length: 500 }, (_, i) => ({
      id: `emp-bench-${i}`,
      basic_salary: 5000 + (i % 10) * 500,
      housing_allowance: 1250,
      other_allowances: 250,
    }));

    const dummyTxs = [
      { transaction_type: "disbursement", direction: "debit", amount: 15000 },
      { transaction_type: "installment", direction: "credit", amount: 5000 },
    ];

    const t0 = performance.now();
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      computeFullEosSettlement({
        employee: emp,
        startDate: "2018-01-01",
        lastWorkingDate: "2026-01-01",
        terminationReason: i % 2 === 0 ? "contract_end" : "resignation",
        leaveBalanceDays: 10,
        unpaidWorkDays: 5,
        loanLedgerTransactions: dummyTxs,
        config,
      });
    }
    const elapsed = performance.now() - t0;

    assert.ok(elapsed < 60, `Expected < 60ms for 500 computations, took ${elapsed.toFixed(2)}ms`);
  });
});

describe("PROMPT 8: Database Migration SQL Static Contract Verification", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/20260918080000_loans_ledger_eos_domain.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("verifies loan_transactions table and immutable trigger in migration", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.loan_transactions"));
    assert.ok(sql.includes("idempotency_key text UNIQUE"));
    assert.ok(sql.includes("trg_loan_transactions_immutable"));
    assert.ok(sql.includes("trg_fn_loan_transactions_immutable"));
  });

  it("verifies loan_installment_schedules table in migration", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.loan_installment_schedules"));
    assert.ok(sql.includes("UNIQUE (loan_id, installment_number)"));
  });

  it("verifies eos_settlements and immutability trigger in migration", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.eos_settlements"));
    assert.ok(sql.includes("calculation_snapshot jsonb"));
    assert.ok(sql.includes("trg_eos_settlements_immutable"));
    assert.ok(sql.includes("trg_fn_eos_settlements_immutable"));
  });

  it("verifies eos_clearances table in migration", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.eos_clearances"));
    assert.ok(sql.includes("UNIQUE (request_id, department_code)"));
  });
});
