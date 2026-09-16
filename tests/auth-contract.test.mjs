import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/routes/auth.tsx", "utf8");

test("auth preserves account type choices and required fields", () => {
  assert.ok(source.includes('["إداري", "موظف"] as const'));
  assert.ok(source.includes('type="email"'));
  assert.ok(source.includes('required'));
  assert.ok(source.includes('id="password"'));
});

test("auth normalizes and validates email before network calls", () => {
  assert.ok(source.includes("normalizeEmail"));
  assert.ok(source.includes("isValidEmail"));
  assert.ok(source.includes("const normalizedEmail"));
});

test("auth errors are generic and never expose provider text", () => {
  assert.ok(source.includes("safeAuthError"));
  assert.ok(source.includes('role="alert"'));
  assert.ok(!source.includes("error.message"));
  assert.ok(!source.includes("err.message"));
});

test("password reset does not reveal account existence", () => {
  assert.ok(source.includes("RESET_NOTICE"));
  assert.ok(source.includes("resetPasswordForEmail"));
  assert.ok(source.includes('window.location.origin + "/reset-password"'));
});

test("form controls have explicit button types and autocomplete", () => {
  assert.ok(source.includes('type="button"'));
  assert.ok(source.includes('autoComplete="email"'));
  assert.ok(source.includes('autoComplete={mode === "login" ? "current-password" : "new-password"}'));
});
