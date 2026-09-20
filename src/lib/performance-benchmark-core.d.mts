export interface SyntheticDataset {
  scale: number;
  employees: Record<string, any>[];
  attendance: Record<string, any>[];
  rawPunches: Record<string, any>[];
  rosters: Record<string, any>[];
  payrollResults: Record<string, any>[];
  leaves: Record<string, any>[];
  loans: Record<string, any>[];
  auditLogs: Record<string, any>[];
  emailLogs: Record<string, any>[];
}

export interface ExecutionMeasurement<T = any> {
  name: string;
  executionTimeMs: number;
  heapUsedDeltaBytes: number;
  heapUsedDeltaMb: number;
  rssDeltaBytes: number;
  payloadSizeBytes: number;
  payloadSizeKb: number;
  result: T;
}

export interface PaginationBenchmarkResult {
  totalRecords: number;
  pageSize: number;
  page: number;
  unbounded: {
    timeMs: number;
    payloadKb: number;
    heapMb: number;
  };
  offset: {
    timeMs: number;
    payloadKb: number;
  };
  keyset: {
    timeMs: number;
    payloadKb: number;
  };
  projection: {
    fullRowSizeKb: number;
    projectedSizeKb: number;
    reductionPercent: number;
  };
}

export interface ConcurrencySimulationResult {
  allPassed: boolean;
  scenarios: {
    twoManagersEditingSameEmployee: {
      passed: boolean;
      managerASucceeded: boolean;
      managerBConflictDetected: boolean;
      finalVersion: number;
    };
    simultaneousLeaveRequests: {
      passed: boolean;
      request1Granted: boolean;
      request2OverdraftBlocked: boolean;
      remainingBalance: number;
    };
    simultaneousRosterPublication: {
      passed: boolean;
      firstPublicationPassed: boolean;
      secondPublicationBlocked: boolean;
    };
    multiplePayrollRecalculations: {
      passed: boolean;
      totalNetSalary: number;
      recalculationCount: number;
    };
    duplicateAttendanceEvents: {
      passed: boolean;
      firstIngestion: string;
      secondIngestion: string;
      totalStored: number;
    };
    repeatedLoanDeductionDelivery: {
      passed: boolean;
      firstPost: string;
      secondPost: string;
      totalDeductionsCount: number;
    };
  };
}

export function generateSyntheticDataset(
  employeeCount: number,
  options?: { seed?: number; companyId?: string; tenantId?: string }
): SyntheticDataset;

export function measureExecution<T = any>(name: string, fn: () => T): ExecutionMeasurement<T>;

export function benchmarkPagination(
  records: any[],
  options?: { pageSize?: number; page?: number; cursor?: string | null }
): PaginationBenchmarkResult;

export function simulateConcurrencyScenarios(): ConcurrencySimulationResult;
