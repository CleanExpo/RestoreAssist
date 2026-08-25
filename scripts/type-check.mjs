#!/usr/bin/env node
/**
 * RestoreAssist - cross-platform type-check runner.
 *
 * The package script used to be:
 *
 *   "type-check": "NODE_OPTIONS=\"--max-old-space-size=8192\" tsc --noEmit"
 *
 * That POSIX env-var prefix is parsed by sh, but npm runs scripts through
 * cmd.exe on Windows, which reports:
 *
 *   'NODE_OPTIONS' is not recognized as an internal or external command
 *
 * and exits 1 WITHOUT EVER RUNNING tsc. The gate therefore reported FAIL on
 * Windows for a shell-parsing reason, never a type reason - a control that
 * cannot report the thing it exists to report. A permanently red gate is worse
 * than a missing one: it trains every reader to dismiss a red result.
 *
 * This runner spawns the TypeScript compiler entry point with node directly,
 * passing NODE_OPTIONS through the child environment rather than the shell, so
 * the heap setting survives on every platform. No shell is involved and no new
 * dependency is introduced.
 *
 * Any extra arguments are forwarded to tsc, so `node scripts/type-check.mjs
 * --pretty false` works.
 *
 * Usage:  node scripts/type-check.mjs [...tsc args]
 *         npm run type-check
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

const HEAP_FLAG = "--max-old-space-size=8192";

let tscEntry;
try {
  tscEntry = require.resolve("typescript/bin/tsc");
} catch {
  console.error(
    "type-check: cannot resolve 'typescript/bin/tsc'. Run `npm ci` first.",
  );
  process.exit(1);
}

// tsconfig.json sets `incremental: true`, so tsc reuses tsconfig.tsbuildinfo
// and skips files the working tree has not touched. That makes a local
// type-check able to report exit 0 on a tree that fails from scratch.
//
// It is not theoretical. On 2026-08-25 two errors reached main this way:
//
//   app/api/properties/scrape/route.ts(289,13)  TS2352
//   app/api/workspace/settings/route.ts(136,7)  TS2322
//
// Nobody saw them locally because their run reused the cache. CI has no
// cache, so CI found them after they had already landed, and Quality Checks
// was red on every PR until #2040 fixed them.
//
// This gate exists to answer "does this tree type-check", so it deletes the
// cache first and answers that question honestly. It costs a full check
// (~90s here) every run. That is the price of a green that means something —
// the same reasoning as UNI-2618, where a build was configured not to look.
//
// The incremental cache is still useful for editors and inner-loop work;
// nothing stops `npx tsc --noEmit` being run directly. What is removed is the
// possibility of the GATE reporting green off a stale file.
//
// Pass --keep-cache to skip the deletion when you deliberately want the fast
// incremental behaviour and understand the result is not authoritative.
const KEEP_CACHE_FLAG = "--keep-cache";
const forwardedArgs = process.argv.slice(2).filter((a) => a !== KEEP_CACHE_FLAG);
const keepCache = process.argv.slice(2).includes(KEEP_CACHE_FLAG);

if (keepCache) {
  console.warn(
    "type-check: --keep-cache set; reusing tsconfig.tsbuildinfo. This result is NOT authoritative.",
  );
} else {
  // tsBuildInfoFile is not set in tsconfig.json, so tsc writes the default
  // sibling of the config. If that ever changes, this needs to change with it.
  const buildInfo = join(process.cwd(), "tsconfig.tsbuildinfo");
  try {
    rmSync(buildInfo, { force: true });
  } catch (err) {
    // Not fatal on its own, but say so loudly: a check that silently kept a
    // stale cache is exactly the failure this code exists to prevent.
    console.warn(
      `type-check: could not remove ${buildInfo} (${err.message}); result may be incremental.`,
    );
  }
}

// Append rather than overwrite: a caller may already have set NODE_OPTIONS
// (CI runners commonly do) and clobbering it would silently drop their flags.
const nodeOptions = [process.env.NODE_OPTIONS, HEAP_FLAG]
  .filter(Boolean)
  .join(" ");

const result = spawnSync(
  process.execPath,
  [tscEntry, "--noEmit", ...forwardedArgs],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  },
);

if (result.error) {
  console.error(`type-check: failed to start tsc - ${result.error.message}`);
  process.exit(1);
}

// A process killed by a signal reports status null; treat that as failure so a
// terminated compiler can never be read as a clean type-check.
process.exit(result.status ?? 1);
