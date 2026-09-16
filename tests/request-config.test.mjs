import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REQUEST_TYPES,
  parseRequestConfigs,
  serializeRequestConfigs,
  splitApprovalChain,
  validateRequestConfig,
} from "../src/lib/request-config.mjs";

const valid = (overrides = {}) => ({
  ...DEFAULT_REQUEST_TYPES[0],
  approval_chain: [...DEFAULT_REQUEST_TYPES[0].approval_chain],
  ...overrides,
});

test("defaults contain usable request workflows", () => {
  assert.equal(DEFAULT_REQUEST_TYPES.length, 5);
  assert.ok(DEFAULT_REQUEST_TYPES.every((item) => item.approval_chain.length > 0));
  assert.ok(DEFAULT_REQUEST_TYPES.every((item) => item.max_sla_hours > 0));
});

test("validation normalizes codes and rejects unsafe or incomplete values", () => {
  const result = validateRequestConfig(valid({ code: " req-custom ", name: " طلب مخصص " }));
  assert.equal(result.ok, true);
  assert.equal(result.value.code, "REQ-CUSTOM");
  assert.equal(result.value.name, "طلب مخصص");

  assert.equal(validateRequestConfig(valid({ code: "x" })).ok, false);
  assert.equal(validateRequestConfig(valid({ max_sla_hours: 0 })).ok, false);
  assert.equal(validateRequestConfig(valid({ approval_chain: [] })).ok, false);
  assert.equal(validateRequestConfig(valid({ category: "غير معروف" })).ok, false);
});

test("parser fails closed to defaults for malformed or empty saved settings", () => {
  const empty = parseRequestConfigs("");
  assert.equal(empty.source, "defaults");
  assert.equal(empty.configs.length, 5);

  const malformed = parseRequestConfigs("{not-json");
  assert.equal(malformed.source, "defaults");
  assert.equal(malformed.invalidCount, 1);
  assert.equal(malformed.configs.length, 5);
});

test("parser keeps valid records while counting invalid and duplicate records", () => {
  const payload = JSON.stringify([
    valid({ id: "req-a", code: "REQ-A" }),
    valid({ id: "req-a", code: "REQ-DUPLICATE-ID" }),
    { ...valid({ id: "req-b", code: "REQ-B" }), max_sla_hours: 9999 },
  ]);
  const parsed = parseRequestConfigs(payload);
  assert.equal(parsed.source, "saved");
  assert.equal(parsed.configs.length, 1);
  assert.equal(parsed.invalidCount, 2);
});

test("serializer rejects duplicates and preserves normalized workflow data", () => {
  assert.throws(() => serializeRequestConfigs([]));
  assert.throws(() => serializeRequestConfigs([valid({ id: "req-a", code: "REQ-A" }), valid({ id: "req-a", code: "REQ-B" })]));

  const serialized = serializeRequestConfigs([valid({ id: "req-a", code: "req-a" })]);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed[0].code, "REQ-A");
  assert.deepEqual(parsed[0].approval_chain, DEFAULT_REQUEST_TYPES[0].approval_chain);
});

test("approval chain input accepts Arabic commas/new lines and removes duplicates", () => {
  assert.deepEqual(splitApprovalChain("المدير المباشر، الموارد البشرية\nالمدير المباشر"), ["المدير المباشر", "الموارد البشرية"]);
  assert.deepEqual(splitApprovalChain(""), ["المدير المباشر", "الموارد البشرية"]);
});
