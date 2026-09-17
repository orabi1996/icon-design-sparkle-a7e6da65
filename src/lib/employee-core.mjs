/**
 * Employee Domain - Pure Business Core & Lifecycle Logic
 * Enforces Saudi National ID / Iqama checksums, ISO 7064 IBAN MOD-97,
 * sensitive data masking, state machine transitions, and employee validation.
 */

export const EMPLOYMENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  PROBATION: "probation",
  SUSPENDED: "suspended",
  ON_LEAVE: "on_leave",
  TERMINATED: "terminated",
  RESIGNED: "resigned",
});

export const STATUS_LABELS_AR = Object.freeze({
  active: "نشط",
  probation: "تحت التجربة",
  suspended: "موقوف",
  on_leave: "في إجازة",
  terminated: "منتهي الخدمة",
  resigned: "مستقيل",
});

/**
 * Validates a Saudi National ID (starts with 1) or Resident Iqama (starts with 2)
 * using the official 10-digit modulus-10 checksum algorithm.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isValidSaudiNationalId(id) {
  if (!id || typeof id !== "string") return false;
  const clean = id.trim();
  if (!/^[12]\d{9}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = Number.parseInt(clean[i], 10);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }

  const expectedCheck = (10 - (sum % 10)) % 10;
  const actualCheck = Number.parseInt(clean[9], 10);
  return expectedCheck === actualCheck;
}

/**
 * Validates an International Bank Account Number (IBAN), specifically Saudi Arabia (SA + 22 chars).
 * Implements ISO 7064 Modulo 97-10 checksum.
 *
 * @param {string} iban
 * @returns {boolean}
 */
export function isValidIban(iban) {
  if (!iban || typeof iban !== "string") return false;
  const clean = iban.replaceAll(/\s+/g, "").toUpperCase();

  // Saudi IBAN must start with SA and be exactly 24 characters
  if (!/^SA\d{2}[0-9A-Z]{20}$/.test(clean)) return false;

  // Rearrange: Move initial 4 chars to the end
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Replace each letter with two digits (A=10, B=11, ... Z=35)
  let numericString = "";
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else {
      numericString += rearranged[i];
    }
  }

  try {
    return BigInt(numericString) % 97n === 1n;
  } catch {
    return false;
  }
}

/**
 * Masks a sensitive National ID / Iqama if user lacks permission.
 *
 * @param {string | null | undefined} id
 * @param {boolean} hasPermission
 * @returns {string}
 */
export function maskNationalId(id, hasPermission) {
  if (!id) return "";
  const clean = String(id).trim();
  if (hasPermission || clean.length < 5) return clean;
  return clean.slice(0, 3) + "****" + clean.slice(-3);
}

/**
 * Masks an IBAN if user lacks permission.
 *
 * @param {string | null | undefined} iban
 * @param {boolean} hasPermission
 * @returns {string}
 */
export function maskIban(iban, hasPermission) {
  if (!iban) return "";
  const clean = String(iban).replaceAll(/\s+/g, "").toUpperCase();
  if (hasPermission || clean.length < 8) return clean;
  return clean.slice(0, 4) + "********" + clean.slice(-4);
}

/**
 * Masks financial amount if user lacks permission.
 *
 * @param {number | string | null | undefined} amount
 * @param {boolean} hasPermission
 * @returns {number | string}
 */
export function maskFinancialValue(amount, hasPermission) {
  if (hasPermission) return Number(amount) || 0;
  return "***";
}

/**
 * Allowed status transition matrix.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  probation: ["active", "terminated", "resigned"],
  active: ["suspended", "on_leave", "terminated", "resigned"],
  suspended: ["active", "terminated", "resigned"],
  on_leave: ["active", "terminated", "resigned"],
  terminated: [],
  resigned: [],
});

/**
 * Checks whether transitioning from `fromStatus` to `toStatus` is valid.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function isAllowedStatusTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true; // No-op transition
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Boolean(allowed && allowed.includes(toStatus));
}

/**
 * Validates a status transition request with metadata.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {{ reason?: string, effective_date?: string }} metadata
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateStatusTransition(fromStatus, toStatus, metadata = {}) {
  const normFrom = (fromStatus || "").toLowerCase();
  const normTo = (toStatus || "").toLowerCase();

  const validStatuses = Object.values(EMPLOYMENT_STATUSES);
  if (!validStatuses.includes(normTo)) {
    return { isValid: false, error: `الحالة المطلوبة غير صالحة: "${toStatus}"` };
  }

  if (!isAllowedStatusTransition(normFrom, normTo)) {
    return {
      isValid: false,
      error: `لا يمكن تحويل حالة الموظف من "${STATUS_LABELS_AR[normFrom] || normFrom}" إلى "${STATUS_LABELS_AR[normTo] || normTo}" مباشرة`,
    };
  }

  if (normTo === "terminated" || normTo === "resigned") {
    if (!metadata.reason || metadata.reason.trim().length < 3) {
      return { isValid: false, error: "سبب إنهاء الخدمة / الاستقالة إلزامي ولا يقل عن 3 أحرف" };
    }
  }

  if (normTo === "suspended") {
    if (!metadata.reason || metadata.reason.trim().length < 3) {
      return { isValid: false, error: "سبب إيقاف الموظف إلزامي ولا يقل عن 3 أحرف" };
    }
  }

  return { isValid: true };
}

/**
 * Validates employee master payload.
 *
 * @param {Record<string, any>} employee
 * @param {Array<Record<string, any>>} existingEmployees
 * @returns {{ isValid: boolean, errors: Record<string, string>, normalized: Record<string, any> }}
 */
export function validateEmployee(employee, existingEmployees = []) {
  const errors = {};
  const empNo = (employee.emp_no || "").trim();
  const fullName = (employee.full_name || "").trim();
  const nationalId = (employee.national_id || "").trim();
  const iban = (employee.iban || "").replaceAll(/\s+/g, "").toUpperCase();

  // Employee Number validation
  if (!empNo) {
    errors.emp_no = "الرقم الوظيفي مطلوب";
  } else if (empNo.length > 50) {
    errors.emp_no = "الرقم الوظيفي يجب ألا يتجاوز 50 حرفًا";
  } else {
    const dup = existingEmployees.find(
      (e) => e.id !== employee.id && (e.emp_no || "").trim().toLowerCase() === empNo.toLowerCase()
    );
    if (dup) {
      errors.emp_no = `الرقم الوظيفي "${empNo}" مستخدم بالفعل لموظف آخر`;
    }
  }

  // Full Name validation
  if (!fullName) {
    errors.full_name = "اسم الموظف الكامل مطلوب";
  } else if (fullName.length < 2 || fullName.length > 200) {
    errors.full_name = "اسم الموظف يجب أن يتراوح بين حرفين و 200 حرف";
  }

  // National ID / Iqama validation
  if (nationalId) {
    // If 10 digits starting with 1 or 2, enforce official Saudi/Iqama checksum
    if (/^[12]\d{9}$/.test(nationalId)) {
      if (!isValidSaudiNationalId(nationalId)) {
        errors.national_id = "رقم الهوية الوطنية / الإقامة غير صحيح وفق خوارزمية التدقيق الرسمية";
      }
    } else if (!/^[A-Za-z0-9]{5,20}$/.test(nationalId)) {
      errors.national_id = "رقم الهوية أو جواز السفر غير صالح";
    }
  }

  // IBAN validation
  if (iban) {
    if (!isValidIban(iban)) {
      errors.iban = "صيغة الآيبان البنكي غير صحيحة أو رمز التدقيق البنكي غير مطابق";
    }
  }

  // Salary & Allowances
  const basicSalary = Number(employee.basic_salary) || 0;
  const allowances = Number(employee.allowances) || 0;

  if (basicSalary < 0) {
    errors.basic_salary = "الراتب الأساسي لا يمكن أن يكون سالباً";
  }
  if (allowances < 0) {
    errors.allowances = "البدلات لا يمكن أن تكون سالبة";
  }

  // Birth Date & Minimum Age (18 years)
  if (employee.birth_date) {
    const bDate = new Date(employee.birth_date);
    if (Number.isNaN(bDate.getTime())) {
      errors.birth_date = "تاريخ الميلاد غير صالح";
    } else {
      const today = new Date();
      const ageYears = (today.getTime() - bDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 18) {
        errors.birth_date = "يجب ألا يقل عمر الموظف عن 18 عاماً نظاماً";
      }
    }
  }

  // Hire Date & Contract End
  if (employee.hire_date && employee.contract_end) {
    if (employee.contract_end < employee.hire_date) {
      errors.contract_end = "تاريخ انتهاء العقد يجب أن يكون لاحقاً لتاريخ التعيين";
    }
  }

  // Status check
  const status = (employee.employment_status || employee.status || "active").toLowerCase();
  const validStatuses = Object.values(EMPLOYMENT_STATUSES);
  const finalStatus = validStatuses.includes(status) ? status : "active";

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      emp_no: empNo,
      full_name: fullName,
      employee_name_en: (employee.employee_name_en || "").trim() || null,
      national_id: nationalId || null,
      iban: iban || null,
      basic_salary: basicSalary,
      allowances: allowances,
      employment_status: finalStatus,
      status: STATUS_LABELS_AR[finalStatus] || "نشط",
      branch_id: employee.branch_id || null,
      department_id: employee.department_id || null,
      job_id: employee.job_id || null,
      position_id: employee.position_id || null,
      hire_date: employee.hire_date || new Date().toISOString().slice(0, 10),
      contract_end: employee.contract_end || null,
      phone: (employee.phone || "").trim() || null,
      email: (employee.email || "").trim() || null,
      gender: employee.gender || "ذكر",
      nationality: employee.nationality || "سعودي",
    },
  };
}
