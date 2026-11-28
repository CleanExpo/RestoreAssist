#!/usr/bin/env node
/**
 * CLI entry for the nexus/release-receipt verdict. Always runs `main()`: no
 * import.meta.url / argv guard (RA-7785). Logic: ./lib.mjs.
 *
 * CODEX_EXIT must be set to exactly "0" for a success; unset is a failure.
 * What is printed carries fixed wording and counts only, never verdict text.
 *
 *   node scripts/ci/nexus-receipt/verdict.mjs <verdict.json>
 *   node scripts/ci/nexus-receipt/verdict.mjs --comment <verdict.json> <sha> <runUrl>
 *   node scripts/ci/nexus-receipt/verdict.mjs --scrub <verdict.json> [auth.json]
 */
import { main } from './lib.mjs';

const code = main();
await new Promise((resolve) => process.stdout.write('', resolve));
await new Promise((resolve) => process.stderr.write('', resolve));
process.exit(code);
