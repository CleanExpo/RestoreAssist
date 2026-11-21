#!/usr/bin/env node
// CLI entry. It always runs main(); there is no main-module check here, which
// is the very thing this gate forbids (RA-7785).
//
//   node scripts/ci/check-no-argv-guard.mjs [--root <repo-root>]
//
// Detector: scripts/ci/lib/no-argv-guard.mjs.
import { main } from "./lib/no-argv-guard.mjs";

process.exitCode = main();
