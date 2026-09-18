export interface NormalizedDeviceEvent {
  deviceSerial: string;
  externalEventId: string;
  employeeRawId: string;
  eventAt: string;
  punchKind: 'in' | 'out' | 'break_start' | 'break_end' | 'unknown';
  siteCode?: string;
  payload: Record<string, unknown>;
}

export interface RegisteredDevice {
  serial_number: string;
  status: string;
  site_code: string;
}

export interface RegisteredEmployee {
  id: string;
  emp_no: string | number;
  status?: string;
}

export interface RegisteredSite {
  code: string;
  status: string;
}

export interface QuarantineResult {
  status: 'mapped' | 'unknown_device' | 'unknown_employee' | 'unknown_site' | 'quarantined';
  employeeId?: string;
  quarantineReason?: string;
}

export interface M08PunchEvent {
  employeeId: string;
  at: string;
  kind: 'in' | 'out' | 'break_start' | 'break_end' | 'unknown';
  siteCode: string;
  source: string;
  sourceEventId: string;
}

export interface AttendanceException {
  category: string;
  severity: string;
  message: string;
  details: Record<string, unknown>;
}

export interface PayrollDeliveryInput {
  periodId: string;
  employeeId: string;
  workDate: string;
  approvedMinutes: number;
  approvedOvertimeMinutes?: number;
  sourceRevision?: number | bigint;
  idempotencyKey?: string;
}

export declare function normalizeDeviceEvent(raw: unknown): NormalizedDeviceEvent;

export declare function deduplicateDeviceEvent(
  seenMap: Map<string, unknown>,
  event: NormalizedDeviceEvent
): { isDuplicate: boolean; duplicateOf?: unknown };

export declare function quarantineEvent(
  event: NormalizedDeviceEvent,
  registeredDevices?: RegisteredDevice[],
  registeredEmployees?: RegisteredEmployee[],
  registeredSites?: RegisteredSite[]
): QuarantineResult;

export declare function toM08PunchEvent(
  event: NormalizedDeviceEvent,
  employeeId: string
): M08PunchEvent;

export declare function extractAttendanceExceptions(
  attendanceResult: any
): AttendanceException[];

export declare function validatePayrollDeliveryContract(
  delivery: PayrollDeliveryInput
): { valid: boolean; errors: string[]; idempotencyKey: string };