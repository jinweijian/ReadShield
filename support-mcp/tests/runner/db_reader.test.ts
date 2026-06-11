import test from "node:test";
import assert from "node:assert/strict";
import { parseMysqlBatchOutput } from "../../cmd/support-mcpd/src/runner/db_reader.js";

test("parses mysql batch output into structured rows", () => {
  const output = ["id\tname\tnote", "1\tAlice\thello", "2\tBob\tNULL"].join("\n");

  const result = parseMysqlBatchOutput(output);

  assert.deepEqual(result.columns, ["id", "name", "note"]);
  assert.deepEqual(result.rows, [
    { id: "1", name: "Alice", note: "hello" },
    { id: "2", name: "Bob", note: null }
  ]);
});
