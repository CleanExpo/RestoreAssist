#!/usr/bin/env node
/**
 * CLI entry for the Codex sandbox that the nexus/release-receipt review runs in
 * (RA-8676). Always runs `main()`: no import.meta.url / argv guard (RA-7785).
 * Rules: ./sandbox-lib.mjs. Commands: ./sandbox-cli.mjs.
 *
 *   sandbox.mjs version                 print the pinned Codex version
 *   sandbox.mjs install                 npm install -g the pinned Codex
 *   sandbox.mjs write-config <home>     write the nexus_review profile
 *   sandbox.mjs observe                 host facts; never fails
 *   sandbox.mjs prepare-host            Linux: lift the AppArmor userns block only if it stops the sandbox
 *   sandbox.mjs probe --mode M --expect E --checkout D --codex-home H [--hostile-config] [--record F]
 *   sandbox.mjs exec-probe --checkout D --codex-home H --schema S [--record F]
 *   sandbox.mjs preflight --checkout D --codex-home H [--base REF]
 *   sandbox.mjs review --checkout D --base REF --schema S --out F --log F
 *   sandbox.mjs summary --record F      markdown table of recorded probe steps
 */
import { main } from './sandbox-cli.mjs';

const code = await main();
await new Promise((resolve) => process.stdout.write('', resolve));
await new Promise((resolve) => process.stderr.write('', resolve));
process.exit(code);
