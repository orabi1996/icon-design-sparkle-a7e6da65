import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(".");
const envPath = join(ROOT, ".env");
let envVars = {};
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...v] = trimmed.split("=");
    if (k) envVars[k.trim()] = v.join("=").replace(/(^"|"$)/g, "").trim();
  }
}

const supabaseUrl = process.env["SUPABASE_URL"] || envVars["SUPABASE_URL"];
const supabaseAnonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || envVars["SUPABASE_PUBLISHABLE_KEY"];

const client = createClient(supabaseUrl, supabaseAnonKey);

// List of milestone tables created across migrations:
const migrationMilestones = [
  { migration: "20260818031110 (Initial schema)", table: "employees" },
  { migration: "20260820071534 (Work shifts)", table: "work_shift_groups" },
  { migration: "20260820082013 (Basic lookups)", table: "basic_lookups" },
  { migration: "20260820084338 (App settings)", table: "app_settings" },
  { migration: "20260828193000 (Employee permits)", table: "employee_permits" },
  { migration: "20260828210500 (Correspondence)", table: "employee_correspondence" },
  { migration: "20260828224000 (EOS provisions)", table: "eos_provisions" },
  { migration: "20260828233000 (EOS requests)", table: "end_of_service_requests" },
  { migration: "20260829063000 (Tasks module)", table: "tasks" },
  { migration: "20260829074000 (Approval requests)", table: "approval_requests" },
  { migration: "20260829223000 (Employee relatives)", table: "employee_relatives" },
  { migration: "20260830035000 (Fingerprint records)", table: "fingerprint_records" },
  { migration: "20260830090000 (Permissions module)", table: "permission_groups" },
  { migration: "20260914190000 (Company foundation)", table: "companies" },
  { migration: "20260915130000 (M08 shifts/rosters)", table: "work_shifts" },
  { migration: "20260917190000 (Email notifications)", table: "email_settings" },
  { migration: "20260918010000 (Security foundation)", table: "security_audit_logs" },
  { migration: "20260918020000 (Organization structure)", table: "branches" },
  { migration: "20260918030000 (Employee lifecycle)", table: "employee_contracts" },
  { migration: "20260918040000 (Requests workflow)", table: "wf_request_instances" },
  { migration: "20260918050000 (Leaves ledger)", table: "leave_ledger" },
  { migration: "20260918060000 (Attendance devices)", table: "biometric_devices" },
  { migration: "20260918070000 (Payroll WPS)", table: "payroll_results" },
  { migration: "20260918080000 (Loans ledger & EOS)", table: "loan_transactions" },
  { migration: "20260918090000 (Operational modules)", table: "disciplinary_inquiries" },
  { migration: "20260918100000 (Reports governance)", table: "vw_reporting_data_quality_issues" }
];

console.log("Checking migration presence in remote staging database:\n");

for (const m of migrationMilestones) {
  const { data, error } = await client.from(m.table).select("*").limit(1);
  if (error && error.code === "PGRST205") {
    console.log(`❌ NOT APPLIED: ${m.migration} (Table '${m.table}' does not exist)`);
  } else if (error) {
    console.log(`✅ APPLIED: ${m.migration} (Table '${m.table}' exists, responded with: ${error.message} [Code: ${error.code}])`);
  } else {
    console.log(`✅ APPLIED: ${m.migration} (Table '${m.table}' exists, returned ${data.length} rows)`);
  }
}
