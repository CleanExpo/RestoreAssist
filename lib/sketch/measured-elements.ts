/**
 * Provenance guard (spec §6.4, T1.3).
 *
 * Technician-measured geometry may feed S500 drying/scope calcs and exports.
 * Same allow-list as `isOperatorMeasuredProvenance`: `operator_measured` and
 * the legacy untagged case (undefined / null / empty string). Explicit tags
 * other than `operator_measured` never contribute — that is both an accuracy
 * and an IP requirement (spec §8.1).
 */

import { isOperatorMeasuredProvenance } from "./measured-provenance";

export interface MeasurableElement {
  provenance?: string | null;
  type?: string;
  dimensionsM?: { areaM2?: number } | null;
}

export function measuredElements<T extends MeasurableElement>(
  elements: T[],
): T[] {
  return elements.filter((e) => isOperatorMeasuredProvenance(e.provenance));
}

/** Total floor area (m²) from operator-measured rooms only. */
export function totalMeasuredFloorAreaM2(
  elements: MeasurableElement[],
): number {
  return measuredElements(elements)
    .filter((e) => e.type === "room")
    .reduce((sum, e) => sum + (e.dimensionsM?.areaM2 ?? 0), 0);
}
