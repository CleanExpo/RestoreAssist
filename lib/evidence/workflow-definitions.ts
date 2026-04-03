/**
 * Job-Type Workflow Definitions — RA-398
 *
 * Defines which evidence classes are required, recommended, or optional
 * for each claim type, organised by inspection phase.
 *
 * These configs drive the guided capture workflow engine (RA-399)
 * and the submission gate validation (RA-401).
 *
 * Claim types match existing ScopeTemplate.claimType values:
 *   water_damage | fire_smoke | mould | storm | sewage
 *
 * @see lib/evidence/evidence-classes.ts — Evidence class metadata
 * @see prisma/schema.prisma — EvidenceClass enum
 */

import type { EvidenceClass } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ClaimType =
  | "water_damage"
  | "fire_smoke"
  | "mould"
  | "storm"
  | "sewage";

export type InspectionPhase =
  | "pre_site"
  | "on_site_initial"
  | "on_site_detailed"
  | "equipment_setup"
  | "monitoring"
  | "completion";

export type EvidenceRequirement = "required" | "recommended" | "optional";

export interface PhaseEvidenceRule {
  evidenceClass: EvidenceClass;
  requirement: EvidenceRequirement;
  minCount: number; // Minimum number of this evidence type needed
  guidance: string; // Instruction text shown to technician
}

export interface WorkflowPhase {
  phase: InspectionPhase;
  displayName: string;
  description: string;
  evidenceRules: PhaseEvidenceRule[];
}

export interface ClaimWorkflow {
  claimType: ClaimType;
  displayName: string;
  iicrcStandard: string; // Primary applicable standard
  phases: WorkflowPhase[];
}

// ─── Workflow Definitions ────────────────────────────────────────────────────

const WATER_DAMAGE_WORKFLOW: ClaimWorkflow = {
  claimType: "water_damage",
  displayName: "Water Damage",
  iicrcStandard: "IICRC S500:2025",
  phases: [
    {
      phase: "pre_site",
      displayName: "Pre-Site Assessment",
      description: "Initial information gathering before arriving on site",
      evidenceRules: [
        {
          evidenceClass: "ENVIRONMENTAL_CONDITION",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Document weather conditions and any external water sources visible on approach",
        },
      ],
    },
    {
      phase: "on_site_initial",
      displayName: "On-Site Initial Assessment",
      description:
        "First walkthrough — safety check, utilities, and damage overview",
      evidenceRules: [
        {
          evidenceClass: "SAFETY_HAZARD",
          requirement: "required",
          minCount: 1,
          guidance:
            "Document all safety hazards: electrical, slip/trip, structural. If none found, capture a note confirming safe conditions",
        },
        {
          evidenceClass: "UTILITY_STATUS",
          requirement: "required",
          minCount: 1,
          guidance:
            "Confirm status of power, water, and gas — isolation if required",
        },
        {
          evidenceClass: "SITE_OVERVIEW",
          requirement: "required",
          minCount: 3,
          guidance:
            "Capture exterior front, affected room wide-angle, and source of water entry. Minimum 3 overview photos",
        },
        {
          evidenceClass: "DAMAGE_CLOSE_UP",
          requirement: "required",
          minCount: 2,
          guidance:
            "Close-up photos of the most severe visible damage and the water source/entry point",
        },
      ],
    },
    {
      phase: "on_site_detailed",
      displayName: "Detailed Inspection",
      description: "Thorough room-by-room assessment with measurements",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 6,
          guidance:
            "Take moisture readings in each affected room: wall base, mid-wall, ceiling, and floor. Record instrument type and serial number",
        },
        {
          evidenceClass: "THERMAL_IMAGE",
          requirement: "recommended",
          minCount: 2,
          guidance:
            "Infrared scans of walls and ceilings to identify hidden moisture behind linings",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Record ambient temperature, relative humidity, and dew point — inside affected area and outside for baseline",
        },
        {
          evidenceClass: "FLOOR_PLAN_ANNOTATION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Annotate floor plan with affected zones, moisture reading locations, and damage extent",
        },
        {
          evidenceClass: "AFFECTED_CONTENTS",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Document affected personal property and furnishings with owner present if possible",
        },
        {
          evidenceClass: "STRUCTURAL_ASSESSMENT",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Assess subfloor, wall framing, and ceiling for structural concerns. Note load-bearing elements",
        },
        {
          evidenceClass: "MATERIAL_SAMPLE",
          requirement: "optional",
          minCount: 0,
          guidance:
            "Collect samples if suspect materials present (pre-1990 buildings: asbestos risk)",
        },
      ],
    },
    {
      phase: "equipment_setup",
      displayName: "Equipment Setup",
      description: "Drying equipment deployment and containment",
      evidenceRules: [
        {
          evidenceClass: "EQUIPMENT_PLACEMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Photo each piece of equipment in position — include equipment ID tag and serial number visible",
        },
        {
          evidenceClass: "CONTAINMENT_SETUP",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Document containment barriers if installed — poly sheeting, negative air, isolation zones",
        },
      ],
    },
    {
      phase: "monitoring",
      displayName: "Drying Monitoring",
      description: "Daily progress readings and condition tracking",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 4,
          guidance:
            "Daily moisture readings at all monitoring points. Compare to previous day's readings",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily ambient conditions — temperature, RH, dew point. Track drying progress",
        },
        {
          evidenceClass: "PROGRESS_PHOTO",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily progress photo showing current condition of primary affected area",
        },
      ],
    },
    {
      phase: "completion",
      displayName: "Completion & Handover",
      description: "Final documentation confirming drying goals met",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 4,
          guidance:
            "Final moisture readings confirming all zones at or below dry standard. Must match initial reading locations",
        },
        {
          evidenceClass: "COMPLETION_PHOTO",
          requirement: "required",
          minCount: 3,
          guidance:
            "Final condition of all previously affected areas — compare with initial site overview angles",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 1,
          guidance:
            "Final ambient conditions confirming environment within acceptable parameters",
        },
      ],
    },
  ],
};

const FIRE_SMOKE_WORKFLOW: ClaimWorkflow = {
  claimType: "fire_smoke",
  displayName: "Fire & Smoke Damage",
  iicrcStandard: "IICRC S500:2025",
  phases: [
    {
      phase: "pre_site",
      displayName: "Pre-Site Assessment",
      description: "Information gathering and authority clearance",
      evidenceRules: [
        {
          evidenceClass: "ENVIRONMENTAL_CONDITION",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Document external conditions and confirm fire authority has released the site",
        },
      ],
    },
    {
      phase: "on_site_initial",
      displayName: "On-Site Initial Assessment",
      description:
        "Safety-first walkthrough — structural integrity and hazard identification",
      evidenceRules: [
        {
          evidenceClass: "SAFETY_HAZARD",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document structural collapse risk, electrical hazards, toxic residue areas, and asbestos exposure risk",
        },
        {
          evidenceClass: "UTILITY_STATUS",
          requirement: "required",
          minCount: 1,
          guidance:
            "Confirm all utilities isolated. Gas and electrical must be confirmed safe before entry",
        },
        {
          evidenceClass: "SITE_OVERVIEW",
          requirement: "required",
          minCount: 4,
          guidance:
            "Exterior showing fire damage extent, interior origin point area, and adjacent unaffected areas for comparison",
        },
        {
          evidenceClass: "DAMAGE_CLOSE_UP",
          requirement: "required",
          minCount: 3,
          guidance:
            "Close-ups of char depth, smoke staining patterns, and heat damage to materials",
        },
      ],
    },
    {
      phase: "on_site_detailed",
      displayName: "Detailed Assessment",
      description: "Room-by-room damage classification and material assessment",
      evidenceRules: [
        {
          evidenceClass: "STRUCTURAL_ASSESSMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Assess all load-bearing elements for fire damage — note char depth, steel discolouration, concrete spalling",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Measure particulate levels and CO levels in affected and unaffected areas",
        },
        {
          evidenceClass: "MATERIAL_SAMPLE",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Collect soot and debris samples for contamination classification. Test for asbestos in pre-1990 buildings",
        },
        {
          evidenceClass: "AFFECTED_CONTENTS",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document all affected contents — categorise as salvageable, cleanable, or total loss",
        },
        {
          evidenceClass: "FLOOR_PLAN_ANNOTATION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Annotate floor plan with fire origin, smoke travel path, and damage zones (direct flame, heat, smoke only)",
        },
      ],
    },
    {
      phase: "equipment_setup",
      displayName: "Equipment & Containment",
      description: "Air scrubbers, deodorisation, and containment barriers",
      evidenceRules: [
        {
          evidenceClass: "EQUIPMENT_PLACEMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document HEPA air scrubber placement, ozone generators, thermal fogger positioning",
        },
        {
          evidenceClass: "CONTAINMENT_SETUP",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document containment isolating fire-damaged zones from unaffected areas. Critical for smoke migration prevention",
        },
      ],
    },
    {
      phase: "monitoring",
      displayName: "Treatment Monitoring",
      description: "Track deodorisation and cleaning progress",
      evidenceRules: [
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily air quality readings — particulate count trending toward baseline",
        },
        {
          evidenceClass: "PROGRESS_PHOTO",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily progress showing cleaning and restoration advancement",
        },
      ],
    },
    {
      phase: "completion",
      displayName: "Completion & Clearance",
      description: "Final air quality clearance and visual confirmation",
      evidenceRules: [
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Final air quality confirming particulate and odour levels within acceptable limits",
        },
        {
          evidenceClass: "COMPLETION_PHOTO",
          requirement: "required",
          minCount: 3,
          guidance:
            "Final condition of all restored areas — match initial overview angles",
        },
      ],
    },
  ],
};

const MOULD_WORKFLOW: ClaimWorkflow = {
  claimType: "mould",
  displayName: "Mould Remediation",
  iicrcStandard: "IICRC S520:2015",
  phases: [
    {
      phase: "pre_site",
      displayName: "Pre-Site Assessment",
      description: "Review occupant health concerns and building history",
      evidenceRules: [
        {
          evidenceClass: "ENVIRONMENTAL_CONDITION",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Note any reported health symptoms, duration of mould concern, and building ventilation type",
        },
      ],
    },
    {
      phase: "on_site_initial",
      displayName: "On-Site Initial Assessment",
      description: "Visual mould assessment and safety identification",
      evidenceRules: [
        {
          evidenceClass: "SAFETY_HAZARD",
          requirement: "required",
          minCount: 1,
          guidance:
            "Document PPE requirements, ventilation concerns, and occupant exposure risks",
        },
        {
          evidenceClass: "SITE_OVERVIEW",
          requirement: "required",
          minCount: 2,
          guidance:
            "Wide-angle of affected rooms showing extent of visible mould growth",
        },
        {
          evidenceClass: "DAMAGE_CLOSE_UP",
          requirement: "required",
          minCount: 3,
          guidance:
            "Close-up of mould colonies — capture colour, texture, and spread pattern on each affected surface",
        },
      ],
    },
    {
      phase: "on_site_detailed",
      displayName: "Detailed Assessment",
      description:
        "Sampling, moisture source identification, and extent mapping",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 4,
          guidance:
            "Identify moisture source — readings around all mould-affected areas to trace origin",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Spore count (if equipment available) or RH/temperature in affected and unaffected areas",
        },
        {
          evidenceClass: "MATERIAL_SAMPLE",
          requirement: "required",
          minCount: 2,
          guidance:
            "Surface and/or air samples for lab identification — species affects remediation protocol",
        },
        {
          evidenceClass: "FLOOR_PLAN_ANNOTATION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Map all visible mould locations and suspected concealed growth areas",
        },
      ],
    },
    {
      phase: "equipment_setup",
      displayName: "Containment & Equipment",
      description: "Negative air containment and HEPA filtration",
      evidenceRules: [
        {
          evidenceClass: "CONTAINMENT_SETUP",
          requirement: "required",
          minCount: 2,
          guidance:
            "Full containment with negative air pressure is mandatory. Document poly barriers, air scrubbers, and pressure differential",
        },
        {
          evidenceClass: "EQUIPMENT_PLACEMENT",
          requirement: "required",
          minCount: 1,
          guidance:
            "HEPA air scrubber and negative air machine placement documentation",
        },
      ],
    },
    {
      phase: "monitoring",
      displayName: "Remediation Monitoring",
      description: "Track containment integrity and cleaning progress",
      evidenceRules: [
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 1,
          guidance:
            "Monitor containment pressure differential and ambient spore count daily",
        },
        {
          evidenceClass: "PROGRESS_PHOTO",
          requirement: "required",
          minCount: 1,
          guidance:
            "Document remediation progress — removed materials, cleaned surfaces, encapsulated areas",
        },
      ],
    },
    {
      phase: "completion",
      displayName: "Post-Remediation Verification",
      description: "Clearance testing confirming successful remediation",
      evidenceRules: [
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Post-remediation air samples — must be at or below outdoor baseline spore counts",
        },
        {
          evidenceClass: "COMPLETION_PHOTO",
          requirement: "required",
          minCount: 3,
          guidance:
            "All previously affected areas showing clean, remediated condition",
        },
        {
          evidenceClass: "MATERIAL_SAMPLE",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Post-remediation surface sample to confirm clearance (if required by protocol)",
        },
      ],
    },
  ],
};

const STORM_WORKFLOW: ClaimWorkflow = {
  claimType: "storm",
  displayName: "Storm Damage",
  iicrcStandard: "IICRC S500:2025",
  phases: [
    {
      phase: "pre_site",
      displayName: "Pre-Site Assessment",
      description: "Weather event documentation and access safety check",
      evidenceRules: [
        {
          evidenceClass: "ENVIRONMENTAL_CONDITION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Document the weather event — BOM warnings, rainfall data, wind speeds. Note ongoing weather risks",
        },
      ],
    },
    {
      phase: "on_site_initial",
      displayName: "On-Site Initial Assessment",
      description:
        "Safety and structural integrity — roof access, tree damage, flooding",
      evidenceRules: [
        {
          evidenceClass: "SAFETY_HAZARD",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document fallen trees/branches, roof damage accessibility, flood water depth, electrical exposure",
        },
        {
          evidenceClass: "UTILITY_STATUS",
          requirement: "required",
          minCount: 1,
          guidance:
            "Check power lines, gas, water mains — storm damage can compromise all utilities",
        },
        {
          evidenceClass: "SITE_OVERVIEW",
          requirement: "required",
          minCount: 4,
          guidance:
            "All four building elevations showing storm damage, plus aerial/roof view if accessible",
        },
        {
          evidenceClass: "DAMAGE_CLOSE_UP",
          requirement: "required",
          minCount: 3,
          guidance:
            "Close-up of roof penetration points, broken windows, structural damage from impact",
        },
      ],
    },
    {
      phase: "on_site_detailed",
      displayName: "Detailed Assessment",
      description: "Interior water ingress mapping and structural review",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 4,
          guidance:
            "Map water ingress path from roof/window penetration through to interior affected areas",
        },
        {
          evidenceClass: "STRUCTURAL_ASSESSMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Assess roof structure, ceiling integrity, window frames, and any impact damage to walls",
        },
        {
          evidenceClass: "FLOOR_PLAN_ANNOTATION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Map water entry points, flow paths, and all affected rooms/zones",
        },
        {
          evidenceClass: "AFFECTED_CONTENTS",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Document any contents damaged by water ingress or debris impact",
        },
      ],
    },
    {
      phase: "equipment_setup",
      displayName: "Make-Safe & Equipment",
      description: "Temporary repairs and drying equipment deployment",
      evidenceRules: [
        {
          evidenceClass: "EQUIPMENT_PLACEMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document temporary roof tarps, board-ups, and drying equipment placement",
        },
      ],
    },
    {
      phase: "monitoring",
      displayName: "Drying Monitoring",
      description: "Track drying progress after make-safe",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 3,
          guidance:
            "Daily moisture readings at water ingress zones and interior affected areas",
        },
        {
          evidenceClass: "PROGRESS_PHOTO",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily progress including make-safe integrity check (tarps, boards still secure)",
        },
      ],
    },
    {
      phase: "completion",
      displayName: "Completion",
      description: "Final drying confirmation and permanent repair readiness",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 3,
          guidance:
            "Final readings confirming all areas at or below dry standard",
        },
        {
          evidenceClass: "COMPLETION_PHOTO",
          requirement: "required",
          minCount: 3,
          guidance:
            "All areas dried and ready for permanent repair — match initial overview angles",
        },
      ],
    },
  ],
};

const SEWAGE_WORKFLOW: ClaimWorkflow = {
  claimType: "sewage",
  displayName: "Sewage / Category 3 Water",
  iicrcStandard: "IICRC S500:2025",
  phases: [
    {
      phase: "pre_site",
      displayName: "Pre-Site Assessment",
      description: "Biohazard preparation and PPE planning",
      evidenceRules: [
        {
          evidenceClass: "ENVIRONMENTAL_CONDITION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Document sewage source (sewer main, septic, stormwater cross-connection) and estimated volume",
        },
      ],
    },
    {
      phase: "on_site_initial",
      displayName: "On-Site Initial Assessment",
      description: "Biohazard safety — Category 3 protocols",
      evidenceRules: [
        {
          evidenceClass: "SAFETY_HAZARD",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document biohazard zones, PPE requirements, and occupant evacuation status. Category 3 water is a health hazard",
        },
        {
          evidenceClass: "UTILITY_STATUS",
          requirement: "required",
          minCount: 1,
          guidance:
            "Confirm sewage source is isolated — plumber/council may be needed before entry",
        },
        {
          evidenceClass: "SITE_OVERVIEW",
          requirement: "required",
          minCount: 3,
          guidance:
            "Overview of sewage-affected areas showing extent of contamination and water levels",
        },
        {
          evidenceClass: "DAMAGE_CLOSE_UP",
          requirement: "required",
          minCount: 2,
          guidance:
            "Close-up of contamination on materials — note porous vs non-porous for disposal decisions",
        },
      ],
    },
    {
      phase: "on_site_detailed",
      displayName: "Detailed Assessment",
      description: "Contamination extent and material disposal classification",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 4,
          guidance:
            "Map contamination extent — any porous material contacted by Category 3 water must be removed per S500:2025 §10.3",
        },
        {
          evidenceClass: "FLOOR_PLAN_ANNOTATION",
          requirement: "required",
          minCount: 1,
          guidance:
            "Mark contamination zone boundary, disposal zone, and decontamination zone on floor plan",
        },
        {
          evidenceClass: "MATERIAL_SAMPLE",
          requirement: "recommended",
          minCount: 1,
          guidance:
            "Collect water sample for contamination classification if source is ambiguous",
        },
        {
          evidenceClass: "AFFECTED_CONTENTS",
          requirement: "required",
          minCount: 2,
          guidance:
            "All contents in contamination zone — most porous items are unrestorable with Category 3",
        },
      ],
    },
    {
      phase: "equipment_setup",
      displayName: "Extraction & Containment",
      description:
        "Sewage extraction, antimicrobial treatment, and containment",
      evidenceRules: [
        {
          evidenceClass: "CONTAINMENT_SETUP",
          requirement: "required",
          minCount: 2,
          guidance:
            "Containment is mandatory — isolate contaminated area from clean zones. Negative air with HEPA",
        },
        {
          evidenceClass: "EQUIPMENT_PLACEMENT",
          requirement: "required",
          minCount: 2,
          guidance:
            "Document extraction equipment, HEPA air scrubbers, and antimicrobial application setup",
        },
      ],
    },
    {
      phase: "monitoring",
      displayName: "Decontamination Monitoring",
      description: "Track antimicrobial treatment and drying progress",
      evidenceRules: [
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 3,
          guidance:
            "Daily readings in decontaminated zones — drying must occur after antimicrobial application",
        },
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 1,
          guidance:
            "Monitor air quality within containment — biohazard levels must trend to baseline",
        },
        {
          evidenceClass: "PROGRESS_PHOTO",
          requirement: "required",
          minCount: 1,
          guidance:
            "Daily progress showing material removal, decontamination, and drying advancement",
        },
      ],
    },
    {
      phase: "completion",
      displayName: "Clearance & Handover",
      description: "Decontamination clearance and safe re-entry confirmation",
      evidenceRules: [
        {
          evidenceClass: "AIR_QUALITY_READING",
          requirement: "required",
          minCount: 2,
          guidance:
            "Post-decontamination air quality confirming safe levels for re-occupancy",
        },
        {
          evidenceClass: "MOISTURE_READING",
          requirement: "required",
          minCount: 3,
          guidance:
            "Final moisture readings confirming complete drying of all decontaminated areas",
        },
        {
          evidenceClass: "COMPLETION_PHOTO",
          requirement: "required",
          minCount: 3,
          guidance:
            "Final clean condition of all previously contaminated areas — safe for rebuild",
        },
      ],
    },
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const WORKFLOWS: Record<ClaimType, ClaimWorkflow> = {
  water_damage: WATER_DAMAGE_WORKFLOW,
  fire_smoke: FIRE_SMOKE_WORKFLOW,
  mould: MOULD_WORKFLOW,
  storm: STORM_WORKFLOW,
  sewage: SEWAGE_WORKFLOW,
};

export { WORKFLOWS };
