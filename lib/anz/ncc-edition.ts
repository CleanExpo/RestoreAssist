/**
 * National Construction Code edition (spec §5.4).
 *
 * The NCC (ABCB) is revised ~every 3 years. The edition must be configurable so
 * the tool rolls to the next NCC without a code change — set `NCC_EDITION` in the
 * environment to override the bundled default.
 */

export const DEFAULT_NCC_EDITION = "NCC 2022";

export function getNccEdition(): string {
  return process.env.NCC_EDITION?.trim() || DEFAULT_NCC_EDITION;
}
