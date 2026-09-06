/**
 * Australian postcode to state or territory.
 *
 * Extracted from app/api/inspections/[id]/guidewire/route.ts so the NCC edition
 * lookup and the Guidewire insurer payload resolve a state from one table rather
 * than two copies. A postcode map that disagrees with itself would put different
 * NCC editions on the report and the insurer export for the same job.
 */

import type { AustralianState } from "./ncc-adoption";

export const POSTCODE_STATE_RANGES: ReadonlyArray<{
  min: number;
  max: number;
  state: AustralianState;
}> = [
  { min: 800, max: 999, state: "NT" }, // NT uses 0800-0999 — match on 3-digit prefix
  { min: 1000, max: 2599, state: "NSW" },
  { min: 2600, max: 2619, state: "ACT" },
  { min: 2620, max: 2899, state: "NSW" },
  { min: 2900, max: 2920, state: "ACT" },
  { min: 2921, max: 2999, state: "NSW" },
  { min: 3000, max: 3999, state: "VIC" },
  { min: 4000, max: 4999, state: "QLD" },
  { min: 5000, max: 5999, state: "SA" },
  { min: 6000, max: 6999, state: "WA" },
  { min: 7000, max: 7999, state: "TAS" },
  { min: 8000, max: 8999, state: "VIC" }, // VIC PO Box range
  { min: 9000, max: 9999, state: "QLD" }, // QLD PO Box range
];

/**
 * Returns the state for a postcode, or **null** when it cannot be determined.
 *
 * Null rather than a default on purpose. The Guidewire route's own helper falls
 * back to "NSW", which is safe for its payload shape but wrong for an NCC lookup:
 * NSW stays on NCC 2022 Amendment 2 until May 2027, so guessing NSW for a
 * Victorian job would cite a superseded edition with full confidence. A caller
 * that gets null should fall back to the national floor, which understates
 * instead.
 */
export function stateFromPostcode(
  postcode: string | null | undefined,
): AustralianState | null {
  if (!postcode) return null;
  const num = Number.parseInt(postcode.replace(/\D/g, ""), 10);
  if (Number.isNaN(num)) return null;
  return POSTCODE_STATE_RANGES.find((r) => num >= r.min && num <= r.max)?.state ?? null;
}
