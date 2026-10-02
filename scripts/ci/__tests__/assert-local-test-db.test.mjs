import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspect } from "node:util";

import {
  LocalTestDatabaseError,
  assertLocalConnectionString,
  assertLocalTestDatabase,
} from "../assert-local-test-db.mjs";

const SCRIPT = fileURLToPath(new URL("../assert-local-test-db.mjs", import.meta.url));
const LOCAL = "postgresql://ci:ci@localhost:5432/ci";
const REMOTE = "postgresql://u:p@db.example.invalid:5432/x";

function refuses(env, name) {
  assert.throws(
    () => assertLocalTestDatabase(env),
    (err) => err instanceof LocalTestDatabaseError && err.message.includes(name),
  );
}

test("refuses every shape that reaches a non-local host", () => {
  const cases = [
    [{ DATABASE_URL: REMOTE }, "DATABASE_URL"],
    [{ DATABASE_URL: LOCAL, DIRECT_URL: REMOTE }, "DIRECT_URL"],
    [{ DATABASE_URL: LOCAL, DIRECT_URL: "postgresql://ci:ci@localhost:5433/ci" }, "DIRECT_URL"],
    [{ SHADOW_DATABASE_URL: REMOTE }, "SHADOW_DATABASE_URL"],
    [{ DATABASE_URL_PROD: REMOTE }, "DATABASE_URL_PROD"],
    [{ SOME_UNRELATED_NAME: REMOTE }, "SOME_UNRELATED_NAME"],
    [{ DATABASE_URL: "postgresql://ci:ci@localhost.evil.example:5432/ci" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://user@localhost@evil.example:5432/ci" }, "DATABASE_URL"],
    [{ DATABASE_URL: `${LOCAL}?host=evil.example` }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://ci:ci@localhost/ci?hostaddr=203.0.113.9" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://ci:ci@/ci?host=evil.example" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql:///ci" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://ci:ci@localhost,evil.example/ci" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgres://u:p@db.example.invalid/x" }, "DATABASE_URL"],
    [{ DATABASE_URL: "   " }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://u:p@[bad" }, "DATABASE_URL"],
    [{ DATABASE_URL: "postgresql://leakpass-SENTINEL/x@db.example.invalid/y" }, "DATABASE_URL"],
    // pg would connect to localhost here, but an `@` after the `/` means the
    // host cannot be read safely in general, so the shape is refused.
    [{ DATABASE_URL: "postgresql://localhost/x@evil.example/y" }, "DATABASE_URL"],
  ];
  for (const [env, name] of cases) refuses(env, name);
});

test("accepts local URLs and an environment with no Postgres at all", () => {
  for (const env of [
    { DATABASE_URL: LOCAL, DIRECT_URL: LOCAL },
    { DATABASE_URL: "postgresql://ci:ci@localhost:5433/ci", DIRECT_URL: "postgresql://ci:ci@localhost:5433/ci" },
    { DATABASE_URL: "postgresql://ci:ci@127.0.0.1:5432/ci" },
    { DATABASE_URL: "postgresql://ci:ci@[::1]:5432/ci" },
    { DATABASE_URL: `${LOCAL}?schema=public` },
    { DATABASE_URL: "", DIRECT_URL: "" },
    { PATH: "/usr/bin", HOME: "/home/ci" },
  ]) {
    assert.doesNotThrow(() => assertLocalTestDatabase(env), JSON.stringify(env));
  }
});

test("assertLocalConnectionString applies the same rules to one string", () => {
  assert.doesNotThrow(() => assertLocalConnectionString(LOCAL));
  assert.throws(() => assertLocalConnectionString(`${LOCAL}?host=evil.example`), LocalTestDatabaseError);
});

const LEAKS = [
  "postgresql://leakuser:leakpass-SENTINEL@db.example.invalid/x",
  "postgresql://leakuser:leakpass-SENTINEL@[bad",
  "postgresql://leakpass-SENTINEL/x@db.example.invalid/y",
  "postgresql://leakuser:12345/leakpass-SENTINEL@db.example.invalid/x",
];

test("never prints the credential, in the error or on the shell path", () => {
  for (const url of LEAKS) {
    let err;
    try {
      assertLocalTestDatabase({ DATABASE_URL: url });
    } catch (caught) {
      err = caught;
    }
    assert.ok(err instanceof LocalTestDatabaseError, url);
    const shown = inspect(err, { depth: null }) + String(err);
    assert.ok(!shown.includes("leakpass-SENTINEL"), `password shown for ${url}`);
    assert.ok(!shown.includes("leakuser"), `user shown for ${url}`);

    const run = spawnSync(process.execPath, [SCRIPT], {
      env: { PATH: process.env.PATH, DATABASE_URL: url },
      encoding: "utf8",
    });
    assert.equal(run.status, 1, url);
    assert.match(run.stderr, /test database guard refused: DATABASE_URL/);
    assert.ok(!(run.stderr + run.stdout).includes("leakpass-SENTINEL"), `shell leak for ${url}`);
    assert.ok(!(run.stderr + run.stdout).includes("leakuser"), `shell user leak for ${url}`);
  }
});

test("the shell entry point passes a local environment", () => {
  const run = spawnSync(process.execPath, [SCRIPT], {
    env: { PATH: process.env.PATH, DATABASE_URL: LOCAL, DIRECT_URL: LOCAL },
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
});
