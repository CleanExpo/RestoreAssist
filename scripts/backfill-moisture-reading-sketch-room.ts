// CLI entry. It always runs main(): there is deliberately no is-this-the-main-module
// check, because Node resolves a symlink in the module URL but not in the process
// arguments, and such a check silently skips the gate and exits 0 (RA-7785).
// The logic lives in ./lib/backfill-moisture-reading-sketch-room; import that, never this file.
import { main } from "./lib/backfill-moisture-reading-sketch-room";

process.exitCode = await main();
