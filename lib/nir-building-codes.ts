/**
 * NIR Building Code Lookup System
 * Provides state-specific building code requirements for Australian states.
 * Based on National Construction Code (NCC) and state-specific regulations.
 *
 * v2.0: State data is sourced from nir-jurisdictional-matrix.ts.
 *   nirEngineFlags and activeTriggers populated from the canonical matrix.
 *
 * v2.1 (Integration #2): Location services wired in.
 *   getBuildingCodeRequirements() now auto-populates activeTriggers using
 *   postcode-based property risk flags from nir-location-services.ts.
 *   No call-site changes required.
 */

import { detectStateFromPostcode } from "@/lib/state-detection";
import {
  getJurisdictionConfig,
  getActiveTriggers,
  type JurisdictionTrigger,
} from "@/lib/nir-jurisdictional-matrix";
import {
  getPropertyLocationFlags,
  type PropertyLocationFlags,
} from "@/lib/nir-location-services";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface BuildingCodeRequirements {
  state: string;
  codeVersion: string;
  moistureThreshold: number | null;
  dryingTimeStandard: string | null;
  dehumidificationRequired: boolean;
  certificationRequired: boolean;
  requirements: {
    [key: string]: any;
  };
  notes: string | null;
  /** NIR v2.0 — engine flags from nir-jurisdictional-matrix.ts */
  nirEngineFlags: string[];
  /** NIR v2.1 — auto-populated by getBuildingCodeRequirements via location services */
  activeTriggers: JurisdictionTrigger[];
  /** NIR v2.1 — postcode-derived property risk flags from nir-location-services.ts */
  locationFlags?: PropertyLocationFlags;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Get building code requirements for a given postcode.
 *
 * v2.1: Now auto-populates activeTriggers and locationFlags using
 * postcode-based property risk detection from nir-location-services.ts.
 * Downstream consumers receive jurisdiction-specific triggers without
 * needing to provide manual context.
 */
export async function getBuildingCodeRequirements(
  postcode: string,
): Promise<BuildingCodeRequirements | null> {
  try {
    const state = detectStateFromPostcode(postcode);
    if (!state) return null;

    // Get static state requirements (moistureThreshold, nirEngineFlags, etc.)
    const requirements = getStateBuildingCodeRequirements(state, postcode);

    // Detect property-level risk flags from postcode
    const locationFlags = getPropertyLocationFlags(postcode, state);

    // Auto-populate activeTriggers from the jurisdictional matrix
    const activeTriggers = getActiveTriggers(state, {
      isFloodZone: locationFlags.isFloodZone,
      isBushfireProne: locationFlags.isBushfireProne,
      isCycloneZone: locationFlags.isCycloneZone,
      isHeritageListed: locationFlags.isHeritageListed,
    });

    return {
      ...requirements,
      activeTriggers,
      locationFlags,
    };
  } catch (error) {
    console.error("Error getting building code requirements:", error);
    return null;
  }
}

/**
 * Check if building code requirements are triggered based on inspection data.
 *
 * v2.0 addition: pass optional `jurisdictionContext` to also evaluate
 * jurisdiction-specific triggers from nir-jurisdictional-matrix.ts.
 * Omitting it preserves the original behaviour exactly.
 */
export function checkBuildingCodeTriggers(
  requirements: BuildingCodeRequirements,
  inspectionData: {
    maxMoistureLevel: number;
    hasDrywall: boolean;
    hasStructuralMaterials: boolean;
    daysSinceLoss?: number;
    buildingAge?: number;
  },
  jurisdictionContext?: {
    isFloodZone?: boolean;
    isBushfireProne?: boolean;
    isCycloneZone?: boolean;
    isHeritageListed?: boolean;
    buildingYearBuilt?: number;
  },
): {
  triggered: boolean;
  triggers: string[];
  requiredActions: string[];
  jurisdictionTriggers: JurisdictionTrigger[];
} {
  const triggers: string[] = [];
  const requiredActions: string[] = [];

  // ── Moisture threshold check ─────────────────────────────────────────────────
  if (
    requirements.moistureThreshold &&
    inspectionData.maxMoistureLevel > requirements.moistureThreshold
  ) {
    if (inspectionData.hasDrywall || inspectionData.hasStructuralMaterials) {
      triggers.push(
        `Moisture level (${inspectionData.maxMoistureLevel}%) exceeds threshold (${requirements.moistureThreshold}%)`,
      );

      if (requirements.dehumidificationRequired) {
        requiredActions.push("Dehumidification is mandatory");
      }

      if (requirements.dryingTimeStandard) {
        requiredActions.push(
          `Drying assessment required: ${requirements.dryingTimeStandard}`,
        );
      }
    }
  }

  // ── Mould testing (water present >3 days) ────────────────────────────────────
  if (inspectionData.daysSinceLoss && inspectionData.daysSinceLoss > 3) {
    triggers.push(
      `Water damage present for ${inspectionData.daysSinceLoss} days`,
    );
    requiredActions.push("Mould testing required (water present >3 days)");
  }

  // ── Asbestos assessment ──────────────────────────────────────────────────────
  if (inspectionData.buildingAge && inspectionData.buildingAge < 1990) {
    triggers.push(
      `Building age (${inspectionData.buildingAge}) indicates potential asbestos presence`,
    );
    requiredActions.push("Asbestos assessment required (pre-1990 building)");
  }

  // ── Lead paint assessment ────────────────────────────────────────────────────
  if (inspectionData.buildingAge && inspectionData.buildingAge < 1970) {
    triggers.push(
      `Building age (${inspectionData.buildingAge}) indicates potential lead paint presence`,
    );
    requiredActions.push("Lead paint assessment required (pre-1970 building)");
  }

  // ── Jurisdiction-specific triggers (NIR v2.1) ────────────────────────────────
  // Use pre-populated activeTriggers from getBuildingCodeRequirements() if available,
  // OR derive from optional jurisdictionContext if caller supplies it,
  // OR fall back to empty (original behaviour when called without context).
  let jurisdictionTriggers: JurisdictionTrigger[] = [];

  if (jurisdictionContext) {
    // Caller-supplied context overrides — useful for manual flag override
    jurisdictionTriggers = getActiveTriggers(requirements.state, {
      ...jurisdictionContext,
      buildingYearBuilt:
        jurisdictionContext.buildingYearBuilt ?? inspectionData.buildingAge,
    });
  } else if (requirements.activeTriggers.length > 0) {
    // Use triggers already resolved by getBuildingCodeRequirements() + location services
    jurisdictionTriggers = requirements.activeTriggers;
  }

  for (const jt of jurisdictionTriggers) {
    triggers.push(`[${jt.regulationRef}] ${jt.condition}`);
    requiredActions.push(jt.requiredAction);
  }

  return {
    triggered: triggers.length > 0,
    triggers,
    requiredActions,
    jurisdictionTriggers,
  };
}

// ─── INTERNAL LOOKUP ──────────────────────────────────────────────────────────

/**
 * Build state requirements, pulling codeVersion and nirEngineFlags
 * from the canonical JURISDICTIONAL_MATRIX where available.
 */
function getStateBuildingCodeRequirements(
  state: string,
  _postcode?: string,
): BuildingCodeRequirements {
  const stateUpper = state.toUpperCase();
  const jurisdictionConfig = getJurisdictionConfig(stateUpper);

  // Base structure — overridden per-state below.
  // activeTriggers is always [] here; getBuildingCodeRequirements() populates it
  // via getActiveTriggers() after calling getPropertyLocationFlags().
  const base: BuildingCodeRequirements = {
    state: stateUpper,
    codeVersion: jurisdictionConfig?.primaryCode ?? "NCC 2022",
    moistureThreshold: 20,
    dryingTimeStandard: "48–72 hours",
    dehumidificationRequired: false,
    certificationRequired: false,
    requirements: {},
    notes: jurisdictionConfig
      ? `${jurisdictionConfig.regulatoryBody} requirements apply.`
      : null,
    nirEngineFlags: jurisdictionConfig?.nirEngineFlags ?? [],
    activeTriggers: [],
  };

  switch (stateUpper) {
    case "QLD":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND drywall affected, dehumidification is mandatory",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting: "If >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
        },
        notes:
          "Queensland Building and Construction Commission (QBCC) requirements apply. " +
          "Pre-1990 buildings require asbestos assessment. " +
          "High-humidity climate: apply QLD_HUMID_DRYING_ADJUSTMENT to drying targets.",
      };

    case "NSW":
      return {
        ...base,
        moistureThreshold: 18,
        dryingTimeStandard: "48–72 hours",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 18,
          dehumidificationRequired:
            "If moisture >18% AND structural materials affected",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos:
            "Pre-1987 buildings: Asbestos assessment required (NSW cutoff differs from QLD)",
          lead: "Pre-1970 buildings: Lead paint assessment required",
        },
        notes:
          "NSW Fair Trading / NSW Building Commission requirements apply. " +
          "Pre-1987 buildings require asbestos assessment (note: different cutoff to other states).",
      };

    case "VIC":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours (may extend in cool climate)",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND drywall/structural materials affected",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          coolClimateAdjustment:
            "VIC_COOL_CLIMATE_DRYING_EXTENSION flag: standard drying timeline may be insufficient",
        },
        notes:
          "Victorian Building Authority (VBA) requirements apply. Pre-1990 buildings require asbestos assessment.",
      };

    case "WA":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND structural materials affected",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          cycloneZone:
            "WA_CYCLONE_ZONE_CHECK: Pilbara/Kimberley — structural replacements must meet Wind Region C/D",
          aridAdjustment:
            "WA_ARID_DRYING_ADJUSTMENT: inland WA drying targets differ from coastal/national defaults",
        },
        notes:
          "Western Australian Building Commission requirements apply. Cyclone zone checks required for northern WA properties.",
      };

    case "SA":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND structural materials affected",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          heritageCheck:
            "SA_HERITAGE_REGISTER_CHECK: Heritage-listed properties require Heritage SA approval before material removal",
        },
        notes:
          "South Australian Building Commission requirements apply. Heritage-listed properties require additional approval.",
      };

    case "TAS":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours (extend for cool climate)",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND structural materials affected",
          dryingAssessment:
            "48–72 hr drying assessment required — TAS cool climate may require extension",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          timberAdjustment:
            "TAS_TIMBER_MOISTURE_ADJUSTMENT: high timber prevalence — standard 48-72 hr timeline frequently insufficient",
        },
        notes:
          "Tasmanian Building Services Authority (TBSA) requirements apply. Cool temperate climate requires extended drying assessment.",
      };

    case "NT":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "24 hours (Cat 3 events), 48–72 hours (Cat 1/2)",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND structural materials affected",
          dryingAssessment:
            "NT: 24-hour re-inspection cycle required for Cat 3 events",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          cycloneZone:
            "NT_CYCLONE_WIND_REGION_CD_ALL: ALL NT structural restoration must meet cyclone-rated specification",
          tropicalAdjustment:
            "NT_TROPICAL_DRYING_ADJUSTMENT: ambient RH 70–90% wet season — drying targets require dehumidification to achieve",
        },
        notes:
          "NT Building Control requirements apply. All NT structural restoration must meet cyclone-rated specifications. " +
          "24-hour re-inspection cycle required for Category 3 water events.",
      };

    case "ACT":
      return {
        ...base,
        moistureThreshold: 20,
        dryingTimeStandard: "48–72 hours",
        dehumidificationRequired: true,
        requirements: {
          moistureThreshold: 20,
          dehumidificationRequired:
            "If moisture >20% AND structural materials affected",
          dryingAssessment: "48–72 hr drying assessment required",
          mouldTesting:
            "If visible mould or >3 days damp: requires mould testing",
          asbestos: "Pre-1990 buildings: Asbestos assessment required",
          lead: "Pre-1970 buildings: Lead paint assessment required",
          bushfireCheck:
            "ACT_BUSHFIRE_PRONE_AREA_CHECK: Tuggeranong/Weston Creek/Molonglo Valley fringe — BAL-rated materials required",
        },
        notes:
          "ACT Planning and Land Authority requirements apply. Bushfire-prone areas require BAL-rated replacement materials.",
      };

    default:
      return base;
  }
}
