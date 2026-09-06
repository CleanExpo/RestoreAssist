/**
 * National Construction Code edition (spec §5.4).
 *
 * The edition in force depends on WHERE and WHEN, not on a single global value —
 * see lib/anz/ncc-adoption.ts for why, and for the verified ABCB adoption table.
 * Pass the state whenever the job records one.
 *
 * `NCC_EDITION` remains supported as a forced override for the whole deployment.
 * It wins over the table, so it is an escape hatch for an org that must pin an
 * edition, not the normal path.
 */

import {
  isAustralianState,
  nationalFloorEdition,
  resolveNccEdition,
  type AustralianState,
} from "./ncc-adoption";

/**
 * Retained for callers and tests that reference it. This is the edition NCC 2022
 * shipped as; it is NOT "the current edition" and must not be used as one — the
 * amendments and NCC 2025 are both later. Use `getNccEdition(state)`.
 */
export const DEFAULT_NCC_EDITION = "NCC 2022";

/**
 * The NCC edition to cite for a job.
 *
 * With a state: the edition legally in force there on `asAt` (default today).
 * Without one: the edition in force in every Australian jurisdiction — see
 * `nationalFloorEdition`, which understates rather than overstates.
 *
 * Returns null for a New Zealand job. NZ has no NCC; it is governed by the New
 * Zealand Building Code. Citing "NCC" on an NZ report is a defect, so the type
 * makes callers handle it rather than letting a stale Australian code through.
 */
export function getNccEdition(
  state?: AustralianState | string | null,
  asAt?: string,
): string | null {
  // Jurisdiction first, override second. New Zealand has no NCC at all, so a
  // deployment-wide NCC_EDITION pin must not put an Australian code on an NZ
  // report — the override exists to pin which AUSTRALIAN edition applies, not to
  // create one where none does.
  if (state === "NZ") return null;

  const forced = process.env.NCC_EDITION?.trim();
  if (forced) return forced;
  if (typeof state === "string" && isAustralianState(state)) {
    return resolveNccEdition(state, asAt);
  }
  return nationalFloorEdition(asAt);
}
