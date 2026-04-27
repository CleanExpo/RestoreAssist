/**
 * Job templates.
 *
 * Each describes everything the orchestrator needs to produce a
 * realistic synthetic restoration job in the system: how many photos
 * to upload, what affected areas + moisture readings to seed, and
 * what assessment domain + options to fire at the end.
 *
 * Jobs are domain-anchored — one per domain plug-in we want to
 * exercise on every run. Add more here to widen coverage.
 */

import type { AssessmentDomain } from "@/lib/assessments/types";
import type { ImageManifestEntry } from "../images/source.js";

export interface JobTemplate {
  key: string;
  label: string;
  domain: AssessmentDomain;
  /** Inspection-creation defaults overridable by the company fixture. */
  inspection: {
    technicianName: string;
    lossDescription: string;
  };
  /** Topic name passed to the image sourcer. */
  imageTopic: ImageManifestEntry["topic"];
  /** How many photos to upload before assessment generation. */
  photoCount: number;
  /** Affected areas to POST. */
  affectedAreas: ReadonlyArray<{
    roomZoneId: string;
    affectedSquareFootage: number;
    waterSource: string;
    description: string;
  }>;
  /** Moisture readings to POST. */
  moistureReadings: ReadonlyArray<{
    location: string;
    surfaceType: string;
    moistureLevel: number;
  }>;
  /** Domain-specific options for the generate call. */
  generateOptions?: Record<string, unknown>;
  /** Pass enhanceWithAi=true on the generate call. */
  enhanceWithAi: boolean;
}

export const JOBS: readonly JobTemplate[] = [
  {
    key: "water-cat2",
    label: "WATER · Cat-2 residential — burst flexi-hose",
    domain: "WATER",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Burst braided flexi-hose under kitchen sink, ~6 hours unattended overnight",
    },
    imageTopic: "water-damage",
    photoCount: 3,
    affectedAreas: [
      {
        roomZoneId: "Kitchen",
        affectedSquareFootage: 14,
        waterSource: "Burst braided flexi-hose under sink",
        description:
          "Vinyl lifting, particleboard subfloor saturated under cabinets",
      },
      {
        roomZoneId: "Hallway",
        affectedSquareFootage: 8,
        waterSource: "Migration from kitchen",
        description: "Carpet and underlay saturated",
      },
    ],
    moistureReadings: [
      {
        location: "Kitchen — base cabinet (north wall)",
        surfaceType: "Particleboard (Yellow Tongue)",
        moistureLevel: 42,
      },
      {
        location: "Kitchen — vinyl flooring centre",
        surfaceType: "Vinyl over particleboard",
        moistureLevel: 38,
      },
      {
        location: "Hallway — carpet underlay centre",
        surfaceType: "Carpet underlay",
        moistureLevel: 65,
      },
    ],
    enhanceWithAi: true,
  },
  {
    key: "mould-cond3",
    label: "MOULD · Condition-3 commercial — active growth",
    domain: "MOULD",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Reported musty smell + visible black growth on basement plasterboard, RH 72%",
    },
    imageTopic: "mould-growth",
    photoCount: 3,
    affectedAreas: [
      {
        roomZoneId: "Basement storage",
        affectedSquareFootage: 22,
        waterSource: "Long-term condensation",
        description: "Plasterboard wall, lower 1.2 m affected",
      },
    ],
    moistureReadings: [
      {
        location: "Basement plasterboard — affected zone",
        surfaceType: "Plasterboard",
        moistureLevel: 28,
      },
      {
        location: "Basement floor concrete",
        surfaceType: "Concrete slab",
        moistureLevel: 18,
      },
    ],
    generateOptions: {
      condition: "CONDITION_3",
      ambientRelativeHumidity: 72,
    },
    enhanceWithAi: true,
  },
  {
    key: "biohazard-sewage",
    label: "BIOHAZARD · Sewage overflow Cat-3",
    domain: "BIOHAZARD",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Toilet stack failure — sewage overflow throughout ground-floor bathroom + adjacent hallway",
    },
    imageTopic: "water-damage",
    photoCount: 2,
    affectedAreas: [
      {
        roomZoneId: "Bathroom",
        affectedSquareFootage: 6,
        waterSource: "Sewage stack overflow",
        description: "Tile floor, wall base saturated",
      },
      {
        roomZoneId: "Hallway",
        affectedSquareFootage: 4,
        waterSource: "Sewage migration",
        description: "Carpet contaminated",
      },
    ],
    moistureReadings: [
      {
        location: "Bathroom wall base",
        surfaceType: "Plasterboard",
        moistureLevel: 48,
      },
    ],
    generateOptions: {
      biohazardType: "sewage_overflow",
    },
    enhanceWithAi: true,
  },
  {
    key: "fire-smoke-wet",
    label: "FIRE_SMOKE · Wet smoke residue — kitchen fire",
    domain: "FIRE_SMOKE",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Cooking-oil flash-fire contained to range hood; wet smoke residue on adjacent surfaces, char level 2",
    },
    imageTopic: "fire-damage",
    photoCount: 3,
    affectedAreas: [
      {
        roomZoneId: "Kitchen",
        affectedSquareFootage: 10,
        waterSource: "Fire-suppression water",
        description: "Smoke residue on cabinets + ceiling",
      },
    ],
    moistureReadings: [],
    generateOptions: {
      smokeType: "wet",
      charLevel: 2,
    },
    enhanceWithAi: true,
  },
  {
    key: "storm-stormwater",
    label: "STORM · Stormwater ingress through roof penetration",
    domain: "STORM",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Severe thunderstorm — stormwater ingress via dislodged roof tile, Cat-2 declared",
    },
    imageTopic: "storm-roof",
    photoCount: 3,
    affectedAreas: [
      {
        roomZoneId: "Lounge",
        affectedSquareFootage: 16,
        waterSource: "Stormwater ingress",
        description: "Ceiling sagged, carpet saturated",
      },
    ],
    moistureReadings: [
      {
        location: "Ceiling plasterboard centre",
        surfaceType: "Plasterboard",
        moistureLevel: 55,
      },
    ],
    generateOptions: {
      entryType: "stormwater_ingress",
      waterCategory: 2,
    },
    enhanceWithAi: true,
  },
  {
    key: "hvac-microbial",
    label: "HVAC · Microbial growth in ducted residential",
    domain: "HVAC",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Routine HVAC inspection found microbial growth on supply-side flex duct after recent water event",
    },
    imageTopic: "restoration-equipment",
    photoCount: 2,
    affectedAreas: [],
    moistureReadings: [],
    generateOptions: {
      systemType: "ducted_residential",
      condition: "MICROBIAL_GROWTH",
      ductLinearMetres: 28,
      areaServedM2: 110,
    },
    enhanceWithAi: true,
  },
  {
    key: "aus-compliance-labour",
    label: "AUSTRALIAN_COMPLIANCE · Labour-hire engagement",
    domain: "AUSTRALIAN_COMPLIANCE",
    inspection: {
      technicianName: "Pilot Tester",
      lossDescription:
        "Compliance documentation pass — engagement uses labour-hire subcontractor + biohazard waste in scope",
    },
    imageTopic: "restoration-equipment",
    photoCount: 1,
    affectedAreas: [],
    moistureReadings: [],
    generateOptions: {
      hasLabourHire: true,
      hasBiohazard: true,
    },
    enhanceWithAi: true,
  },
];

export function findJob(key: string): JobTemplate {
  const j = JOBS.find((x) => x.key === key);
  if (!j) {
    throw new Error(
      `[pilot-tester] unknown job key "${key}". Known: ${JOBS.map((x) => x.key).join(", ")}`,
    );
  }
  return j;
}
