/**
 * Boot guard (RA-7942): a production server refuses to boot when a migration
 * in this revision has not been applied to its database.
 *
 * THE FAULT THIS EXISTS FOR
 *   8 Oct, 6 Nov and 17 Nov 2026: code merged to main and went live before its
 *   migration was applied. On 17 Nov the new code ran for about six minutes
 *   against a database without its columns. Nothing in build or boot applies
 *   migrations (on purpose), and nothing stopped new code going live without
 *   them.
 *
 * WHAT IT DOES
 *   Before the server takes a request it lists this revision's migration
 *   folders, reads the migration ledger with one SELECT, and exits non-zero
 *   when a folder has no applied ledger row. The new deployment then never
 *   becomes healthy.
 *
 * WHAT IT DOES NOT DO
 *   It never applies, resolves or rolls back a migration and sends no write.
 *   Applying migrations stays a separately approved step.
 *
 * NOT AN EQUALITY CHECK
 *   Migrations are applied before the code that needs them, so the running
 *   older revision must keep booting against a database that is ahead of it.
 *   Extra ledger rows are fine; only a missing one refuses.
 *
 * UNREADABLE IS NOT A PASS
 *   If the folder or the ledger cannot be read after a few tries the server
 *   also refuses, with a different exit code, because "could not check" must
 *   not look like "checked and fine". Cost: a container that restarts while
 *   the database is briefly unreachable exits and is restarted by the
 *   platform, instead of booting and serving errors until the database
 *   returns.
 *
 * WHERE IT RUNS
 *   Long-running production Node servers only (both `next start` and the
 *   standalone `node server.js`), from instrumentation.ts. Not on Vercel:
 *   there a function cold start has no previous deployment to fall back to,
 *   so exiting would turn a partly broken site into a wholly broken one.
 */
import { lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyMigrationLedger,
  type MigrationAttempt,
} from "./migration-ledger";

export const BOOT_GUARD_EXIT = Object.freeze({
  /** sysexits EX_TEMPFAIL: could not check. */
  LEDGER_UNREADABLE: 75,
  /** sysexits EX_CONFIG: checked, and a migration is missing. */
  MIGRATION_MISSING: 78,
});

export type BootGuardResult =
  | { ok: true; revisionCount: number }
  | {
      ok: false;
      exitCode: number;
      reason: string;
      missing?: string[];
    };

export interface BootGuardOptions {
  /** Returns every row of the migration ledger. Must only read. */
  readLedger: () => Promise<readonly MigrationAttempt[]>;
  root?: string;
  attempts?: number;
  delayMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export function shouldEnforceBootGuard(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.NEXT_RUNTIME === "nodejs" &&
    env.NODE_ENV === "production" &&
    !env.VERCEL &&
    env.NEXT_PHASE !== "phase-production-build"
  );
}

/**
 * Migration folder names in this revision. Same population as
 * scripts/ci/expected-migration-ledger.mjs (real directories, no symlinks);
 * a test holds the two counts equal.
 */
export function revisionMigrationNames(root: string = process.cwd()): string[] {
  const directory = resolve(root, "prisma", "migrations");
  const names = readdirSync(directory)
    .filter((name) => {
      const stat = lstatSync(resolve(directory, name));
      return stat.isDirectory() && !stat.isSymbolicLink();
    })
    .sort();
  if (names.length === 0) {
    throw new Error("this revision has no migration folders");
  }
  return names;
}

export async function checkRevisionMigrations(
  options: BootGuardOptions,
): Promise<BootGuardResult> {
  const {
    readLedger,
    root = process.cwd(),
    attempts = 3,
    delayMs = 3_000,
    log = (line: string) => console.error(line),
    sleep = (ms: number) =>
      new Promise<void>((done) => {
        setTimeout(done, ms);
      }),
  } = options;

  let revision: string[];
  try {
    revision = revisionMigrationNames(root);
  } catch (error) {
    return {
      ok: false,
      exitCode: BOOT_GUARD_EXIT.LEDGER_UNREADABLE,
      reason: `could not list this revision's migrations: ${errorName(error)}`,
    };
  }

  let rows: readonly MigrationAttempt[] | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rows = await readLedger();
      break;
    } catch (error) {
      lastError = error;
      log(
        `[boot-guard] could not read the migration ledger (try ${attempt} of ${attempts}): ${errorName(error)}`,
      );
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  if (rows === undefined) {
    return {
      ok: false,
      exitCode: BOOT_GUARD_EXIT.LEDGER_UNREADABLE,
      reason: `could not read the migration ledger after ${attempts} tries: ${errorName(lastError)}`,
    };
  }

  const applied = new Set(classifyMigrationLedger(rows).applied);
  const missing = revision.filter((name) => !applied.has(name));
  if (missing.length > 0) {
    return {
      ok: false,
      exitCode: BOOT_GUARD_EXIT.MIGRATION_MISSING,
      reason: `${missing.length} of ${revision.length} migrations in this revision are not applied to this database`,
      missing,
    };
  }
  return { ok: true, revisionCount: revision.length };
}

export async function assertRevisionMigrationsApplied(
  options: BootGuardOptions & { exit?: (code: number) => void },
): Promise<void> {
  const log = options.log ?? ((line: string) => console.error(line));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const result = await checkRevisionMigrations({ ...options, log });
  if (result.ok) {
    log(
      `[boot-guard] PASS: all ${result.revisionCount} migrations in this revision are applied`,
    );
    return;
  }
  log(`[boot-guard] REFUSING TO BOOT: ${result.reason}`);
  if (result.missing) {
    for (const name of result.missing.slice(0, 20)) {
      log(`[boot-guard]   not applied: ${name}`);
    }
    log(
      "[boot-guard] Nothing was changed. The previous deployment should still be serving.",
    );
    log(
      "[boot-guard] Owner step: apply the approved migrations (scripts/ops/production-migrate-deploy.sh), then redeploy this revision. Applying alone does not redeploy it.",
    );
  } else {
    log(
      "[boot-guard] Could not check is not a pass. Fix database reachability, then redeploy or restart.",
    );
  }
  exit(result.exitCode);
}

function errorName(error: unknown): string {
  // Name and code only: a driver message can carry a connection string.
  if (error && typeof error === "object") {
    const { name, code } = error as { name?: unknown; code?: unknown };
    const parts = [name, code].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) return parts.join(" ");
  }
  return "Error";
}
