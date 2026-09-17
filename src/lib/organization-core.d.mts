export type BranchEntity = {
  id?: string | undefined;
  tenant_id?: string | undefined;
  company_id?: string | undefined;
  code: string;
  name_ar: string;
  name_en?: string | null | undefined;
  city?: string | null | undefined;
  district?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  manager_id?: string | null | undefined;
  active?: boolean | undefined;
  effective_from?: string | undefined;
  effective_to?: string | null | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
};

export type DepartmentEntity = {
  id?: string | undefined;
  tenant_id?: string | undefined;
  company_id?: string | undefined;
  branch_id?: string | null | undefined;
  sector_id?: string | null | undefined;
  parent_id?: string | null | undefined;
  cost_center_id?: string | null | undefined;
  level?: "main_department" | "department" | "section" | "team" | undefined;
  code: string;
  name_ar: string;
  name_en?: string | null | undefined;
  manager_id?: string | null | undefined;
  active?: boolean | undefined;
  effective_from?: string | undefined;
  effective_to?: string | null | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
};

export type ValidationResult<T> = {
  isValid: boolean;
  errors: Record<string, string>;
  normalized: T;
};

export declare function normalizeArabic(text?: string | null): string;
export declare function isValidDateString(val?: string | null): boolean;
export declare function detectCircularHierarchy(
  items: Array<{ id: string; parent_id?: string | null }>,
  targetId: string,
  newParentId?: string | null,
): boolean;

export declare function validateBranch(
  branch: Partial<BranchEntity>,
  existingBranches?: BranchEntity[],
): ValidationResult<BranchEntity>;

export declare function validateDepartment(
  dept: Partial<DepartmentEntity>,
  existingDepartments?: DepartmentEntity[],
): ValidationResult<DepartmentEntity>;

export declare function validateCostCenter(
  center: any,
  existingCenters?: any[],
): ValidationResult<any>;

export declare function validateJob(
  job: any,
  existingJobs?: any[],
): ValidationResult<any>;

export declare function validatePosition(
  pos: any,
  existingPositions?: any[],
): ValidationResult<any>;

export type ReconciliationReport = {
  matched: Array<{ legacyId: string; text: string; entityId: string; entityName: string }>;
  ambiguous: Array<{ legacyId: string; text: string; candidateIds: string[]; candidateNames: string[] }>;
  unmatched: Array<{ legacyId: string; text: string }>;
  summary: { total: number; matchedCount: number; ambiguousCount: number; unmatchedCount: number };
};

export declare function reconcileLegacyEntities(
  legacyItems: Array<{ id: string; text: string }>,
  authoritativeEntities: Array<{ id: string; code: string; name_ar: string; name_en?: string | null }>,
): ReconciliationReport;
