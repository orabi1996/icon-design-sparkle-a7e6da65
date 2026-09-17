import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isValidSaudiNationalId,
  isValidIban,
  maskNationalId,
  maskIban,
  maskFinancialValue,
  isAllowedStatusTransition,
  validateStatusTransition,
  validateEmployee,
} from "../src/lib/employee-core.mjs";

test("Employee Domain: Saudi National ID & Iqama Checksum", () => {
  // Valid National ID (starts with 1)
  assert.equal(isValidSaudiNationalId("1000000008"), true);
  assert.equal(isValidSaudiNationalId("1010101010"), true);

  // Valid Resident Iqama (starts with 2)
  assert.equal(isValidSaudiNationalId("2000000006"), true);
  assert.equal(isValidSaudiNationalId("2010101018"), true);

  // Invalid Checksums
  assert.equal(isValidSaudiNationalId("1000000000"), false);
  assert.equal(isValidSaudiNationalId("2000000001"), false);

  // Invalid prefixes
  assert.equal(isValidSaudiNationalId("3000000008"), false);
  assert.equal(isValidSaudiNationalId("5000000008"), false);

  // Invalid lengths & formats
  assert.equal(isValidSaudiNationalId("100000008"), false);
  assert.equal(isValidSaudiNationalId("10000000008"), false);
  assert.equal(isValidSaudiNationalId("100000000A"), false);
  assert.equal(isValidSaudiNationalId(""), false);
  assert.equal(isValidSaudiNationalId(null), false);
});

test("Employee Domain: Saudi IBAN ISO 7064 MOD-97 Checksum", () => {
  // Valid Saudi IBANs
  const validIban1 = "SA0380000000608010167519";
  const validIbanWithSpaces = "SA03 8000 0000 6080 1016 7519";
  assert.equal(isValidIban(validIban1), true);
  assert.equal(isValidIban(validIbanWithSpaces), true);

  // Invalid Checksum
  const invalidIbanChecksum = "SA0480000000608010167519";
  assert.equal(isValidIban(invalidIbanChecksum), false);

  // Invalid lengths
  assert.equal(isValidIban("SA038000000060801016751"), false); // 23 chars
  assert.equal(isValidIban("SA03800000006080101675199"), false); // 25 chars

  // Invalid country code
  assert.equal(isValidIban("EG0380000000608010167519"), false);

  // Invalid formats
  assert.equal(isValidIban(""), false);
  assert.equal(isValidIban(null), false);
});

test("Employee Domain: Sensitive Data Masking", () => {
  const nationalId = "1023456789";
  const iban = "SA0380000000608010167519";
  const salary = 15000;

  // Masked (unauthorized)
  assert.equal(maskNationalId(nationalId, false), "102****789");
  assert.equal(maskIban(iban, false), "SA03********7519");
  assert.equal(maskFinancialValue(salary, false), "***");

  // Unmasked (authorized)
  assert.equal(maskNationalId(nationalId, true), "1023456789");
  assert.equal(maskIban(iban, true), "SA0380000000608010167519");
  assert.equal(maskFinancialValue(salary, true), 15000);

  // Edge cases
  assert.equal(maskNationalId("", false), "");
  assert.equal(maskIban("", false), "");
  assert.equal(maskFinancialValue(null, true), 0);
});

test("Employee Domain: Lifecycle State Machine Transitions", () => {
  // Allowed transitions
  assert.equal(isAllowedStatusTransition("probation", "active"), true);
  assert.equal(isAllowedStatusTransition("probation", "terminated"), true);
  assert.equal(isAllowedStatusTransition("active", "suspended"), true);
  assert.equal(isAllowedStatusTransition("active", "on_leave"), true);
  assert.equal(isAllowedStatusTransition("suspended", "active"), true);
  assert.equal(isAllowedStatusTransition("active", "terminated"), true);
  assert.equal(isAllowedStatusTransition("active", "resigned"), true);

  // Disallowed transitions (terminal states)
  assert.equal(isAllowedStatusTransition("terminated", "active"), false);
  assert.equal(isAllowedStatusTransition("resigned", "probation"), false);

  // Validation with metadata
  const validTermination = validateStatusTransition("active", "terminated", {
    reason: "انتهاء مدة العقد المحددة وعدم الرغبة في التجديد",
    effective_date: "2026-10-01",
  });
  assert.equal(validTermination.isValid, true);

  // Missing termination reason should fail
  const missingReasonTermination = validateStatusTransition("active", "terminated", {
    reason: "",
  });
  assert.equal(missingReasonTermination.isValid, false);
  assert.match(missingReasonTermination.error, /سبب إنهاء الخدمة/);

  // Missing suspension reason should fail
  const missingSuspensionReason = validateStatusTransition("active", "suspended", {
    reason: "",
  });
  assert.equal(missingSuspensionReason.isValid, false);
  assert.match(missingSuspensionReason.error, /سبب إيقاف الموظف/);

  // Invalid target status
  const invalidStatus = validateStatusTransition("active", "unknown_status");
  assert.equal(invalidStatus.isValid, false);
  assert.match(invalidStatus.error, /غير صالحة/);
});

test("Employee Domain: Employee Master Validation", () => {
  const existing = [
    { id: "e1", emp_no: "1001", full_name: "أحمد محمد" },
    { id: "e2", emp_no: "1002", full_name: "خالد سعيد" },
  ];

  // 1. Duplicate employee number
  const dupEmp = validateEmployee({ emp_no: "1001", full_name: "موظف مكرر" }, existing);
  assert.equal(dupEmp.isValid, false);
  assert.match(dupEmp.errors.emp_no, /مستخدم بالفعل/);

  // 2. Minimum Age Constraint (< 18 years)
  const minorDate = new Date();
  minorDate.setFullYear(minorDate.getFullYear() - 16);
  const minorEmp = validateEmployee(
    {
      emp_no: "1003",
      full_name: "موظف قاصر",
      birth_date: minorDate.toISOString().slice(0, 10),
    },
    existing
  );
  assert.equal(minorEmp.isValid, false);
  assert.match(minorEmp.errors.birth_date, /18 عاماً/);

  // 3. Contract End earlier than Hire Date
  const invalidContract = validateEmployee(
    {
      emp_no: "1004",
      full_name: "سالم فهد",
      hire_date: "2026-05-01",
      contract_end: "2026-04-01",
    },
    existing
  );
  assert.equal(invalidContract.isValid, false);
  assert.match(invalidContract.errors.contract_end, /لاحقاً لتاريخ التعيين/);

  // 4. Negative Salary
  const negativeSalary = validateEmployee(
    { emp_no: "1005", full_name: "سالم", basic_salary: -500 },
    existing
  );
  assert.equal(negativeSalary.isValid, false);
  assert.match(negativeSalary.errors.basic_salary, /لا يمكن أن يكون سالباً/);

  // 5. Valid employee payload
  const adultDate = new Date();
  adultDate.setFullYear(adultDate.getFullYear() - 25);
  const valid = validateEmployee(
    {
      emp_no: "1006",
      full_name: "عبدالله الشمري",
      national_id: "1000000008",
      iban: "SA0380000000608010167519",
      basic_salary: 8000,
      allowances: 1500,
      birth_date: adultDate.toISOString().slice(0, 10),
      hire_date: "2026-01-01",
      contract_end: "2027-01-01",
    },
    existing
  );
  assert.equal(valid.isValid, true);
  assert.equal(valid.normalized.basic_salary, 8000);
  assert.equal(valid.normalized.allowances, 1500);
});

test("Employee Domain: Database Migration SQL Contract", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260918030000_employee_lifecycle_domain.sql"
  );
  assert.equal(fs.existsSync(migrationPath), true, "Migration file must exist on disk");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // Check columns added to employees
  assert.match(sql, /tenant_id uuid REFERENCES public\.hr_tenants/i);
  assert.match(sql, /employment_status text NOT NULL DEFAULT 'active'/i);
  assert.match(sql, /termination_date date/i);

  // Check employee_lifecycle_transitions table and RLS
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.employee_lifecycle_transitions/i);
  assert.match(sql, /ALTER TABLE public\.employee_lifecycle_transitions ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /ALTER TABLE public\.employee_lifecycle_transitions FORCE ROW LEVEL SECURITY/i);

  // Check zero hard delete trigger
  assert.match(sql, /prevent_employee_hard_delete/i);
  assert.match(sql, /trg_prevent_employee_hard_delete/i);

  // Check historical assignment tracking trigger
  assert.match(sql, /track_employee_historical_assignment/i);
  assert.match(sql, /trg_track_employee_historical_assignment/i);

  // Check lifecycle transition RPC
  assert.match(sql, /transition_employee_lifecycle_status/i);
});
