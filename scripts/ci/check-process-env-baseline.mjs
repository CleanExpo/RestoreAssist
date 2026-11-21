#!/usr/bin/env node
// CLI entry for the RA-7784 process-env baseline ratchet. It always runs
// main(): there is deliberately no is-this-the-main-module check, because Node
// resolves a symlink in the module URL but not in the process arguments, and
// such a check silently skips the gate and exits 0 (RA-7785).
// The logic lives in ./lib/process-env-baseline.mjs; import that, never this file.
import { main } from "./lib/process-env-baseline.mjs";

const code = await main(process.argv.slice(2));
// Exit once main() has returned and stdio has flushed, so no open handle can
// hold the CLI open after it has finished (RA-7785).
await new Promise((resolve) => process.stdout.write("", resolve));
await new Promise((resolve) => process.stderr.write("", resolve));
process.exit(code);
