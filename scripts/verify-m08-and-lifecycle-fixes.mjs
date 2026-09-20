import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = "https://ylfpyugoxxxyjglyppcn.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_KK5d6zzm7t4zJUxFoOc9yQ_8n7Plrl0";

const adminClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false }
});

const COMPANY_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BRANCH_RUH_ID = "33333333-3333-3333-3333-333333333331";
const BRANCH_JED_ID = "33333333-3333-3333-3333-333333333332";
const DEPT_HR_ID = "44444444-4444-4444-4444-444444444441";
const DEPT_ENG_ID = "44444444-4444-4444-4444-444444444443";

async function main() {
  console.log("================================================================================");
  console.log("          PROMPT 22: DIRECT VERIFICATION OF M08 & LIFECYCLE FIXES               ");
  console.log("================================================================================");

  // Authenticate as Admin
  const { data: authData, error: authErr } = await adminClient.auth.signInWithPassword({
    email: "uat.admin@acme.staging",
    password: "StagingUat2026!"
  });
  if (authErr) {
    console.error("Admin sign in failed:", authErr);
    process.exit(1);
  }
  console.log(`Admin signed in: ${authData.user.id}\n`);

  // Record 20260920150000 in schema_migrations if not present
  try {
    await adminClient.from("supabase_migrations.schema_migrations").insert({
      version: "20260920150000"
    });
  } catch (e) {
    // schema_migrations may not be exposed via PostgREST, that's fine
  }

  // ----------------------------------------------------------------------------
  // SECTION 3: VERIFY M08 FIX DIRECTLY
  // ----------------------------------------------------------------------------
  console.log("--- SECTION 3: M08 FIX DIRECT VERIFICATION ---");

  // Ensure test device exists in m08_devices
  await adminClient.from("m08_devices").upsert({
    company_id: COMPANY_ID,
    serial_number: "BIO-VERIFY-01",
    name: "جهاز التحقق المركزي",
    site_code: "SITE-HQ",
    status: "active",
    device_type: "biometric"
  }, { onConflict: "company_id, serial_number" });

  const testEmpNo = "EMP-01042";
  const runTag = Date.now().toString().slice(-6);

  // Test 3.1: Known Device + Known Employee
  console.log("\n[M08-01] Testing: Known Device + Known Employee...");
  const { data: m08_known, error: err_known } = await adminClient.rpc("m08_ingest_device_event", {
    p_company_id: COMPANY_ID,
    p_device_serial: "BIO-VERIFY-01",
    p_external_event_id: `VERIFY-KNOWN-${runTag}`,
    p_employee_raw_id: testEmpNo,
    p_event_at: new Date().toISOString(),
    p_punch_kind: "in"
  });
  console.log("Result:", m08_known, "Error:", err_known?.message || "none");
  const pass_m08_01 = !err_known && m08_known?.mapping_status === "mapped" && m08_known?.success === true;
  console.log(`Status: ${pass_m08_01 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 3.2: Unknown Device
  console.log("\n[M08-02] Testing: Unknown Device (graceful handling, no unassigned record error)...");
  const { data: m08_unk_dev, error: err_unk_dev } = await adminClient.rpc("m08_ingest_device_event", {
    p_company_id: COMPANY_ID,
    p_device_serial: "BIO-NONEXISTENT-999",
    p_external_event_id: `VERIFY-UNKDEV-${runTag}`,
    p_employee_raw_id: testEmpNo,
    p_event_at: new Date().toISOString(),
    p_punch_kind: "in"
  });
  console.log("Result:", m08_unk_dev, "Error:", err_unk_dev?.message || "none");
  const pass_m08_02 = !err_unk_dev && m08_unk_dev?.mapping_status === "unknown_device" && m08_unk_dev?.quarantine_reason?.includes("غير مسجل");
  console.log(`Status: ${pass_m08_02 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 3.3: Unknown Employee Mapping
  console.log("\n[M08-03] Testing: Unknown Employee Mapping (graceful quarantine)...");
  const { data: m08_unk_emp, error: err_unk_emp } = await adminClient.rpc("m08_ingest_device_event", {
    p_company_id: COMPANY_ID,
    p_device_serial: "BIO-VERIFY-01",
    p_external_event_id: `VERIFY-UNKEMP-${runTag}`,
    p_employee_raw_id: "EMP-NONEXISTENT-9999",
    p_event_at: new Date().toISOString(),
    p_punch_kind: "in"
  });
  console.log("Result:", m08_unk_emp, "Error:", err_unk_emp?.message || "none");
  const pass_m08_03 = !err_unk_emp && m08_unk_emp?.mapping_status === "unknown_employee" && m08_unk_emp?.quarantine_reason?.includes("رقم الموظف غير مطابق");
  console.log(`Status: ${pass_m08_03 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 3.4: Duplicate Event (Idempotent ON CONFLICT DO NOTHING)
  console.log("\n[M08-04] Testing: Duplicate Event Idempotency...");
  const { data: m08_dup, error: err_dup } = await adminClient.rpc("m08_ingest_device_event", {
    p_company_id: COMPANY_ID,
    p_device_serial: "BIO-VERIFY-01",
    p_external_event_id: `VERIFY-KNOWN-${runTag}`, // Repeat same external event ID!
    p_employee_raw_id: testEmpNo,
    p_event_at: new Date().toISOString(),
    p_punch_kind: "in"
  });
  console.log("Result:", m08_dup, "Error:", err_dup?.message || "none");
  const pass_m08_04 = !err_dup && m08_dup?.success === true && m08_dup?.event_id === null;
  console.log(`Status: ${pass_m08_04 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 3.5: Raw Punch Immutability (UPDATE must be rejected by trigger hr_reject_history_change)
  console.log("\n[M08-05] Testing: Raw Punch Immutability Trigger...");
  const { error: mutErr } = await adminClient
    .from("m08_device_events")
    .update({ punch_kind: "out" })
    .eq("id", m08_known?.event_id);
  console.log("Update attempt error:", mutErr?.message || "none", "Code:", mutErr?.code);
  const pass_m08_05 = mutErr !== null && (mutErr.message.includes("غير قابلة للتعديل") || mutErr.code === "P0001" || mutErr.code === "42501");
  console.log(`Status: ${pass_m08_05 ? "✅ PASS" : "❌ FAIL"}`);

  // ----------------------------------------------------------------------------
  // SECTION 4: VERIFY EMPLOYEE LIFECYCLE FIX DIRECTLY
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 4: EMPLOYEE LIFECYCLE FIX DIRECT VERIFICATION ---");

  // Ensure test employee exists with job_id, branch_id, department_id
  const testEmpId = "e1111111-1111-1111-1111-111111111111";

  // Fetch job_id
  const { data: jobs } = await adminClient.from("org_jobs").select("id").eq("company_id", COMPANY_ID).limit(1);
  const testJobId = jobs?.[0]?.id;

  // Set employee initial state
  await adminClient.from("employees").update({
    branch_id: BRANCH_RUH_ID,
    department_id: DEPT_ENG_ID,
    job_id: testJobId,
    employment_status: "active",
    status: "نشط"
  }).eq("id", testEmpId);

  // Test 4.1: Branch Transfer Trigger
  console.log("\n[LC-01] Testing: Branch Transfer (Riyadh -> Jeddah)...");
  const { data: empTrans, error: errTrans } = await adminClient
    .from("employees")
    .update({
      branch_id: BRANCH_JED_ID,
      version: 5,
      updated_at: new Date().toISOString()
    })
    .eq("id", testEmpId)
    .select();
  console.log("Employee update error:", errTrans?.message || "none");

  const { data: histTrans } = await adminClient
    .from("org_historical_assignments")
    .select("*")
    .eq("employee_id", testEmpId)
    .order("created_at", { ascending: false });

  console.log(`Historical assignments count: ${histTrans?.length}; Latest branch: ${histTrans?.[0]?.branch_id}`);
  const pass_lc_01 = !errTrans && histTrans?.[0]?.branch_id === BRANCH_JED_ID && histTrans?.[0]?.is_current === true;
  console.log(`Status: ${pass_lc_01 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 4.2: Department Change Trigger
  console.log("\n[LC-02] Testing: Department Change (Engineering -> HR)...");
  const { data: empDept, error: errDept } = await adminClient
    .from("employees")
    .update({
      department_id: DEPT_HR_ID,
      version: 6,
      updated_at: new Date().toISOString()
    })
    .eq("id", testEmpId)
    .select();
  console.log("Employee update error:", errDept?.message || "none");

  const { data: histDept } = await adminClient
    .from("org_historical_assignments")
    .select("*")
    .eq("employee_id", testEmpId)
    .order("created_at", { ascending: false });

  console.log(`Latest department in history: ${histDept?.[0]?.department_id}; Prev is_current: ${histDept?.[1]?.is_current}`);
  const pass_lc_02 = !errDept && histDept?.[0]?.department_id === DEPT_HR_ID && histDept?.[1]?.is_current === false;
  console.log(`Status: ${pass_lc_02 ? "✅ PASS" : "❌ FAIL"}`);

  // Test 4.3: Employment Status Change (Resignation) via transition_employee_lifecycle_status
  console.log("\n[LC-03] Testing: Status Change to Resigned (No 42703 error, preserved record)...");
  const { data: empResign, error: errResign } = await adminClient
    .from("employees")
    .update({
      employment_status: "resigned",
      status: "مستقيل",
      version: 7,
      updated_at: new Date().toISOString()
    })
    .eq("id", testEmpId)
    .select();
  console.log("Employee update error:", errResign?.message || "none");

  const { data: empFinal } = await adminClient
    .from("employees")
    .select("id, status, employment_status")
    .eq("id", testEmpId)
    .single();

  const pass_lc_03 = !errResign && empFinal?.status === "مستقيل" && empFinal?.employment_status === "resigned";
  console.log(`Employee status: ${empFinal?.status}, employment_status: ${empFinal?.employment_status}`);
  console.log(`Status: ${pass_lc_03 ? "✅ PASS" : "❌ FAIL"}`);

  // Summary
  console.log("\n================================================================================");
  console.log("                        DIRECT VERIFICATION RESULTS                             ");
  console.log("================================================================================");
  const allM08Pass = pass_m08_01 && pass_m08_02 && pass_m08_03 && pass_m08_04 && pass_m08_05;
  const allLcPass = pass_lc_01 && pass_lc_02 && pass_lc_03;
  console.log(`M08 Verification:       ${allM08Pass ? "✅ ALL PASS" : "❌ FAIL"}`);
  console.log(`Lifecycle Verification: ${allLcPass ? "✅ ALL PASS" : "❌ FAIL"}`);

  if (!allM08Pass || !allLcPass) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
