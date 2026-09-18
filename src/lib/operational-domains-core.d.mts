export interface TaskSlaResult {
  hasSla: boolean;
  isBreached: boolean;
  slaDueAt: string | null;
  hoursRemaining: number | null;
  overdueHours: number;
}

export interface ConfidentialCorrespondenceResult {
  accessibleRecords: Array<Record<string, unknown>>;
  hiddenSensitiveCount: number;
}

export interface DisciplinaryPenaltyValidation {
  valid: boolean;
  errors: string[];
  calculatedDeductionAmount: number;
  adjustmentPayload: {
    employee_id: string;
    component_code: string;
    component_type: string;
    amount: number;
    days: number;
    source: string;
    status: string;
    reason: string;
  } | null;
}

export interface SurveyAggregationResult {
  totalResponses: number;
  isAnonymous: boolean;
  sanitizedResponses: Array<Record<string, unknown>>;
  questionAggregates: Record<string, Record<string, unknown>>;
}

export interface DocumentRetentionResult {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number | null;
  isPastRetentionPolicy: boolean;
}

export function roundCurrency(amount: number): number;

export function calculateTaskSla(
  task: Record<string, unknown>,
  currentTimeStr?: string
): TaskSlaResult;

export function filterConfidentialCorrespondence(
  records?: Array<Record<string, unknown>>,
  userAuth?: {
    canViewSensitive?: boolean | undefined;
    isAdmin?: boolean | undefined;
    userId?: string | undefined;
  }
): ConfidentialCorrespondenceResult;

export function validateDisciplinaryPenalty(inputs: {
  employeeId: string;
  empNo?: string | undefined;
  employeeName?: string | undefined;
  monthlyWageBase: number;
  decisionType: string;
  deductionDays?: number | undefined;
  existingMonthDeductionsDays?: number | undefined;
  notes?: string | undefined;
}): DisciplinaryPenaltyValidation;

export function aggregateSurveyResults(
  survey: {
    id: string;
    is_anonymous: boolean;
    questions: Array<{ id: string; type: string; title: string; options?: string[] }>;
  },
  responses?: Array<{
    employee_id?: string;
    answers: Record<string, unknown>;
  }>
): SurveyAggregationResult;

export function verifyDocumentRetentionAndExpiry(
  doc: {
    issue_date?: string | undefined;
    expiry_date?: string | undefined;
    retention_years?: number | undefined;
  },
  referenceDateStr?: string
): DocumentRetentionResult;
