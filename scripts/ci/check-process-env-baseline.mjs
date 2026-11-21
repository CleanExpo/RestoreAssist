#!/usr/bin/env node
// CLI entry for the RA-7784 process-env baseline ratchet. It always runs
// main(): no is-this-the-main-module check (RA-7785). Logic lives in
// ./lib/process-env-baseline.mjs.
import { main } from "./lib/process-env-baseline.mjs";

process.exitCode = await main(process.argv.slice(2));
