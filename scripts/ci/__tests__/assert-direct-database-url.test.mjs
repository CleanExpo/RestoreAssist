import assert from "node:assert/strict";
import test from "node:test";

import { assertDirectDatabaseUrl } from "../../assert-direct-database-url.mjs";

const HOST = "db.udooysjajglluvuxkijp.supabase.co";
const DATABASE = "postgres";
const SCHEMA = "public";

function assertUrl(url) {
  return assertDirectDatabaseUrl(url, HOST, DATABASE, SCHEMA);
}

test("accepts the exact direct Supabase host on 5432", () => {
  assert.doesNotThrow(() =>
    assertUrl(`postgresql://user:pass@${HOST}:5432/postgres`),
  );
});

test("rejects poolers on any port or host", () => {
  for (const url of [
    "postgresql://user:pass@transaction-pooler.example:6543/postgres",
    "postgresql://user:pass@transaction-pooler.example:6432/postgres",
    "postgresql://user:pass@transaction-pooler.example:5432/postgres",
    `postgresql://user:pass@${HOST}:6432/postgres`,
  ]) {
    assert.throws(() => assertUrl(url));
  }
});

test("does not mistake a password containing 6543 for the port", () => {
  assert.doesNotThrow(() =>
    assertUrl(`postgresql://user:abc%3A6543%2Fdef@${HOST}:5432/postgres`),
  );
});

test("rejects query parameters that override the parsed connection identity", () => {
  for (const parameter of [
    "host=transaction-pooler.example",
    "hostaddr=127.0.0.1",
    "port=6432",
    "dbname=decoy",
    "database=decoy",
    "user=decoy",
    "password=decoy",
    "service=decoy",
  ]) {
    assert.throws(() =>
      assertUrl(`postgresql://user:pass@${HOST}:5432/postgres?${parameter}`),
    );
  }
});

test("rejects the wrong database, schema, connection options and duplicate keys", () => {
  for (const url of [
    `postgresql://user:pass@${HOST}:5432/decoy`,
    `postgresql://user:pass@${HOST}:5432/postgres?schema=decoy`,
    `postgresql://user:pass@${HOST}:5432/postgres?options=--search_path%3Ddecoy`,
    `postgresql://user:pass@${HOST}:5432/postgres?schema=public&schema=decoy`,
    `postgresql://user:pass@${HOST}:5432/postgres?Schema=decoy`,
  ]) {
    assert.throws(() => assertUrl(url));
  }
  assert.doesNotThrow(() =>
    assertUrl(`postgresql://user:pass@${HOST}:5432/postgres?schema=public&sslmode=require`),
  );
});
