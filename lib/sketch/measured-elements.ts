/**
 * Provenance guard (spec §6.4, T1.3).
 *
 * Only `operator_measured` geometry may feed S500 drying/scope calcs and exports.
 * `underlay_reference` rows (from an imported plan) are orientation-only and must
 * never contribute measured quantities — that is both an accuracy and an IP
 * requirement (spec §8.1).
 */

export interface MeasurableElement {
  provenance: string;
  type?: string;
  dimensionsM?: { areaM2?: number } | null;
}

export function measuredElements<T extends MeasurableElement>(
  elements: T[],
): T[] {
  return elements.filter((e) => e.provenance === "operator_measured");
}

/** Total floor area (m²) from operator-measured rooms only. */
export function totalMeasuredFloorAreaM2(
  elements: MeasurableElement[],
): number {
  return measuredElements(elements)
    .filter((e) => e.type === "room")
    .reduce((sum, e) => sum + (e.dimensionsM?.areaM2 ?? 0), 0);
}
