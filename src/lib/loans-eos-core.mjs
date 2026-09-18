/**
 * PROMPT 8: Pure Domain Engine for Loans (Ledger-based) and End of Service (EOS) Country Pack.
 * Implements deterministic calculations, immutable ledger balance, idempotent payroll deduction,
 * and Saudi Labor Law (Articles 84, 85, 87) EOS benefit calculations.
 */

/**
 * Deterministic financial rounding to 2 decimal places.
 * @param {number} amount
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function roundCurrency(amount, decimals = 2) {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((amount + Number.EPSILON) * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Calculates authoritative loan balance from an immutable ledger of transactions.
 * Outstanding Balance = SUM(Debits) - SUM(Credits)
 * @param {Array<object>} transactions
 * @param {number} [initialPrincipal=0]
 * @returns {{
 *   totalDisbursed: number;
 *   totalRepaid: number;
 *   totalDebits: number;
 *   totalCredits: number;
 *   outstandingBalance: number;
 *   isSettled: boolean;
 *   transactionCount: number;
 * }}
 */
export function calculateLoanLedgerBalance(transactions = [], initialPrincipal = 0) {
  let totalDebits = 0;
  let totalCredits = 0;
  let totalDisbursed = 0;
  let totalRepaid = 0;

  for (const t of transactions) {
    const amt = Number(t.amount || 0);
    const direction = String(t.direction || '').toLowerCase();
    const type = String(t.transaction_type || t.transactionType || '').toLowerCase();

    if (direction === 'debit') {
      totalDebits = roundCurrency(totalDebits + amt);
      if (type === 'disbursement') {
        totalDisbursed = roundCurrency(totalDisbursed + amt);
      }
    } else if (direction === 'credit') {
      totalCredits = roundCurrency(totalCredits + amt);
      if (['installment', 'manual_payment', 'payroll_deduction'].includes(type)) {
        totalRepaid = roundCurrency(totalRepaid + amt);
      }
    }
  }

  // If no disbursement transaction exists in ledger but initialPrincipal was given, treat as disbursed
  if (totalDebits === 0 && initialPrincipal > 0) {
    totalDebits = roundCurrency(initialPrincipal);
    totalDisbursed = roundCurrency(initialPrincipal);
  }

  const outstandingBalance = roundCurrency(totalDebits - totalCredits);
  const isSettled = outstandingBalance <= 0;

  return {
    totalDisbursed,
    totalRepaid,
    totalDebits,
    totalCredits,
    outstandingBalance: Math.max(0, outstandingBalance),
    isSettled,
    transactionCount: transactions.length,
  };
}

/**
 * Generates planned loan amortization schedule.
 * Distributes fractional cents to the final installment for exact precision.
 * @param {number} amount Total loan amount
 * @param {number} installmentsCount Number of monthly installments
 * @param {string} startDateStr First installment due date (YYYY-MM-DD)
 * @param {number} [monthlyAmountOverride]
 * @returns {Array<{
 *   installmentNumber: number;
 *   dueDate: string;
 *   principalAmount: number;
 *   status: string;
 * }>}
 */
export function generateLoanSchedule(amount, installmentsCount, startDateStr, monthlyAmountOverride) {
  const total = roundCurrency(Number(amount || 0));
  const count = Math.max(1, parseInt(installmentsCount, 10) || 1);
  if (total <= 0) return [];

  const baseDate = new Date(startDateStr || new Date().toISOString().slice(0, 10));
  const defaultMonthly = roundCurrency(Math.floor((total / count) * 100) / 100);
  const standardMonthly = monthlyAmountOverride ? roundCurrency(monthlyAmountOverride) : defaultMonthly;

  const schedule = [];
  let allocated = 0;

  for (let i = 1; i <= count; i++) {
    const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + (i - 1), baseDate.getDate());
    const isLast = i === count;

    let installmentAmount;
    if (isLast) {
      installmentAmount = roundCurrency(total - allocated);
    } else {
      installmentAmount = standardMonthly;
      allocated = roundCurrency(allocated + installmentAmount);
    }

    schedule.push({
      installmentNumber: i,
      dueDate: dueDate.toISOString().slice(0, 10),
      principalAmount: installmentAmount,
      status: 'pending',
    });
  }

  return schedule;
}

/**
 * Builds an idempotent payroll deduction transaction for an active loan.
 * Prevents double-deductions and verifies ledger balance.
 * @param {object} loan
 * @param {Array<object>} ledgerTransactions
 * @param {{
 *   payrollRunId: string;
 *   periodKey: string;
 *   requestedInstallment?: number;
 * }} payrollMeta
 * @returns {{
 *   eligible: boolean;
 *   deductionAmount: number;
 *   idempotencyKey: string;
 *   remainingBalanceAfter: number;
 *   reason?: string;
 * }}
 */
export function buildLoanPayrollDeduction(loan, ledgerTransactions = [], payrollMeta) {
  if (!loan || !loan.id) throw new Error('بيانات السلفة مطلوبة');
  if (!payrollMeta || !payrollMeta.payrollRunId) throw new Error('معرف مسير الرواتب مطلوب لإنشاء مرجع القيد');

  const balance = calculateLoanLedgerBalance(ledgerTransactions, Number(loan.approved_amount || loan.amount || 0));

  if (balance.isSettled || balance.outstandingBalance <= 0) {
    return {
      eligible: false,
      deductionAmount: 0,
      idempotencyKey: `payroll:loan:${loan.id}:run:${payrollMeta.payrollRunId}`,
      remainingBalanceAfter: 0,
      reason: 'السلفة مسددة بالكامل ولا يوجد رصيد قائم للاستقطاع',
    };
  }

  const defaultInstallment = Number(
    payrollMeta.requestedInstallment ||
    loan.monthly_amount ||
    Math.round(balance.outstandingBalance / Math.max(1, loan.installments || 1))
  );

  const deductionAmount = roundCurrency(Math.min(defaultInstallment, balance.outstandingBalance));
  const remainingBalanceAfter = roundCurrency(balance.outstandingBalance - deductionAmount);
  const idempotencyKey = `payroll:loan:${loan.id}:run:${payrollMeta.payrollRunId}:${payrollMeta.periodKey || 'current'}`;

  return {
    eligible: deductionAmount > 0,
    deductionAmount,
    idempotencyKey,
    remainingBalanceAfter,
  };
}

/**
 * Returns statutory End of Service configuration (Saudi Labor Law Article 84, 85, 87).
 * @param {string} [countryCode='SA']
 * @param {string} [version='SA_LABOR_LAW_V1']
 * @returns {object}
 */
export function getStatutoryEosConfig(countryCode = 'SA', version = 'SA_LABOR_LAW_V1') {
  return {
    countryCode,
    version,
    currency: 'SAR',
    standardMonthDays: 30,
    tier1YearsCap: 5,
    tier1RatePerYear: 0.5, // Half-month wage for each of the first 5 years (Article 84)
    tier2RatePerYear: 1.0, // Full-month wage for each following year (Article 84)
    resignationTiers: [
      { minYears: 0, maxYears: 2, factor: 0.0, description: 'أقل من سنتين: لا يستحق مكافأة' },
      { minYears: 2, maxYears: 5, factor: 1 / 3, description: 'من سنتين إلى 5 سنوات: ثلث المكافأة (33.33%)' },
      { minYears: 5, maxYears: 10, factor: 2 / 3, description: 'من 5 سنوات إلى 10 سنوات: ثلثي المكافأة (66.67%)' },
      { minYears: 10, maxYears: Infinity, factor: 1.0, description: '10 سنوات فأكثر: المكافأة كاملة (100%)' },
    ],
    fullEntitlementReasons: [
      'contract_end',          // انتهاء مدة العقد المحدد
      'employer_termination', // إنهاء من صاحب العمل لغير أسباب مادة 80
      'force_majeure',        // قوة قاهرة (مادة 87)
      'female_marriage_birth',// ترك العمل لزواج أو إنجاب خلال المهلة النظامية (مادة 87)
      'death',                // الوفاة
      'medical_disability',   // العجز الصحي الكلي
    ],
    zeroEntitlementReasons: [
      'probation_failed',        // عدم اجتياز فترة التجربة
      'disciplinary_article_80', // الفصل التأديبي بموجب المادة 80
    ],
  };
}

/**
 * Calculates exact calendar service duration between hire date and last working date.
 * @param {string} startDateStr YYYY-MM-DD
 * @param {string} endDateStr YYYY-MM-DD
 * @returns {{
 *   years: number;
 *   months: number;
 *   days: number;
 *   totalCalendarDays: number;
 *   decimalYears: number;
 * }}
 */
export function calculateExactServiceDuration(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) {
    return { years: 0, months: 0, days: 0, totalCalendarDays: 0, decimalYears: 0 };
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (end < start) {
    return { years: 0, months: 0, days: 0, totalCalendarDays: 0, decimalYears: 0 };
  }

  const totalCalendarDays = Math.round((end.getTime() - start.getTime()) / 86400000);

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    // Days in previous month
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  // Precise fractional years matching labor office calculations
  const decimalYears = roundCurrency(years + months / 12 + days / 365.25, 4);

  return {
    years,
    months,
    days,
    totalCalendarDays,
    decimalYears,
  };
}

/**
 * Computes statutory End of Service Gratification according to Saudi Labor Law Articles 84, 85, 87.
 * @param {object} config Statutory configuration (from getStatutoryEosConfig)
 * @param {{
 *   decimalYears: number;
 *   wageBase: number;
 *   terminationReason: string;
 * }} inputs
 * @returns {{
 *   baseAward: number;
 *   resignationFactor: number;
 *   finalGratuity: number;
 *   decimalYears: number;
 *   wageBase: number;
 *   terminationReason: string;
 * }}
 */
export function computeEosGratuity(config, inputs) {
  const wageBase = roundCurrency(Number(inputs.wageBase || 0));
  const decimalYears = Number(inputs.decimalYears || 0);
  const reason = String(inputs.terminationReason || 'resignation').toLowerCase();

  if (wageBase <= 0 || decimalYears <= 0) {
    return {
      baseAward: 0,
      resignationFactor: 0,
      finalGratuity: 0,
      decimalYears,
      wageBase,
      terminationReason: reason,
    };
  }

  // Check 0 entitlement reasons (probation failure, article 80)
  if (config.zeroEntitlementReasons.includes(reason)) {
    return {
      baseAward: 0,
      resignationFactor: 0,
      finalGratuity: 0,
      decimalYears,
      wageBase,
      terminationReason: reason,
    };
  }

  // Article 84 Base Award:
  // - First 5 years: 0.5 month per year
  // - Beyond 5 years: 1.0 month per year
  const tier1Years = Math.min(decimalYears, config.tier1YearsCap);
  const tier2Years = Math.max(0, decimalYears - config.tier1YearsCap);

  const baseAward = roundCurrency(
    (tier1Years * config.tier1RatePerYear + tier2Years * config.tier2RatePerYear) * wageBase
  );

  // Article 85 Resignation Factor:
  let resignationFactor = 1.0;
  if (reason === 'resignation' || reason === 'استقالة') {
    const tier = config.resignationTiers.find(
      (t) => decimalYears >= t.minYears && decimalYears < t.maxYears
    );
    resignationFactor = tier ? tier.factor : 1.0;
  } else if (config.fullEntitlementReasons.includes(reason)) {
    resignationFactor = 1.0;
  }

  const finalGratuity = roundCurrency(baseAward * resignationFactor);

  return {
    baseAward,
    resignationFactor: roundCurrency(resignationFactor, 4),
    finalGratuity,
    decimalYears,
    wageBase,
    terminationReason: reason,
  };
}

/**
 * Computes leave balance encashment (compensation for unused leaves upon departure).
 * @param {number} leaveBalanceDays Unused leave balance in days
 * @param {number} monthlyWageBase Monthly wage base
 * @param {number} [monthDays=30]
 * @returns {number}
 */
export function computeLeaveEncashment(leaveBalanceDays, monthlyWageBase, monthDays = 30) {
  const days = Math.max(0, Number(leaveBalanceDays || 0));
  const salary = Math.max(0, Number(monthlyWageBase || 0));
  if (days <= 0 || salary <= 0) return 0;
  return roundCurrency((days / monthDays) * salary);
}

/**
 * Computes complete consolidated final settlement for departing employee.
 * Integrates: Gratuity + Leave Encashment + Final Payroll Days - Outstanding Loan Balance
 * @param {{
 *   employee: object;
 *   startDate: string;
 *   lastWorkingDate: string;
 *   terminationReason: string;
 *   leaveBalanceDays?: number;
 *   unpaidWorkDays?: number;
 *   otherAdditions?: number;
 *   otherDeductions?: number;
 *   loanLedgerTransactions?: Array<object>;
 *   config?: object;
 * }} params
 * @returns {{
 *   serviceDuration: object;
 *   wageBase: number;
 *   gratuity: object;
 *   leaveEncashmentAmount: number;
 *   unpaidPayrollAmount: number;
 *   loanSettlementDeduction: number;
 *   otherAdditions: number;
 *   otherDeductions: number;
 *   totalGrossEntitlements: number;
 *   totalDeductions: number;
 *   netSettlementAmount: number;
 *   isSettled: boolean;
 * }}
 */
export function computeFullEosSettlement(params) {
  const {
    employee = {},
    startDate,
    lastWorkingDate,
    terminationReason,
    leaveBalanceDays = 0,
    unpaidWorkDays = 0,
    otherAdditions = 0,
    otherDeductions = 0,
    loanLedgerTransactions = [],
    config = getStatutoryEosConfig('SA'),
  } = params;

  const basic = Number(employee.basic_salary || employee.basicSalary || 0);
  const housing = Number(employee.housing_allowance || employee.housingAllowance || 0);
  const other = Number(employee.other_allowances || employee.otherAllowances || 0);
  const wageBase = roundCurrency(basic + housing + other);

  const serviceDuration = calculateExactServiceDuration(startDate, lastWorkingDate);

  const gratuity = computeEosGratuity(config, {
    decimalYears: serviceDuration.decimalYears,
    wageBase,
    terminationReason,
  });

  const leaveEncashmentAmount = computeLeaveEncashment(leaveBalanceDays, wageBase);

  // Unpaid payroll for final working days in departure month
  const unpaidPayrollAmount = unpaidWorkDays > 0 ? roundCurrency((unpaidWorkDays / 30) * wageBase) : 0;

  // Outstanding loan balance deduction from loan ledger
  const loanBalance = calculateLoanLedgerBalance(loanLedgerTransactions);
  const loanSettlementDeduction = roundCurrency(loanBalance.outstandingBalance);

  const additions = roundCurrency(
    gratuity.finalGratuity + leaveEncashmentAmount + unpaidPayrollAmount + Number(otherAdditions || 0)
  );
  const deductions = roundCurrency(loanSettlementDeduction + Number(otherDeductions || 0));
  const netSettlementAmount = roundCurrency(additions - deductions);

  return {
    serviceDuration,
    wageBase,
    gratuity,
    leaveEncashmentAmount,
    unpaidPayrollAmount,
    loanSettlementDeduction,
    otherAdditions: roundCurrency(Number(otherAdditions || 0)),
    otherDeductions: roundCurrency(Number(otherDeductions || 0)),
    totalGrossEntitlements: additions,
    totalDeductions: deductions,
    netSettlementAmount,
    isSettled: netSettlementAmount >= 0,
  };
}

/**
 * Builds an immutable, reproducible JSON calculation snapshot.
 * @param {object} settlementDetails
 * @param {{ actorEmail?: string; actorId?: string; now?: string }} [options]
 * @returns {object}
 */
export function buildEosCalculationSnapshot(settlementDetails, options = {}) {
  return {
    formulaVersion: settlementDetails.gratuity?.terminationReason
      ? 'SA_LABOR_LAW_V1'
      : 'STANDARD_V1',
    countryCode: 'SA',
    calculatedAt: options.now || new Date().toISOString(),
    calculatedBy: {
      id: options.actorId || 'system',
      email: options.actorEmail || 'system@hrms.internal',
    },
    serviceDuration: settlementDetails.serviceDuration,
    wageBase: settlementDetails.wageBase,
    gratuity: settlementDetails.gratuity,
    entitlements: {
      statutoryGratuity: settlementDetails.gratuity?.finalGratuity || 0,
      leaveEncashment: settlementDetails.leaveEncashmentAmount || 0,
      unpaidPayroll: settlementDetails.unpaidPayrollAmount || 0,
      otherAdditions: settlementDetails.otherAdditions || 0,
      totalGross: settlementDetails.totalGrossEntitlements || 0,
    },
    deductions: {
      loanSettlement: settlementDetails.loanSettlementDeduction || 0,
      otherDeductions: settlementDetails.otherDeductions || 0,
      totalDeductions: settlementDetails.totalDeductions || 0,
    },
    netSettlementAmount: settlementDetails.netSettlementAmount,
    roundingPrecision: 2,
  };
}
