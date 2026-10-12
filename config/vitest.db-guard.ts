/**
 * Test database guard (slice 2a). Runs before every test file under every repo
 * vitest config that can collect a DB-gated suite.
 *
 * 1. Refuses the file when the environment can reach a non-local Postgres.
 * 2. When no Postgres key is set, pins DATABASE_URL and DIRECT_URL to "" so a
 *    module that loads a .env later (dotenv skips keys already present) cannot
 *    fill them. Suites still skip: "" is falsy.
 * 3. Checks every pg connection as it opens (pg's resolved host, after
 *    `?host=` and PGHOST), so a URL changed after setup, or a module that
 *    builds its own Pool, is refused where it would do damage. A refusal is
 *    counted, and the file fails in afterAll even if a caller caught it.
 * 4. On a DB run, refuses a generated Prisma client built from another schema
 *    (worktrees can share one node_modules).
 *
 * Output never contains a URL: a refused value is usually a production URL
 * with its password in it.
 */
import { afterAll } from "vitest";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  LOCAL_HOSTS,
  LocalTestDatabaseError,
  assertLocalConnectionString,
  assertLocalTestDatabase,
  localHostOf,
} from "../scripts/ci/assert-local-test-db.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type GuardState = { refusals: number; marked: boolean; wrapped: boolean };
const g = globalThis as typeof globalThis & {
  __testDbGuardState?: GuardState;
  __testDbGuard?: (connectionString: string) => void;
};
const state: GuardState = (g.__testDbGuardState ??= { refusals: 0, marked: false, wrapped: false });

function refuse(message: string): LocalTestDatabaseError {
  state.refusals += 1;
  console.error(`[test-db-guard] ${message}`);
  return new LocalTestDatabaseError(message);
}

// 1. The environment as this file starts.
assertLocalTestDatabase(process.env);

// 2. Pin the keys when nothing is set.
if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  process.env.DATABASE_URL = "";
  process.env.DIRECT_URL = "";
} else if (!state.marked) {
  state.marked = true;
  console.error(`test-db-guard: DATABASE_URL host=${localHostOf(process.env.DATABASE_URL ?? "")} ok`);
}

// 3. Every connection as it opens. lib/prisma.ts calls __testDbGuard too.
g.__testDbGuard = (connectionString: string) => {
  try {
    assertLocalConnectionString(connectionString, "DATABASE_URL");
  } catch (error) {
    if (error instanceof LocalTestDatabaseError) throw refuse(error.message);
    throw error;
  }
};
if (!state.wrapped) {
  state.wrapped = true;
  const proto = pg.Client.prototype as unknown as {
    connect: (...args: unknown[]) => unknown;
    host?: string;
  };
  const connect = proto.connect;
  proto.connect = function (this: { host?: string }, ...args: unknown[]) {
    const host = String(this.host ?? "").replace(/^\[(.*)\]$/, "$1").toLowerCase();
    if (!LOCAL_HOSTS.has(host)) {
      const shown = host === "" ? "<none>" : host.startsWith("/") ? "<socket>" : "<not shown>";
      const err = refuse(`test database guard refused: a pg connection to a non-local host (host=${shown})`);
      const callback = args.find((a) => typeof a === "function") as ((e: Error) => void) | undefined;
      if (callback) {
        process.nextTick(() => callback(err));
        return undefined;
      }
      return Promise.reject(err);
    }
    return connect.apply(this, args);
  };
}
const refusalsAtStart = state.refusals;
afterAll(() => {
  if (state.refusals > refusalsAtStart) {
    throw new LocalTestDatabaseError(
      `test database guard refused ${state.refusals - refusalsAtStart} connection(s) in this file; ` +
        "see the [test-db-guard] lines above",
    );
  }
});

// 4. On a DB run, the generated client must come from this worktree's schema.
if (process.env.DATABASE_URL) {
  const normalise = (text: string) =>
    text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter((line) => line !== "")
      .join("\n");
  const source = join(repoRoot, "prisma", "schema.prisma");
  const generated = join(repoRoot, "node_modules", ".prisma", "client", "schema.prisma");
  const where = () =>
    `generated=${existsSync(generated) ? realpathSync(generated) : generated} source=${realpathSync(source)}`;
  if (!existsSync(generated)) {
    throw new LocalTestDatabaseError(`no generated Prisma client found; run prisma generate (${where()})`);
  }
  if (normalise(readFileSync(generated, "utf8")) !== normalise(readFileSync(source, "utf8"))) {
    throw new LocalTestDatabaseError(`generated client is from another schema (${where()})`);
  }
}
