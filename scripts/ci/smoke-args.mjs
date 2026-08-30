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
 * @property {string[]} extraArgs Everything else, forwarded to Playwright.
 */

/** Flags this wrapper consumes rather than forwarding. */
export const SMOKE_FLAGS = ["--preflight-only", "--allow-stale"];

/**
 * @param {string[]} rawArgs Everything after the base URL.
 * @returns {SmokeArgs}
 */
export function parseSmokeArgs(rawArgs) {
  const args = rawArgs ?? [];
  return {
    preflightOnly: args.includes("--preflight-only"),
    allowStale: args.includes("--allow-stale"),
    extraArgs: args.filter((arg) => !SMOKE_FLAGS.includes(arg)),
  };
}
