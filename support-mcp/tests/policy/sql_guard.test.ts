import test from "node:test";
import assert from "node:assert/strict";
import { SqlGuard } from "../../cmd/support-mcpd/src/policy/sql_guard.js";

test("allows readonly select and appends configured limit", () => {
  const guard = new SqlGuard();
  guard.assertReadonlySql("select id, name from users where id = 1");

  assert.equal(
    guard.enforceLimit("select id, name from users where id = 1", 50),
    "select id, name from users where id = 1 LIMIT 50"
  );
});

test("rejects writes, multi statements, and forbidden sensitive tables", () => {
  const guard = new SqlGuard();

  assert.throws(() => guard.assertReadonlySql("update users set name = 'x'"), /sql type forbidden/);
  assert.throws(() => guard.assertReadonlySql("select * from users; select * from orders"), /multi statement/);
  assert.throws(
    () => guard.assertReadonlySql("select * from user_password", ["select"], { forbiddenTables: ["user_password"] }),
    /forbidden table/
  );
});

test("restricts configured schemas when SQL references schema qualified tables", () => {
  const guard = new SqlGuard();

  guard.assertReadonlySql("select * from edu.students", ["select"], { allowedSchemas: ["edu"] });
  assert.throws(
    () => guard.assertReadonlySql("select * from mysql.user", ["select"], { allowedSchemas: ["edu"] }),
    /schema not allowed/
  );
});
