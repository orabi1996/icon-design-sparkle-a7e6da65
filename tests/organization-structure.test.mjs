import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeArabic,
  isValidDateString,
  detectCircularHierarchy,
  validateBranch,
  validateDepartment,
  validateCostCenter,
  validateJob,
  validatePosition,
  reconcileLegacyEntities,
} from "../src/lib/organization-core.mjs";

test("Organization Domain: Arabic Normalization", () => {
  assert.equal(normalizeArabic("إدارة الموارد البشرية"), "اداره الموارد البشريه");
  assert.equal(normalizeArabic("شعبة  المشتريات    العامة"), "شعبه المشتريات العامه");
  assert.equal(normalizeArabic("شركة آفاق لأجهزة الحاسب"), "شركه افاق لاجهزه الحاسب");
  assert.equal(normalizeArabic("تقنية   المعلومات  "), "تقنيه المعلومات");
});

test("Organization Domain: Date Validation", () => {
  assert.equal(isValidDateString("2026-09-18"), true);
  assert.equal(isValidDateString("2026-02-30"), false);
  assert.equal(isValidDateString("invalid-date"), false);
  assert.equal(isValidDateString(""), false);
});

test("Organization Domain: Circular Hierarchy Detection", () => {
  const departments = [
    { id: "dept-1", parent_id: null },
    { id: "dept-2", parent_id: "dept-1" },
    { id: "dept-3", parent_id: "dept-2" },
    { id: "dept-4", parent_id: "dept-3" },
  ];

  // 1. Self-reference loop: dept-1 parent is dept-1
  assert.equal(detectCircularHierarchy(departments, "dept-1", "dept-1"), true);

  // 2. Direct cycle: setting dept-1 parent to dept-2 (dept-2 already has parent dept-1)
  assert.equal(detectCircularHierarchy(departments, "dept-1", "dept-2"), true);

  // 3. Multi-hop cycle: setting dept-1 parent to dept-4 (dept-4 -> dept-3 -> dept-2 -> dept-1)
  assert.equal(detectCircularHierarchy(departments, "dept-1", "dept-4"), true);

  // 4. Valid non-circular addition: dept-5 whose parent is dept-4
  assert.equal(detectCircularHierarchy(departments, "dept-5", "dept-4"), false);

  // 5. Valid top-level: dept-6 with no parent
  assert.equal(detectCircularHierarchy(departments, "dept-6", null), false);
});

test("Organization Domain: Branch Validation & Code Uniqueness", () => {
  const existingBranches = [
    {
      id: "b1",
      tenant_id: "t1",
      company_id: "c1",
      code: "BR-01",
      name_ar: "الفرع الرئيسي",
      active: true,
    },
    {
      id: "b2",
      tenant_id: "t1",
      company_id: "c1",
      code: "BR-02",
      name_ar: "فرع جدة",
      active: true,
    },
  ];

  // Duplicate code check
  const dupCode = validateBranch(
    { code: "BR-01", name_ar: "فرع الرياض 2" },
    existingBranches
  );
  assert.equal(dupCode.isValid, false);
  assert.match(dupCode.errors.code, /مستخدم بالفعل/);

  // Updating same branch with same code should be valid
  const updateSame = validateBranch(
    { id: "b1", code: "BR-01", name_ar: "الفرع الرئيسي المحدث" },
    existingBranches
  );
  assert.equal(updateSame.isValid, true);

  // Invalid date range (effective_to < effective_from)
  const invalidDates = validateBranch(
    {
      code: "BR-03",
      name_ar: "فرع الدمام",
      effective_from: "2026-09-01",
      effective_to: "2026-08-01",
    },
    existingBranches
  );
  assert.equal(invalidDates.isValid, false);
  assert.match(invalidDates.errors.effective_to, /تاريخ الانتهاء يجب أن يكون لاحقاً/);
});

test("Organization Domain: Department Validation & Hierarchy Rules", () => {
  const existingDepts = [
    {
      id: "d1",
      tenant_id: "t1",
      company_id: "c1",
      code: "DEP-01",
      name_ar: "الإدارة العامة",
      level: "main_department",
      parent_id: null,
      active: true,
    },
    {
      id: "d2",
      tenant_id: "t1",
      company_id: "c1",
      code: "DEP-02",
      name_ar: "إدارة الموارد البشرية",
      level: "department",
      parent_id: "d1",
      active: true,
    },
    {
      id: "d3",
      tenant_id: "t1",
      company_id: "c1",
      code: "DEP-03",
      name_ar: "شعبة التوظيف",
      level: "section",
      parent_id: "d2",
      active: true,
    },
  ];

  // 1. Missing required fields
  const missing = validateDepartment({ code: "", name_ar: "" }, existingDepts);
  assert.equal(missing.isValid, false);
  assert.ok(missing.errors.code);
  assert.ok(missing.errors.name_ar);

  // 2. Duplicate department code
  const dup = validateDepartment(
    { code: "DEP-02", name_ar: "قسم جديد" },
    existingDepts
  );
  assert.equal(dup.isValid, false);
  assert.match(dup.errors.code, /مستخدم بالفعل/);

  // 3. Circular reference attempt
  const circular = validateDepartment(
    { id: "d1", code: "DEP-01", name_ar: "الإدارة العامة", parent_id: "d3" },
    existingDepts
  );
  assert.equal(circular.isValid, false);
  assert.match(circular.errors.parent_id, /دائرية/);

  // 4. Incompatible hierarchy level transition (e.g. section cannot parent a main_department)
  const invalidLevel = validateDepartment(
    {
      code: "DEP-04",
      name_ar: "إدارة عامة فرعية غير منطقية",
      level: "main_department",
      parent_id: "d3", // d3 is a section!
    },
    existingDepts
  );
  assert.equal(invalidLevel.isValid, false);
  assert.match(invalidLevel.errors.level, /لا يمكن للإدارة\/الوحدة/);
});

test("Organization Domain: Cost Center, Job & Position Validation", () => {
  // Cost Center
  const ccValid = validateCostCenter(
    { code: "CC-101", name_ar: "مركز التكاليف الإدارية" },
    []
  );
  assert.equal(ccValid.isValid, true);

  // Job
  const jobMissing = validateJob({ code: "", title_ar: "" }, []);
  assert.equal(jobMissing.isValid, false);
  assert.ok(jobMissing.errors.code);
  assert.ok(jobMissing.errors.title_ar);

  // Position
  const posValid = validatePosition(
    {
      position_code: "POS-HR-001",
      title_ar: "أخصائي موارد بشرية",
      job_id: "j1",
      department_id: "d1",
    },
    []
  );
  assert.equal(posValid.isValid, true);

  const posInvalidHeadcount = validatePosition(
    {
      position_code: "POS-HR-002",
      title_ar: "أخصائي",
      job_id: "j1",
      department_id: "d1",
      max_headcount: -1,
    },
    []
  );
  assert.equal(posInvalidHeadcount.isValid, false);
  assert.match(posInvalidHeadcount.errors.max_headcount, /أكبر من أو يساوي 1/);
});

test("Organization Domain: Legacy Text Reconciliation Engine", () => {
  const authoritativeEntities = [
    {
      id: "dept-it",
      code: "IT-01",
      name_ar: "إدارة تقنية المعلومات",
      name_en: "Information Technology Department",
    },
    {
      id: "dept-hr-1",
      code: "HR-01",
      name_ar: "إدارة الموارد البشرية",
      name_en: "Human Resources",
    },
    {
      id: "dept-hr-2",
      code: "HR-02",
      name_ar: "قسم الموارد البشرية",
      name_en: "HR Operations",
    },
    {
      id: "dept-fin",
      code: "FIN-01",
      name_ar: "الإدارة المالية",
      name_en: "Finance Department",
    },
  ];

  const legacyInputs = [
    { id: "e1", text: "تقنية المعلومات" }, // Single normalized match
    { id: "e2", text: "ادارة تقنية المعلومات" }, // Single normalized match
    { id: "e3", text: "الموارد البشرية" }, // Matches both HR-01 and HR-02 -> Ambiguous!
    { id: "e4", text: "إدارة العلاقات العامة والتسويق" }, // Unmatched
    { id: "e5", text: "   " }, // Empty / whitespace
  ];

  const result = reconcileLegacyEntities(legacyInputs, authoritativeEntities);

  assert.equal(result.matched.length, 2);
  assert.equal(result.matched[0].entityId, "dept-it");
  assert.equal(result.matched[1].entityId, "dept-it");

  // Ambiguous test: Multiple matches must NEVER be auto-assigned
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0].legacyId, "e3");
  assert.equal(result.ambiguous[0].candidateIds.length >= 2, true);

  // Unmatched test
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].legacyId, "e4");

  // Summary counts
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.matchedCount, 2);
  assert.equal(result.summary.ambiguousCount, 1);
  assert.equal(result.summary.unmatchedCount, 1);
});

test("Organization Domain: Database Migration SQL Contract", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260918020000_organization_structure_domain.sql"
  );
  assert.equal(fs.existsSync(migrationPath), true, "Migration file must exist on disk");

  const sql = fs.readFileSync(migrationPath, "utf8");

  // Verify all 9 essential tables exist
  const expectedTables = [
    "org_branches",
    "org_sectors",
    "org_cost_centers",
    "org_departments",
    "org_work_locations",
    "org_job_levels",
    "org_jobs",
    "org_positions",
    "org_historical_assignments",
  ];

  for (const table of expectedTables) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i"),
      `Table ${table} must be defined in migration`
    );
    assert.match(
      sql,
      new RegExp(`'${table}'`, "i"),
      `Table ${table} must be included in RLS enforcement loop`
    );
  }

  assert.match(
    sql,
    /ENABLE ROW LEVEL SECURITY/i,
    "RLS must be enabled on organization tables"
  );
  assert.match(
    sql,
    /FORCE ROW LEVEL SECURITY/i,
    "RLS must be forced on organization tables"
  );

  // Verify uniqueness constraints
  assert.match(sql, /UNIQUE \(company_id, code\)/, "Must enforce UNIQUE (company_id, code)");

  // Verify circular hierarchy triggers
  assert.match(sql, /trg_org_department_cycle/, "Must contain department cycle trigger");
  assert.match(sql, /trg_org_cost_center_cycle/, "Must contain cost center cycle trigger");

  // Verify legacy reconciliation RPC
  assert.match(
    sql,
    /reconcile_legacy_org_entities/,
    "Must define reconcile_legacy_org_entities RPC"
  );
});
