export interface StatutoryConfig {
  version: number;
  countryCode: string;
  saudi_employee_pct: number;
  saudi_company_pct: number;
  non_saudi_employee_pct: number;
  non_saudi_company_pct: number;
  cap_base_amount: number;
  min_base_amount: number;
  max_deduction_pct: number;
}

export interface PayrollInputItem {
  component_code: string;
  component_type?: 'earning' | 'deduction' | 'company_contribution';
  amount: number;
  units?: number;
  rate?: number;
  source?: string;
  source_id?: string;
  source_version?: number;
  reason?: string;
}

export interface EmployeePayrollResult {
  employeeId: string;
  empNo: string;
  employeeName: string;
  isSaudi: boolean;
  bankCode: string;
  iban: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeAmount: number;
  manualEarnings: number;
  grossSalary: number;
  lateDeductions: number;
  absenceDeductions: number;
  leaveDeductions: number;
  loanDeductions: number;
  socialInsuranceEmployee: number;
  socialInsuranceCompany: number;
  manualDeductions: number;
  totalDeductions: number;
  netSalary: number;
  currency: string;
  calculationSnapshot: Record<string, unknown>;
  status: 'calculated' | 'verified' | 'error' | 'locked' | 'adjusted';
}

export interface PayrollReconciliation {
  isReconciled: boolean;
  totalBasic: number;
  totalAllowances: number;
  totalGross: number;
  totalDeductions: number;
  totalSocialInsurance: number;
  totalNet: number;
  employeesCount: number;
  difference: number;
}

export interface WpsBatchMeta {
  batchReference: string;
  bankCode: string;
  payerIban: string;
  molEstId: string;
  valueDate?: string | undefined;
}

export interface WpsGenerationResult {
  fileName: string;
  fileContent: string;
  fileHash: string;
  totalAmount: number;
  recordCount: number;
  validationErrors: Array<{ empNo: string; errors: string[] }>;
}

export declare function roundCurrency(amount: number, decimals?: number): number;

export declare function getDefaultStatutoryConfig(): StatutoryConfig;

export declare function computeEmployeePayroll(
  employee: Record<string, unknown>,
  inputs?: PayrollInputItem[],
  statutoryConfig?: StatutoryConfig,
  options?: { currency?: string; formulaVersion?: number }
): EmployeePayrollResult;

export declare function reconcilePayrollTotals(
  results: EmployeePayrollResult[]
): PayrollReconciliation;

export declare function validateWpsRecord(
  record: Record<string, unknown>
): { valid: boolean; errors: string[] };

export declare function generateWpsBankFile(
  batchMeta: WpsBatchMeta,
  records: Array<Record<string, unknown>>,
  adapterConfig?: { currency?: string }
): WpsGenerationResult;