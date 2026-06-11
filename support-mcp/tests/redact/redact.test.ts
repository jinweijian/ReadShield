import test from "node:test";
import assert from "node:assert/strict";
import { Redactor } from "../../cmd/support-mcpd/src/redact/redact.js";

test("redacts private keys and common secrets in strings", () => {
  const redactor = new Redactor();
  const input = [
    "password=plain-text",
    "token: abcdef",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "super-secret-body",
    "-----END OPENSSH PRIVATE KEY-----",
    "mobile 13800138000"
  ].join("\n");

  const output = redactor.apply(input);

  assert.match(output, /password=\*\*\*/);
  assert.match(output, /token=\*\*\*/);
  assert.match(output, /<private_key_masked>/);
  assert.match(output, /<mobile_masked>/);
  assert.doesNotMatch(output, /super-secret-body/);
  assert.doesNotMatch(output, /13800138000/);
});

test("redacts nested structured rows without mutating original input", () => {
  const redactor = new Redactor();
  const row = { user: "alice", credential: { api_token: "live-token", note: "ok" } };

  const output = redactor.applyToValue(row);

  assert.deepEqual(output, { user: "alice", credential: { api_token: "***", note: "ok" } });
  assert.deepEqual(row, { user: "alice", credential: { api_token: "live-token", note: "ok" } });
});
