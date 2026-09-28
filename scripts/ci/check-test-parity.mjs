#!/usr/bin/env node
/**
 * RestoreAssist - CI test-parity guard (CLI entry).
 *
 * Always scans. This file does not check how it was invoked. A symlink or
 * wrapper whose path does not end in this filename must still run the guard.
 * Skipping the scan in that case prints nothing and exits 0, which is a
 * fail-open gate.
 *
 * The scan itself lives in scripts/ci/lib/test-parity.mjs.
 *
 * Usage:  node scripts/ci/check-test-parity.mjs [--strict] [--changed] [--json]
 *         npm run test:parity
 */
import { main } from "./lib/test-parity.mjs";

await main();
