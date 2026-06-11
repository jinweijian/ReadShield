import test from "node:test";
import assert from "node:assert/strict";
import { shellQuote } from "../../cmd/support-mcpd/src/runner/ssh_runner.js";

test("shellQuote wraps values and escapes single quotes", () => {
  assert.equal(shellQuote("plain"), "'plain'");
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
