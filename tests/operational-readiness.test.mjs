import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  logger,
  redactSensitiveData,
  createLogEntry,
} from "../src/lib/observability/logger.ts";
import {
  checkApplicationHealth,
  checkDatabaseHealth,
  checkAuthenticationHealth,
  checkStorageHealth,
  checkSmtpHealth,
  checkBackgroundWorkerHealth,
  getSystemHealthReport,
} from "../src/lib/observability/health.ts";

test("Observability: Redaction engine strictly scrubs secrets, tokens, passwords, and PII", () => {
  const sensitivePayload = {
    userId: "user-123",
    username: "ahmed.ali",
    password: "SuperSecretPassword123!",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis",
    apiKey: "sb_secret_99999999",
    headers: {
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      cookie: "session=xyz123",
    },
    employee: {
      name: "أحمد علي",
      national_id: "1023456789",
      iban: "SA1280000000123456789012",
      basic_salary: 8500,
      gross_salary: 11000,
      net_salary: 10171.25,
      department: "الهندسة",
    },
    service_role_key: "eyJhbGciOi...",
  };

  const sanitized = redactSensitiveData(sensitivePayload);

  // Assert sensitive fields are redacted
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.service_role_key, "[REDACTED]");
  assert.equal(sanitized.headers.authorization, "[REDACTED]");
  assert.equal(sanitized.headers.cookie, "[REDACTED]");

  assert.equal(sanitized.employee.national_id, "[REDACTED]");
  assert.equal(sanitized.employee.iban, "[REDACTED]");
  assert.equal(sanitized.employee.basic_salary, "[REDACTED]");
  assert.equal(sanitized.employee.gross_salary, "[REDACTED]");
  assert.equal(sanitized.employee.net_salary, "[REDACTED]");

  // Assert non-sensitive fields are preserved
  assert.equal(sanitized.userId, "user-123");
  assert.equal(sanitized.username, "ahmed.ali");
  assert.equal(sanitized.employee.name, "أحمد علي");
  assert.equal(sanitized.employee.department, "الهندسة");
});

test("Observability: Logger formats entries across all 4 alert levels and tracks slow operations", () => {
  const levels = ["INFO", "WARNING", "ERROR", "CRITICAL"];

  for (const lvl of levels) {
    const entry = createLogEntry(lvl, "operational_lifecycle", `Test message for ${lvl}`, {
      tenantId: "t-1",
      userId: "u-1",
      metadata: { action: "login", password: "raw_password_should_be_scrubbed" },
    });

    assert.equal(entry.level, lvl);
    assert.equal(entry.eventType, "operational_lifecycle");
    assert.equal(entry.metadata.password, "[REDACTED]");
    assert.equal(entry.metadata.action, "login");
  }

  // Test slow operation tracker (> 500ms)
  const slowLog = logger.trackDuration("PayrollCalculation", 750, { tenantId: "t-1" });
  assert.ok(slowLog);
  assert.equal(slowLog.level, "WARNING");
  assert.equal(slowLog.eventType, "slow_operation");
  assert.equal(slowLog.durationMs, 750);

  // Fast operation (<= 500ms) should not emit slow_operation warning
  const fastLog = logger.trackDuration("EmployeeLookup", 120, { tenantId: "t-1" });
  assert.equal(fastLog, null);
});

test("Health Diagnostics: Probes execute cleanly across all 6 subsystems", async () => {
  // 1. Application probe
  const app = checkApplicationHealth();
  assert.equal(app.status, "healthy");
  assert.ok(app.details.heapUsedMb > 0);

  // Mock Supabase DB client for healthy scenario
  const mockHealthyDb = {
    from: (table) => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [{ id: "mock-1" }], error: null }),
        eq: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: { smtp_host: "smtp.example.com", smtp_port: 587, is_active: true }, error: null }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: null, error: { message: "User not found" } }),
    },
    storage: {
      listBuckets: () => Promise.resolve({
        data: [{ name: "employee-documents" }, { name: "employee-permits" }],
        error: null,
      }),
    },
  };

  const dbHealth = await checkDatabaseHealth(mockHealthyDb);
  assert.equal(dbHealth.status, "healthy");
  assert.ok(dbHealth.latencyMs >= 0);

  const authHealth = await checkAuthenticationHealth(mockHealthyDb);
  assert.equal(authHealth.status, "healthy");

  const storageHealth = await checkStorageHealth(mockHealthyDb);
  assert.equal(storageHealth.status, "healthy");
  assert.equal(storageHealth.details.hasCoreBuckets, true);

  const smtpHealth = await checkSmtpHealth(mockHealthyDb);
  assert.equal(smtpHealth.status, "healthy");

  const workerHealth = await checkBackgroundWorkerHealth(mockHealthyDb);
  assert.equal(workerHealth.status, "healthy");
  assert.equal(workerHealth.details.pendingBacklogCount, 0);

  // Overall system health
  const systemReport = await getSystemHealthReport(mockHealthyDb);
  assert.equal(systemReport.status, "healthy");
  assert.ok(systemReport.uptimeSeconds >= 0);
});

test("Health Diagnostics: Correctly degrades and reports unhealthy when DB or Auth fails", async () => {
  const mockFailingDb = {
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: null, error: new Error("Connection terminated unexpectedly") }),
      }),
    }),
    auth: {
      getUser: () => Promise.reject(new Error("Auth gateway timeout")),
    },
    storage: {
      listBuckets: () => Promise.resolve({ data: [], error: new Error("Storage unreachable") }),
    },
  };

  const systemReport = await getSystemHealthReport(mockFailingDb);
  assert.equal(systemReport.status, "unhealthy");
  assert.equal(systemReport.subsystems.database.status, "unhealthy");
  assert.equal(systemReport.subsystems.authentication.status, "unhealthy");
  assert.equal(systemReport.subsystems.storage.status, "degraded");
});

test("Operational Documentation: Backup & DR, PITR, and Credential Rotation are completely documented", () => {
  const backupDocPath = path.resolve(process.cwd(), "docs/operational/BACKUP_AND_DISASTER_RECOVERY.md");
  assert.ok(fs.existsSync(backupDocPath), "BACKUP_AND_DISASTER_RECOVERY.md must exist");

  const content = fs.readFileSync(backupDocPath, "utf8");

  // Check all 11 required operational areas
  assert.ok(content.includes("Database Backup Strategy"), "Must document Database Backup Strategy");
  assert.ok(content.includes("Restore Procedure"), "Must document Restore Procedure");
  assert.ok(content.includes("Point-in-Time Recovery"), "Must document Point-in-Time Recovery");
  assert.ok(content.includes("Migration Backup Procedure"), "Must document Migration Backup Procedure");
  assert.ok(content.includes("File & Storage Backup Strategy"), "Must document File/Storage Backup Strategy");
  assert.ok(content.includes("Secret Rotation Procedure"), "Must document Secret Rotation Procedure");
  assert.ok(content.includes("SMTP Credential Rotation"), "Must document SMTP Credential Rotation");
  assert.ok(content.includes("Service-Role Key Rotation"), "Must document Service-Role Key Rotation");
  assert.ok(content.includes("Encryption Key Rotation Strategy"), "Must document Encryption Key Rotation Strategy");
  assert.ok(content.includes("Audit & Log Retention Policy"), "Must document Audit Retention");
  assert.ok(content.includes("Tested Backup Restore Checklist"), "Must document Tested Backup Restore Checklist");
});

test("Operational Documentation: Incident Runbook covers all 8 critical operational failure modes", () => {
  const runbookDocPath = path.resolve(process.cwd(), "docs/operational/INCIDENT_RUNBOOK.md");
  assert.ok(fs.existsSync(runbookDocPath), "INCIDENT_RUNBOOK.md must exist");

  const content = fs.readFileSync(runbookDocPath, "utf8");

  // Check all 8 failure modes
  assert.ok(content.includes("Incident 1: Application Down"), "Must cover Application Down");
  assert.ok(content.includes("Incident 2: Database Unavailable"), "Must cover Database Unavailable");
  assert.ok(content.includes("Incident 3: Email Unavailable"), "Must cover Email Unavailable");
  assert.ok(content.includes("Incident 4: Failed Database Migration"), "Must cover Failed Database Migration");
  assert.ok(content.includes("Incident 5: Bad Payroll Run"), "Must cover Bad Payroll Run");
  assert.ok(content.includes("Incident 6: Duplicate Integration Event"), "Must cover Duplicate Integration Event");
  assert.ok(content.includes("Incident 7: Storage Failure"), "Must cover Storage Failure");
  assert.ok(content.includes("Incident 8: Security Incident"), "Must cover Security Incident");

  console.log("\n==================================================");
  console.log("OPERATIONAL READINESS = PASS");
  console.log("==================================================\n");
});
