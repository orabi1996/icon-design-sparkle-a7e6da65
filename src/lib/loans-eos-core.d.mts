export interface LoanLedgerBalance {
  totalDisbursed: number;
  totalRepaid: number;
  totalDebits: number;
  totalCredits: number;
  outstandingBalance: number;
  isSettled: boolean;
  transactionCount: number;
}

export interface LoanScheduleItem {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  status: string;
}

export interface LoanPayrollDeductionResult {
  eligible: boolean;
  deductionAmount: number;
  idempotencyKey: string;
  remainingBalanceAfter: number;
  reason?: string;
}

export interface StatutoryEosConfig {
  countryCode: string;
  version: string;
  currency: string;
  standardMonthDays: number;
  tier1YearsCap: number;
  tier1RatePerYear: number;
  tier2RatePerYear: number;
  resignationTiers: Array<{
    minYears: number;
    maxYears: number;
    factor: number;
    description: string;
  }>;
  fullEntitlementReasons: string[];
  zeroEntitlementReasons: string[];
}

export interface ServiceDuration {
  years: number;
  months: number;
  days: number;
  totalCalendarDays: number;
  decimalYears: number;
}

export interface EosGratuityResult {
  baseAward: number;
  resignationFactor: number;
  finalGratuity: number;
  decimalYears: number;
  wageBase: number;
  terminationReason: string;
}

export interface FullEosSettlementResult {
  serviceDuration: ServiceDuration;
  wageBase: number;
  gratuity: EosGratuityResult;
  leaveEncashmentAmount: number;
  unpaidPayrollAmount: number;
  loanSettlementDeduction: number;
  otherAdditions: number;
  otherDeductions: number;
  totalGrossEntitlements: number;
  totalDeductions: number;
  netSettlementAmount: number;
  isSettled: boolean;
}

export interface EosCalculationSnapshot {
  formulaVersion: string;
  countryCode: string;
  calculatedAt: string;
  calculatedBy: {
    id: string;
    email: string;
  };
  serviceDuration: ServiceDuration;
  wageBase: number;
  gratuity: EosGratuityResult;
  entitlements: {
    statutoryGratuity: number;
    leaveEncashment: number;
    unpaidPayroll: number;
    otherAdditions: number;
    totalGross: number;
  };
  deductions: {
    loanSettlement: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSettlementAmount: number;
  roundingPrecision: number;
}

export function roundCurrency(amount: number, decimals?: number): number;

export function calculateLoanLedgerBalance(
  transactions?: Array<Record<string, unknown>>,
  initialPrincipal?: number
): LoanLedgerBalance;

export function generateLoanSchedule(
  amount: number,
  installmentsCount: number,
  startDateStr: string,
  monthlyAmountOverride?: number
): LoanScheduleItem[];

export function buildLoanPayrollDeduction(
  loan: Record<string, unknown>,
  ledgerTransactions: Array<Record<string, unknown>>,
  payrollMeta: {
    payrollRunId: string;
    periodKey: string;
    requestedInstallment?: number;
  }
): LoanPayrollDeductionResult;

export function getStatutoryEosConfig(
  countryCode?: string,
  version?: string
): StatutoryEosConfig;

export function calculateExactServiceDuration(
  startDateStr: string,
  endDateStr: string
): ServiceDuration;

export function computeEosGratuity(
  config: StatutoryEosConfig,
  inputs: {
    decimalYears: number;
    wageBase: number;
    terminationReason: string;
  }
): EosGratuityResult;

export function computeLeaveEncashment(
  leaveBalanceDays: number,
  monthlyWageBase: number,
  monthDays?: number
): number;

export function computeFullEosSettlement(params: {
  employee: Record<string, unknown>;
  startDate: string;
  lastWorkingDate: string;
  terminationReason: string;
  leaveBalanceDays?: number;
  unpaidWorkDays?: number;
  otherAdditions?: number;
  otherDeductions?: number;
  loanLedgerTransactions?: Array<Record<string, unknown>>;
  config?: StatutoryEosConfig;
}): FullEosSettlementResult;

export function buildEosCalculationSnapshot(
  settlementDetails: FullEosSettlementResult,
  options?: { actorEmail?: string; actorId?: string; now?: string }
): EosCalculationSnapshot;
