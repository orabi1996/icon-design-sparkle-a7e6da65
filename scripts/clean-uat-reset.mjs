import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ylfpyugoxxxyjglyppcn.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_KK5d6zzm7t4zJUxFoOc9yQ_8n7Plrl0";

const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false }
});

const COMPANY_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const testEmpId = "e1111111-1111-1111-1111-111111111111";
const testEmpNo = "EMP-01042";
const BRANCH_RUH_ID = "33333333-3333-3333-3333-333333333331";
const DEPT_ENG_ID = "44444444-4444-4444-4444-444444444443";
const periodId = "p1111111-1111-1111-1111-111111111111";
const runId = "r1111111-1111-1111-1111-111111111111";
const loanId = "c1111111-1111-1111-1111-111111111111";
const eosReqId = "f1111111-1111-1111-1111-111111111111";
const leaveReqId = "88888888-8888-8888-8888-888888888881";
const permitId = "99999999-9999-9999-9999-999999999991";
const outboxEventId = "f2222222-2222-2222-2222-222222222222";

async function cleanReset() {
  console.log("================================================================================");
  console.log("                 CLEAN UAT RESET FOR STAGING DATABASE                           ");
  console.log("================================================================================");

  // Authenticate as Admin
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: "uat.admin@acme.staging",
    password: "StagingUat2026!"
  });
  if (authErr) {
    console.error("Failed to authenticate admin:", authErr);
    process.exit(1);
  }
  console.log(`Admin authenticated: ${authData.user.id}`);

  // Safely clean up synthetic transaction and operational records
  console.log("Resetting synthetic UAT operational records...");

  // 1. Email logs & outbox
  await client.from("email_logs").delete().eq("company_id", COMPANY_ID);
  await client.from("wf_outbox_events").delete().eq("tenant_id", TENANT_ID);

  // 2. EOS settlements & requests
  await client.from("eos_settlements").delete().eq("company_id", COMPANY_ID);
  await client.from("end_of_service_requests").delete().eq("company_id", COMPANY_ID);

  // 3. Bank files & Payment batches
  await client.from("payroll_bank_files").delete().eq("company_id", COMPANY_ID);
  await client.from("payroll_payment_batches").delete().eq("company_id", COMPANY_ID);

  // 4. Payroll adjustments, results, inputs, runs, periods
  await client.from("payroll_adjustments").delete().eq("company_id", COMPANY_ID);
  await client.from("payroll_results").delete().eq("company_id", COMPANY_ID);
  await client.from("payroll_inputs").delete().eq("company_id", COMPANY_ID);
  await client.from("payroll_runs").delete().eq("company_id", COMPANY_ID);
  await client.from("payroll_periods").delete().eq("company_id", COMPANY_ID);

  // 5. Loan transactions, installment schedules, loans
  await client.from("loan_transactions").delete().eq("company_id", COMPANY_ID);
  await client.from("loan_installment_schedules").delete().eq("company_id", COMPANY_ID);
  await client.from("loans").delete().eq("employee_id", testEmpId);

  // 6. Attendance results & exceptions
  await client.from("m08_attendance_results").delete().eq("company_id", COMPANY_ID);
  await client.from("m08_attendance_exceptions").delete().eq("company_id", COMPANY_ID);

  // 7. Permits
  await client.from("employee_permits").delete().eq("employee_id", testEmpId);

  // 8. Leave ledger & requests
  await client.from("leave_ledger").delete().eq("employee_id", testEmpId);
  await client.from("leave_requests").delete().eq("employee_id", testEmpId);

  // 9. Historical assignments & lifecycle transitions
  await client.from("org_historical_assignments").delete().eq("employee_id", testEmpId);
  await client.from("employee_lifecycle_transitions").delete().eq("employee_id", testEmpId);

  // 10. Ensure BIO-HQ-01 device exists with correct schema
  await client.from("m08_devices").upsert({
    company_id: COMPANY_ID,
    serial_number: "BIO-HQ-01",
    name: "جهاز البصمة الرئيسي - المقر",
    site_code: "SITE-HQ",
    status: "active",
    device_type: "biometric"
  }, { onConflict: "company_id, serial_number" });

  // 11. Reset test employee to initial state (probation, active, version 1)
  const { data: jobs } = await client.from("org_jobs").select("id").eq("company_id", COMPANY_ID).limit(1);
  const testJobId = jobs?.[0]?.id;

  await client.from("employees").upsert({
    id: testEmpId,
    tenant_id: TENANT_ID,
    company_id: COMPANY_ID,
    branch_id: BRANCH_RUH_ID,
    department_id: DEPT_ENG_ID,
    job_id: testJobId,
    emp_no: testEmpNo,
    full_name: "سعود بن محمد القحطاني",
    national_id: "1087654321",
    email: "saud.alqahtani@acme.staging",
    phone: "0501234567",
    gender: "ذكر",
    nationality: "سعودي",
    birth_date: "1992-05-15",
    hire_date: "2026-10-01",
    basic_salary: 10000,
    allowances: 3500,
    iban: "SA0380000000608010167519",
    bank_name: "مصرف الراجحي",
    bank_code: "RJHI",
    job_title: "مهندس برمجيات أول",
    employment_status: "probation",
    status: "نشط",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  console.log("✅ Synthetic UAT reset completed successfully! Clean state established.\n");
}

cleanReset().catch(err => {
  console.error("Clean reset error:", err);
  process.exit(1);
});
