export interface LeavePolicy {
  id?: string | undefined;
  code: string;
  name_ar: string;
  name_en?: string | null | undefined;
  paid?: boolean | undefined;
  unit?: 'days' | 'hours' | undefined;
  accrual_method?: 'annual_frontloaded' | 'monthly_accrual' | 'prorated_service' | 'none' | undefined;
  annual_entitlement: number;
  carry_forward?: boolean | undefined;
  max_carry?: number | null | undefined;
  expiry_months?: number | null | undefined;
  negative_balance_policy?: 'forbidden' | 'warn_allow' | 'allow_up_to_limit' | undefined;
  max_negative_balance?: number | null | undefined;
  attachment_requirement?: 'never' | 'always' | 'if_exceeds_days' | undefined;
  attachment_exceeds_days?: number | null | undefined;
  min_duration?: number | undefined;
  max_duration?: number | null | undefined;
  notice_days_required?: number | undefined;
  count_weekends?: boolean | undefined;
  count_holidays?: boolean | undefined;
  probation_behavior?: 'forbidden' | 'allowed' | 'unpaid_only' | undefined;
  gender_eligibility?: 'all' | 'male_only' | 'female_only' | undefined;
  active?: boolean | undefined;
  version?: number | undefined;
}

export interface OfficialHoliday {
  id?: string | undefined;
  code?: string | undefined;
  name_ar: string;
  from_date: string | Date;
  to_date: string | Date;
  days: number;
}

export interface LeaveLedgerEntry {
  id?: string | undefined;
  employee_id?: string | undefined;
  leave_policy_id?: string | undefined;
  transaction_type:
    | 'opening'
    | 'accrual'
    | 'reservation'
    | 'consumption'
    | 'reversal'
    | 'adjustment'
    | 'expiry'
    | 'carry_forward';
  amount: number;
  effective_date?: string | Date | undefined;
  source_type?: string | undefined;
  source_id?: string | undefined;
  reason?: string | undefined;
}

export interface DeductibleDaysResult {
  totalCalendarDays: number;
  deductibleDays: number;
  excludedWeekends: number;
  excludedHolidays: number;
}

export interface LeaveBalanceSummary {
  currentBalance: number;
  reservedBalance: number;
  availableBalance: number;
}

export interface PermitPolicy {
  max_hours_per_month?: number | undefined;
  max_times_per_month?: number | undefined;
}

export declare function toIsoDate(d: string | Date): string;

export declare function detectDateOverlap(
  a: { from_date: string | Date; to_date: string | Date },
  b: { from_date: string | Date; to_date: string | Date }
): boolean;

export declare function calculateDeductibleDays(
  fromDate: string | Date,
  toDate: string | Date,
  policy?: Partial<LeavePolicy> | undefined,
  holidays?: OfficialHoliday[] | undefined
): DeductibleDaysResult;

export declare function computeBalanceFromLedger(
  ledgerEntries?: LeaveLedgerEntry[] | undefined
): LeaveBalanceSummary;

export declare function validateLeaveEligibility(
  employee: { employment_status?: string | undefined; gender?: string | undefined } | null | undefined,
  policy: Partial<LeavePolicy> | null | undefined,
  requestedDays: number,
  availableBalance: number,
  options?: { hasAttachment?: boolean | undefined } | undefined
): { eligible: boolean; reason?: string | undefined };

export declare function validatePermitQuota(
  existingMonthPermits?: Array<{ duration_hours: number }> | undefined,
  newDurationHours?: number | undefined,
  policy?: PermitPolicy | undefined
): { allowed: boolean; reason?: string | undefined; remainingHours?: number | undefined };
