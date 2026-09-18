/**
 * PROMPT 5 - Leave Balances, Ledger & Permits Domain Tests
 * Tests for leave-core.mjs pure domain logic (matches actual API signatures)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toIsoDate,
  detectDateOverlap,
  calculateDeductibleDays,
  computeBalanceFromLedger,
  validateLeaveEligibility,
  validatePermitQuota,
} from "../src/lib/leave-core.mjs";

// ---------------------------------------------------------------------------
// toIsoDate
// ---------------------------------------------------------------------------
describe("toIsoDate", () => {
  it("converts Date to YYYY-MM-DD", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    assert.equal(toIsoDate(d), "2026-03-15");
  });
  it("passes through a string date", () => {
    assert.equal(toIsoDate("2026-07-01"), "2026-07-01");
  });
  it("returns empty string for falsy input", () => {
    assert.equal(toIsoDate(null), "");
  });
});

// ---------------------------------------------------------------------------
// detectDateOverlap — takes objects { from_date, to_date }
// ---------------------------------------------------------------------------
describe("detectDateOverlap", () => {
  const make = (f, t) => ({ from_date: f, to_date: t });

  it("detects identical ranges as overlap", () => {
    assert.equal(detectDateOverlap(make("2026-06-01","2026-06-05"), make("2026-06-01","2026-06-05")), true);
  });
  it("detects partial overlap (a starts inside b)", () => {
    assert.equal(detectDateOverlap(make("2026-06-03","2026-06-07"), make("2026-06-01","2026-06-05")), true);
  });
  it("detects partial overlap (a ends inside b)", () => {
    assert.equal(detectDateOverlap(make("2026-05-29","2026-06-02"), make("2026-06-01","2026-06-05")), true);
  });
  it("detects a containing b", () => {
    assert.equal(detectDateOverlap(make("2026-05-28","2026-06-10"), make("2026-06-01","2026-06-05")), true);
  });
  it("returns false for adjacent non-overlapping ranges", () => {
    // a ends 2026-05-31, b starts 2026-06-01 -> no overlap
    assert.equal(detectDateOverlap(make("2026-05-25","2026-05-31"), make("2026-06-01","2026-06-05")), false);
  });
  it("returns false for completely separate ranges", () => {
    assert.equal(detectDateOverlap(make("2026-07-01","2026-07-10"), make("2026-06-01","2026-06-05")), false);
  });
  it("returns false when inputs are missing required fields", () => {
    assert.equal(detectDateOverlap(null, make("2026-06-01","2026-06-05")), false);
  });
});

// ---------------------------------------------------------------------------
// calculateDeductibleDays — returns { totalCalendarDays, deductibleDays, ... }
// weekends = Fri(5) + Sat(6) excluded by default (count_weekends: false)
// ---------------------------------------------------------------------------
describe("calculateDeductibleDays", () => {
  it("counts only working days Mon-Thu for a 6-day span", () => {
    // 2026-06-01 Mon -> 2026-06-06 Sat: Mon Tue Wed Thu Fri Sat
    // Fri(05) + Sat(06) excluded -> 4 deductible
    const r = calculateDeductibleDays("2026-06-01","2026-06-06", {}, []);
    assert.equal(r.deductibleDays, 4);
    assert.equal(r.excludedWeekends, 2);
  });
  it("excludes an official holiday mid-week (holiday as range object)", () => {
    // Mon Tue Wed(holiday) Thu -> 3
    const holidays = [{ from_date: "2026-06-03", to_date: "2026-06-03" }];
    const r = calculateDeductibleDays("2026-06-01","2026-06-04", {}, holidays);
    assert.equal(r.deductibleDays, 3);
    assert.equal(r.excludedHolidays, 1);
  });
  it("returns 0 deductible for a weekend-only span", () => {
    const r = calculateDeductibleDays("2026-06-05","2026-06-06", {}, []);
    assert.equal(r.deductibleDays, 0);
    assert.equal(r.excludedWeekends, 2);
  });
  it("counts weekends when count_weekends=true", () => {
    const r = calculateDeductibleDays("2026-06-05","2026-06-06", { count_weekends: true }, []);
    assert.equal(r.deductibleDays, 2);
  });
  it("handles a single working day", () => {
    const r = calculateDeductibleDays("2026-06-01","2026-06-01", {}, []);
    assert.equal(r.deductibleDays, 1);
    assert.equal(r.totalCalendarDays, 1);
  });
});

// ---------------------------------------------------------------------------
// computeBalanceFromLedger — uses entry.amount (not entry.days)
// returns { currentBalance, reservedBalance, availableBalance }
// ---------------------------------------------------------------------------
describe("computeBalanceFromLedger", () => {
  it("returns zeroes for empty ledger", () => {
    const r = computeBalanceFromLedger([]);
    assert.equal(r.currentBalance, 0);
    assert.equal(r.reservedBalance, 0);
    assert.equal(r.availableBalance, 0);
  });
  it("sums opening + accrual correctly", () => {
    const r = computeBalanceFromLedger([
      { transaction_type: "opening", amount: 5 },
      { transaction_type: "accrual", amount: 10 },
    ]);
    assert.equal(r.currentBalance, 15);
    assert.equal(r.availableBalance, 15);
  });
  it("subtracts consumption from current", () => {
    const r = computeBalanceFromLedger([
      { transaction_type: "opening", amount: 20 },
      { transaction_type: "consumption", amount: -5 },
    ]);
    assert.equal(r.currentBalance, 15);
    assert.equal(r.availableBalance, 15);
  });
  it("reservation reduces available but not current", () => {
    const r = computeBalanceFromLedger([
      { transaction_type: "opening", amount: 20 },
      { transaction_type: "reservation", amount: -3 },
    ]);
    assert.equal(r.currentBalance, 20);
    assert.equal(r.reservedBalance, 3);
    assert.equal(r.availableBalance, 17);
  });
  it("reversal adds back to current", () => {
    const r = computeBalanceFromLedger([
      { transaction_type: "opening", amount: 20 },
      { transaction_type: "reservation", amount: -3 },
      { transaction_type: "reversal", amount: 3 },
    ]);
    // current = 20 + 3 = 23, reserved = 3, available = 23-3 = 20
    assert.equal(r.currentBalance, 23);
    assert.equal(r.reservedBalance, 3);
    assert.equal(r.availableBalance, 20);
  });
});

// ---------------------------------------------------------------------------
// validateLeaveEligibility — (employee, policy, requestedDays, availableBalance, options)
// returns { eligible: boolean, reason?: string }
// ---------------------------------------------------------------------------
describe("validateLeaveEligibility", () => {
  const activeEmployee = { employment_status: "active", gender: "ذكر" };
  const policy = {
    min_duration: 1,
    max_duration: 14,
    gender_eligibility: "all",
    negative_balance_policy: "forbidden",
    attachment_requirement: "never",
    probation_behavior: "allowed",
  };

  it("passes for a valid request within balance", () => {
    const r = validateLeaveEligibility(activeEmployee, policy, 5, 20);
    assert.equal(r.eligible, true);
  });

  it("fails when available balance is insufficient (forbidden policy)", () => {
    const r = validateLeaveEligibility(activeEmployee, policy, 10, 5);
    assert.equal(r.eligible, false);
    assert.ok(r.reason.includes("رصيد"));
  });

  it("fails when requested days exceed max_duration", () => {
    const r = validateLeaveEligibility(activeEmployee, { ...policy, max_duration: 14 }, 20, 30);
    assert.equal(r.eligible, false);
    assert.ok(r.reason.includes("14"));
  });

  it("fails when request is less than min_duration", () => {
    const r = validateLeaveEligibility(activeEmployee, { ...policy, min_duration: 1 }, 0, 20);
    assert.equal(r.eligible, false);
  });

  it("fails for terminated employee", () => {
    const r = validateLeaveEligibility({ employment_status: "terminated" }, policy, 5, 20);
    assert.equal(r.eligible, false);
    assert.ok(r.reason.includes("غير نشط") || r.reason.includes("إنهاء"));
  });

  it("fails gender mismatch (female-only policy, male employee)", () => {
    const femalePol = { ...policy, gender_eligibility: "female_only" };
    const r = validateLeaveEligibility({ employment_status: "active", gender: "ذكر" }, femalePol, 5, 20);
    assert.equal(r.eligible, false);
    assert.ok(r.reason.includes("إناث"));
  });

  it("allows negative balance when policy is allow", () => {
    const lenientPol = { ...policy, negative_balance_policy: "allow" };
    const r = validateLeaveEligibility(activeEmployee, lenientPol, 5, 2);
    assert.equal(r.eligible, true);
  });
});

// ---------------------------------------------------------------------------
// validatePermitQuota — (existingMonthPermits, newDurationHours, policy)
// returns { allowed: boolean, reason?: string, remainingHours?: number }
// ---------------------------------------------------------------------------
describe("validatePermitQuota", () => {
  const policy = {
    max_times_per_month: 2,
    max_hours_per_month: 4,
  };

  it("passes when within monthly quota", () => {
    const r = validatePermitQuota([], 1, policy);
    assert.equal(r.allowed, true);
    assert.equal(r.remainingHours, 3);
  });

  it("fails when monthly times limit exceeded", () => {
    const existing = [{ duration_hours: 1 }, { duration_hours: 1 }];
    const r = validatePermitQuota(existing, 1, policy);
    assert.equal(r.allowed, false);
    assert.ok(r.reason.includes("مرات"));
  });

  it("fails when monthly hours limit exceeded", () => {
    const existing = [{ duration_hours: 3.5 }];
    const r = validatePermitQuota(existing, 1, policy);
    // 3.5 + 1 = 4.5 > 4
    assert.equal(r.allowed, false);
    assert.ok(r.reason.includes("ساعة"));
  });

  it("passes at exactly the monthly times limit boundary (1 existing + 1 new = max)", () => {
    const existing = [{ duration_hours: 1 }];
    const r = validatePermitQuota(existing, 1, policy);
    // usedTimes+1 = 2 <= maxTimes=2 -> allowed
    assert.equal(r.allowed, true);
  });

  it("reports remaining hours on success", () => {
    const r = validatePermitQuota([{ duration_hours: 1 }], 1, policy);
    assert.ok(typeof r.remainingHours === "number");
    assert.equal(r.remainingHours, 2);
  });
});