import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyCompanyProfile, validateCompanyProfile, moneyToMinor, summarizeLoanBalances,
  totalLoanBalances, csvCell, normalizeSearch,
} from "../src/lib/business-core.mjs";

const employee = { id: "employee-1", emp_no: "1001", full_name: "موظف اختبار", branch: "الفرع", department: "القسم" };
const validProfile = () => ({ ...emptyCompanyProfile(), companyNameAr: "شركة اختبار", countryCode: "EG", currency: "EGP", timezone: "Africa/Cairo" });
const loan = (values = {}) => ({ id: "loan-1", employee_id: employee.id, amount: "1000.25", approved_amount: "0", paid_amount: "100.10", monthly_amount: "50.25", request_status: "معتمدة", status: "قيد السداد", ...values });

test("money uses integer cents without 0.1 + 0.2 drift", () => {
  assert.equal(moneyToMinor("0.1") + moneyToMinor("0.2"), 30);
  assert.equal(moneyToMinor("-12.05"), -1205);
});
test("invalid precision, NaN, exponent and overflow fail explicitly", () => {
  for (const value of ["12.345", "NaN", "1e8", Infinity, "9007199254740992", "1,000", "wrong"]) assert.throws(() => moneyToMinor(value));
});
test("empty source never fabricates loans or dates", () => {
  const result = summarizeLoanBalances([employee], []);
  assert.equal(result.rows[0].loans_count, 0);
  assert.equal(result.rows[0].current_balance, 0);
  assert.equal(result.rows[0].last_payment_date, "غير متاح في سجلات السلف");
});
test("actual approved principal and payments determine balance", () => {
  const row = summarizeLoanBalances([employee], [loan({ approved_amount: "800.20" })]).rows[0];
  assert.equal(row.total_granted, 800.20);
  assert.equal(row.total_paid, 100.10);
  assert.equal(row.current_balance, 700.10);
  assert.deepEqual(row.source_loan_ids, ["loan-1"]);
});
test("legacy zero approved amount falls back to stored principal", () => {
  const row = summarizeLoanBalances([employee], [loan()]).rows[0];
  assert.equal(row.total_granted, 1000.25);
  assert.equal(row.current_balance, 900.15);
});
test("multiple loans aggregate exact principal, payment and instalment sums", () => {
  const rows = summarizeLoanBalances([employee], [loan(), loan({ id: "loan-2", amount: "0.30", paid_amount: "0.10", monthly_amount: "0.10" })]).rows;
  assert.equal(rows[0].current_balance, 900.35);
  assert.deepEqual(totalLoanBalances(rows), { granted: 1000.55, paid: 100.20, balance: 900.35, activeMonthly: 50.35 });
});
test("rejected, cancelled and pending requests are excluded", () => {
  const result = summarizeLoanBalances([employee], [
    loan({ request_status: "مرفوضة" }),
    loan({ id: "loan-2", status: "ملغاة" }),
    loan({ id: "loan-3", request_status: "بانتظار الموافقة" }),
  ]);
  assert.equal(result.rows[0].loans_count, 0);
});
test("employee order and identical names cannot change balances", () => {
  const other = { ...employee, id: "employee-2", emp_no: "1002" };
  const a = summarizeLoanBalances([employee, other], [loan()]).rows;
  const b = summarizeLoanBalances([other, employee], [loan()]).rows;
  assert.equal(a.find((row) => row.id === employee.id).current_balance, b.find((row) => row.id === employee.id).current_balance);
  assert.equal(b.find((row) => row.id === other.id).current_balance, 0);
});
test("legacy employee numbers are allowed only when stable ID is absent", () => {
  assert.equal(summarizeLoanBalances([employee], [loan({ employee_id: null, emp_no: "1001" })]).rows[0].loans_count, 1);
  const mismatch = summarizeLoanBalances([employee], [loan({ employee_id: "missing", emp_no: "1001" })]);
  assert.equal(mismatch.rows[0].loans_count, 0);
  assert.equal(mismatch.rows.length, 2);
  assert.equal(mismatch.issues.length, 1);
});
test("ambiguous employee number is not silently matched", () => {
  const result = summarizeLoanBalances([employee, { ...employee, id: "employee-2" }], [loan({ employee_id: "", emp_no: "1001" })]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.issues.length, 1);
});
test("overpayments remain visible instead of being clamped to zero", () => {
  const result = summarizeLoanBalances([employee], [loan({ amount: "100", paid_amount: "120" })]);
  assert.equal(result.rows[0].current_balance, -20);
  assert.equal(result.rows[0].status, "يحتاج مراجعة");
});
test("closed loans with outstanding amounts are flagged and excluded from active instalments", () => {
  const result = summarizeLoanBalances([employee], [loan({ status: "مسددة" })]);
  assert.equal(result.rows[0].active_monthly_installment, 0);
  assert.equal(result.rows[0].status, "يحتاج مراجعة");
});
test("negative inputs, duplicate loans and incomplete identity fail closed", () => {
  assert.throws(() => summarizeLoanBalances([employee], [loan({ paid_amount: "-1" })]));
  assert.throws(() => summarizeLoanBalances([employee], [loan(), loan()]));
  assert.throws(() => summarizeLoanBalances([{ full_name: "بدون معرّف" }], []));
});
test("company profile starts empty, never with fictitious IDs", () => {
  assert.ok(Object.values(emptyCompanyProfile()).every((value) => value === ""));
  assert.deepEqual(validateCompanyProfile(validProfile()).errors, {});
});
test("company requires name, country, currency and real timezone", () => {
  const errors = validateCompanyProfile(emptyCompanyProfile()).errors;
  for (const field of ["companyNameAr", "countryCode", "currency", "timezone"]) assert.ok(errors[field]);
});
test("company rejects unknown fields and invalid field types", () => {
  assert.ok(validateCompanyProfile({ ...validProfile(), role: "admin" }).errors.role);
  assert.ok(validateCompanyProfile({ ...validProfile(), companyNameAr: 100 }).errors.companyNameAr);
  assert.ok(validateCompanyProfile([]).errors.form);
});
test("company validates contact details without inventing statutory ID rules", () => {
  const result = validateCompanyProfile({ ...validProfile(), email: "not-email", website: "javascript:alert(1)", crNumber: "user-supplied-id" });
  assert.ok(result.errors.email); assert.ok(result.errors.website); assert.equal(result.errors.crNumber, undefined);
  assert.ok(validateCompanyProfile({ ...validProfile(), website: "https://user:password@example.test" }).errors.website);
});
test("company dates reject invalid calendar days and accept leap years", () => {
  assert.ok(validateCompanyProfile({ ...validProfile(), establishmentDate: "2025-02-29" }).errors.establishmentDate);
  assert.equal(validateCompanyProfile({ ...validProfile(), establishmentDate: "2024-02-29" }).errors.establishmentDate, undefined);
});
test("CSV handles quotes, commas, newlines and spreadsheet injection", () => {
  assert.equal(csvCell('اسم "شركة", فرع\nثان'), '"اسم ""شركة"", فرع\nثان"');
  assert.equal(csvCell("=1+1"), "\"'=1+1\"");
  assert.equal(csvCell("  @SUM(1)"), "\"'  @SUM(1)\"");
  assert.equal(csvCell(-20), '"-20"');
});
test("Arabic search ignores diacritics and alef variants", () => {
  assert.equal(normalizeSearch("إِدارة"), normalizeSearch("ادارة"));
});
