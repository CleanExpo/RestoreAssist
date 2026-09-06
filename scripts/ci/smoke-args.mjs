/**
 * Argument parsing for `scripts/run-smoke.mjs`, split out so it can be tested
 * without a network probe or a Playwright install.
 *
 * The flags are separated from the pass-through arguments deliberately: any
 * flag this wrapper understands must NOT reach the Playwright CLI, which
 * rejects options it does not know and would turn a wiring mistake into a
 * confusing exit 2.
 */

/**
 * @typedef {object} SmokeArgs
 * @property {boolean} preflightOnly Stop after the freshness and migration
 *   probes, without running Playwright.
 * @property {boolean} allowStale Treat a stale deployment as a warning and
 *   continue to the user flows, rather than exiting 3.
 * @property {boolean} flowsDespiteDegraded Run the user flows even when the
 *   migration-health preflight fails. Does NOT make that failure green: the
 *   run still exits non-zero afterwards. It buys evidence about whether users
 *   are affected, which aborting throws away.
 * @property {string[]} extraArgs Everything else, forwarded to Playwright.
 */

/** Flags this wrapper consumes rather than forwarding. */
export const SMOKE_FLAGS = [
  "--preflight-only",
  "--allow-stale",
  "--flows-despite-degraded",
];

/**
 * The run's exit code once the flows have finished.
 *
 * Extracted so the one property that must never regress is testable without a
 * network probe: **a degraded preflight always fails the run**, whatever the
 * flows said. Passing flows do not excuse a failing migration probe — they
 * only establish the blast radius. Returning the flow status there would hide
 * the failure the flows were run to characterise, which is the same defect as
 * the staleness abort with its sign flipped.
 *
 * @param {object} input
 * @param {boolean} input.degraded Whether a preflight failure was tolerated.
 * @param {number|null|undefined} input.flowStatus Playwright's exit status;
 *   null when the child was signal-terminated, which is a failure, not a 0.
 * @returns {number}
 */
export function finalSmokeExitCode({ degraded, flowStatus }) {
  if (degraded) return 1;
  return flowStatus ?? 1;
}

/**
 * @param {string[]} rawArgs Everything after the base URL.
 * @returns {SmokeArgs}
 */
export function parseSmokeArgs(rawArgs) {
  const args = rawArgs ?? [];
  return {
    preflightOnly: args.includes("--preflight-only"),
    allowStale: args.includes("--allow-stale"),
    flowsDespiteDegraded: args.includes("--flows-despite-degraded"),
    extraArgs: args.filter((arg) => !SMOKE_FLAGS.includes(arg)),
  };
}
