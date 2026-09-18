/**
 * Device Ingestion & Attendance Pipeline Domain Logic
 * Implements Ingestion Contract, Normalization, Deduplication, Quarantine & Attendance Stages Separation.
 */

/**
 * Normalizes raw device event payload across biometric hardware vendors.
 * @param {object} raw
 * @returns {{
 *   deviceSerial: string;
 *   externalEventId: string;
 *   employeeRawId: string;
 *   eventAt: string;
 *   punchKind: 'in' | 'out' | 'break_start' | 'break_end' | 'unknown';
 *   siteCode?: string;
 *   payload: object;
 * }}
 */
export function normalizeDeviceEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('بيانات بصمة الجهاز غير صحيحة');
  }

  const deviceSerial = String(
    raw.device_serial || raw.deviceSerial || raw.serial_number || raw.serialNumber || raw.sn || ''
  ).trim();

  if (!deviceSerial) {
    throw new Error('الرقم التسلسلي للجهاز مطلوب');
  }

  const externalEventId = String(
    raw.external_event_id || raw.externalEventId || raw.log_id || raw.logId || raw.record_id || raw.id || ''
  ).trim();

  if (!externalEventId) {
    throw new Error('معرف الحدث الخارجي مطلوب لضمان منع التكرار');
  }

  const employeeRawId = String(
    raw.employee_raw_id || raw.employeeRawId || raw.user_id || raw.userId || raw.emp_no || raw.pin || ''
  ).trim();

  if (!employeeRawId) {
    throw new Error('رقم الموظف في الجهاز مطلوب');
  }

  const rawAt = raw.event_at || raw.eventAt || raw.punch_at || raw.timestamp || raw.time;
  const parsedDate = new Date(rawAt);
  if (!rawAt || Number.isNaN(parsedDate.getTime())) {
    throw new Error('تاريخ وتوقيت البصمة غير صالح');
  }
  const eventAt = parsedDate.toISOString();

  // Normalize punch kind
  const rawKind = String(raw.punch_kind || raw.punchKind || raw.state || raw.type || '').toLowerCase();
  let punchKind = 'unknown';
  if (rawKind === 'in' || rawKind === '0' || rawKind.includes('حضور') || rawKind === 'checkin') {
    punchKind = 'in';
  } else if (rawKind === 'out' || rawKind === '1' || rawKind.includes('انصراف') || rawKind === 'checkout') {
    punchKind = 'out';
  } else if (rawKind === 'break_start' || rawKind === '2' || rawKind.includes('بداية استراحة')) {
    punchKind = 'break_start';
  } else if (rawKind === 'break_end' || rawKind === '3' || rawKind.includes('نهاية استراحة')) {
    punchKind = 'break_end';
  }

  const siteCode = raw.site_code || raw.siteCode || raw.site || undefined;

  return {
    deviceSerial,
    externalEventId,
    employeeRawId,
    eventAt,
    punchKind,
    siteCode: siteCode ? String(siteCode).trim() : undefined,
    payload: raw,
  };
}

/**
 * Deduplicates new device events against previously seen events or an in-batch seen map.
 * @param {Map<string, object>} seenMap Map of "deviceSerial:externalEventId"
 * @param {object} event Normalized event
 * @returns {{ isDuplicate: boolean; duplicateOf?: object }}
 */
export function deduplicateDeviceEvent(seenMap, event) {
  const key = `${event.deviceSerial}:${event.externalEventId}`;
  if (seenMap.has(key)) {
    return { isDuplicate: true, duplicateOf: seenMap.get(key) };
  }
  seenMap.set(key, event);
  return { isDuplicate: false };
}

/**
 * Quarantines unverified devices, unmapped employees, or unverified sites.
 * An unknown employee or device NEVER converts automatically to approved attendance!
 * @param {object} event Normalized event
 * @param {Array<{ serial_number: string; status: string; site_code: string }>} registeredDevices
 * @param {Array<{ id: string; emp_no: string; status?: string }>} registeredEmployees
 * @param {Array<{ code: string; status: string }>} registeredSites
 * @returns {{
 *   status: 'mapped' | 'unknown_device' | 'unknown_employee' | 'unknown_site' | 'quarantined';
 *   employeeId?: string;
 *   quarantineReason?: string;
 * }}
 */
export function quarantineEvent(event, registeredDevices = [], registeredEmployees = [], registeredSites = []) {
  // 1. Device check
  const device = registeredDevices.find(
    (d) => d.serial_number.toLowerCase() === event.deviceSerial.toLowerCase()
  );
  if (!device) {
    return {
      status: 'unknown_device',
      quarantineReason: `الجهاز ذو الرقم التسلسلي (${event.deviceSerial}) غير مسجل بالنظام`,
    };
  }
  if (device.status !== 'active') {
    return {
      status: 'quarantined',
      quarantineReason: `الجهاز (${device.serial_number}) في حالة (${device.status}) وغير مسموح باستقبال بصماته`,
    };
  }

  // 2. Employee check
  const employee = registeredEmployees.find(
    (e) => String(e.emp_no).trim() === String(event.employeeRawId).trim()
  );
  if (!employee) {
    return {
      status: 'unknown_employee',
      quarantineReason: `رقم الموظف (${event.employeeRawId}) غير مسجل في دليل الموظفين`,
    };
  }
  if (employee.status && ['terminated', 'resigned', 'suspended'].includes(employee.status)) {
    return {
      status: 'quarantined',
      employeeId: employee.id,
      quarantineReason: `الموظف (${employee.emp_no}) في حالة إنهاء خدمة أو إيقاف`,
    };
  }

  // 3. Site check
  const siteCode = event.siteCode || device.site_code;
  if (siteCode && registeredSites.length > 0) {
    const site = registeredSites.find(
      (s) => s.code.toLowerCase() === siteCode.toLowerCase() && s.status === 'active'
    );
    if (!site) {
      return {
        status: 'unknown_site',
        employeeId: employee.id,
        quarantineReason: `موقع البصمة (${siteCode}) غير مسجل أو غير نشط`,
      };
    }
  }

  return {
    status: 'mapped',
    employeeId: employee.id,
  };
}

/**
 * Converts a verified device event into M08 pure punch format for engine.mjs ingestion.
 * @param {object} event Normalized event
 * @param {string} employeeId Resolved employee UUID
 * @returns {object}
 */
export function toM08PunchEvent(event, employeeId) {
  return {
    employeeId,
    at: event.eventAt,
    kind: event.punchKind,
    siteCode: event.siteCode || '',
    source: `device:${event.deviceSerial}`,
    sourceEventId: event.externalEventId,
  };
}

/**
 * Categorizes attendance issues into formal Attendance Exceptions.
 * @param {object} attendanceResult Result object from calculateAttendance
 * @returns {Array<{ category: string; severity: string; message: string; details: object }>}
 */
export function extractAttendanceExceptions(attendanceResult) {
  if (!attendanceResult) return [];
  const exceptions = [];

  if (attendanceResult.status === 'incomplete') {
    if (!attendanceResult.firstIn) {
      exceptions.push({
        category: 'missing_check_in',
        severity: 'exception',
        message: 'بصمة الدخول مفقودة',
        details: { workDate: attendanceResult.workDate, assignmentKey: attendanceResult.assignmentKey },
      });
    }
    if (!attendanceResult.lastOut) {
      exceptions.push({
        category: 'missing_check_out',
        severity: 'exception',
        message: 'بصمة الخروج مفقودة',
        details: { workDate: attendanceResult.workDate, assignmentKey: attendanceResult.assignmentKey },
      });
    }
  }

  if (attendanceResult.lateMinutes > 0) {
    exceptions.push({
      category: 'late',
      severity: attendanceResult.lateMinutes > 30 ? 'exception' : 'warning',
      message: `تأخير بمقدار ${attendanceResult.lateMinutes} دقيقة`,
      details: { lateMinutes: attendanceResult.lateMinutes },
    });
  }

  if (attendanceResult.earlyDepartureMinutes > 0) {
    exceptions.push({
      category: 'early_departure',
      severity: 'warning',
      message: `انصراف مبكر بمقدار ${attendanceResult.earlyDepartureMinutes} دقيقة`,
      details: { earlyDepartureMinutes: attendanceResult.earlyDepartureMinutes },
    });
  }

  if (attendanceResult.eligibleOvertimeMinutes > 0 && !attendanceResult.approvedOvertimeMinutes) {
    exceptions.push({
      category: 'overtime_unapproved',
      severity: 'info',
      message: `ساعات عمل إضافية مؤهلة تحتاج اعتماد (${attendanceResult.eligibleOvertimeMinutes} دقيقة)`,
      details: { eligibleMinutes: attendanceResult.eligibleOvertimeMinutes },
    });
  }

  if (Array.isArray(attendanceResult.issues)) {
    for (const issue of attendanceResult.issues) {
      if (issue.code === 'UNVERIFIED_SITE') {
        exceptions.push({
          category: 'unverified_site',
          severity: 'exception',
          message: issue.message || 'البصمة تمت في موقع غير معتمد',
          details: issue,
        });
      }
    }
  }

  return exceptions;
}

/**
 * Validates Payroll Delivery receiver contract and returns idempotent payload.
 * @param {object} delivery Delivery object
 * @returns {{ valid: boolean; errors: string[]; idempotencyKey: string }}
 */
export function validatePayrollDeliveryContract(delivery) {
  const errors = [];
  if (!delivery || typeof delivery !== 'object') {
    return { valid: false, errors: ['بيانات التسليم مفقودة'], idempotencyKey: '' };
  }

  if (!delivery.periodId) errors.push('معرف دورة الرواتب مطلوب');
  if (!delivery.employeeId) errors.push('معرف الموظف مطلوب');
  if (!delivery.workDate) errors.push('تاريخ العمل مطلوب');
  if (typeof delivery.approvedMinutes !== 'number' || delivery.approvedMinutes < 0) {
    errors.push('دقائق الحضور المعتمدة غير صحيحة');
  }

  // Idempotency key derivation: period:employee:workDate:sourceRevision
  const idempotencyKey = delivery.idempotencyKey ||
    `${delivery.periodId}:${delivery.employeeId}:${delivery.workDate}:${delivery.sourceRevision ?? 0}`;

  return {
    valid: errors.length === 0,
    errors,
    idempotencyKey,
  };
}