/**
 * Pure Leave & Permits Domain Core
 * Implements Working Calendar calculation, Overlap Detection, Ledger Balance Derivation, and Eligibility Validation.
 */

/**
 * Normalizes date string or Date object to YYYY-MM-DD
 * @param {string | Date} d
 * @returns {string}
 */
export function toIsoDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Tests whether two date intervals overlap
 * @param {{ from_date: string | Date; to_date: string | Date }} a
 * @param {{ from_date: string | Date; to_date: string | Date }} b
 * @returns {boolean}
 */
export function detectDateOverlap(a, b) {
  if (!a || !b || !a.from_date || !a.to_date || !b.from_date || !b.to_date) {
    return false;
  }

  const startA = toIsoDate(a.from_date);
  const endA = toIsoDate(a.to_date);
  const startB = toIsoDate(b.from_date);
  const endB = toIsoDate(b.to_date);

  return startA <= endB && endA >= startB;
}

/**
 * Calculates deductible days according to working calendar, weekend and holiday policies
 * @param {string | Date} fromDate
 * @param {string | Date} toDate
 * @param {{ count_weekends?: boolean; count_holidays?: boolean }} [policy]
 * @param {Array<{ from_date: string | Date; to_date: string | Date }>} [holidays]
 * @returns {{ totalCalendarDays: number; deductibleDays: number; excludedWeekends: number; excludedHolidays: number }}
 */
export function calculateDeductibleDays(fromDate, toDate, policy = {}, holidays = []) {
  const start = new Date(toIsoDate(fromDate) + 'T00:00:00Z');
  const end = new Date(toIsoDate(toDate) + 'T00:00:00Z');

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { totalCalendarDays: 0, deductibleDays: 0, excludedWeekends: 0, excludedHolidays: 0 };
  }

  const countWeekends = Boolean(policy.count_weekends);
  const countHolidays = Boolean(policy.count_holidays);

  let totalCalendarDays = 0;
  let deductibleDays = 0;
  let excludedWeekends = 0;
  let excludedHolidays = 0;

  const curr = new Date(start.getTime());

  while (curr <= end) {
    totalCalendarDays++;
    const isoCurr = curr.toISOString().split('T')[0];
    const dow = curr.getUTCDay(); // 0=Sunday, 5=Friday, 6=Saturday

    // Check holiday
    const isHoliday = !countHolidays && holidays.some((h) => {
      const hStart = toIsoDate(h.from_date);
      const hEnd = toIsoDate(h.to_date);
      return isoCurr >= hStart && isoCurr <= hEnd;
    });

    if (isHoliday) {
      excludedHolidays++;
    } else if (!countWeekends && (dow === 5 || dow === 6)) {
      // Weekend excluded (Friday & Saturday)
      excludedWeekends++;
    } else {
      deductibleDays++;
    }

    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return {
    totalCalendarDays,
    deductibleDays,
    excludedWeekends,
    excludedHolidays,
  };
}

/**
 * Computes authoritative balance figures from an immutable leave ledger
 * @param {Array<{ transaction_type: string; amount: number }>} ledgerEntries
 * @returns {{ currentBalance: number; reservedBalance: number; availableBalance: number }}
 */
export function computeBalanceFromLedger(ledgerEntries = []) {
  if (!Array.isArray(ledgerEntries)) {
    return { currentBalance: 0, reservedBalance: 0, availableBalance: 0 };
  }

  let current = 0;
  let reserved = 0;

  for (const entry of ledgerEntries) {
    const amt = Number(entry.amount) || 0;
    const type = entry.transaction_type;

    if (type === 'reservation') {
      reserved += Math.abs(amt);
    } else if (
      type === 'opening' ||
      type === 'accrual' ||
      type === 'consumption' ||
      type === 'reversal' ||
      type === 'adjustment' ||
      type === 'expiry' ||
      type === 'carry_forward'
    ) {
      current += amt;
    }
  }

  const currentBalance = Number(current.toFixed(2));
  const reservedBalance = Number(reserved.toFixed(2));
  const availableBalance = Number((current - reserved).toFixed(2));

  return {
    currentBalance,
    reservedBalance,
    availableBalance,
  };
}

/**
 * Validates leave eligibility against employee master status and policy rules
 * @param {{ employment_status?: string; gender?: string }} employee
 * @param {object} policy
 * @param {number} requestedDays
 * @param {number} availableBalance
 * @param {{ hasAttachment?: boolean }} [options]
 * @returns {{ eligible: boolean; reason?: string }}
 */
export function validateLeaveEligibility(
  employee,
  policy,
  requestedDays,
  availableBalance,
  options = {}
) {
  if (!employee) return { eligible: false, reason: 'بيانات الموظف غير موجودة' };
  if (!policy) return { eligible: false, reason: 'سياسة الإجازة غير محددة' };

  // 1. Employment Status Check
  const status = employee.employment_status || 'active';
  if (status === 'terminated' || status === 'resigned' || status === 'suspended') {
    return { eligible: false, reason: 'لا يمكن طلب إجازة لموظف غير نشط أو في حالة إنهاء خدمة' };
  }

  // 2. Probation Period Behavior
  if (status === 'probation') {
    const probationBehavior = policy.probation_behavior || 'forbidden';
    if (probationBehavior === 'forbidden') {
      return { eligible: false, reason: 'سياسة الإجازة تمنع الاستحقاق أثناء فترة التجربة' };
    }
  }

  // 3. Gender Eligibility
  const gender = (employee.gender || '').trim();
  const genderEligibility = policy.gender_eligibility || 'all';
  if (genderEligibility === 'female_only' && (gender === 'ذكر' || gender.toLowerCase() === 'male')) {
    return { eligible: false, reason: 'هذه الإجازة مخصصة للإناث فقط' };
  }
  if (genderEligibility === 'male_only' && (gender === 'أنثى' || gender.toLowerCase() === 'female')) {
    return { eligible: false, reason: 'هذه الإجازة مخصصة للذكور فقط' };
  }

  // 4. Duration constraints
  const minDuration = policy.min_duration || 1;
  if (requestedDays < minDuration) {
    return { eligible: false, reason: `الحد الأدنى لطلب هذه الإجازة هو ${minDuration} يوم` };
  }
  if (policy.max_duration && requestedDays > policy.max_duration) {
    return { eligible: false, reason: `الحد الأقصى لطلب هذه الإجازة هو ${policy.max_duration} يوم` };
  }

  // 5. Balance & Negative Balance Policy
  const negPolicy = policy.negative_balance_policy || 'forbidden';
  if (negPolicy === 'forbidden' && availableBalance < requestedDays) {
    return {
      eligible: false,
      reason: `رصيد الإجازة المتاح (${availableBalance}) غير كافٍ لتغطية الأيام المطلوبة (${requestedDays})`,
    };
  }
  if (negPolicy === 'allow_up_to_limit') {
    const maxNeg = policy.max_negative_balance || 0;
    if (availableBalance - requestedDays < -maxNeg) {
      return {
        eligible: false,
        reason: `الرصيد السالب يتجاوز الحد الأقصى المسموح به (${maxNeg}) يوم`,
      };
    }
  }

  // 6. Attachment Requirement
  const attachReq = policy.attachment_requirement || 'never';
  const hasAttachment = Boolean(options.hasAttachment);

  if (attachReq === 'always' && !hasAttachment) {
    return { eligible: false, reason: 'إرفاق المستند/التقرير الطبي إلزامي لهذا النوع من الإجازات' };
  }
  if (attachReq === 'if_exceeds_days') {
    const threshold = policy.attachment_exceeds_days || 2;
    if (requestedDays > threshold && !hasAttachment) {
      return {
        eligible: false,
        reason: `إرفاق التقرير إلزامي للإجازات التي تتجاوز ${threshold} أيام`,
      };
    }
  }

  return { eligible: true };
}

/**
 * Validates hourly permit monthly quotas
 * @param {Array<{ duration_hours: number }>} existingMonthPermits
 * @param {number} newDurationHours
 * @param {{ max_hours_per_month?: number; max_times_per_month?: number }} [policy]
 * @returns {{ allowed: boolean; reason?: string; remainingHours?: number }}
 */
export function validatePermitQuota(existingMonthPermits = [], newDurationHours, policy = {}) {
  const maxHours = policy.max_hours_per_month ?? 4;
  const maxTimes = policy.max_times_per_month ?? 2;

  const usedTimes = existingMonthPermits.length;
  const usedHours = existingMonthPermits.reduce((sum, p) => sum + (Number(p.duration_hours) || 0), 0);

  if (usedTimes + 1 > maxTimes) {
    return {
      allowed: false,
      reason: `تم تجاوز الحد الأقصى لمرات الاستئذان المسموحة شهرياً (${maxTimes} مرات)`,
    };
  }

  if (usedHours + newDurationHours > maxHours) {
    return {
      allowed: false,
      reason: `تم تجاوز الساعات المسموح بها شهرياً (المستخدم: ${usedHours}، المطلوب: ${newDurationHours}، الحد الأقصى: ${maxHours} ساعة)`,
    };
  }

  const remainingHours = Number((maxHours - (usedHours + newDurationHours)).toFixed(2));
  return { allowed: true, remainingHours };
}
