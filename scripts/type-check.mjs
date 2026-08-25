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
import { createRequire } from "node:module";

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

// Append rather than overwrite: a caller may already have set NODE_OPTIONS
// (CI runners commonly do) and clobbering it would silently drop their flags.
const nodeOptions = [process.env.NODE_OPTIONS, HEAP_FLAG]
  .filter(Boolean)
  .join(" ");

const result = spawnSync(
  process.execPath,
  [tscEntry, "--noEmit", ...process.argv.slice(2)],
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
