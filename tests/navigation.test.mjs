import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SCREENS } from "../src/lib/screen-catalog.mjs";

test("directory includes every concrete registered route, with no duplicate or dead URL", () => {
  const layouts = new Set(["__root.tsx", "settings.tsx", "staff.tsx", "regulations.tsx"]);
  const expected = readdirSync("src/routes").filter((name) => name.endsWith(".tsx") && !layouts.has(name)).map((name) => {
    const source = readFileSync("src/routes/" + name, "utf8");
    const match = /createFileRoute\("([^"]+)"\)/.exec(source);
    assert.ok(match, "Missing route definition: " + name);
    return match[1] === "/" ? "/" : match[1].replace(/\/$/, "");
  }).sort();
  const actual = SCREENS.map((screen) => screen.path).sort();
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual, expected);
});

test("payroll parent exposes Outlet for its bank-file child route", () => {
  const source = readFileSync("src/routes/payroll.tsx", "utf8");
  assert.ok(source.includes("component: PayrollRoute"));
  assert.ok(source.includes("return <Outlet />"));
});

test("shell avoids nesting and exposes a keyboard-accessible directory", () => {
  const source = readFileSync("src/components/hr/AppShell.tsx", "utf8");
  assert.ok(source.includes("if (nested) return"));
  assert.ok(source.includes("ScreenDirectory"));
  assert.ok(source.includes('event.key.toLowerCase() === "k"'));
  assert.ok(!source.includes('count="٦"'));
});

test("company writes use the checked RPC, with a feature flag and no fake success timer", () => {
  const source = readFileSync("src/routes/settings.company.tsx", "utf8");
  const db = readFileSync("src/lib/company-db.ts", "utf8");
  assert.ok(source.includes("COMPANY_BUSINESS_ENABLED"));
  assert.ok(!source.includes("setSavedSuccess"));
  assert.ok(!source.includes("setTimeout"));
  assert.ok(db.includes('"save_hr_company_profile"'));
  assert.ok(db.includes("p_expected_version"));
  assert.ok(db.includes("p_request_id"));
});

test("foundation SQL contains tenant and history protections (static contract, not DB execution)", () => {
  const sql = readFileSync("supabase/migrations/20260914190000_company_business_foundation.sql", "utf8");
  for (const token of ["hr_can_manage_tenant", "ENABLE ROW LEVEL SECURITY", "p_expected_version", "request_id", "hr_company_versions_immutable", "hr_business_events_immutable"]) {
    assert.ok(sql.includes(token), "Missing protection: " + token);
  }
  assert.ok(!/TO anon, authenticated/.test(sql));
  assert.ok(!/GRANT (?:ALL|INSERT|UPDATE|DELETE)/.test(sql));
});
