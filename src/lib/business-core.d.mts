export type CompanyProfile = {
  companyNameAr: string; companyNameEn: string; countryCode: string; currency: string; timezone: string;
  crNumber: string; unified700Number: string; vatNumber: string; gosiEstNumber: string; molEstNumber: string;
  chamberNumber: string; activityType: string; establishmentDate: string; city: string; district: string;
  street: string; buildingNo: string; postalCode: string; additionalNo: string; phone: string; email: string;
  website: string; generalManager: string; hrManager: string; financeManager: string;
};
export const COMPANY_FIELDS: readonly (keyof CompanyProfile)[];
export function emptyCompanyProfile(): CompanyProfile;
export function validateCompanyProfile(input: unknown): { profile: CompanyProfile; errors: Record<string, string> };
export function moneyToMinor(value: unknown, field?: string): number;
export type LoanBalanceRow = {
  id: string; emp_no: string; employee_name: string; branch: string; department: string; job_title: string;
  loans_count: number; total_granted: number; total_paid: number; current_balance: number;
  active_monthly_installment: number; last_payment_date: string; status: string;
  source_loan_ids: string[]; data_issues: string[];
};
export function summarizeLoanBalances(
  employees: Record<string, unknown>[], loans: Record<string, unknown>[],
): { rows: LoanBalanceRow[]; issues: { employeeId: string; message: string }[] };
export function csvCell(value: unknown): string;
export function normalizeSearch(value: unknown): string;
export function totalLoanBalances(rows: LoanBalanceRow[]): { granted: number; paid: number; balance: number; activeMonthly: number };
