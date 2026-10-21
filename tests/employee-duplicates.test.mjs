import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEmployee } from "../src/lib/employee-core.mjs";

const existing = [{ id: "a", emp_no: "100", full_name: "أحمد  محمد", national_id: "A12345" }];

test("rejects duplicate employee name", () => {
  const r = validateEmployee({ emp_no: "200", full_name: "أحمد محمد" }, existing);
  assert.equal(r.isValid, false);
  assert.ok(r.errors.full_name.includes("تشابه"));
});

test("rejects duplicate national id", () => {
  const r = validateEmployee({ emp_no: "200", full_name: "خالد", national_id: "A12345" }, existing);
  assert.equal(r.isValid, false);
  assert.ok(r.errors.national_id_duplicate);
});

test("allows editing the same employee", () => {
  const r = validateEmployee({ id: "a", emp_no: "100", full_name: "أحمد محمد", national_id: "A12345" }, existing);
  assert.equal(r.isValid, true);
});
