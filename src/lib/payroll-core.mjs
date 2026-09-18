/**
 * PROMPT 7: Pure Payroll Domain Core
 * Implements deterministic calculation, formula versioning, statutory country pack (GOSI),
 * input snapshotting, reconciliation, and SAMA/MOL WPS bank file generation.
 */

/**
 * Pure UTF-8 SHA-256 implementation without Node or browser dependencies.
 * @param {string} str
 * @returns {string} 64-character hexadecimal SHA-256 hash
 */
export function sha256Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i;
  let j;
  let result = '';
  const words = [];
  const bitLength = bytes.length * 8;
  let hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  for (i = 0; i < bytes.length; i++) {
    words[i >> 2] |= bytes[i] << ((3 - (i % 4)) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << ((3 - (bytes.length % 4)) * 8);
  const totalWords = (((bytes.length + 8) >> 6) + 1) * 16;
  while (words.length < totalWords - 2) words.push(0);
  words.push((bitLength / maxWord) | 0);
  words.push(bitLength | 0);

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i] || 0
            : ((w[i - 16] || 0) +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                (w[i - 7] || 0) +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash.slice(0, 7));
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Rounds a number using deterministic 2-decimal financial rounding.
 * @param {number} amount
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function roundCurrency(amount, decimals = 2) {
  if (!Number.isFinite(amount)) return 0;
  const factor = 10 ** decimals;
  const res = Math.round((amount + Number.EPSILON) * factor) / factor;
  return res === 0 ? 0 : res;
}

/**
 * Default Saudi GOSI Country Pack configuration (versioned).
 * @returns {{
 *   version: number;
 *   countryCode: string;
 *   saudi_employee_pct: number;
 *   saudi_company_pct: number;
 *   non_saudi_employee_pct: number;
 *   non_saudi_company_pct: number;
 *   cap_base_amount: number;
 *   min_base_amount: number;
 *   max_deduction_pct: number;
 * }}
 */
export function getDefaultStatutoryConfig() {
  return {
    version: 1,
    countryCode: 'SA',
    saudi_employee_pct: 9.75, // 9% Retirement + 0.75% Saned
    saudi_company_pct: 11.75, // 9% Retirement + 0.75% Saned + 2% Hazards
    non_saudi_employee_pct: 0.0,
    non_saudi_company_pct: 2.0, // Occupational Hazard
    cap_base_amount: 45000.0,
    min_base_amount: 1500.0,
    max_deduction_pct: 50.0, // Statutory limit on deduction from gross
  };
}

/**
 * Computes deterministic employee payroll results from raw inputs and statutory rules.
 * @param {object} employee Employee master data
 * @param {Array<object>} inputs Input component items
 * @param {object} [statutoryConfig] Versioned statutory configuration
 * @param {object} [options]
 * @returns {object} Calculated payroll result with snapshot
 */
export function computeEmployeePayroll(employee, inputs = [], statutoryConfig = getDefaultStatutoryConfig(), options = {}) {
  if (!employee) throw new Error('بيانات الموظف مطلوبة لاحتساب الراتب');

  const isSaudi = employee.nationality === 'سعودي' || employee.is_saudi === true || employee.nationality_code === 'SA';

  // 1. Resolve Basic Salary
  const basicInput = inputs.find((i) => i.component_code === 'BASIC');
  const basicSalary = roundCurrency(
    Number(basicInput?.amount ?? employee.basic_salary ?? employee.basicSalary ?? 0)
  );

  // 2. Fixed Allowances
  const housingInput = inputs.find((i) => i.component_code === 'HOUSING');
  const housingAllowance = roundCurrency(
    Number(housingInput?.amount ?? employee.housing_allowance ?? employee.housingAllowance ?? 0)
  );

  const transportInput = inputs.find((i) => i.component_code === 'TRANSPORT');
  const transportAllowance = roundCurrency(
    Number(transportInput?.amount ?? employee.transport_allowance ?? employee.transportAllowance ?? 0)
  );

  // Other recurring / variable allowances
  let otherAllowances = 0;
  let overtimeAmount = 0;
  let manualEarnings = 0;

  for (const item of inputs) {
    const amt = Number(item.amount) || 0;
    if (item.component_code === 'OVERTIME') {
      overtimeAmount += amt;
    } else if (item.component_type === 'earning' && !['BASIC', 'HOUSING', 'TRANSPORT', 'OVERTIME'].includes(item.component_code)) {
      if (item.source === 'manual_adjustment') {
        manualEarnings += amt;
      } else {
        otherAllowances += amt;
      }
    }
  }

  otherAllowances = roundCurrency(otherAllowances);
  overtimeAmount = roundCurrency(overtimeAmount);
  manualEarnings = roundCurrency(manualEarnings);

  const totalAllowances = roundCurrency(housingAllowance + transportAllowance + otherAllowances + overtimeAmount + manualEarnings);
  const grossSalary = roundCurrency(basicSalary + totalAllowances);

  // 3. Statutory Deductions (GOSI Country Pack)
  const gosiBase = Math.min(
    Math.max(basicSalary + housingAllowance, statutoryConfig.min_base_amount || 0),
    statutoryConfig.cap_base_amount || 45000
  );

  let socialInsuranceEmployee = 0;
  let socialInsuranceCompany = 0;

  if (isSaudi) {
    socialInsuranceEmployee = roundCurrency((gosiBase * statutoryConfig.saudi_employee_pct) / 100);
    socialInsuranceCompany = roundCurrency((gosiBase * statutoryConfig.saudi_company_pct) / 100);
  } else {
    socialInsuranceEmployee = roundCurrency((gosiBase * statutoryConfig.non_saudi_employee_pct) / 100);
    socialInsuranceCompany = roundCurrency((gosiBase * statutoryConfig.non_saudi_company_pct) / 100);
  }

  // 4. Attendance, Leave, and Loan Deductions
  let lateDeductions = 0;
  let absenceDeductions = 0;
  let leaveDeductions = 0;
  let requestedLoanDeduction = 0;
  let manualDeductions = 0;

  for (const item of inputs) {
    const amt = Number(item.amount) || 0;
    if (item.component_code === 'LATE_DEDUCTION') {
      lateDeductions += amt;
    } else if (item.component_code === 'ABSENCE_DEDUCTION') {
      absenceDeductions += amt;
    } else if (item.component_code === 'LEAVE_UNPAID' || item.component_code === 'LEAVE_DEDUCTION') {
      leaveDeductions += amt;
    } else if (item.component_code === 'LOAN_INSTALLMENT') {
      requestedLoanDeduction += amt;
    } else if (item.component_type === 'deduction' && !['GOSI_EMPLOYEE', 'LATE_DEDUCTION', 'ABSENCE_DEDUCTION', 'LEAVE_UNPAID', 'LEAVE_DEDUCTION', 'LOAN_INSTALLMENT'].includes(item.component_code)) {
      manualDeductions += amt;
    }
  }

  lateDeductions = roundCurrency(lateDeductions);
  absenceDeductions = roundCurrency(absenceDeductions);
  leaveDeductions = roundCurrency(leaveDeductions);
  manualDeductions = roundCurrency(manualDeductions);

  // Subtotal of non-loan deductions
  const nonLoanDeductions = roundCurrency(
    socialInsuranceEmployee + lateDeductions + absenceDeductions + leaveDeductions + manualDeductions
  );

  // 5. Statutory Deduction Cap Protection
  // Total deductions must not exceed max_deduction_pct of gross (e.g. 50%) unless forced by court
  const maxAllowedDeductions = roundCurrency((grossSalary * (statutoryConfig.max_deduction_pct || 50)) / 100);
  const remainingDeductionCapacity = Math.max(0, roundCurrency(maxAllowedDeductions - nonLoanDeductions));

  // Cap loan deduction to remaining capacity
  const loanDeductions = roundCurrency(Math.min(requestedLoanDeduction, remainingDeductionCapacity));

  const totalDeductions = roundCurrency(nonLoanDeductions + loanDeductions);
  const netSalary = roundCurrency(grossSalary - totalDeductions);

  const snapshot = {
    calculatedAt: options.now || new Date().toISOString(),
    statutoryVersion: statutoryConfig.version,
    formulaVersion: options.formulaVersion || 1,
    isSaudi,
    gosiBase,
    rates: {
      employeeGosiPct: isSaudi ? statutoryConfig.saudi_employee_pct : statutoryConfig.non_saudi_employee_pct,
      companyGosiPct: isSaudi ? statutoryConfig.saudi_company_pct : statutoryConfig.non_saudi_company_pct,
    },
    loanCapped: requestedLoanDeduction > loanDeductions,
    requestedLoanDeduction,
    inputsCount: inputs.length,
  };

  return {
    employeeId: employee.id,
    empNo: String(employee.emp_no || employee.empNo || ''),
    employeeName: employee.full_name || employee.fullName || '—',
    isSaudi,
    bankCode: employee.bank_code || employee.bankCode || '',
    iban: (employee.iban || '').trim(),
    basicSalary,
    housingAllowance,
    transportAllowance,
    otherAllowances,
    overtimeAmount,
    manualEarnings,
    grossSalary,
    lateDeductions,
    absenceDeductions,
    leaveDeductions,
    loanDeductions,
    socialInsuranceEmployee,
    socialInsuranceCompany,
    manualDeductions,
    totalDeductions,
    netSalary,
    currency: options.currency || 'SAR',
    calculationSnapshot: snapshot,
    status: netSalary >= 0 ? 'calculated' : 'error',
  };
}

/**
 * Reconciles totals across an entire payroll run down to the exact cent.
 * @param {Array<object>} results
 * @returns {{
 *   isReconciled: boolean;
 *   totalBasic: number;
 *   totalAllowances: number;
 *   totalGross: number;
 *   totalDeductions: number;
 *   totalSocialInsurance: number;
 *   totalNet: number;
 *   employeesCount: number;
 *   difference: number;
 * }}
 */
export function reconcilePayrollTotals(results = []) {
  let totalBasic = 0;
  let totalAllowances = 0;
  let totalGross = 0;
  let totalDeductions = 0;
  let totalSocialInsurance = 0;
  let totalNet = 0;

  for (const r of results) {
    totalBasic += Number(r.basicSalary) || 0;
    totalAllowances += (Number(r.housingAllowance) || 0) + (Number(r.transportAllowance) || 0) + (Number(r.otherAllowances) || 0) + (Number(r.overtimeAmount) || 0) + (Number(r.manualEarnings) || 0);
    totalGross += Number(r.grossSalary) || 0;
    totalDeductions += Number(r.totalDeductions) || 0;
    totalSocialInsurance += Number(r.socialInsuranceEmployee) || 0;
    totalNet += Number(r.netSalary) || 0;
  }

  totalBasic = roundCurrency(totalBasic);
  totalAllowances = roundCurrency(totalAllowances);
  totalGross = roundCurrency(totalGross);
  totalDeductions = roundCurrency(totalDeductions);
  totalSocialInsurance = roundCurrency(totalSocialInsurance);
  totalNet = roundCurrency(totalNet);

  const difference = roundCurrency(totalGross - totalDeductions - totalNet);
  const isReconciled = Math.abs(difference) === 0;

  return {
    isReconciled,
    totalBasic,
    totalAllowances,
    totalGross,
    totalDeductions,
    totalSocialInsurance,
    totalNet,
    employeesCount: results.length,
    difference,
  };
}

/**
 * Validates an employee record against Saudi WPS (Wage Protection System) criteria.
 * @param {object} record
 * @returns {{ valid: boolean; errors: string[] }}
 */
export function validateWpsRecord(record) {
  const errors = [];
  if (!record) return { valid: false, errors: ['سجل الموظف مفقود'] };

  // 1. IBAN Validation (Must be SA + 22 alphanumeric = 24 chars)
  const iban = String(record.iban || '').trim().toUpperCase();
  if (!iban) {
    errors.push('رقم الآيبان البنكي مطلوب لملف حماية الأجور');
  } else if (!/^SA\d{2}[A-Z0-9]{20}$/.test(iban) || iban.length !== 24) {
    errors.push(`صيغة الآيبان غير مطابقة للمعيار السعودي (${iban})`);
  }

  // 2. National ID / Iqama Validation (10 digits)
  const id = String(record.national_id || record.nationalId || '').trim();
  if (!id) {
    errors.push('رقم الهوية الوطنية أو الإقامة مطلوب');
  } else if (!/^[12]\d{9}$/.test(id)) {
    errors.push(`رقم الهوية أو الإقامة يجب أن يتكون من 10 أرقام تبدأ بـ 1 أو 2 (${id})`);
  }

  // 3. Net Salary Validation (Must be positive)
  const net = Number(record.net_salary ?? record.netSalary ?? 0);
  if (net <= 0) {
    errors.push(`صافي الراتب يجب أن يكون أكبر من الصفر (${net})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates an official SAMA/MOL WPS text bank file with SHA-256 cryptographic verification.
 * @param {{
 *   batchReference: string;
 *   bankCode: string;
 *   payerIban: string;
 *   molEstId: string;
 *   valueDate: string;
 * }} batchMeta
 * @param {Array<object>} records List of employee payroll records
 * @param {object} [adapterConfig]
 * @returns {{
 *   fileName: string;
 *   fileContent: string;
 *   fileHash: string;
 *   totalAmount: number;
 *   recordCount: number;
 *   validationErrors: Array<{ empNo: string; errors: string[] }>;
 * }}
 */
export function generateWpsBankFile(batchMeta, records = [], adapterConfig = {}) {
  if (!batchMeta.payerIban) throw new Error('رقم آيبان المنشأة المحول منه مطلوب');
  if (!batchMeta.molEstId) throw new Error('رقم المنشأة لدى وزارة الموارد البشرية مطلوب');

  const validationErrors = [];
  const lines = [];
  let totalAmount = 0;

  // Header Record: SCR|PayerIban|BankCode|ValueDate|BatchRef|MolEstId|RecordCount|TotalAmount|Currency
  const valueDate = batchMeta.valueDate || new Date().toISOString().slice(0, 10);
  const bankCode = batchMeta.bankCode || 'SAMA';
  const currency = adapterConfig.currency || 'SAR';

  // Detail records
  for (const r of records) {
    const val = validateWpsRecord(r);
    if (!val.valid) {
      validationErrors.push({ empNo: r.emp_no || r.empNo || '—', errors: val.errors });
    }

    const net = roundCurrency(Number(r.net_salary ?? r.netSalary ?? 0));
    const basic = roundCurrency(Number(r.basic_salary ?? r.basicSalary ?? 0));
    const housing = roundCurrency(Number(r.housing_allowance ?? r.housingAllowance ?? 0));
    const other = roundCurrency((Number(r.gross_salary ?? r.grossSalary ?? 0)) - basic - housing);
    const deductions = roundCurrency(Number(r.total_deductions ?? r.totalDeductions ?? 0));

    totalAmount = roundCurrency(totalAmount + net);

    const nationalId = String(r.national_id || r.nationalId || '').trim();
    const empNo = String(r.emp_no || r.empNo || '').trim();
    const empName = String(r.employee_name || r.employeeName || '').trim();
    const empIban = String(r.iban || '').trim().toUpperCase();
    const empBank = r.bank_code || r.bankCode || bankCode;

    // EDR (Employee Detail Record)
    lines.push(
      `EDR|${empNo}|${nationalId}|${empName}|${empIban}|${empBank}|${basic.toFixed(2)}|${housing.toFixed(2)}|${other.toFixed(2)}|${deductions.toFixed(2)}|${net.toFixed(2)}`
    );
  }

  // Prepend Header
  const header = `SCR|${batchMeta.payerIban}|${bankCode}|${valueDate}|${batchMeta.batchReference}|${batchMeta.molEstId}|${records.length}|${totalAmount.toFixed(2)}|${currency}`;
  const fileContent = [header, ...lines].join('\r\n');

  // Compute SHA-256 Hash
  const fileHash = sha256Utf8(fileContent);
  const fileName = `WPS_${batchMeta.molEstId}_${batchMeta.batchReference}_${valueDate.replace(/-/g, '')}.txt`;

  return {
    fileName,
    fileContent,
    fileHash,
    totalAmount,
    recordCount: records.length,
    validationErrors,
  };
}