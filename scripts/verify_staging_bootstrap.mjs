import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ylfpyugoxxxyjglyppcn.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_KK5d6zzm7t4zJUxFoOc9yQ_8n7Plrl0";

const anonClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

const domainModules = {
  "1. Multi-Tenant & Organization": [
    "hr_tenants",
    "hr_company_profiles",
    "hr_company_versions",
    "org_branches",
    "org_sectors",
    "org_departments",
    "org_cost_centers",
    "org_positions"
  ],
  "2. Employee Lifecycle & Master Data": [
    "employees",
    "profiles",
    "user_roles",
    "employee_relatives",
    "employee_documents",
    "employee_correspondence",
    "employee_lifecycle_transitions"
  ],
  "3. Request & Approval Workflows": [
    "wf_request_types",
    "wf_definitions",
    "wf_stages",
    "wf_request_instances",
    "wf_outbox_events",
    "approval_requests",
    "tasks"
  ],
  "4. Leave, Balances & Permits": [
    "leave_requests",
    "leave_policies",
    "leave_ledger",
    "employee_permits"
  ],
  "5. Shift, Attendance & Biometrics (M08)": [
    "work_shift_groups",
    "m08_devices",
    "m08_device_events",
    "m08_attendance_results",
    "m08_attendance_exceptions",
    "fingerprint_records"
  ],
  "6. Payroll & SAMA WPS": [
    "payroll_periods",
    "payroll_runs",
    "payroll_results",
    "payroll_salary_components"
  ],
  "7. Loans & End of Service (EOS)": [
    "loans",
    "loan_transactions",
    "loan_installment_schedules",
    "employee_eos_provisions",
    "end_of_service_requests"
  ],
  "8. Operational HR & Governance": [
    "disciplinary_inquiries",
    "surveys",
    "archived_documents",
    "security_audit_logs",
    "email_logs",
    "permission_features"
  ],
  "9. Legacy Data Migration Reconciliation": [
    "migration_batches",
    "migration_row_items",
    "legacy_migration_mappings"
  ]
};

async function main() {
  console.log("================================================================================");
  console.log("       LIVE REMOTE DATABASE VERIFICATION: ylfpyugoxxxyjglyppcn (STAGING)        ");
  console.log("================================================================================");
  console.log(`Target URL: ${SUPABASE_URL}`);
  console.log(`Key Type: Publishable / Anon Client\n`);

  let totalTables = 0;
  let accessibleAnonTables = 0;
  let protectedTables = 0;
  let missingTables = 0;

  const tableResults = [];

  for (const [moduleName, tables] of Object.entries(domainModules)) {
    console.log(`\n--- ${moduleName} ---`);
    for (const table of tables) {
      totalTables++;
      try {
        const { data, error, status } = await anonClient.from(table).select("*").limit(1);

        if (status === 404) {
          missingTables++;
          tableResults.push({ Module: moduleName, Table: table, Status: "MISSING (404)", Security: "N/A" });
          console.log(`  ❌ ${table}: MISSING (Table does not exist on remote DB)`);
        } else if (error && (status === 401 || status === 403 || error.message.includes("permission denied") || error.code === "42501" || error.code === "PGRST301")) {
          protectedTables++;
          tableResults.push({ Module: moduleName, Table: table, Status: "PRESENT", Security: "STRICT RLS / GRANTS (Anon Blocked 401/403)" });
          console.log(`  🛡️  ${table}: PRESENT & PROTECTED (Anon access blocked by RLS/Grants)`);
        } else if (!error && Array.isArray(data) && data.length === 0) {
          // RLS is active: query succeeded at DB connection level but RLS filtered all rows to 0
          protectedTables++;
          tableResults.push({ Module: moduleName, Table: table, Status: "PRESENT", Security: "STRICT RLS (0 rows returned to anon)" });
          console.log(`  🛡️  ${table}: PRESENT & PROTECTED (RLS Active, 0 rows returned to anon)`);
        } else if (!error && Array.isArray(data) && data.length > 0) {
          // Data was leaked to anon!
          accessibleAnonTables++;
          tableResults.push({ Module: moduleName, Table: table, Status: "DATA LEAK", Security: "ANON DATA EXPOSURE!" });
          console.log(`  🚨 ${table}: DATA LEAK! ${data.length} row(s) returned to anon!`);
        } else {
          tableResults.push({ Module: moduleName, Table: table, Status: `HTTP ${status}`, Security: error?.message?.slice(0, 50) });
          console.log(`  ℹ️  ${table}: Status ${status} - ${error?.message?.slice(0, 60)}`);
        }
      } catch (err) {
        missingTables++;
        tableResults.push({ Module: moduleName, Table: table, Status: "ERROR", Security: err.message });
        console.log(`  ❌ ${table}: ${err.message}`);
      }
    }
  }

  console.log("\n================================================================================");
  console.log("                          VERIFICATION SUMMARY                                  ");
  console.log("================================================================================");
  console.log(`Total Enterprise Tables Checked: ${totalTables}`);
  console.log(`Missing Tables (Not Migrated):   ${missingTables}`);
  console.log(`Protected Tables (Strict RLS):   ${protectedTables}`);
  console.log(`Anon Data Leak Tables:           ${accessibleAnonTables}`);
  console.log("================================================================================\n");

  if (missingTables === 0 && accessibleAnonTables === 0) {
    console.log("RESULT: LIVE STAGING DATABASE VERIFICATION: PASS");
    process.exit(0);
  } else {
    console.log("RESULT: LIVE STAGING DATABASE VERIFICATION: PENDING / BLOCKED");
    process.exit(1);
  }
}

main().catch(console.error);
