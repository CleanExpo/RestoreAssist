import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExpectedLogicalIdentity,
  fingerprintIdentity,
} from "../../verify-database-identity.mjs";

test("database fingerprint is stable for the same logical database/schema", () => {
  const identity = {
    database_name: "postgres",
    schema_name: "public",
    instance_sentinel: "11111111-1111-4111-8111-111111111111",
    server_address: "10.0.0.7",
    server_port: 5432,
  };
  assert.equal(fingerprintIdentity(identity), fingerprintIdentity({ ...identity }));
});

test("direct and pooled URLs share a logical database fingerprint despite endpoint topology", () => {
  const direct = fingerprintIdentity({
    database_name: "postgres",
    schema_name: "public",
    instance_sentinel: "11111111-1111-4111-8111-111111111111",
    server_address: "10.0.0.7",
    server_port: 5432,
  });
  const runtime = fingerprintIdentity({
    database_name: "postgres",
    schema_name: "public",
    instance_sentinel: "11111111-1111-4111-8111-111111111111",
    server_address: "aws-0-ap-southeast-2.pooler.supabase.com",
    server_port: 6543,
  });
  assert.equal(direct, runtime);
});

test("database fingerprint rejects missing logical identity fields even when endpoint fields exist", () => {
  assert.throws(() =>
    fingerprintIdentity({ database_name: "postgres", schema_name: "", instance_sentinel: "11111111-1111-4111-8111-111111111111", server_address: "10.0.0.7", server_port: 5432 }),
  );
  assert.throws(() =>
    fingerprintIdentity({ database_name: "postgres", schema_name: "public" }),
  );
});

test("database fingerprint changes for a different database, schema, or instance sentinel", () => {
  const base = { database_name: "postgres", schema_name: "public", instance_sentinel: "11111111-1111-4111-8111-111111111111", server_address: "10.0.0.7", server_port: 5432 };
  assert.notEqual(fingerprintIdentity(base), fingerprintIdentity({ ...base, database_name: "decoy" }));
  assert.notEqual(fingerprintIdentity(base), fingerprintIdentity({ ...base, schema_name: "decoy" }));
  assert.notEqual(
    fingerprintIdentity(base),
    fingerprintIdentity({ ...base, instance_sentinel: "22222222-2222-4222-8222-222222222222" }),
  );
});

test("expected logical identity fails closed for the wrong database or schema", () => {
  const expected = ["postgres", "public"];
  for (const identity of [
    { database_name: "decoy", schema_name: "public", instance_sentinel: "11111111-1111-4111-8111-111111111111" },
    { database_name: "postgres", schema_name: "decoy", instance_sentinel: "11111111-1111-4111-8111-111111111111" },
  ]) {
    assert.throws(
      () => assertExpectedLogicalIdentity(identity, ...expected, "DATABASE_URL"),
      /wrong canonical database or schema/,
    );
  }
});
