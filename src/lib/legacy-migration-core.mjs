/**
 * Controlled Legacy Data Migration and Reconciliation Engine.
 * 
 * Supports:
 * - 12 Entities (employees, departments, branches, managers, contracts,
 *   leaves, loans, attendance, fingerprint, payroll_archive, documents, requests)
 * - 9 Migration Phases (Extract, Normalize, Validate, Match, Preview,
 *   Reconcile, Approve, Import, Verify)
 * - 6 Row Classifications (MATCHED, AMBIGUOUS, UNMATCHED, INVALID, DUPLICATE, ALREADY_MIGRATED)
 * - Disambiguation Guard: Ambiguous employee names are never auto-resolved
 * - Financial Zero-Tolerance Reconciliation
 * - Idempotency and Atomic Rollback
 */

import { createHash } from "node:crypto";

export const MIGRATION_ENTITIES = Object.freeze([
  "employees",
  "departments",
  "branches",
  "managers",
  "contracts",
  "leaves",
  "loans",
  "attendance",
  "fingerprint",
  "payroll_archive",
  "documents",
  "requests",
]);

export const MIGRATION_PHASES = Object.freeze([
  "extract",
  "normalize",
  "validate",
  "match",
  "preview",
  "reconcile",
  "approve",
  "import",
  "verify",
]);

export const ROW_CLASSIFICATIONS = Object.freeze({
  MATCHED: "MATCHED",
  AMBIGUOUS: "AMBIGUOUS",
  UNMATCHED: "UNMATCHED",
  INVALID: "INVALID",
  DUPLICATE: "DUPLICATE",
  ALREADY_MIGRATED: "ALREADY_MIGRATED",
});

/**
 * Computes deterministic SHA-256 checksum of an object or string.
 */
export function computeChecksum(data) {
  const canonicalString = typeof data === "string" 
    ? data 
    : JSON.stringify(data, Object.keys(data || {}).sort());
  return createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Converts currency amount string or number to integer minor units (halalas/cents).
 */
export function moneyToMinor(value, fieldName = "amount") {
  if (value === null || value === undefined || value === "") return 0n;
  const raw = String(value).trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new Error(`${fieldName}: مبلغ غير صالح أو يتجاوز خانتين عشريتين (${value})`);
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] || "").padEnd(2, "0"));
  return sign * (whole * 100n + fraction);
}

/**
 * Converts integer minor units back to standard decimal string with 2 decimal places.
 */
export function minorToMoneyString(minorUnits) {
  const b = BigInt(minorUnits ?? 0);
  const isNegative = b < 0n;
  const abs = isNegative ? -b : b;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${isNegative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Normalizes text for comparison (strips extra spaces, normalizes Arabic variants).
 */
export function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width characters
    .replace(/[\u0000-\u001f\u007f]/g, "") // Remove control characters
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Normalizes a date string to strict YYYY-MM-DD without any timezone shifts.
 */
export function normalizeDate(dateVal) {
  if (!dateVal) return null;
  const str = String(dateVal).trim();
  const dateMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(str);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = dateMatch[2].padStart(2, "0");
    const d = dateMatch[3].padStart(2, "0");
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return `${y}-${m}-${d}`;
    }
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(parsed.toISOString());
  return isoMatch ? isoMatch[0] : null;
}

/**
 * Phase 1: EXTRACT
 * Extracts raw records and computes immutable row checksums.
 */
export function extractLegacyRows(rawRows, options = {}) {
  const source = options.source || "legacy_input";
  return rawRows.map((row, index) => {
    const legacyId = String(row.id || row.legacy_id || row.code || row.emp_no || `row_${index + 1}`).trim();
    const checksum = computeChecksum(row);
    return {
      legacy_id: legacyId,
      source_row_index: index,
      raw_data: row,
      checksum,
      source,
    };
  });
}

/**
 * Phase 2: NORMALIZE
 * Produces structured, cleaned, and typed representations for each entity.
 */
export function normalizeLegacyRow(entity, extractedRow) {
  const raw = extractedRow.raw_data || {};
  const normalized = { ...raw };

  // Common identifier cleanups
  if (raw.emp_no) normalized.emp_no = String(raw.emp_no).trim();
  if (raw.national_id) normalized.national_id = String(raw.national_id).trim();
  if (raw.email) normalized.email = String(raw.email).trim().toLowerCase();
  if (raw.phone) normalized.phone = String(raw.phone).replace(/[^\d+]/g, "");

  // Entity specific normalizations
  switch (entity) {
    case "employees":
      normalized.full_name = String(raw.full_name || raw.name || `${raw.first_name || ""} ${raw.last_name || ""}`).trim();
      normalized.normalized_name = normalizeText(normalized.full_name);
      normalized.joining_date = normalizeDate(raw.joining_date || raw.hire_date);
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "active";
      if (raw.basic_salary !== undefined) {
        normalized.basic_salary_minor = moneyToMinor(raw.basic_salary, "basic_salary").toString();
      }
      break;

    case "departments":
      normalized.code = String(raw.code || raw.department_code || "").trim();
      normalized.name_ar = String(raw.name_ar || raw.name || "").trim();
      normalized.name_en = raw.name_en ? String(raw.name_en).trim() : null;
      normalized.manager_emp_no = raw.manager_emp_no ? String(raw.manager_emp_no).trim() : null;
      normalized.manager_name = raw.manager_name ? String(raw.manager_name).trim() : null;
      break;

    case "branches":
      normalized.code = String(raw.code || raw.branch_code || "").trim();
      normalized.name_ar = String(raw.name_ar || raw.name || "").trim();
      normalized.name_en = raw.name_en ? String(raw.name_en).trim() : null;
      normalized.city = raw.city ? String(raw.city).trim() : null;
      normalized.manager_emp_no = raw.manager_emp_no ? String(raw.manager_emp_no).trim() : null;
      break;

    case "managers":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.manager_emp_no = raw.manager_emp_no ? String(raw.manager_emp_no).trim() : null;
      normalized.manager_name = raw.manager_name ? String(raw.manager_name).trim() : null;
      normalized.assignment_type = raw.assignment_type ? String(raw.assignment_type).trim().toLowerCase() : "direct";
      break;

    case "contracts":
      normalized.contract_number = String(raw.contract_number || raw.id || "").trim();
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.contract_type = raw.contract_type ? String(raw.contract_type).trim() : "unspecified";
      normalized.start_date = normalizeDate(raw.start_date);
      normalized.end_date = normalizeDate(raw.end_date);
      normalized.basic_salary_minor = moneyToMinor(raw.basic_salary ?? 0, "basic_salary").toString();
      normalized.housing_allowance_minor = moneyToMinor(raw.housing_allowance ?? 0, "housing_allowance").toString();
      normalized.transport_allowance_minor = moneyToMinor(raw.transport_allowance ?? 0, "transport_allowance").toString();
      break;

    case "leaves":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.employee_name = raw.employee_name ? String(raw.employee_name).trim() : null;
      normalized.leave_type = String(raw.leave_type || "annual").trim().toLowerCase();
      normalized.start_date = normalizeDate(raw.start_date);
      normalized.end_date = normalizeDate(raw.end_date);
      normalized.days_count = Number(raw.days_count ?? 1);
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "approved";
      break;

    case "loans":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.employee_name = raw.employee_name ? String(raw.employee_name).trim() : null;
      normalized.amount_minor = moneyToMinor(raw.amount ?? 0, "amount").toString();
      normalized.paid_amount_minor = moneyToMinor(raw.paid_amount ?? 0, "paid_amount").toString();
      normalized.monthly_installment_minor = moneyToMinor(raw.monthly_installment ?? 0, "monthly_installment").toString();
      normalized.installments_count = Number(raw.installments_count ?? 1);
      normalized.start_date = normalizeDate(raw.start_date);
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "active";
      break;

    case "attendance":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.employee_name = raw.employee_name ? String(raw.employee_name).trim() : null;
      normalized.date = normalizeDate(raw.date || raw.work_date);
      normalized.check_in = raw.check_in ? String(raw.check_in).trim() : null;
      normalized.check_out = raw.check_out ? String(raw.check_out).trim() : null;
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "present";
      break;

    case "fingerprint":
      normalized.device_id = String(raw.device_id || "").trim();
      normalized.biometric_user_id = String(raw.biometric_user_id || raw.user_id || "").trim();
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.punch_time = raw.punch_time ? String(raw.punch_time).trim() : null;
      normalized.punch_state = raw.punch_state ? String(raw.punch_state).trim().toLowerCase() : "check_in";
      break;

    case "payroll_archive":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.employee_name = raw.employee_name ? String(raw.employee_name).trim() : null;
      normalized.period_start = normalizeDate(raw.period_start);
      normalized.period_end = normalizeDate(raw.period_end);
      normalized.basic_salary_minor = moneyToMinor(raw.basic_salary ?? 0, "basic_salary").toString();
      normalized.gross_salary_minor = moneyToMinor(raw.gross_salary ?? 0, "gross_salary").toString();
      normalized.total_deductions_minor = moneyToMinor(raw.total_deductions ?? 0, "total_deductions").toString();
      normalized.net_salary_minor = moneyToMinor(raw.net_salary ?? 0, "net_salary").toString();
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "paid";
      break;

    case "documents":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.document_type = String(raw.document_type || "id").trim().toLowerCase();
      normalized.document_number = raw.document_number ? String(raw.document_number).trim() : null;
      normalized.issue_date = normalizeDate(raw.issue_date);
      normalized.expiry_date = normalizeDate(raw.expiry_date);
      normalized.file_name = raw.file_name ? String(raw.file_name).trim() : null;
      break;

    case "requests":
      normalized.employee_emp_no = raw.employee_emp_no ? String(raw.employee_emp_no).trim() : null;
      normalized.employee_name = raw.employee_name ? String(raw.employee_name).trim() : null;
      normalized.request_type = String(raw.request_type || "general").trim().toLowerCase();
      normalized.status = raw.status ? String(raw.status).trim().toLowerCase() : "pending";
      normalized.submission_date = normalizeDate(raw.submission_date || raw.created_at);
      break;

    default:
      break;
  }

  return {
    ...extractedRow,
    normalized_data: normalized,
  };
}

/**
 * Phase 3: VALIDATE
 * Validates mandatory fields, constraints, and business domain invariants.
 */
export function validateLegacyRow(entity, normalizedRow) {
  const norm = normalizedRow.normalized_data || {};
  const errors = [];

  switch (entity) {
    case "employees":
      if (!norm.full_name) errors.push("اسم الموظف مطلوب");
      if (!norm.emp_no && !norm.national_id) errors.push("يجب توفر الرقم الوظيفي أو رقم الهوية الوطنية");
      break;

    case "departments":
      if (!norm.code) errors.push("رمز القسم مطلوب");
      if (!norm.name_ar) errors.push("اسم القسم بالعربية مطلوب");
      break;

    case "branches":
      if (!norm.code) errors.push("رمز الفرع مطلوب");
      if (!norm.name_ar) errors.push("اسم الفرع بالعربية مطلوب");
      break;

    case "managers":
      if (!norm.employee_emp_no) errors.push("الرقم الوظيفي للموظف مطلوب");
      if (!norm.manager_emp_no && !norm.manager_name) errors.push("معرّف أو اسم المدير مطلوب");
      break;

    case "contracts":
      if (!norm.employee_emp_no) errors.push("الرقم الوظيفي للموظف مطلوب");
      if (!norm.contract_number) errors.push("رقم العقد مطلوب");
      if (!norm.start_date) errors.push("تاريخ بداية العقد مطلوب");
      if (norm.end_date && norm.end_date < norm.start_date) errors.push("تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية");
      break;

    case "leaves":
      if (!norm.employee_emp_no && !norm.employee_name) errors.push("معرّف أو اسم الموظف مطلوب للإجازة");
      if (!norm.start_date) errors.push("تاريخ بداية الإجازة مطلوب");
      if (!norm.end_date) errors.push("تاريخ نهاية الإجازة مطلوب");
      if (norm.end_date && norm.start_date && norm.end_date < norm.start_date) errors.push("تاريخ نهاية الإجازة يسبق تاريخ البداية");
      if (!norm.days_count || norm.days_count <= 0) errors.push("عدد أيام الإجازة يجب أن يكون أكبر من صفر");
      break;

    case "loans":
      if (!norm.employee_emp_no && !norm.employee_name) errors.push("معرّف أو اسم الموظف مطلوب للسلفة");
      if (BigInt(norm.amount_minor ?? "0") <= 0n) errors.push("مبلغ السلفة يجب أن يكون أكبر من صفر");
      if (BigInt(norm.paid_amount_minor ?? "0") < 0n) errors.push("المبلغ المسدد لا يمكن أن يكون سالبًا");
      if (BigInt(norm.paid_amount_minor ?? "0") > BigInt(norm.amount_minor ?? "0")) {
        errors.push("المبلغ المسدد لا يمكن أن يتجاوز إجمالي السلفة");
      }
      break;

    case "attendance":
      if (!norm.employee_emp_no && !norm.employee_name) errors.push("معرّف أو اسم الموظف مطلوب لسجل الحضور");
      if (!norm.date) errors.push("تاريخ الحضور مطلوب");
      break;

    case "fingerprint":
      if (!norm.biometric_user_id) errors.push("معرّف البصمة مطلوب");
      if (!norm.punch_time) errors.push("وقت البصمة مطلوب");
      break;

    case "payroll_archive":
      if (!norm.employee_emp_no && !norm.employee_name) errors.push("معرّف أو اسم الموظف مطلوب لكشف الراتب");
      if (!norm.period_start || !norm.period_end) errors.push("فترة الراتب (البداية والنهاية) مطلوبة");
      if (norm.period_end && norm.period_start && norm.period_end < norm.period_start) {
        errors.push("نهاية فترة الراتب تسبق البداية");
      }
      break;

    case "documents":
      if (!norm.employee_emp_no) errors.push("الرقم الوظيفي للموظف مطلوب للمستند");
      if (!norm.document_type) errors.push("نوع المستند مطلوب");
      break;

    case "requests":
      if (!norm.employee_emp_no && !norm.employee_name) errors.push("معرّف أو اسم الموظف مطلوب للطلب");
      if (!norm.request_type) errors.push("نوع الطلب مطلوب");
      break;

    default:
      break;
  }

  return {
    ...normalizedRow,
    validation_errors: errors,
    is_valid: errors.length === 0,
  };
}

/**
 * Phase 4: MATCH
 * Matches legacy records with modern records using stable identifiers,
 * detects duplicates, ambiguous entries, already migrated rows, or unmatched rows.
 */
export function matchLegacyRow(entity, validatedRow, context = {}) {
  const norm = validatedRow.normalized_data || {};
  const {
    existingMappings = new Map(), // legacy_id -> { migrated_id, checksum }
    currentBatchIds = new Set(), // legacy IDs seen in the current batch
    employeesByEmpNo = new Map(),
    employeesByNationalId = new Map(),
    employeesByName = new Map(), // normalized_name -> Employee[]
    departmentsByCode = new Map(),
    branchesByCode = new Map(),
    approvedMappings = new Map(), // legacy_id -> target_id
  } = context;

  const legacyId = validatedRow.legacy_id;

  // 1. Check if INVALID from Phase 3
  if (!validatedRow.is_valid) {
    return {
      ...validatedRow,
      classification: ROW_CLASSIFICATIONS.INVALID,
      matching_notes: `فشل التحقق: ${validatedRow.validation_errors.join(" | ")}`,
      target_id: null,
    };
  }

  // 2. Check if DUPLICATE within current batch
  if (currentBatchIds.has(legacyId)) {
    return {
      ...validatedRow,
      classification: ROW_CLASSIFICATIONS.DUPLICATE,
      matching_notes: `معرّف مكرر في نفس الدفعة (${legacyId})`,
      target_id: null,
    };
  }
  currentBatchIds.add(legacyId);

  // 3. Check if ALREADY_MIGRATED in a previous batch
  if (existingMappings.has(legacyId)) {
    const prev = existingMappings.get(legacyId);
    if (prev.checksum === validatedRow.checksum) {
      return {
        ...validatedRow,
        classification: ROW_CLASSIFICATIONS.ALREADY_MIGRATED,
        matching_notes: `تمت الهجرة سابقًا بنفس البصمة الرقمية (target_id: ${prev.migrated_id})`,
        target_id: prev.migrated_id,
      };
    }
  }

  // 4. Check if an approved manual mapping exists
  if (approvedMappings.has(legacyId)) {
    return {
      ...validatedRow,
      classification: ROW_CLASSIFICATIONS.MATCHED,
      matching_notes: `تمت المطابقة وفق خريطة معتمدة يدويًا`,
      target_id: approvedMappings.get(legacyId),
      stable_identifier: "approved_mapping",
    };
  }

  // 5. Entity-specific matching logic
  let classification = ROW_CLASSIFICATIONS.UNMATCHED;
  let targetId = null;
  let notes = "";
  let stableIdentifier = null;

  switch (entity) {
    case "employees": {
      // Employees are matched against existing modern employees
      const empNo = norm.emp_no;
      const natId = norm.national_id;

      if (empNo && employeesByEmpNo.has(empNo)) {
        targetId = employeesByEmpNo.get(empNo).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `emp_no:${empNo}`;
        notes = `مطابقة تامة بالرقم الوظيفي (${empNo})`;
      } else if (natId && employeesByNationalId.has(natId)) {
        targetId = employeesByNationalId.get(natId).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `national_id:${natId}`;
        notes = `مطابقة تامة برقم الهوية (${natId})`;
      } else {
        // Name check
        const normName = norm.normalized_name;
        const candidates = employeesByName.get(normName) || [];
        if (candidates.length > 1) {
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `يوجد أكثر من موظف بنفس الاسم (${norm.full_name}) - يتطلب مطابقة يدوية معتمدة`;
        } else if (candidates.length === 1) {
          // Rule: Never auto-resolve ambiguous employee names. Prefer stable identifiers.
          // If only matched by name without stable ID or approved mapping, classify as AMBIGUOUS!
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `تم العثور على اسم مطابق دون معرّف ثابت مؤكد (${norm.full_name}) - يتطلب اعتماد صريح`;
        } else {
          // New employee to be created in target
          classification = ROW_CLASSIFICATIONS.MATCHED;
          notes = "سجل موظف جديد جاهز للإدراج";
          stableIdentifier = empNo ? `emp_no:${empNo}` : `national_id:${natId}`;
        }
      }
      break;
    }

    case "departments": {
      const code = norm.code;
      if (departmentsByCode.has(code)) {
        targetId = departmentsByCode.get(code).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `code:${code}`;
        notes = `مطابقة القسم برمز (${code})`;
      } else {
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `code:${code}`;
        notes = "قسم جديد جاهز للإدراج";
      }
      break;
    }

    case "branches": {
      const code = norm.code;
      if (branchesByCode.has(code)) {
        targetId = branchesByCode.get(code).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `code:${code}`;
        notes = `مطابقة الفرع برمز (${code})`;
      } else {
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `code:${code}`;
        notes = "فرع جديد جاهز للإدراج";
      }
      break;
    }

    case "managers": {
      const mgrEmpNo = norm.manager_emp_no;
      const mgrName = norm.manager_name ? normalizeText(norm.manager_name) : null;

      if (mgrEmpNo && employeesByEmpNo.has(mgrEmpNo)) {
        targetId = employeesByEmpNo.get(mgrEmpNo).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `emp_no:${mgrEmpNo}`;
        notes = `مطابقة المدير بالرقم الوظيفي (${mgrEmpNo})`;
      } else if (mgrName) {
        const candidates = employeesByName.get(mgrName) || [];
        if (candidates.length > 1) {
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `اسم المدير متكرر لعدة موظفين (${norm.manager_name}) - يمنع الربط التلقائي`;
        } else if (candidates.length === 1) {
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `مطابقة اسم المدير تتطلب اعتماد صريح لعدم توفر رقم وظيفي`;
        } else {
          classification = ROW_CLASSIFICATIONS.UNMATCHED;
          notes = `لم يتم العثور على موظف باسم المدير (${norm.manager_name})`;
        }
      } else {
        classification = ROW_CLASSIFICATIONS.UNMATCHED;
        notes = "بيانات المدير غير كافية للمطابقة";
      }
      break;
    }

    // Dependent entities that must bind to a valid employee
    case "contracts":
    case "leaves":
    case "loans":
    case "attendance":
    case "payroll_archive":
    case "documents":
    case "requests": {
      const empNo = norm.employee_emp_no;
      const empName = norm.employee_name ? normalizeText(norm.employee_name) : null;

      if (empNo && employeesByEmpNo.has(empNo)) {
        targetId = employeesByEmpNo.get(empNo).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `emp_no:${empNo}`;
        notes = `مطابقة الموظف بالرقم الوظيفي (${empNo})`;
      } else if (empName) {
        const candidates = employeesByName.get(empName) || [];
        if (candidates.length > 1) {
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `يوجد أكثر من موظف بنفس الاسم (${norm.employee_name}) - يمنع الربط التلقائي ويتطلب مطابقة يدوية معتمدة`;
        } else if (candidates.length === 1) {
          classification = ROW_CLASSIFICATIONS.AMBIGUOUS;
          notes = `مطابقة الموظف بالاسم فقط دون رقم وظيفي (${norm.employee_name}) - تتطلب اعتماد صريح`;
        } else {
          classification = ROW_CLASSIFICATIONS.UNMATCHED;
          notes = `لم يتم العثور على الموظف (${norm.employee_name})`;
        }
      } else {
        classification = ROW_CLASSIFICATIONS.UNMATCHED;
        notes = "معرّف الموظف غير موجود في السجلات الحديثة";
      }
      break;
    }

    case "fingerprint": {
      // Match by biometric user id or emp_no
      const bioId = norm.biometric_user_id;
      const empNo = norm.employee_emp_no;
      if (empNo && employeesByEmpNo.has(empNo)) {
        targetId = employeesByEmpNo.get(empNo).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `emp_no:${empNo}`;
        notes = `مطابقة بصمة الموظف بالرقم الوظيفي (${empNo})`;
      } else if (bioId && employeesByEmpNo.has(bioId)) {
        targetId = employeesByEmpNo.get(bioId).id;
        classification = ROW_CLASSIFICATIONS.MATCHED;
        stableIdentifier = `biometric_id:${bioId}`;
        notes = `مطابقة البصمة برقم المستخدم البايومتري (${bioId})`;
      } else {
        classification = ROW_CLASSIFICATIONS.UNMATCHED;
        notes = `بصمة غير مرتبطة بموظف معروف (${bioId})`;
      }
      break;
    }

    default:
      break;
  }

  // Calculate financial amount for financial entities
  let financialAmount = 0n;
  if (entity === "loans") {
    financialAmount = BigInt(norm.amount_minor || "0");
  } else if (entity === "payroll_archive") {
    financialAmount = BigInt(norm.net_salary_minor || "0");
  } else if (entity === "contracts") {
    financialAmount = BigInt(norm.basic_salary_minor || "0");
  }

  return {
    ...validatedRow,
    classification,
    target_id: targetId,
    matching_notes: notes,
    stable_identifier: stableIdentifier,
    financial_amount: financialAmount.toString(),
  };
}

/**
 * Phase 5: PREVIEW
 * Aggregates batch rows and generates a preview summary.
 */
export function generateBatchPreview(entity, matchedRows) {
  const counts = {
    total: matchedRows.length,
    MATCHED: 0,
    AMBIGUOUS: 0,
    UNMATCHED: 0,
    INVALID: 0,
    DUPLICATE: 0,
    ALREADY_MIGRATED: 0,
  };

  let financialTotalBefore = 0n;
  let financialTotalAfter = 0n;

  for (const row of matchedRows) {
    counts[row.classification] = (counts[row.classification] || 0) + 1;
    const amount = BigInt(row.financial_amount || "0");
    financialTotalBefore += amount;
    if (row.classification === ROW_CLASSIFICATIONS.MATCHED) {
      financialTotalAfter += amount;
    }
  }

  const financialDifference = financialTotalAfter - financialTotalBefore;

  const canApprove = counts.AMBIGUOUS === 0 && counts.INVALID === 0;

  return {
    entity,
    counts,
    financials: {
      totalBeforeMinor: financialTotalBefore.toString(),
      totalAfterMinor: financialTotalAfter.toString(),
      differenceMinor: financialDifference.toString(),
      totalBeforeFormatted: minorToMoneyString(financialTotalBefore),
      totalAfterFormatted: minorToMoneyString(financialTotalAfter),
      differenceFormatted: minorToMoneyString(financialDifference),
      isZeroDifference: financialDifference === 0n,
    },
    canApprove,
    rows: matchedRows,
  };
}

/**
 * Phase 6: RECONCILE
 * Strictly verifies count integrity and zero-tolerance financial balance.
 */
export function reconcileBatch(batchPreview, options = {}) {
  const { counts, financials } = batchPreview;
  const { overrideReason = null, allowDiscrepancy = false } = options;

  const rowCountSum = counts.MATCHED + counts.AMBIGUOUS + counts.UNMATCHED + counts.INVALID + counts.DUPLICATE + counts.ALREADY_MIGRATED;
  const isCountConsistent = rowCountSum === counts.total;

  const isFinancialZeroDiff = financials.differenceMinor === "0";
  const isFinancialApproved = isFinancialZeroDiff || (allowDiscrepancy && Boolean(overrideReason?.trim()));

  const issues = [];
  if (!isCountConsistent) {
    issues.push(`عدم اتساق في إجمالي الصفوف: المجموع (${rowCountSum}) لا يطابق الإجمالي (${counts.total})`);
  }
  if (counts.AMBIGUOUS > 0) {
    issues.push(`يوجد ${counts.AMBIGUOUS} سجل ملتبس يتطلب مطابقة يدوية معتمدة`);
  }
  if (counts.INVALID > 0) {
    issues.push(`يوجد ${counts.INVALID} سجل غير صالح وفق قواعد التحقق`);
  }
  if (!isFinancialZeroDiff && !isFinancialApproved) {
    issues.push(`فارق مالي غير مصفّر (${financials.differenceFormatted}) يتطلب سبب اعتماد معتمد صريحًا`);
  }

  const status = issues.length === 0 ? "reconciled" : "reconciliation_failed";

  return {
    isReconciled: issues.length === 0,
    status,
    issues,
    counts,
    financials,
    overrideReason,
  };
}

/**
 * Phase 7: APPROVE
 * Validates prerequisites before granting migration import approval.
 */
export function approveBatch(reconciliationResult, approvalData = {}) {
  const { approvedBy, overrideReason } = approvalData;
  if (!approvedBy) {
    throw new Error("لا يمكن اعتماد الدفعة دون تحديد معرّف المعتمد (approved_by)");
  }

  if (reconciliationResult.counts.AMBIGUOUS > 0) {
    throw new Error(`لا يمكن اعتماد الدفعة: يوجد ${reconciliationResult.counts.AMBIGUOUS} سجل ملتبس غير محسوم`);
  }

  if (reconciliationResult.financials.differenceMinor !== "0") {
    if (!overrideReason || !overrideReason.trim()) {
      throw new Error(`لا يمكن اعتماد الدفعة: يوجد فارق مالي (${reconciliationResult.financials.differenceFormatted}) دون تقديم سبب استثناء معتمد`);
    }
  }

  return {
    status: "approved",
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    override_reason: overrideReason || null,
  };
}

/**
 * Phase 8: IMPORT (Execution Planner)
 * Prepares actionable insert/update payloads and mapping rows for target database.
 */
export function planBatchImport(batchPreview, approvalResult, tenantContext) {
  if (approvalResult.status !== "approved") {
    throw new Error("لا يمكن تخطيط الاستيراد لدفعة غير معتمدة");
  }

  const { tenant_id, company_id, batch_id } = tenantContext;
  const toImport = [];
  const mappingsToCreate = [];
  let skippedAlreadyMigrated = 0;
  let rejectedCount = 0;

  for (const row of batchPreview.rows) {
    if (row.classification === ROW_CLASSIFICATIONS.ALREADY_MIGRATED) {
      skippedAlreadyMigrated++;
      continue;
    }

    if (row.classification === ROW_CLASSIFICATIONS.MATCHED) {
      const generatedTargetId = row.target_id || crypto.randomUUID();
      toImport.push({
        ...row.normalized_data,
        id: generatedTargetId,
        tenant_id,
        company_id,
        migration_legacy_id: row.legacy_id,
        migration_batch_id: batch_id,
      });

      mappingsToCreate.push({
        tenant_id,
        company_id,
        entity: batchPreview.entity,
        legacy_id: row.legacy_id,
        migrated_id: generatedTargetId,
        batch_id,
        checksum: row.checksum,
      });
    } else {
      rejectedCount++;
    }
  }

  return {
    batch_id,
    entity: batchPreview.entity,
    totalToImport: toImport.length,
    skippedAlreadyMigrated,
    rejectedCount,
    importPayloads: toImport,
    mappingPayloads: mappingsToCreate,
  };
}

/**
 * Phase 9: VERIFY & REPORT
 * Generates the standardized reconciliation report after import.
 */
export function generateReconciliationReport(batch, rowItems, verificationData = {}) {
  const counts = {
    legacyCount: 0,
    migratedCount: 0,
    rejectedCount: 0,
    missingCount: 0,
    duplicateCount: 0,
    alreadyMigratedCount: 0,
  };

  let financialTotalBefore = 0n;
  let financialTotalAfter = 0n;

  for (const item of rowItems) {
    counts.legacyCount++;
    const amount = BigInt(item.financial_amount || "0");
    financialTotalBefore += amount;

    switch (item.classification) {
      case ROW_CLASSIFICATIONS.MATCHED:
        counts.migratedCount++;
        financialTotalAfter += amount;
        break;
      case ROW_CLASSIFICATIONS.INVALID:
      case ROW_CLASSIFICATIONS.AMBIGUOUS:
        counts.rejectedCount++;
        break;
      case ROW_CLASSIFICATIONS.UNMATCHED:
        counts.missingCount++;
        break;
      case ROW_CLASSIFICATIONS.DUPLICATE:
        counts.duplicateCount++;
        break;
      case ROW_CLASSIFICATIONS.ALREADY_MIGRATED:
        counts.alreadyMigratedCount++;
        financialTotalAfter += amount; // Preserved from previous batch
        break;
      default:
        break;
    }
  }

  const financialDifference = financialTotalAfter - financialTotalBefore;

  return {
    batch_id: batch.id,
    entity: batch.entity,
    status: batch.status,
    initiated_by: batch.initiated_by,
    approved_by: batch.approved_by,
    approved_at: batch.approved_at,
    checksum: batch.checksum,
    counts: {
      legacyCount: counts.legacyCount,
      migratedCount: counts.migratedCount,
      rejectedCount: counts.rejectedCount,
      missingCount: counts.missingCount,
      duplicateCount: counts.duplicateCount,
      alreadyMigratedCount: counts.alreadyMigratedCount,
    },
    financials: {
      financialTotalBefore: minorToMoneyString(financialTotalBefore),
      financialTotalAfter: minorToMoneyString(financialTotalAfter),
      difference: minorToMoneyString(financialDifference),
      isZeroDifference: financialDifference === 0n,
    },
    overrideReason: batch.override_reason || null,
    verifiedAt: new Date().toISOString(),
    isReadinessPassed: counts.rejectedCount === 0 && (financialDifference === 0n || Boolean(batch.override_reason)),
  };
}

/**
 * Rollback Strategy
 * Validates whether a batch can be safely rolled back and generates deletion keys.
 */
export function buildRollbackPlan(batch, mappings, downstreamDependencies = []) {
  if (batch.status === "rolled_back") {
    throw new Error("الدفعة تم التراجع عنها مسبقًا");
  }

  if (downstreamDependencies.length > 0) {
    throw new Error(`لا يمكن التراجع عن الدفعة لوجود علاقات تابعة أنشئت لاحقًا: ${downstreamDependencies.join(", ")}`);
  }

  return {
    batch_id: batch.id,
    entity: batch.entity,
    recordsToDelete: mappings.map(m => m.migrated_id),
    mappingsToDelete: mappings.map(m => m.id),
    action: "atomic_rollback",
  };
}
