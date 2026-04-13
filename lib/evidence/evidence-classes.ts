/**
 * Evidence Classes — TypeScript definitions mirroring Prisma EvidenceClass enum
 *
 * Each evidence class maps to a specific type of evidence captured during
 * water damage, fire, mould, storm, or sewage restoration inspections.
 * IICRC section references follow S500:2025 unless otherwise noted.
 *
 * @see prisma/schema.prisma — EvidenceClass enum
 * @see RA-397 — Evidence schema with chain-of-custody metadata
 */

import type { EvidenceClass } from "@prisma/client";

export interface EvidenceClassMeta {
  id: string;
  displayName: string;
  description: string;
  iicrcRef: string; // Primary IICRC section reference
  mediaTypes: Array<
    "PHOTO" | "VIDEO" | "AUDIO" | "NOTE" | "READING" | "SKETCH" | "DOCUMENT"
  >;
  requiresMeasurement: boolean;
}

export const EVIDENCE_CLASSES: Record<string, EvidenceClassMeta> = {
  SITE_OVERVIEW: {
    id: "SITE_OVERVIEW",
    displayName: "Site Overview",
    description:
      "Wide-angle exterior and interior shots establishing the property and affected areas",
    iicrcRef: "S500:2025 §6.1",
    mediaTypes: ["PHOTO", "VIDEO"],
    requiresMeasurement: false,
  },
  DAMAGE_CLOSE_UP: {
    id: "DAMAGE_CLOSE_UP",
    displayName: "Damage Close-Up",
    description:
      "Detailed close-up photography of visible damage, staining, delamination, or deterioration",
    iicrcRef: "S500:2025 §6.3",
    mediaTypes: ["PHOTO", "VIDEO"],
    requiresMeasurement: false,
  },
  MOISTURE_READING: {
    id: "MOISTURE_READING",
    displayName: "Moisture Reading",
    description:
      "Pin or non-invasive moisture meter reading with value, location, and instrument details",
    iicrcRef: "S500:2025 §8.6.2",
    mediaTypes: ["READING", "PHOTO"],
    requiresMeasurement: true,
  },
  THERMAL_IMAGE: {
    id: "THERMAL_IMAGE",
    displayName: "Thermal Image",
    description:
      "Infrared thermography showing temperature differentials indicating moisture presence",
    iicrcRef: "S500:2025 §8.6.4",
    mediaTypes: ["PHOTO"],
    requiresMeasurement: false,
  },
  EQUIPMENT_PLACEMENT: {
    id: "EQUIPMENT_PLACEMENT",
    displayName: "Equipment Placement",
    description:
      "Documentation of drying equipment positioning — dehumidifiers, air movers, HEPA units",
    iicrcRef: "S500:2025 §8.3",
    mediaTypes: ["PHOTO", "SKETCH"],
    requiresMeasurement: false,
  },
  CONTAINMENT_SETUP: {
    id: "CONTAINMENT_SETUP",
    displayName: "Containment Setup",
    description:
      "Photos of containment barriers, negative air pressure setups, and isolation zones",
    iicrcRef: "S500:2025 §9.4",
    mediaTypes: ["PHOTO", "VIDEO"],
    requiresMeasurement: false,
  },
  AIR_QUALITY_READING: {
    id: "AIR_QUALITY_READING",
    displayName: "Air Quality Reading",
    description:
      "Relative humidity, temperature, dew point, and airborne particulate measurements",
    iicrcRef: "S500:2025 §8.5",
    mediaTypes: ["READING", "PHOTO"],
    requiresMeasurement: true,
  },
  MATERIAL_SAMPLE: {
    id: "MATERIAL_SAMPLE",
    displayName: "Material Sample",
    description:
      "Documentation of material samples collected for lab testing (asbestos, mould, lead)",
    iicrcRef: "S520:2015 §12.2",
    mediaTypes: ["PHOTO", "DOCUMENT"],
    requiresMeasurement: false,
  },
  FLOOR_PLAN_ANNOTATION: {
    id: "FLOOR_PLAN_ANNOTATION",
    displayName: "Floor Plan Annotation",
    description:
      "Annotated floor plan showing affected areas, moisture readings, and equipment locations",
    iicrcRef: "S500:2025 §6.4",
    mediaTypes: ["SKETCH", "DOCUMENT"],
    requiresMeasurement: false,
  },
  PROGRESS_PHOTO: {
    id: "PROGRESS_PHOTO",
    displayName: "Progress Photo",
    description:
      "Daily progress documentation showing drying advancement and condition changes",
    iicrcRef: "S500:2025 §8.7",
    mediaTypes: ["PHOTO", "VIDEO"],
    requiresMeasurement: false,
  },
  COMPLETION_PHOTO: {
    id: "COMPLETION_PHOTO",
    displayName: "Completion Photo",
    description:
      "Final condition documentation confirming drying goals met and work completed",
    iicrcRef: "S500:2025 §8.8",
    mediaTypes: ["PHOTO", "VIDEO"],
    requiresMeasurement: false,
  },
  AFFECTED_CONTENTS: {
    id: "AFFECTED_CONTENTS",
    displayName: "Affected Contents",
    description:
      "Documentation of personal property, furnishings, and contents affected by the loss",
    iicrcRef: "S500:2025 §11.1",
    mediaTypes: ["PHOTO", "VIDEO", "NOTE"],
    requiresMeasurement: false,
  },
  STRUCTURAL_ASSESSMENT: {
    id: "STRUCTURAL_ASSESSMENT",
    displayName: "Structural Assessment",
    description:
      "Documentation of structural integrity concerns — subfloor, framing, load-bearing elements",
    iicrcRef: "S500:2025 §7.2",
    mediaTypes: ["PHOTO", "NOTE", "DOCUMENT"],
    requiresMeasurement: false,
  },
  SAFETY_HAZARD: {
    id: "SAFETY_HAZARD",
    displayName: "Safety Hazard",
    description:
      "Documentation of safety hazards — electrical, slip/trip, structural collapse, biohazard",
    iicrcRef: "S500:2025 §5.2",
    mediaTypes: ["PHOTO", "VIDEO", "NOTE"],
    requiresMeasurement: false,
  },
  UTILITY_STATUS: {
    id: "UTILITY_STATUS",
    displayName: "Utility Status",
    description:
      "Status of utilities — power, water, gas isolation and restoration confirmation",
    iicrcRef: "S500:2025 §5.3",
    mediaTypes: ["PHOTO", "NOTE"],
    requiresMeasurement: false,
  },
  ENVIRONMENTAL_CONDITION: {
    id: "ENVIRONMENTAL_CONDITION",
    displayName: "Environmental Condition",
    description:
      "Ambient environmental conditions — weather, external water sources, neighbouring properties",
    iicrcRef: "S500:2025 §6.2",
    mediaTypes: ["PHOTO", "NOTE", "READING"],
    requiresMeasurement: false,
  },
  OTHER: {
    id: "OTHER",
    displayName: "Other",
    description: "Miscellaneous evidence not covered by standard classes",
    iicrcRef: "S500:2025",
    mediaTypes: [
      "PHOTO",
      "VIDEO",
      "AUDIO",
      "NOTE",
      "READING",
      "SKETCH",
      "DOCUMENT",
    ],
    requiresMeasurement: false,
  },
};

/** Get metadata for an evidence class */
export function getEvidenceClassMeta(
  cls: EvidenceClass | string,
): EvidenceClassMeta {
  return EVIDENCE_CLASSES[cls as string];
}

/** Get all evidence classes that require measurement data */
export function getMeasurementClasses(): string[] {
  return Object.values(EVIDENCE_CLASSES)
    .filter((m) => m.requiresMeasurement)
    .map((m) => m.id);
}
