import test from "node:test";
import assert from "node:assert/strict";
import {
  MIGRATION_ENTITIES,
  MIGRATION_PHASES,
  ROW_CLASSIFICATIONS,
  computeChecksum,
  moneyToMinor,
  minorToMoneyString,
  normalizeText,
  normalizeDate,
  extractLegacyRows,
  normalizeLegacyRow,
  validateLegacyRow,
  matchLegacyRow,
  generateBatchPreview,
  reconcileBatch,
  approveBatch,
  planBatchImport,
  generateReconciliationReport,
  buildRollbackPlan,
} from "../src/lib/legacy-migration-core.mjs";

test("12 entities and 9 phases are formally defined", () => {
  assert.equal(MIGRATION_ENTITIES.length, 12);
  assert.deepEqual(MIGRATION_ENTITIES, [
    "employees", "departments", "branches", "managers",
    "contracts", "leaves", "loans", "attendance",
    "fingerprint", "payroll_archive", "documents", "requests"
  ]);

  assert.equal(MIGRATION_PHASES.length, 9);
  assert.deepEqual(MIGRATION_PHASES, [
    "extract", "normalize", "validate", "match", "preview",
    "reconcile", "approve", "import", "verify"
  ]);

  assert.deepEqual(Object.keys(ROW_CLASSIFICATIONS), [
    "MATCHED", "AMBIGUOUS", "UNMATCHED", "INVALID", "DUPLICATE", "ALREADY_MIGRATED"
  ]);
});

test("checksum is deterministic and sensitive to content changes", () => {
  const data1 = { id: "101", name: "أحمد", amount: "5000" };
  const data2 = { amount: "5000", id: "101", name: "أحمد" }; // Different key order
  const data3 = { id: "101", name: "أحمد", amount: "5001" }; // Changed content

  assert.equal(computeChecksum(data1), computeChecksum(data2));
  assert.notEqual(computeChecksum(data1), computeChecksum(data3));
});

test("financial moneyToMinor arithmetic prevents floating point drift", () => {
  assert.equal(moneyToMinor("1250.50"), 125050n);
  assert.equal(moneyToMinor("0.05"), 5n);
  assert.equal(moneyToMinor("100"), 10000n);
  assert.equal(moneyToMinor("-50.25"), -5025n);
  assert.equal(moneyToMinor("1,250.75"), 125075n);
  assert.throws(() => moneyToMinor("12.345")); // More than 2 decimals
  assert.throws(() => moneyToMinor("invalid"));
});

test("date normalization prevents timezone backward shift", () => {
  assert.equal(normalizeDate("2026-11-01"), "2026-11-01");
  assert.equal(normalizeDate("2026-11-01T00:00:00Z"), "2026-11-01");
  assert.equal(normalizeDate("2026/05/15"), "2026-05-15");
  assert.equal(normalizeDate("invalid-date"), null);
});

test("text normalization cleans Arabic characters for matching", () => {
  assert.equal(normalizeText("  أحمد   إبراهيم  "), "احمد ابراهيم");
  assert.equal(normalizeText("شركة التقنية المتقدمة"), "شركه التقنيه المتقدمه");
});

test("Phase 1 to 4: Employee extraction, normalization, validation, and matching", () => {
  const rawRows = [
    { id: "legacy-1", emp_no: "E101", name: "سعد بن خالد", national_id: "1012345678", basic_salary: "8500.00" },
    { id: "legacy-2", emp_no: "E102", name: "خالد سعيد", national_id: "1012345679", basic_salary: "9200.00" },
    { id: "legacy-3", emp_no: "", name: "", national_id: "", basic_salary: "5000" }, // Invalid
    { id: "legacy-1", emp_no: "E101", name: "سعد بن خالد", national_id: "1012345678" }, // Duplicate
  ];

  const extracted = extractLegacyRows(rawRows, { source: "legacy_system" });
  assert.equal(extracted.length, 4);
  assert.equal(extracted[0].legacy_id, "legacy-1");

  const context = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    employeesByEmpNo: new Map([["E101", { id: "modern-e101", emp_no: "E101" }]]),
    employeesByNationalId: new Map(),
    employeesByName: new Map(),
  };

  const processed = extracted.map(row => {
    const norm = normalizeLegacyRow("employees", row);
    const valid = validateLegacyRow("employees", norm);
    return matchLegacyRow("employees", valid, context);
  });

  assert.equal(processed[0].classification, ROW_CLASSIFICATIONS.MATCHED);
  assert.equal(processed[0].target_id, "modern-e101");

  assert.equal(processed[1].classification, ROW_CLASSIFICATIONS.MATCHED); // New employee to insert
  assert.equal(processed[1].target_id, null);

  assert.equal(processed[2].classification, ROW_CLASSIFICATIONS.INVALID);
  assert.ok(processed[2].validation_errors.length > 0);

  assert.equal(processed[3].classification, ROW_CLASSIFICATIONS.DUPLICATE);
});

test("Strict Disambiguation: Duplicate employee names are marked AMBIGUOUS and never auto-resolved", () => {
  const rawRows = [
    { id: "leg-loan-1", employee_name: "محمد عبد الله", amount: "5000", paid_amount: "1000" },
  ];

  const extracted = extractLegacyRows(rawRows);
  const context = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    employeesByEmpNo: new Map(),
    employeesByNationalId: new Map(),
    // Two employees in the target system share the exact same normalized name!
    employeesByName: new Map([
      ["محمد عبد الله", [
        { id: "emp-uuid-1", emp_no: "E001", full_name: "محمد عبد الله" },
        { id: "emp-uuid-2", emp_no: "E002", full_name: "محمد عبد الله" },
      ]]
    ]),
  };

  const norm = normalizeLegacyRow("loans", extracted[0]);
  const valid = validateLegacyRow("loans", norm);
  const matched = matchLegacyRow("loans", valid, context);

  // Must be classified as AMBIGUOUS! Never guess or auto-resolve!
  assert.equal(matched.classification, ROW_CLASSIFICATIONS.AMBIGUOUS);
  assert.equal(matched.target_id, null);
  assert.ok(matched.matching_notes.includes("يوجد أكثر من موظف بنفس الاسم"));

  // Batch preview with ambiguous row cannot be approved without manual mapping
  const preview = generateBatchPreview("loans", [matched]);
  assert.equal(preview.canApprove, false);

  const reconciliation = reconcileBatch(preview);
  assert.equal(reconciliation.isReconciled, false);
  assert.throws(() => approveBatch(reconciliation, { approvedBy: "admin-user" }), /سجل ملتبس/);
});

test("Approved manual mapping resolves previously ambiguous rows", () => {
  const rawRows = [
    { id: "leg-loan-1", employee_name: "محمد عبد الله", amount: "5000", paid_amount: "1000" },
  ];

  const extracted = extractLegacyRows(rawRows);
  const context = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    employeesByEmpNo: new Map(),
    employeesByNationalId: new Map(),
    employeesByName: new Map([
      ["محمد عبد الله", [
        { id: "emp-uuid-1", emp_no: "E001", full_name: "محمد عبد الله" },
        { id: "emp-uuid-2", emp_no: "E002", full_name: "محمد عبد الله" },
      ]]
    ]),
    approvedMappings: new Map([
      ["leg-loan-1", "emp-uuid-2"] // Explicit administrator resolution
    ]),
  };

  const norm = normalizeLegacyRow("loans", extracted[0]);
  const valid = validateLegacyRow("loans", norm);
  const matched = matchLegacyRow("loans", valid, context);

  assert.equal(matched.classification, ROW_CLASSIFICATIONS.MATCHED);
  assert.equal(matched.target_id, "emp-uuid-2");
  assert.equal(matched.stable_identifier, "approved_mapping");
});

test("Financial Zero-Tolerance: Rejects batches with non-zero financial discrepancy", () => {
  const rawRows = [
    { id: "loan-1", employee_emp_no: "E001", amount: "10000.00", paid_amount: "2000.00" },
    { id: "loan-2", employee_emp_no: "E002", amount: "5000.00", paid_amount: "1000.00" }, // Will fail match
  ];

  const extracted = extractLegacyRows(rawRows);
  const context = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    employeesByEmpNo: new Map([["E001", { id: "emp-1", emp_no: "E001" }]]), // Only E001 exists!
  };

  const matchedRows = extracted.map(r => {
    const norm = normalizeLegacyRow("loans", r);
    const valid = validateLegacyRow("loans", norm);
    return matchLegacyRow("loans", valid, context);
  });

  const preview = generateBatchPreview("loans", matchedRows);
  assert.equal(preview.financials.totalBeforeFormatted, "15000.00");
  assert.equal(preview.financials.totalAfterFormatted, "10000.00");
  assert.equal(preview.financials.differenceFormatted, "-5000.00");
  assert.equal(preview.financials.isZeroDifference, false);

  // Reconciliation fails without override
  const recFail = reconcileBatch(preview, { allowDiscrepancy: false });
  assert.equal(recFail.isReconciled, false);
  assert.throws(() => approveBatch(recFail, { approvedBy: "finance-admin" }), /فارق مالي/);

  // With explicit signed administrative override reason, approval succeeds
  const recPass = reconcileBatch(preview, {
    allowDiscrepancy: true,
    overrideReason: "الموظف E002 مستقيل وتم تصفية سلفته في الحساب الختامي القديم"
  });
  assert.equal(recPass.isReconciled, true);
  const approval = approveBatch(recPass, {
    approvedBy: "finance-admin",
    overrideReason: "الموظف E002 مستقيل وتم تصفية سلفته في الحساب الختامي القديم"
  });
  assert.equal(approval.status, "approved");
});

test("Idempotency: Re-running a batch produces zero duplicates and marks rows ALREADY_MIGRATED", () => {
  const rawRows = [
    { id: "dept-10", code: "ENG", name_ar: "الهندسة" },
    { id: "dept-20", code: "HR", name_ar: "الموارد البشرية" },
  ];

  const extracted = extractLegacyRows(rawRows);

  // First run: Empty mappings
  const context1 = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    departmentsByCode: new Map(),
  };

  const matched1 = extracted.map(r => {
    const norm = normalizeLegacyRow("departments", r);
    const valid = validateLegacyRow("departments", norm);
    return matchLegacyRow("departments", valid, context1);
  });

  assert.equal(matched1[0].classification, ROW_CLASSIFICATIONS.MATCHED);
  assert.equal(matched1[1].classification, ROW_CLASSIFICATIONS.MATCHED);

  // Simulate import creating mappings
  const simulatedMappings = new Map([
    ["dept-10", { migrated_id: "mod-dept-1", checksum: matched1[0].checksum }],
    ["dept-20", { migrated_id: "mod-dept-2", checksum: matched1[1].checksum }],
  ]);

  // Second run: With existing mappings and identical checksums
  const context2 = {
    existingMappings: simulatedMappings,
    currentBatchIds: new Set(),
    departmentsByCode: new Map(),
  };

  const matched2 = extracted.map(r => {
    const norm = normalizeLegacyRow("departments", r);
    const valid = validateLegacyRow("departments", norm);
    return matchLegacyRow("departments", valid, context2);
  });

  assert.equal(matched2[0].classification, ROW_CLASSIFICATIONS.ALREADY_MIGRATED);
  assert.equal(matched2[1].classification, ROW_CLASSIFICATIONS.ALREADY_MIGRATED);

  // Planning import skips already migrated rows
  const preview2 = generateBatchPreview("departments", matched2);
  const plan2 = planBatchImport(preview2, {
    status: "approved",
    approved_by: "admin",
    approved_at: new Date().toISOString(),
    override_reason: null,
  }, {
    tenant_id: "t-1",
    company_id: "c-1",
    batch_id: "b-2",
  });

  assert.equal(plan2.totalToImport, 0);
  assert.equal(plan2.skippedAlreadyMigrated, 2);
  assert.equal(plan2.importPayloads.length, 0);
});

test("Atomic Rollback: Correctly builds rollback plan and respects downstream dependencies", () => {
  const batch = {
    id: "batch-100",
    entity: "employees",
    status: "completed",
  };

  const mappings = [
    { id: "map-1", migrated_id: "emp-101" },
    { id: "map-2", migrated_id: "emp-102" },
  ];

  // Clean rollback
  const plan = buildRollbackPlan(batch, mappings, []);
  assert.equal(plan.batch_id, "batch-100");
  assert.deepEqual(plan.recordsToDelete, ["emp-101", "emp-102"]);
  assert.deepEqual(plan.mappingsToDelete, ["map-1", "map-2"]);

  // Blocked rollback when downstream dependencies exist
  assert.throws(() => {
    buildRollbackPlan(batch, mappings, ["مسيرات رواتب مسجلة للموظفين"]);
  }, /علاقات تابعة/);
});

test("All 12 Entities end-to-end pipeline verification and final readiness report", () => {
  const entitySamples = {
    employees: [{ id: "e1", emp_no: "101", full_name: "أحمد علي", national_id: "1111111111", basic_salary: "6000" }],
    departments: [{ id: "d1", code: "IT", name_ar: "تقنية المعلومات" }],
    branches: [{ id: "b1", code: "RUH", name_ar: "فرع الرياض", city: "الرياض" }],
    managers: [{ id: "m1", employee_emp_no: "101", manager_emp_no: "100" }],
    contracts: [{ id: "c1", employee_emp_no: "101", contract_number: "CNT-01", start_date: "2026-01-01", basic_salary: "6000" }],
    leaves: [{ id: "l1", employee_emp_no: "101", leave_type: "annual", start_date: "2026-08-01", end_date: "2026-08-05", days_count: 5 }],
    loans: [{ id: "ln1", employee_emp_no: "101", amount: "5000", paid_amount: "1000", monthly_installment: "500", installments_count: 10, start_date: "2026-01-01" }],
    attendance: [{ id: "a1", employee_emp_no: "101", date: "2026-09-01", check_in: "08:00", check_out: "16:00" }],
    fingerprint: [{ id: "f1", device_id: "DEV-1", biometric_user_id: "101", employee_emp_no: "101", punch_time: "2026-09-01 08:00:00" }],
    payroll_archive: [{ id: "p1", employee_emp_no: "101", period_start: "2026-08-01", period_end: "2026-08-31", basic_salary: "6000", net_salary: "6000" }],
    documents: [{ id: "doc1", employee_emp_no: "101", document_type: "id", document_number: "1111111111" }],
    requests: [{ id: "r1", employee_emp_no: "101", request_type: "certificate", status: "approved" }],
  };

  const sharedContext = {
    existingMappings: new Map(),
    currentBatchIds: new Set(),
    employeesByEmpNo: new Map([
      ["100", { id: "emp-100", emp_no: "100", full_name: "المدير العام" }],
      ["101", { id: "emp-101", emp_no: "101", full_name: "أحمد علي" }],
    ]),
    employeesByNationalId: new Map([["1111111111", { id: "emp-101", emp_no: "101" }]]),
    employeesByName: new Map([["أحمد علي", [{ id: "emp-101", emp_no: "101" }]]]),
    departmentsByCode: new Map(),
    branchesByCode: new Map(),
  };

  let allEntitiesPassed = true;

  for (const [entity, rows] of Object.entries(entitySamples)) {
    const extracted = extractLegacyRows(rows);
    const processed = extracted.map(r => {
      const norm = normalizeLegacyRow(entity, r);
      const valid = validateLegacyRow(entity, norm);
      return matchLegacyRow(entity, valid, sharedContext);
    });

    const preview = generateBatchPreview(entity, processed);
    const rec = reconcileBatch(preview);
    assert.equal(rec.isReconciled, true, `Entity ${entity} failed reconciliation`);

    const approval = approveBatch(rec, { approvedBy: "admin-system" });
    assert.equal(approval.status, "approved", `Entity ${entity} failed approval`);

    const plan = planBatchImport(preview, approval, {
      tenant_id: "tenant-demo",
      company_id: "company-demo",
      batch_id: `batch-${entity}`,
    });
    assert.equal(plan.totalToImport, 1, `Entity ${entity} failed import planning`);

    const report = generateReconciliationReport({
      id: `batch-${entity}`,
      entity,
      status: "completed",
      checksum: computeChecksum(rows),
      initiated_by: "admin",
      approved_by: "admin-system",
      approved_at: approval.approved_at,
    }, processed);

    assert.equal(report.isReadinessPassed, true, `Entity ${entity} failed readiness`);
    if (!report.isReadinessPassed) allEntitiesPassed = false;
  }

  // Final Gate Assertion
  assert.equal(allEntitiesPassed, true);
  console.log("=========================================");
  console.log("DATA MIGRATION READINESS = PASS");
  console.log("=========================================");
});
