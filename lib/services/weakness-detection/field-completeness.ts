/**
 * Deterministic field-presence checks against the report's own structured
 * data: timestamps, affected areas, and evidence (photo) labelling. Zero AI
 * spend — every finding here is a straight null/empty check, never an
 * inference, so every one anchors as "unverified/missing" (there is no text
 * to quote for an absent field).
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { randomUUID } from "node:crypto";
import type { WeaknessDetectionInput, WeaknessFinding } from "./types";

function missingFieldFinding(
  severity: WeaknessFinding["severity"],
  description: string,
  suggestedAction: string,
): WeaknessFinding {
  return {
    id: randomUUID(),
    checkClass: "missing_field",
    severity,
    evidenceAnchor: "unverified/missing",
    description,
    suggestedAction,
    detectionMethod: "deterministic",
  };
}

export function checkFieldCompleteness(
  input: WeaknessDetectionInput,
): WeaknessFinding[] {
  const findings: WeaknessFinding[] = [];

  // Timestamps
  if (!input.incident?.dateOfLoss) {
    findings.push(
      missingFieldFinding(
        "P1",
        "Date of loss (incident.dateOfLoss) is not recorded on this report.",
        "Enter the date the water damage occurred before this report leaves the system.",
      ),
    );
  }
  if (!input.incident?.technicianAttendanceDate) {
    findings.push(
      missingFieldFinding(
        "P1",
        "Technician attendance date (incident.technicianAttendanceDate) is not recorded on this report.",
        "Enter the date the technician attended site.",
      ),
    );
  }

  // Affected areas — core evidence; zero areas is a hard stop.
  const affectedAreas = input.affectedAreas ?? [];
  if (affectedAreas.length === 0) {
    findings.push(
      missingFieldFinding(
        "P0",
        "No affected areas are recorded on this report.",
        "Add at least one affected area with dimensions, moisture readings, and photos before handoff.",
      ),
    );
  } else {
    affectedAreas.forEach((area, i) => {
      const label = area.name || `affectedAreas[${i}]`;
      if (!area.moistureReadings || area.moistureReadings.length === 0) {
        findings.push(
          missingFieldFinding(
            "P1",
            `Affected area "${label}" has no moisture readings recorded.`,
            "Add at least one moisture reading for this area, or remove it if not inspected.",
          ),
        );
      }
      if (!area.photos || area.photos.length === 0) {
        findings.push(
          missingFieldFinding(
            "P1",
            `Affected area "${label}" has no photos recorded.`,
            "Attach at least one photo documenting this area.",
          ),
        );
      }
      if (area.wetPercentage === undefined || area.wetPercentage === null) {
        findings.push(
          missingFieldFinding(
            "P2",
            `Affected area "${label}" has no wet-percentage figure recorded.`,
            "Record the estimated wet percentage for this area.",
          ),
        );
      }
    });
  }

  // Evidence labels — every photo should be attributable to a location/category.
  (input.photos ?? []).forEach((photo, i) => {
    if (!photo.category && !photo.location) {
      findings.push(
        missingFieldFinding(
          "P2",
          `Photo ${photo.url || `photos[${i}]`} has no location or category label.`,
          "Label this photo with the affected area or category it documents.",
        ),
      );
    }
  });

  return findings;
}
