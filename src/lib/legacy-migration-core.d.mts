export type MigrationEntity =
  | "employees"
  | "departments"
  | "branches"
  | "managers"
  | "contracts"
  | "leaves"
  | "loans"
  | "attendance"
  | "fingerprint"
  | "payroll_archive"
  | "documents"
  | "requests";

export type MigrationPhase =
  | "extract"
  | "normalize"
  | "validate"
  | "match"
  | "preview"
  | "reconcile"
  | "approve"
  | "import"
  | "verify";

export type RowClassification =
  | "MATCHED"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "INVALID"
  | "DUPLICATE"
  | "ALREADY_MIGRATED";

export interface ExtractedLegacyRow {
  legacy_id: string;
  source_row_index: number;
  raw_data: Record<string, any>;
  checksum: string;
  source: string;
}

export interface NormalizedLegacyRow extends ExtractedLegacyRow {
  normalized_data: Record<string, any>;
}

export interface ValidatedLegacyRow extends NormalizedLegacyRow {
  validation_errors: string[];
  is_valid: boolean;
}

export interface MatchedLegacyRow extends ValidatedLegacyRow {
  classification: RowClassification;
  target_id: string | null;
  matching_notes: string;
  stable_identifier: string | null;
  financial_amount: string;
}

export interface BatchPreview {
  entity: MigrationEntity;
  counts: {
    total: number;
    MATCHED: number;
    AMBIGUOUS: number;
    UNMATCHED: number;
    INVALID: number;
    DUPLICATE: number;
    ALREADY_MIGRATED: number;
  };
  financials: {
    totalBeforeMinor: string;
    totalAfterMinor: string;
    differenceMinor: string;
    totalBeforeFormatted: string;
    totalAfterFormatted: string;
    differenceFormatted: string;
    isZeroDifference: boolean;
  };
  canApprove: boolean;
  rows: MatchedLegacyRow[];
}

export interface ReconciliationResult {
  isReconciled: boolean;
  status: string;
  issues: string[];
  counts: BatchPreview["counts"];
  financials: BatchPreview["financials"];
  overrideReason: string | null;
}

export interface BatchApprovalResult {
  status: "approved";
  approved_by: string;
  approved_at: string;
  override_reason: string | null;
}

export interface PlannedBatchImport {
  batch_id: string;
  entity: MigrationEntity;
  totalToImport: number;
  skippedAlreadyMigrated: number;
  rejectedCount: number;
  importPayloads: Record<string, any>[];
  mappingPayloads: Record<string, any>[];
}

export interface ReconciliationReport {
  batch_id: string;
  entity: MigrationEntity;
  status: string;
  initiated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  checksum: string;
  counts: {
    legacyCount: number;
    migratedCount: number;
    rejectedCount: number;
    missingCount: number;
    duplicateCount: number;
    alreadyMigratedCount: number;
  };
  financials: {
    financialTotalBefore: string;
    financialTotalAfter: string;
    difference: string;
    isZeroDifference: boolean;
  };
  overrideReason: string | null;
  verifiedAt: string;
  isReadinessPassed: boolean;
}

export interface RollbackPlan {
  batch_id: string;
  entity: MigrationEntity;
  recordsToDelete: string[];
  mappingsToDelete: string[];
  action: "atomic_rollback";
}

export function computeChecksum(data: any): string;
export function moneyToMinor(value: any, fieldName?: string): bigint;
export function minorToMoneyString(minorUnits: bigint | number | string): string;
export function normalizeText(text: string | null | undefined): string;
export function normalizeDate(dateVal: any): string | null;

export const MIGRATION_ENTITIES: readonly MigrationEntity[];
export const MIGRATION_PHASES: readonly MigrationPhase[];
export const ROW_CLASSIFICATIONS: { readonly [K in RowClassification]: K };

export function extractLegacyRows(rawRows: any[], options?: { source?: string }): ExtractedLegacyRow[];
export function normalizeLegacyRow(entity: MigrationEntity, extractedRow: ExtractedLegacyRow): NormalizedLegacyRow;
export function validateLegacyRow(entity: MigrationEntity, normalizedRow: NormalizedLegacyRow): ValidatedLegacyRow;
export function matchLegacyRow(entity: MigrationEntity, validatedRow: ValidatedLegacyRow, context?: any): MatchedLegacyRow;
export function generateBatchPreview(entity: MigrationEntity, matchedRows: MatchedLegacyRow[]): BatchPreview;
export function reconcileBatch(batchPreview: BatchPreview, options?: { overrideReason?: string | null; allowDiscrepancy?: boolean }): ReconciliationResult;
export function approveBatch(reconciliationResult: ReconciliationResult, approvalData?: { approvedBy: string; overrideReason?: string | null }): BatchApprovalResult;
export function planBatchImport(batchPreview: BatchPreview, approvalResult: BatchApprovalResult, tenantContext: { tenant_id: string; company_id: string; batch_id: string }): PlannedBatchImport;
export function generateReconciliationReport(batch: any, rowItems: MatchedLegacyRow[], verificationData?: any): ReconciliationReport;
export function buildRollbackPlan(batch: any, mappings: any[], downstreamDependencies?: string[]): RollbackPlan;
