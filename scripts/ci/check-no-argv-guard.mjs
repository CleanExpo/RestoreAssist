#!/usr/bin/env node
// CLI entry. It always runs main(); there is no main-module check here, which
// is the very thing this gate forbids (RA-7785).
//
//   node scripts/ci/check-no-argv-guard.mjs [--root <repo-root>]
//
// Detector: scripts/ci/lib/no-argv-guard.mjs.
import { main } from "./lib/no-argv-guard.mjs";

const code = main();
// Exit once main() has returned and stdio has flushed. An idle pg pool or a
// request left pending by a failed sibling must not hold the CLI open, and
// main() awaits all of its own work before it returns (RA-7785).
await new Promise((resolve) => process.stdout.write("", resolve));
await new Promise((resolve) => process.stderr.write("", resolve));
process.exit(code);
