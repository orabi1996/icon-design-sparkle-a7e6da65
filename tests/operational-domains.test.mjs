import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  roundCurrency,
  calculateTaskSla,
  filterConfidentialCorrespondence,
  validateDisciplinaryPenalty,
  aggregateSurveyResults,
  verifyDocumentRetentionAndExpiry,
} from "../src/lib/operational-domains-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("PROMPT 9: Tasks SLA & Lifecycle Engine", () => {
  it("calculates active SLA with positive hours remaining", () => {
    const task = {
      title: "إعداد تقرير الميزانية",
      created_at: "2026-05-01T08:00:00.000Z",
      sla_hours: 48, // due in 48 hours -> 2026-05-03T08:00:00.000Z
      status_code: "in_progress",
    };

    const currentTime = "2026-05-02T08:00:00.000Z"; // 24 hours passed
    const sla = calculateTaskSla(task, currentTime);

    assert.equal(sla.hasSla, true);
    assert.equal(sla.isBreached, false);
    assert.equal(sla.hoursRemaining, 24);
    assert.equal(sla.overdueHours, 0);
  });

  it("detects breached SLA and computes overdue hours", () => {
    const task = {
      title: "صيانة أجهزة البصمة",
      sla_due_at: "2026-05-02T12:00:00.000Z",
      status_code: "pending",
    };

    const currentTime = "2026-05-02T18:00:00.000Z"; // 6 hours late
    const sla = calculateTaskSla(task, currentTime);

    assert.equal(sla.hasSla, true);
    assert.equal(sla.isBreached, true);
    assert.equal(sla.hoursRemaining, 0);
    assert.equal(sla.overdueHours, 6);
  });

  it("stops SLA clock when task is completed before breach", () => {
    const task = {
      title: "رفع مسير الرواتب",
      created_at: "2026-05-01T08:00:00.000Z",
      sla_hours: 24, // Due 2026-05-02T08:00:00.000Z
      status_code: "completed",
      completed_at: "2026-05-01T20:00:00.000Z", // Completed in 12 hours
    };

    const laterTime = "2026-05-10T12:00:00.000Z"; // checked 9 days later
    const sla = calculateTaskSla(task, laterTime);

    assert.equal(sla.isBreached, false);
    assert.equal(sla.hoursRemaining, 12);
  });
});

describe("PROMPT 9: Correspondence Confidentiality & Permissions", () => {
  const sampleCorrespondence = [
    { id: "c1", subject: "تعميم دوام رمضان", confidentiality: "normal" },
    { id: "c2", subject: "محضر تحقيق داخلي", confidentiality: "confidential", created_by: "user-hr-1" },
    { id: "c3", subject: "تقرير التدقيق المالي السري", confidentiality: "top_secret", created_by: "user-ceo" },
  ];

  it("hides confidential and top-secret correspondence from regular users", () => {
    const result = filterConfidentialCorrespondence(sampleCorrespondence, {
      canViewSensitive: false,
      isAdmin: false,
      userId: "user-emp-5",
    });

    assert.equal(result.accessibleRecords.length, 1);
    assert.equal(result.accessibleRecords[0].id, "c1");
    assert.equal(result.hiddenSensitiveCount, 2);
  });

  it("grants access to sensitive correspondence when user has view_sensitive or admin permission", () => {
    const result = filterConfidentialCorrespondence(sampleCorrespondence, {
      canViewSensitive: true,
      isAdmin: false,
    });

    assert.equal(result.accessibleRecords.length, 3);
    assert.equal(result.hiddenSensitiveCount, 0);
  });

  it("allows creator to view their own confidential correspondence even without global permission", () => {
    const result = filterConfidentialCorrespondence(sampleCorrespondence, {
      canViewSensitive: false,
      isAdmin: false,
      userId: "user-hr-1",
    });

    // Can view normal (c1) + own confidential (c2) = 2 records
    assert.equal(result.accessibleRecords.length, 2);
    assert.ok(result.accessibleRecords.some((r) => r.id === "c2"));
    assert.equal(result.hiddenSensitiveCount, 1);
  });
});

describe("PROMPT 9: Disciplinary Inquiries & Saudi Labor Law Enforcement", () => {
  it("enforces Saudi Labor Law Article 66 cap (max 5 days deduction for single violation)", () => {
    const invalidPenalty = {
      employeeId: "emp-violator-1",
      monthlyWageBase: 9000,
      decisionType: "salary_deduction",
      deductionDays: 7, // Exceeds statutory 5-day cap!
    };

    const res = validateDisciplinaryPenalty(invalidPenalty);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("المادة 66")));
  });

  it("enforces Saudi Labor Law Article 68 cumulative monthly cap (max 5 days per month)", () => {
    const cumulativeViolation = {
      employeeId: "emp-violator-2",
      monthlyWageBase: 6000,
      decisionType: "salary_deduction",
      deductionDays: 3,
      existingMonthDeductionsDays: 3, // 3 + 3 = 6 > 5!
    };

    const res = validateDisciplinaryPenalty(cumulativeViolation);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("المادة 68")));
  });

  it("generates decoupled pending payroll adjustment payload without modifying payroll directly", () => {
    const validPenalty = {
      employeeId: "emp-violator-3",
      monthlyWageBase: 6000, // Daily wage = 200 SAR
      decisionType: "salary_deduction",
      deductionDays: 3, // 3 * 200 = 600 SAR
      notes: "خصم 3 أيام لتكرار الغياب بدون عذر",
    };

    const res = validateDisciplinaryPenalty(validPenalty);
    assert.equal(res.valid, true);
    assert.equal(res.calculatedDeductionAmount, 600);
    assert.ok(res.adjustmentPayload);
    assert.equal(res.adjustmentPayload.status, "pending_financial_approval");
    assert.equal(res.adjustmentPayload.amount, 600);
    assert.equal(res.adjustmentPayload.days, 3);
  });
});

describe("PROMPT 9: Surveys Aggregation & Anonymity Policy", () => {
  const survey = {
    id: "surv-satisfaction-1",
    title: "استبيان الرضا الوظيفي السنوي",
    is_anonymous: true,
    questions: [
      { id: "q_env", type: "rating_1_5", title: "بيئة العمل" },
      { id: "q_tools", type: "single_choice", title: "كفاية أدوات العمل", options: ["ممتاز", "جيد", "ضعيف"] },
    ],
  };

  const responses = [
    { employee_id: "emp-101", answers: { q_env: 5, q_tools: "ممتاز" } },
    { employee_id: "emp-102", answers: { q_env: 4, q_tools: "ممتاز" } },
    { employee_id: "emp-103", answers: { q_env: 3, q_tools: "جيد" } },
  ];

  it("aggregates question averages and options breakdown accurately", () => {
    const agg = aggregateSurveyResults(survey, responses);

    assert.equal(agg.totalResponses, 3);
    // Rating average: (5 + 4 + 3) / 3 = 4.0
    assert.equal(agg.questionAggregates.q_env.numericAverage, 4);
    assert.equal(agg.questionAggregates.q_tools.optionsBreakdown["ممتاز"], 2);
    assert.equal(agg.questionAggregates.q_tools.optionsBreakdown["جيد"], 1);
  });

  it("strips employee identification when survey is marked anonymous", () => {
    const agg = aggregateSurveyResults(survey, responses);

    assert.equal(agg.isAnonymous, true);
    for (const r of agg.sanitizedResponses) {
      assert.equal(r.employee_id, null);
    }
  });
});

describe("PROMPT 9: Documents Retention & Expiry Verification", () => {
  it("identifies expired documents and expiring soon (30-day window)", () => {
    const expiredDoc = { expiry_date: "2026-01-01" };
    const expiringSoonDoc = { expiry_date: "2026-05-20" };
    const validDoc = { expiry_date: "2027-12-31" };

    const refDate = "2026-05-01";

    const resExpired = verifyDocumentRetentionAndExpiry(expiredDoc, refDate);
    assert.equal(resExpired.isExpired, true);
    assert.equal(resExpired.isExpiringSoon, false);

    const resSoon = verifyDocumentRetentionAndExpiry(expiringSoonDoc, refDate);
    assert.equal(resSoon.isExpired, false);
    assert.equal(resSoon.isExpiringSoon, true);

    const resValid = verifyDocumentRetentionAndExpiry(validDoc, refDate);
    assert.equal(resValid.isExpired, false);
    assert.equal(resValid.isExpiringSoon, false);
  });

  it("verifies retention policy against document issue date", () => {
    const oldDoc = {
      issue_date: "2010-01-01",
      retention_years: 10, // retention ended 2020
    };
    const newDoc = {
      issue_date: "2022-01-01",
      retention_years: 10, // retention ends 2032
    };

    const refDate = "2026-05-01";

    assert.equal(verifyDocumentRetentionAndExpiry(oldDoc, refDate).isPastRetentionPolicy, true);
    assert.equal(verifyDocumentRetentionAndExpiry(newDoc, refDate).isPastRetentionPolicy, false);
  });
});

describe("PROMPT 9: Database Migration SQL Static Contract Verification", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/20260918090000_operational_modules_enterprise.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("verifies tasks SLA enhancements and task_comments table in migration", () => {
    assert.ok(sql.includes("sla_due_at timestamptz"));
    assert.ok(sql.includes("watchers jsonb"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.task_comments"));
  });

  it("verifies correspondence direction, confidentiality and reference in migration", () => {
    assert.ok(sql.includes("direction_type text"));
    assert.ok(sql.includes("confidentiality text"));
    assert.ok(sql.includes("reference_number text UNIQUE"));
    assert.ok(sql.includes("employee_correspondence_select_scope"));
  });

  it("verifies disciplinary inquiries lifecycle and immutability trigger in migration", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.disciplinary_inquiries"));
    assert.ok(sql.includes("deduction_days integer"));
    assert.ok(sql.includes("trg_disciplinary_inquiry_immutable"));
    assert.ok(sql.includes("trg_fn_disciplinary_inquiry_immutable"));
  });

  it("verifies surveys, unique respondent voting index, and archived_documents table", () => {
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.surveys"));
    assert.ok(sql.includes("survey_responses_unique_employee_idx"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.archived_documents"));
    assert.ok(sql.includes("file_hash text NOT NULL"));
    assert.ok(sql.includes("storage_bucket text NOT NULL DEFAULT 'documents-archive'"));
  });
});
