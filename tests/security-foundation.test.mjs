import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSelfRegistrationAllowed } from "../src/lib/auth-config.ts";
import { encryptSecret, decryptSecret, maskSecret, isEncrypted } from "../src/lib/email/crypto.mjs";

const migrationSource = readFileSync(
  "supabase/migrations/20260918010000_security_foundation_auth_authorization.sql",
  "utf8"
);

test("migration: revokes all anon and public grants from HR tables", () => {
  assert.ok(migrationSource.includes("REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC;"));
  assert.ok(migrationSource.includes("ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;"));
  assert.ok(migrationSource.includes("DROP POLICY IF EXISTS %I ON %I.%I;"));
  assert.ok(migrationSource.includes("policyname LIKE 'demo_open_%'"));
});

test("migration: establishes immutable security audit log table", () => {
  assert.ok(migrationSource.includes("CREATE TABLE IF NOT EXISTS public.security_audit_logs"));
  assert.ok(migrationSource.includes("reject_security_audit_modification"));
  assert.ok(migrationSource.includes("سجل التدقيق الأمني غير قابل للتعديل أو الحذف نهائيًا"));
  assert.ok(migrationSource.includes("CREATE TRIGGER security_audit_logs_immutable"));
  assert.ok(migrationSource.includes("BEFORE UPDATE OR DELETE ON public.security_audit_logs"));
});

test("migration: defines comprehensive event types in security audit log", () => {
  const expectedEvents = [
    "login",
    "login_failed",
    "user_created",
    "role_changed",
    "permission_changed",
    "group_changed",
    "account_disabled",
    "sensitive_config_changed",
    "unauthorized_access",
  ];
  for (const event of expectedEvents) {
    assert.ok(
      migrationSource.includes(`'${event}'`),
      `Expected event '${event}' to be defined in security_audit_logs`
    );
  }
});

test("migration: seeds granular email permissions in permission_features", () => {
  const emailPermissions = [
    "email.settings.read",
    "email.settings.update",
    "email.test",
    "email.templates.read",
    "email.templates.update",
    "email.logs.read",
    "email.logs.resend",
    "email.dispatch",
  ];
  for (const perm of emailPermissions) {
    assert.ok(
      migrationSource.includes(`'${perm}'`),
      `Expected email permission '${perm}' to be seeded`
    );
  }
});

test("crypto: fails securely when EMAIL_CONFIG_ENCRYPTION_KEY is missing", () => {
  const originalKey = process.env["EMAIL_CONFIG_ENCRYPTION_KEY"];
  delete process.env["EMAIL_CONFIG_ENCRYPTION_KEY"];
  try {
    assert.throws(
      () => encryptSecret("my-password"),
      /Missing required environment secret: EMAIL_CONFIG_ENCRYPTION_KEY/
    );
  } finally {
    process.env["EMAIL_CONFIG_ENCRYPTION_KEY"] = originalKey || "test-key-32-chars-minimum-ok!!!";
  }
});

test("crypto: encrypts and decrypts correctly with proper key", () => {
  process.env["EMAIL_CONFIG_ENCRYPTION_KEY"] = "test-key-32-chars-minimum-ok!!!";
  const raw = "CompanySmtpSecret2026!";
  const encrypted = encryptSecret(raw);
  assert.ok(isEncrypted(encrypted));
  assert.match(encrypted, /^enc:v1:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
  assert.equal(decryptSecret(encrypted), raw);
  assert.equal(maskSecret(raw), "••••••••");
});

test("auth-config: self-registration defaults to false in enterprise mode", () => {
  const originalEnv = process.env["ALLOW_SELF_REGISTRATION"];
  delete process.env["ALLOW_SELF_REGISTRATION"];
  try {
    assert.equal(isSelfRegistrationAllowed(), false);
  } finally {
    if (originalEnv !== undefined) {
      process.env["ALLOW_SELF_REGISTRATION"] = originalEnv;
    }
  }
});

test("auth-config: self-registration enables only when explicitly set to 'true'", () => {
  const originalEnv = process.env["ALLOW_SELF_REGISTRATION"];
  try {
    process.env["ALLOW_SELF_REGISTRATION"] = "false";
    assert.equal(isSelfRegistrationAllowed(), false);

    process.env["ALLOW_SELF_REGISTRATION"] = "0";
    assert.equal(isSelfRegistrationAllowed(), false);

    process.env["ALLOW_SELF_REGISTRATION"] = "true";
    assert.equal(isSelfRegistrationAllowed(), true);
  } finally {
    if (originalEnv !== undefined) {
      process.env["ALLOW_SELF_REGISTRATION"] = originalEnv;
    } else {
      delete process.env["ALLOW_SELF_REGISTRATION"];
    }
  }
});

test("server-authorization: contract check for requirePermission sequence", () => {
  const serverAuthSource = readFileSync("src/lib/server/authorization.ts", "utf8");
  assert.ok(serverAuthSource.includes("export async function requirePermission"));
  assert.ok(serverAuthSource.includes("export class UnauthorizedError"));
  assert.ok(serverAuthSource.includes("export class ForbiddenError"));
  assert.ok(serverAuthSource.includes("logSecurityAudit"));
  assert.ok(serverAuthSource.includes("account_disabled_or_banned"));
  assert.ok(serverAuthSource.includes("branch_scope_violation"));
  assert.ok(serverAuthSource.includes("department_scope_violation"));
  assert.ok(serverAuthSource.includes("missing_required_permission"));
});

test("email-functions: protect all endpoints with granular permissions and audit logging", () => {
  const emailFnSource = readFileSync("src/lib/email/functions.ts", "utf8");
  assert.ok(emailFnSource.includes('requirePermission(context, "email.settings", "read")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.settings", "update")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.test", "update")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.logs", "read")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.logs", "resend")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.templates", "read")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.templates", "update")'));
  assert.ok(emailFnSource.includes('requirePermission(context, "email.dispatch", "create")'));
  assert.ok(emailFnSource.includes('eventType: "sensitive_config_changed"'));
});

test("permissions-functions: enforce /permissions authorization and audit logging", () => {
  const permFnSource = readFileSync("src/lib/permissions.functions.ts", "utf8");
  assert.ok(permFnSource.includes('requirePermission(context, "/permissions", "read")'));
  assert.ok(permFnSource.includes('requirePermission(context, "/permissions", "update")'));
  assert.ok(permFnSource.includes('eventType: "user_created"'));
  assert.ok(permFnSource.includes('eventType: "role_changed"'));
  assert.ok(permFnSource.includes('eventType: "account_disabled"'));
  assert.ok(permFnSource.includes('eventType: "group_changed"'));
});
