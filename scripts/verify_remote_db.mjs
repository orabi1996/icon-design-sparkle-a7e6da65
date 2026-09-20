const SUPABASE_URL = "https://ufdfvcsvvgzjxsmekqqc.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_SFJbLeGyqW0zWNo_w8Vr9A_aNkRUhK8";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: "count=exact",
};

async function checkTable(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/${table}?select=*&limit=1`, { headers });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    
    const cr = res.headers.get("content-range");
    const total = cr ? cr.split("/")[1] : (Array.isArray(json) ? json.length : null);
    
    return {
      status: res.status,
      ok: res.ok,
      total,
      data: Array.isArray(json) ? json : null,
      error: !res.ok ? text : null,
    };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

async function main() {
  console.log("================================================================================");
  console.log("            REMOTE SUPABASE REAL ENVIRONMENT VERIFICATION                       ");
  console.log("================================================================================");
  console.log("Target URL:", SUPABASE_URL);

  const tablesToCheck = [
    // Pre-20260830 tables
    "employees",
    "departments",
    "attendance_records",
    "leave_requests",
    "loans",
    "fingerprint_records",
    "approval_requests",
    "end_of_service_requests",
    "work_shift_groups",
    "basic_lookups",
    "regulation_rules",
    "app_settings",
    // 20260914 onward (PROMPT 0 - PROMPT 12 migrations)
    "hr_tenants",
    "hr_company_profiles",
    "hr_company_versions",
    "org_branches",
    "org_sectors",
    "org_departments",
    "org_cost_centers",
    "employee_contracts",
    "employee_lifecycle_events",
    "wf_requests",
    "wf_request_instances",
    "leave_balances",
    "leave_ledger",
    "employee_permits",
    "m08_devices",
    "m08_raw_punches",
    "m08_attendance_daily",
    "m08_attendance_exceptions",
    "payroll_periods",
    "payroll_runs",
    "payroll_results",
    "loan_installments",
    "loan_transactions",
    "eos_provisions",
    "disciplinary_inquiries",
    "surveys",
    "archived_documents",
    "security_audit_logs",
    "email_configs",
    "wf_outbox_events",
    "migration_batches",
    "migration_row_items",
    "legacy_migration_mappings"
  ];

  const results = [];
  for (const table of tablesToCheck) {
    const res = await checkTable(table);
    results.push({
      Table: table,
      Exists: res.status !== 404 && !res.error?.includes("relation") && !res.error?.includes("does not exist"),
      Status: res.status,
      Count: res.total ?? "N/A",
      Details: res.ok ? "Accessible" : (res.status === 404 ? "Table Not Found (404)" : (res.error ? res.error.slice(0, 80) : `HTTP ${res.status}`)),
    });
  }

  console.table(results);
}

main().catch(console.error);
