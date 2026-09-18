/**
 * PROMPT 9: Pure Domain Engine for Operational Modules:
 * Tasks SLA, Confidential Correspondence Filtering, Disciplinary Penalty Validation (Saudi Labor Law),
 * Survey Analytics & Anonymity, Document Retention & Expiry.
 */

/**
 * Deterministic financial rounding to 2 decimal places.
 * @param {number} amount
 * @returns {number}
 */
export function roundCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * 1. TASKS: Calculates task SLA compliance, deadline, and breach status.
 * @param {{
 *   created_at?: string;
 *   start_date?: string;
 *   end_date?: string;
 *   sla_hours?: number;
 *   sla_due_at?: string;
 *   status_code?: string;
 *   completed_at?: string;
 * }} task
 * @param {string} [currentTimeStr]
 * @returns {{
 *   hasSla: boolean;
 *   isBreached: boolean;
 *   slaDueAt: string | null;
 *   hoursRemaining: number | null;
 *   overdueHours: number;
 * }}
 */
export function calculateTaskSla(task, currentTimeStr) {
  const now = new Date(currentTimeStr || new Date().toISOString());
  let slaDueAt = null;

  if (task.sla_due_at) {
    slaDueAt = new Date(task.sla_due_at);
  } else if (task.sla_hours && (task.created_at || task.start_date)) {
    const base = new Date(task.start_date || task.created_at);
    slaDueAt = new Date(base.getTime() + task.sla_hours * 3600000);
  } else if (task.end_date) {
    slaDueAt = new Date(`${task.end_date}T23:59:59.999Z`);
  }

  if (!slaDueAt || isNaN(slaDueAt.getTime())) {
    return {
      hasSla: false,
      isBreached: false,
      slaDueAt: null,
      hoursRemaining: null,
      overdueHours: 0,
    };
  }

  const completionTime =
    ['finished', 'closed', 'completed'].includes(String(task.status_code || '').toLowerCase()) && task.completed_at
      ? new Date(task.completed_at)
      : null;

  const evalTime = completionTime || now;
  const diffMs = slaDueAt.getTime() - evalTime.getTime();
  const diffHours = roundCurrency(diffMs / 3600000);
  const isBreached = diffMs < 0;

  return {
    hasSla: true,
    isBreached,
    slaDueAt: slaDueAt.toISOString(),
    hoursRemaining: isBreached ? 0 : diffHours,
    overdueHours: isBreached ? Math.abs(diffHours) : 0,
  };
}

/**
 * 2. CORRESPONDENCE: Filters out confidential or top-secret correspondence for unauthorized users.
 * @param {Array<object>} records
 * @param {{
 *   canViewSensitive?: boolean;
 *   isAdmin?: boolean;
 *   userId?: string;
 * }} userAuth
 * @returns {{
 *   accessibleRecords: Array<object>;
 *   hiddenSensitiveCount: number;
 * }}
 */
export function filterConfidentialCorrespondence(records = [], userAuth = {}) {
  const canAccessSensitive = Boolean(userAuth.canViewSensitive || userAuth.isAdmin);
  const accessibleRecords = [];
  let hiddenSensitiveCount = 0;

  for (const r of records) {
    const conf = String(r.confidentiality || 'normal').toLowerCase();
    const isSensitive = ['confidential', 'top_secret'].includes(conf);

    if (isSensitive && !canAccessSensitive) {
      // If user is direct recipient, allow own correspondence
      if (userAuth.userId && r.created_by === userAuth.userId) {
        accessibleRecords.push(r);
      } else {
        hiddenSensitiveCount++;
      }
    } else {
      accessibleRecords.push(r);
    }
  }

  return {
    accessibleRecords,
    hiddenSensitiveCount,
  };
}

/**
 * 3. DISCIPLINARY: Validates penalty against Saudi Labor Law (Articles 66, 68)
 * and generates a decoupled payroll adjustment payload.
 * Maximum deduction for single violation is 5 days' wage.
 * Cannot deduct directly without financial approval.
 * @param {{
 *   employeeId: string;
 *   empNo?: string;
 *   employeeName?: string;
 *   monthlyWageBase: number;
 *   decisionType: string;
 *   deductionDays?: number;
 *   existingMonthDeductionsDays?: number;
 *   notes?: string;
 * }} inputs
 * @returns {{
 *   valid: boolean;
 *   errors: string[];
 *   calculatedDeductionAmount: number;
 *   adjustmentPayload: object | null;
 * }}
 */
export function validateDisciplinaryPenalty(inputs) {
  const errors = [];
  const decisionType = String(inputs.decisionType || '').toLowerCase();
  const days = Number(inputs.deductionDays || 0);
  const wageBase = Number(inputs.monthlyWageBase || 0);
  const existingMonthDays = Number(inputs.existingMonthDeductionsDays || 0);

  let calculatedDeductionAmount = 0;
  let adjustmentPayload = null;

  if (decisionType === 'salary_deduction') {
    if (days <= 0) {
      errors.push('عدد أيام الخصم يجب أن يكون أكبر من الصفر');
    }

    // Saudi Labor Law Article 66: Max 5 days deduction for a single violation
    if (days > 5) {
      errors.push(`الحد الأقصى للخصم في المخالفة الواحدة هو 5 أيام وفق المادة 66 من نظام العمل السعودي (المطلوب: ${days} أيام)`);
    }

    // Saudi Labor Law Article 68: Total deductions in one month cannot exceed 5 days' wage
    if (existingMonthDays + days > 5) {
      errors.push(
        `إجمالي الخصومات التأديبية للشهر الواحد يتجاوز 5 أيام وفق المادة 68 من نظام العمل السعودي (الحالي: ${existingMonthDays} + المطلوب: ${days})`
      );
    }

    if (wageBase > 0 && days > 0) {
      const dailyWage = roundCurrency(wageBase / 30);
      calculatedDeductionAmount = roundCurrency(dailyWage * days);

      // Decoupled payroll adjustment payload requiring separate approval
      adjustmentPayload = {
        employee_id: inputs.employeeId,
        component_code: 'DISCIPLINARY_DEDUCTION',
        component_type: 'deduction',
        amount: calculatedDeductionAmount,
        days,
        source: 'disciplinary_inquiry',
        status: 'pending_financial_approval', // NOT applied directly!
        reason: inputs.notes || `جزاء تأديبي - خصم ${days} أيام عمل بموجب قرار التحقيق`,
      };
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    calculatedDeductionAmount,
    adjustmentPayload,
  };
}

/**
 * 4. SURVEYS: Aggregates survey questions and answers, enforcing anonymity policy.
 * @param {{
 *   id: string;
 *   is_anonymous: boolean;
 *   questions: Array<{ id: string; type: string; title: string; options?: string[] }>;
 * }} survey
 * @param {Array<{
 *   employee_id?: string;
 *   answers: Record<string, any>;
 * }>} responses
 * @returns {{
 *   totalResponses: number;
 *   isAnonymous: boolean;
 *   sanitizedResponses: Array<object>;
 *   questionAggregates: Record<string, any>;
 * }}
 */
export function aggregateSurveyResults(survey, responses = []) {
  const isAnonymous = Boolean(survey.is_anonymous);
  const questions = survey.questions || [];
  const questionAggregates = {};

  // Initialize aggregates
  for (const q of questions) {
    questionAggregates[q.id] = {
      id: q.id,
      title: q.title,
      type: q.type,
      responseCount: 0,
      optionsBreakdown: {},
      numericAverage: null,
      totalScore: 0,
      textAnswers: [],
    };
    if (Array.isArray(q.options)) {
      q.options.forEach((opt) => {
        questionAggregates[q.id].optionsBreakdown[opt] = 0;
      });
    }
  }

  const sanitizedResponses = [];

  for (const r of responses) {
    const answers = r.answers || {};

    // Strip employee identification if survey is anonymous
    sanitizedResponses.push({
      employee_id: isAnonymous ? null : r.employee_id,
      answers,
    });

    for (const q of questions) {
      const ans = answers[q.id];
      if (ans !== undefined && ans !== null && ans !== '') {
        const agg = questionAggregates[q.id];
        agg.responseCount++;

        if (q.type === 'rating_1_5' || q.type === 'number') {
          const num = Number(ans);
          if (!isNaN(num)) {
            agg.totalScore += num;
          }
        } else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
          const selected = Array.isArray(ans) ? ans : [ans];
          for (const s of selected) {
            agg.optionsBreakdown[s] = (agg.optionsBreakdown[s] || 0) + 1;
          }
        } else if (q.type === 'text') {
          agg.textAnswers.push(String(ans));
        }
      }
    }
  }

  // Compute averages
  for (const q of questions) {
    const agg = questionAggregates[q.id];
    if ((q.type === 'rating_1_5' || q.type === 'number') && agg.responseCount > 0) {
      agg.numericAverage = roundCurrency(agg.totalScore / agg.responseCount);
    }
  }

  return {
    totalResponses: responses.length,
    isAnonymous,
    sanitizedResponses,
    questionAggregates,
  };
}

/**
 * 5. DOCUMENTS: Verifies document retention and expiry dates.
 * @param {{
 *   issue_date?: string;
 *   expiry_date?: string;
 *   retention_years?: number;
 * }} doc
 * @param {string} [referenceDateStr]
 * @returns {{
 *   isExpired: boolean;
 *   isExpiringSoon: boolean;
 *   daysUntilExpiry: number | null;
 *   isPastRetentionPolicy: boolean;
 * }}
 */
export function verifyDocumentRetentionAndExpiry(doc, referenceDateStr) {
  const ref = new Date(referenceDateStr || new Date().toISOString().slice(0, 10));

  let isExpired = false;
  let isExpiringSoon = false;
  let daysUntilExpiry = null;

  if (doc.expiry_date) {
    const exp = new Date(doc.expiry_date);
    const diffDays = Math.round((exp.getTime() - ref.getTime()) / 86400000);
    daysUntilExpiry = diffDays;
    isExpired = diffDays < 0;
    isExpiringSoon = diffDays >= 0 && diffDays <= 30;
  }

  let isPastRetentionPolicy = false;
  if (doc.issue_date && doc.retention_years) {
    const issue = new Date(doc.issue_date);
    const retentionEnd = new Date(issue.getFullYear() + doc.retention_years, issue.getMonth(), issue.getDate());
    isPastRetentionPolicy = ref > retentionEnd;
  }

  return {
    isExpired,
    isExpiringSoon,
    daysUntilExpiry,
    isPastRetentionPolicy,
  };
}
