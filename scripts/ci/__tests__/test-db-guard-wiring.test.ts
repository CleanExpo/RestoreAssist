/**
 * The test database guard is wired in, and stays wired in (slice 2a,
 * acceptance 4 and 5). Runs in the ordinary unit suite, so a guard that is
 * unregistered or made inert fails a PR.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const GUARD = "config/vitest.db-guard.ts";
const FIXTURE = "scripts/__tests__/db-guard-fixture.test.ts";
const REMOTE = "postgresql://leakuser:leakpass-SENTINEL@db.example.invalid:5432/x";
const VITEST_BIN = join(ROOT, "node_modules", ".bin", "vitest");

type GuardState = { refusals: number };
const guardState = () => (globalThis as { __testDbGuardState?: GuardState }).__testDbGuardState;

/** A test that provokes a refusal on purpose acknowledges it, or the file fails. */
function acknowledgeRefusals(n: number) {
  const s = guardState();
  expect(s, "the guard setup file did not run").toBeDefined();
  s!.refusals -= n;
}

function vitestConfigs(): string[] {
  return execFileSync("git", ["ls-files", "*vitest.config.*"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/^(?:node_modules|mobile|packages)\//.test(f));
}

function childRun(config: string, env: Record<string, string>) {
  return spawnSync(VITEST_BIN, ["run", "--config", config, FIXTURE], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
}

describe("test database guard: registration", () => {
  it("every repo vitest config registers the guard as a setup file", async () => {
    const configs = vitestConfigs();
    expect(configs).toEqual(expect.arrayContaining(["config/vitest.config.js", "scripts/__tests__/vitest.config.ts"]));
    for (const file of configs) {
      const mod = await import(pathToFileURL(join(ROOT, file)).href);
      const setupFiles = [mod.default?.test?.setupFiles ?? []].flat().map(String);
      expect(setupFiles.some((f) => f.endsWith(GUARD)), `${file} does not register ${GUARD}`).toBe(true);
    }
  });
});

describe("test database guard: a child run under each config", () => {
  for (const config of ["config/vitest.config.js", "scripts/__tests__/vitest.config.ts"]) {
    it(`${config}: a remote DATABASE_URL fails the file before any body runs`, () => {
      const marker = join(mkdtempSync(join(tmpdir(), "db-guard-")), "marker");
      const run = childRun(config, { DATABASE_URL: REMOTE, DB_GUARD_FIXTURE: "sentinel", DB_GUARD_MARKER: marker });
      const output = run.stdout + run.stderr;
      expect(run.status, output.slice(-2000)).not.toBe(0);
      expect(output).toContain("test database guard refused: DATABASE_URL");
      expect(existsSync(marker), "a test body ran").toBe(false);
      expect(output).not.toContain("leakpass-SENTINEL");
    }, 150_000);

    it(`${config}: a refusal a test catches still fails the file`, () => {
      const run = childRun(config, { DB_GUARD_FIXTURE: "swallow", DB_GUARD_REMOTE_HOST: "db.example.invalid" });
      const output = run.stdout + run.stderr;
      expect(run.status, output.slice(-2000)).not.toBe(0);
      expect(output).toContain("test database guard refused 1 connection(s) in this file");
      expect(output).not.toContain("leakpass-SENTINEL");
    }, 150_000);
  }
});

describe("test database guard: late fills and late connections", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  // Skipped only on a DB run (a real URL is set); with no URL the pin must hold.
  it.skipIf(!!process.env.DATABASE_URL)("a .env loaded after setup cannot fill DATABASE_URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "db-guard-env-"));
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${REMOTE}\nDIRECT_URL=${REMOTE}\n`);
    const { config } = await import("dotenv");
    config({ path: join(dir, ".env"), override: false, quiet: true });
    expect(process.env.DATABASE_URL).toBe("");
    expect(process.env.DIRECT_URL).toBe("");
  });

  it("a raw pg connection to a remote host is refused by the guard, not by DNS", async () => {
    const pool = new pg.Pool({ connectionString: REMOTE });
    const outcome = await pool.connect().catch((error: unknown) => error);
    await pool.end().catch(() => null);
    expect(String(outcome)).toContain("test database guard refused");
    expect(String(outcome)).not.toContain("leakpass-SENTINEL");
    acknowledgeRefusals(1);
  });

  it("the app's own pool refuses a remote URL under the guard, and only under the guard", async () => {
    const g = globalThis as {
      prisma?: unknown;
      pgPool?: { end(): Promise<void> };
      __testDbGuard?: (connectionString: string) => void;
    };
    const kept = { prisma: g.prisma, pgPool: g.pgPool, guard: g.__testDbGuard };
    try {
      process.env.DATABASE_URL = REMOTE;
      g.prisma = undefined;
      g.pgPool = undefined;
      vi.resetModules();
      const { prisma } = await import("@/lib/prisma");
      expect(() => (prisma as unknown as Record<string, unknown>).user).toThrow(
        /test database guard refused: DATABASE_URL host is not local/,
      );
      acknowledgeRefusals(1);

      // As in production: no setup file ran, so no hook exists.
      delete g.__testDbGuard;
      g.prisma = undefined;
      g.pgPool = undefined;
      vi.resetModules();
      const outside = await import("@/lib/prisma");
      // Builds the client and pool without connecting: no guard without the hook.
      expect(() => (outside.prisma as unknown as Record<string, unknown>).user).not.toThrow();
      await g.pgPool?.end().catch(() => null);
    } finally {
      g.__testDbGuard = kept.guard;
      g.prisma = kept.prisma;
      g.pgPool = kept.pgPool;
      vi.resetModules();
    }
  });
});
