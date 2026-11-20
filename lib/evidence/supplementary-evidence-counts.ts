/**
 * Wave 1 (W1-1): classes whose workflow counts must include authoritative
 * measurement tables, not only EvidenceItem rows (RA-8388 / field-evidence-audit).
 */

import type { EvidenceClass } from "@/lib/types/evidence";

export interface SupplementaryMeasurementCounts {
  moistureReadings: number;
  psychrometricReadings: number;
}

/** Effective captured count for a class, including supplementary tables. */
export function evidenceClassCapturedTotal(
  evidenceClass: EvidenceClass,
  evidenceItemCount: number,
  supplementary: SupplementaryMeasurementCounts,
): number {
  if (evidenceClass === "MOISTURE_READING") {
    return evidenceItemCount + supplementary.moistureReadings;
  }
  if (evidenceClass === "AMBIENT_ENVIRONMENTAL") {
    return evidenceItemCount + supplementary.psychrometricReadings;
  }
  return evidenceItemCount;
}