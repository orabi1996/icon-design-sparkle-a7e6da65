/**
 * Pure business rules. No network, database writes, or statutory payroll formulas.
 * Financial arithmetic uses integer minor units; UI conversion happens at the boundary.
 */
export const COMPANY_FIELDS = Object.freeze([
  "companyNameAr", "companyNameEn", "countryCode", "currency", "timezone",
  "crNumber", "unified700Number", "vatNumber", "gosiEstNumber", "molEstNumber",
  "chamberNumber", "activityType", "establishmentDate", "city", "district",
  "street", "buildingNo", "postalCode", "additionalNo", "phone", "email",
  "website", "generalManager", "hrManager", "financeManager",
]);

export function emptyCompanyProfile() {
  return Object.fromEntries(COMPANY_FIELDS.map((key) => [key, ""]));
}

export function validateCompanyProfile(input) {
  const errors = {};
  const profile = emptyCompanyProfile();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { profile, errors: { form: "بيانات الشركة غير صحيحة" } };
  }
  for (const key of Object.keys(input)) {
    if (!COMPANY_FIELDS.includes(key)) errors[key] = "حقل غير مسموح";
  }
  for (const key of COMPANY_FIELDS) {
    const value = input[key] ?? "";
    if (typeof value !== "string") {
      errors[key] = "القيمة يجب أن تكون نصًا";
      continue;
    }
    profile[key] = value.trim();
    if (profile[key].length > 500) errors[key] = "الحد الأقصى 500 حرف";
    if (/[\u0000-\u001f\u007f]/.test(profile[key])) errors[key] = "توجد محارف غير صالحة";
  }
  if (!profile.companyNameAr) errors.companyNameAr = "اسم الشركة بالعربية مطلوب";
  if (!/^[A-Z]{2}$/.test(profile.countryCode)) errors.countryCode = "اختر الدولة";
  if (!/^[A-Z]{3}$/.test(profile.currency)) errors.currency = "رمز العملة يجب أن يكون ثلاثة أحرف إنجليزية كبيرة";
  try {
    if (!profile.timezone) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: profile.timezone }).format(0);
  } catch {
    errors.timezone = "اختر منطقة زمنية صحيحة مثل Africa/Cairo";
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    errors.email = "البريد الإلكتروني غير صحيح";
  }
  if (profile.website) {
    try {
      const url = new URL(profile.website);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch {
      errors.website = "أدخل رابط موقع يبدأ بـ https:// أو http:// دون بيانات دخول";
    }
  }
  if (profile.establishmentDate) {
    const value = profile.establishmentDate;
    const date = new Date(value + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      errors.establishmentDate = "تاريخ التأسيس غير صحيح";
    }
  }
  return { profile, errors };
}

export function moneyToMinor(value, field = "amount") {
  const raw = value === null || value === undefined || value === "" ? "0" : String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw new Error(field + ": مبلغ غير صحيح أو يتجاوز منزلتين عشريتين");
  const absolute = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  const result = Number(match[1] ? -absolute : absolute);
  if (!Number.isSafeInteger(result)) throw new Error(field + ": المبلغ يتجاوز النطاق المدعوم");
  return result;
}

function addMinor(a, b) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("إجمالي المبلغ يتجاوز النطاق المدعوم");
  return result;
}

export function summarizeLoanBalances(employees, loans) {
  const rows = new Map();
  const byId = new Map();
  const byNumber = new Map();
  const issues = [];
  const text = (value) => String(value ?? "").trim();
  const makeRow = (key, employee) => ({
    id: key, emp_no: text(employee.emp_no), employee_name: text(employee.full_name || employee.employee_name) || "موظف غير مرتبط",
    branch: text(employee.branch), department: text(employee.department), job_title: text(employee.job_title),
    loans_count: 0, total_granted: 0, total_paid: 0, current_balance: 0,
    active_monthly_installment: 0, last_payment_date: "غير متاح في سجلات السلف",
    status: "لا توجد سلف", source_loan_ids: [], data_issues: [],
  });
  for (const employee of employees) {
    const id = text(employee.id);
    if (!id || byId.has(id)) throw new Error("معرّف موظف مفقود أو مكرر");
    const row = makeRow(id, employee);
    rows.set(id, row);
    byId.set(id, row);
    const number = text(employee.emp_no);
    if (number) byNumber.set(number, byNumber.has(number) ? null : row);
  }
  const seen = new Set();
  const excluded = new Set(["ملغاة", "ملغي", "ملغية", "مرفوضة", "مرفوض", "cancelled", "canceled", "rejected"]);
  const approved = new Set(["معتمدة", "معتمد", "approved"]);
  for (const loan of loans) {
    const id = text(loan.id);
    if (!id || seen.has(id)) throw new Error("معرّف سلفة مفقود أو مكرر");
    seen.add(id);
    const approval = text(loan.request_status).toLowerCase();
    const state = text(loan.status).toLowerCase();
    if (excluded.has(approval) || excluded.has(state)) continue;
    if (approval && !approved.has(approval)) continue;
    const employeeId = text(loan.employee_id);
    // Never join financial data by display name, or override a mismatched stable ID.
    let row = employeeId ? byId.get(employeeId) : byNumber.get(text(loan.emp_no));
    if (!row) {
      row = makeRow("unlinked:" + id, loan);
      row.data_issues.push("السلفة غير مرتبطة بمعرّف موظف متاح");
      rows.set(row.id, row);
    }
    const amount = moneyToMinor(loan.amount, "amount");
    const approvedAmount = moneyToMinor(loan.approved_amount, "approved_amount");
    // Matches the existing loan-entry contract: legacy zero approved_amount falls back to amount.
    const granted = approvedAmount > 0 ? approvedAmount : amount;
    const paid = moneyToMinor(loan.paid_amount, "paid_amount");
    const monthly = moneyToMinor(loan.monthly_amount, "monthly_amount");
    if (amount < 0 || approvedAmount < 0 || paid < 0 || monthly < 0) throw new Error("السلفة " + id + ": مبلغ سالب يحتاج تصحيح المصدر");
    const balance = granted - paid;
    if (balance < 0) row.data_issues.push("السداد يتجاوز قيمة السلفة " + id);
    if (["مسددة", "paid", "closed"].includes(state) && balance !== 0) row.data_issues.push("سلفة مغلقة برصيد غير صفري " + id);
    row.loans_count += 1;
    row.total_granted = addMinor(row.total_granted, granted);
    row.total_paid = addMinor(row.total_paid, paid);
    row.current_balance = addMinor(row.current_balance, balance);
    if (balance > 0 && !["مسددة", "paid", "closed"].includes(state)) {
      row.active_monthly_installment = addMinor(row.active_monthly_installment, monthly);
    }
    row.source_loan_ids.push(id);
  }
  const result = Array.from(rows.values()).map((row) => {
    for (const issue of row.data_issues) issues.push({ employeeId: row.id, message: issue });
    row.status = row.data_issues.length ? "يحتاج مراجعة" : row.current_balance > 0 ? "يوجد رصيد قائم" : row.loans_count ? "مسدد بالكامل" : "لا توجد سلف";
    return {
      ...row,
      total_granted: row.total_granted / 100,
      total_paid: row.total_paid / 100,
      current_balance: row.current_balance / 100,
      active_monthly_installment: row.active_monthly_installment / 100,
    };
  });
  return { rows: result, issues };
}

export function csvCell(value) {
  let text = String(value ?? "");
  // Neutralize spreadsheet formulas in user-supplied strings; quote commas, quotes and newlines.
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function normalizeSearch(value) {
  return String(value ?? "").normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .toLocaleLowerCase("ar").trim();
}

export function totalLoanBalances(rows) {
  const totals = { granted: 0, paid: 0, balance: 0, activeMonthly: 0 };
  for (const row of rows) {
    totals.granted = addMinor(totals.granted, moneyToMinor(row.total_granted));
    totals.paid = addMinor(totals.paid, moneyToMinor(row.total_paid));
    totals.balance = addMinor(totals.balance, moneyToMinor(row.current_balance));
    totals.activeMonthly = addMinor(totals.activeMonthly, moneyToMinor(row.active_monthly_installment));
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 100]));
}
