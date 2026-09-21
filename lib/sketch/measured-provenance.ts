/**
 * RA-7611 — measured-quantity provenance is an allow-list.
 *
 * Only `operator_measured` geometry may feed estimates, scope quantities, or
 * SketchRoom billed area. `underlay_reference` (imported plan / pending
 * LiDAR) and `ai_suggested` (Vision / cloud AI rooms) are suggestions until
 * a technician confirms them.
 *
 * These three filters used to be deny-lists that excluded only
 * `underlay_reference`, so any other tag — including `ai_suggested` — reached
 * billing. Keep this helper as the single predicate so they cannot drift.
 */

export const OPERATOR_MEASURED_PROVENANCE = "operator_measured";
export const AI_SUGGESTED_PROVENANCE = "ai_suggested";
export const UNDERLAY_REFERENCE_PROVENANCE = "underlay_reference";

export type SketchQuantityProvenance =
  | typeof OPERATOR_MEASURED_PROVENANCE
  | typeof AI_SUGGESTED_PROVENANCE
  | typeof UNDERLAY_REFERENCE_PROVENANCE;

/** True only for technician-measured (or confirmed) provenance. */
export function isOperatorMeasuredProvenance(value: unknown): boolean {
  return value === OPERATOR_MEASURED_PROVENANCE;
}
