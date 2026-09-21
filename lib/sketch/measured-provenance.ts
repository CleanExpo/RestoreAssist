/**
 * RA-7611 — measured-quantity provenance is an allow-list with a
 * missing-tag fallback.
 *
 * Technician-measured geometry (`operator_measured`) may feed estimates,
 * scope quantities, or SketchRoom billed area. So may a *missing* tag:
 * undefined, null, or `""` — the legacy editor and pre-RA-6760 V2 import
 * write room polygons with no provenance, and those rooms billed as
 * technician-drawn before this change.
 *
 * Any *explicit* value other than `operator_measured` does not bill:
 * `underlay_reference` (imported plan / pending LiDAR), `ai_suggested`
 * (Vision / cloud AI rooms), and unknown tags stay out until Confirm.
 *
 * These three filters used to be deny-lists that excluded only
 * `underlay_reference`, so `ai_suggested` reached billing. Keep this
 * helper as the single predicate so they cannot drift.
 */

export const OPERATOR_MEASURED_PROVENANCE = "operator_measured";
export const AI_SUGGESTED_PROVENANCE = "ai_suggested";
export const UNDERLAY_REFERENCE_PROVENANCE = "underlay_reference";

export type SketchQuantityProvenance =
  | typeof OPERATOR_MEASURED_PROVENANCE
  | typeof AI_SUGGESTED_PROVENANCE
  | typeof UNDERLAY_REFERENCE_PROVENANCE;

/**
 * True for technician-measured (or confirmed) provenance, and for the
 * legacy untagged case (undefined / null / empty string).
 */
export function isOperatorMeasuredProvenance(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  return value === OPERATOR_MEASURED_PROVENANCE;
}
