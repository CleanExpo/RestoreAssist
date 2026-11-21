// CLI entry. It always runs main(): there is deliberately no is-this-the-main-module
// check, because Node resolves a symlink in the module URL but not in the process
// arguments, and such a check silently skips the gate and exits 0 (RA-7785).
// The logic lives in ./lib/a1-core-journeys; import that, never this file.
import { main } from "./lib/a1-core-journeys";

const code = await main();
// Exit once main() has returned and stdio has flushed. An idle pg pool or a
// request left pending by a failed sibling must not hold the CLI open, and
// main() awaits all of its own work before it returns (RA-7785).
await new Promise((resolve) => process.stdout.write("", resolve));
await new Promise((resolve) => process.stderr.write("", resolve));
process.exit(code);
