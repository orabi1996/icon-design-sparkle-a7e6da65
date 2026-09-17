export const EMPLOYMENT_STATUSES: {
  readonly ACTIVE: "active";
  readonly PROBATION: "probation";
  readonly SUSPENDED: "suspended";
  readonly ON_LEAVE: "on_leave";
  readonly TERMINATED: "terminated";
  readonly RESIGNED: "resigned";
};

export type EmploymentStatus =
  | "active"
  | "probation"
  | "suspended"
  | "on_leave"
  | "terminated"
  | "resigned";

export const STATUS_LABELS_AR: Record<string, string>;

export declare function isValidSaudiNationalId(id?: string | null): boolean;
export declare function isValidIban(iban?: string | null): boolean;
export declare function maskNationalId(id?: string | null, hasPermission?: boolean): string;
export declare function maskIban(iban?: string | null, hasPermission?: boolean): string;
export declare function maskFinancialValue(amount?: number | string | null, hasPermission?: boolean): number | string;
export declare function isAllowedStatusTransition(fromStatus: string, toStatus: string): boolean;
export declare function validateStatusTransition(
  fromStatus: string,
  toStatus: string,
  metadata?: { reason?: string | undefined; effective_date?: string | undefined }
): { isValid: boolean; error?: string | undefined };

export type EmployeeEntity = {
  id?: string | undefined;
  tenant_id?: string | undefined;
  company_id?: string | undefined;
  emp_no: string;
  full_name: string;
  employee_name_en?: string | null | undefined;
  national_id?: string | null | undefined;
  iban?: string | null | undefined;
  basic_salary?: number | undefined;
  allowances?: number | undefined;
  employment_status?: EmploymentStatus | undefined;
  status?: string | undefined;
  branch_id?: string | null | undefined;
  department_id?: string | null | undefined;
  job_id?: string | null | undefined;
  position_id?: string | null | undefined;
  hire_date?: string | undefined;
  contract_end?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  gender?: string | undefined;
  nationality?: string | undefined;
  birth_date?: string | null | undefined;
  photo_path?: string | null | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
};

export type NormalizedEmployee = {
  emp_no: string;
  full_name: string;
  employee_name_en?: string | null | undefined;
  national_id?: string | null | undefined;
  iban?: string | null | undefined;
  basic_salary: number;
  allowances: number;
  employment_status: EmploymentStatus;
  status: string;
  branch_id?: string | null | undefined;
  department_id?: string | null | undefined;
  job_id?: string | null | undefined;
  position_id?: string | null | undefined;
  hire_date: string;
  contract_end?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  gender: string;
  nationality: string;
};

export type EmployeeValidationResult = {
  isValid: boolean;
  errors: Record<string, string>;
  normalized: NormalizedEmployee;
};

export declare function validateEmployee(
  employee: Partial<EmployeeEntity>,
  existingEmployees?: EmployeeEntity[]
): EmployeeValidationResult;
