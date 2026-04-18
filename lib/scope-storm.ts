/**
 * Storm Damage Scope Generation Engine
 *
 * Deterministic scope generation for storm damage jobs.
 * Storm jobs combine structural water intrusion, potential contamination,
 * and debris removal. Scope items vary by entry point and water category.
 *
 * IICRC references:
 *   S500:2025 §3.1 — Water category classification
 *   S500:2025 §6.3 — Category 3 (grossly contaminated) treatment
 *   NCC 2022       — National Construction Code (weather-tightness, stabilisation)
 *   AS 4055:2021   — Wind loads for housing
 */

import { CompanyPricingRates } from "./nir-cost-estimation";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Storm damage entry point — drives additional scope items beyond base set */
export type StormEntryType =
  | "roof_penetration"
  | "stormwater_ingress"
  | "wind_driven_rain"
  | "flash_flooding";

/**
 * Draft scope item — includes indicative cost fields computed from pricingConfig.
 * Suitable for display and review before persistence to the ScopeItem model.
 */
export interface ScopeItemDraft {
  itemType: string;
  description: string;
  justification: string;
  /** Typed IICRC/NCC clause references — must cite edition and section per CLAUDE.md rule 14 */
  clauseRefs: string[];
  quantity?: number;
  unit?: string;
  specification?: string;
  isRequired: boolean;
  /** Indicative unit cost in AUD, derived from pricingConfig */
  unitCost?: number;
  /** Indicative total cost in AUD (unitCost × quantity) */
  totalCost?: number;
}

// ─── CLAUSE REFERENCE CONSTANTS ───────────────────────────────────────────────

/** IICRC S500:2025 §3.1 — Water category classification */
const CLAUSE_CAT_CLASSIFICATION = "IICRC S500:2025 §3.1";

/** IICRC S500:2025 §6.3 — Category 3 (grossly contaminated) treatment and sanitation */
const CLAUSE_CAT3_TREATMENT = "IICRC S500:2025 §6.3";

/** IICRC S500:2025 §5 — Structural drying protocol */
const CLAUSE_STRUCTURAL_DRYING = "IICRC S500:2025 §5";

/** NCC 2022 — Weather-tightness, stabilisation and reinstatement */
const CLAUSE_NCC_2022 = "NCC 2022";

/** AS 4055:2021 — Wind loads for housing */
const CLAUSE_AS_4055 = "AS 4055:2021";

// ─── SCOPE GENERATOR ──────────────────────────────────────────────────────────

/**
 * Generate a deterministic set of scope item drafts for a storm damage job.
 *
 * Base items (water extraction, structural drying, moisture mapping, debris removal)
 * are always included. Entry-type and water-category logic appends additional items.
 *
 * Acceptance invariants:
 *   - Base items are always present regardless of entry type
 *   - waterCategory === 3 always adds sanitation line items
 *   - flash_flooding always adds mud/silt removal
 *   - All IICRC references cite edition and section (CLAUDE.md rule 14)
 */
export function generateStormScope(params: {
  entryType: StormEntryType;
  waterCategory: 1 | 2 | 3;
  affectedAreaM2: number;
  estimatedDays: number;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[] {
  const {
    entryType,
    waterCategory,
    affectedAreaM2,
    estimatedDays,
    pricingConfig,
  } = params;
  const items: ScopeItemDraft[] = [];

  // ── Base items — always included regardless of entry type ───────────────────

  items.push({
    itemType: "water_extraction",
    description: "Water Extraction",
    justification:
      "Storm water intrusion must be extracted to initiate the drying process per IICRC S500:2025 §3.1.",
    clauseRefs: [CLAUSE_CAT_CLASSIFICATION],
    quantity: Math.ceil(affectedAreaM2 / 20),
    unit: "hr",
    isRequired: true,
    unitCost: pricingConfig.extractionTruckMountedHourlyRate,
    totalCost:
      pricingConfig.extractionTruckMountedHourlyRate *
      Math.ceil(affectedAreaM2 / 20),
  });

  items.push({
    itemType: "structural_drying",
    description: "Structural Drying",
    justification:
      "Structural drying required to restore affected materials to pre-loss equilibrium moisture content per IICRC S500:2025 §5.",
    clauseRefs: [CLAUSE_STRUCTURAL_DRYING, CLAUSE_CAT_CLASSIFICATION],
    quantity: estimatedDays,
    unit: "day",
    isRequired: true,
    unitCost: pricingConfig.dehumidifierLGRDailyRate,
    totalCost: pricingConfig.dehumidifierLGRDailyRate * estimatedDays,
  });

  items.push({
    itemType: "moisture_mapping",
    description: "Moisture Mapping",
    justification:
      "Moisture mapping documents the full extent of water intrusion and establishes a baseline drying target per IICRC S500:2025 §3.1.",
    clauseRefs: [CLAUSE_CAT_CLASSIFICATION],
    quantity: 1,
    unit: "assessment",
    isRequired: true,
    unitCost: pricingConfig.thermalCameraUseCostPerAssessment,
    totalCost: pricingConfig.thermalCameraUseCostPerAssessment,
  });

  items.push({
    itemType: "debris_removal",
    description: "Debris Removal",
    justification:
      "Storm debris must be cleared to allow safe access and accurate damage assessment per NCC 2022.",
    clauseRefs: [CLAUSE_NCC_2022],
    quantity: affectedAreaM2,
    unit: "m²",
    isRequired: true,
    unitCost: pricingConfig.labourerNormalHours,
    totalCost:
      pricingConfig.labourerNormalHours * Math.ceil(affectedAreaM2 / 10),
  });

  // ── Entry-type specific items ────────────────────────────────────────────────

  if (entryType === "roof_penetration") {
    items.push({
      itemType: "temporary_weatherproof_covering",
      description: "Temporary Weatherproof Covering",
      justification:
        "Roof penetration requires temporary tarping or boarding within 24–48 hours to maintain weather-tightness per NCC 2022 and ICA stabilisation guidelines.",
      clauseRefs: [CLAUSE_NCC_2022, CLAUSE_AS_4055],
      quantity: 1,
      unit: "item",
      specification:
        "Install 200 μm polyethylene tarpaulin or equivalent over penetration, secured against AS 4055:2021 wind loads for site region",
      isRequired: true,
      unitCost: pricingConfig.qualifiedTechnicianNormalHours * 4,
      totalCost: pricingConfig.qualifiedTechnicianNormalHours * 4,
    });

    items.push({
      itemType: "structural_inspection",
      description: "Structural Inspection",
      justification:
        "Roof penetration may compromise structural integrity — licensed inspection required to assess compliance with NCC 2022 and AS 4055:2021 wind load provisions.",
      clauseRefs: [CLAUSE_NCC_2022, CLAUSE_AS_4055],
      quantity: 1,
      unit: "inspection",
      isRequired: true,
      unitCost: pricingConfig.masterQualifiedNormalHours * 2,
      totalCost: pricingConfig.masterQualifiedNormalHours * 2,
    });
  }

  if (entryType === "stormwater_ingress") {
    items.push({
      itemType: "cat3_water_treatment",
      description: "Category 3 Water Treatment",
      justification:
        "Stormwater ingress from external bodies is classified Category 3 (grossly contaminated) per IICRC S500:2025 §3.1 — full contamination protocol required per §6.3.",
      clauseRefs: [CLAUSE_CAT3_TREATMENT, CLAUSE_CAT_CLASSIFICATION],
      quantity: affectedAreaM2,
      unit: "m²",
      isRequired: true,
      unitCost: pricingConfig.biohazardTreatmentRate,
      totalCost: pricingConfig.biohazardTreatmentRate * affectedAreaM2,
    });

    items.push({
      itemType: "sanitation",
      description: "Sanitation — Category 3 Protocol",
      justification:
        "All surfaces affected by Category 3 stormwater ingress require antimicrobial sanitation per IICRC S500:2025 §6.3.",
      clauseRefs: [CLAUSE_CAT3_TREATMENT],
      quantity: affectedAreaM2,
      unit: "m²",
      isRequired: true,
      unitCost: pricingConfig.antimicrobialTreatmentRate,
      totalCost: pricingConfig.antimicrobialTreatmentRate * affectedAreaM2,
    });
  }

  if (entryType === "wind_driven_rain") {
    items.push({
      itemType: "structural_dry_out",
      description: "Structural Dry-Out — Wind-Driven Rain",
      justification:
        "Wind-driven rain penetrates wall cavities and roof spaces requiring targeted injection drying to achieve equilibrium moisture content per IICRC S500:2025 §5.",
      clauseRefs: [CLAUSE_STRUCTURAL_DRYING, CLAUSE_AS_4055],
      quantity: estimatedDays,
      unit: "day",
      specification:
        "Install injection drying systems into affected wall cavities; monitor daily until equilibrium moisture content is achieved",
      isRequired: true,
      unitCost: pricingConfig.injectionDryingSystemDailyRate,
      totalCost: pricingConfig.injectionDryingSystemDailyRate * estimatedDays,
    });
  }

  if (entryType === "flash_flooding") {
    items.push({
      itemType: "cat3_protocol",
      description: "Category 3 Flood Protocol",
      justification:
        "Flash flooding from external water bodies is classified Category 3 (grossly contaminated) per IICRC S500:2025 §3.1 — full containment, PPE, and decontamination required per §6.3.",
      clauseRefs: [CLAUSE_CAT3_TREATMENT, CLAUSE_CAT_CLASSIFICATION],
      quantity: affectedAreaM2,
      unit: "m²",
      isRequired: true,
      unitCost: pricingConfig.biohazardTreatmentRate,
      totalCost: pricingConfig.biohazardTreatmentRate * affectedAreaM2,
    });

    items.push({
      itemType: "mud_silt_removal",
      description: "Mud and Silt Removal",
      justification:
        "Flash flooding deposits mud and silt that must be removed before drying can commence per IICRC S500:2025 §6.3.",
      clauseRefs: [CLAUSE_CAT3_TREATMENT, CLAUSE_NCC_2022],
      quantity: affectedAreaM2,
      unit: "m²",
      isRequired: true,
      unitCost: pricingConfig.labourerNormalHours,
      totalCost:
        pricingConfig.labourerNormalHours * Math.ceil(affectedAreaM2 / 5),
    });
  }

  // ── Category 3 water — always add sanitation if not already present ─────────
  //
  // stormwater_ingress and flash_flooding already emit Cat 3 items above.
  // This guard catches roof_penetration and wind_driven_rain with Cat 3 water
  // (e.g. contaminated runoff) and any future entry type added to StormEntryType.

  if (waterCategory === 3) {
    const hasSanitation = items.some((item) =>
      ["sanitation", "cat3_water_treatment", "cat3_protocol"].includes(
        item.itemType,
      ),
    );

    if (!hasSanitation) {
      items.push({
        itemType: "cat3_sanitation",
        description: "Category 3 Water Sanitation",
        justification:
          "Category 3 (grossly contaminated) water requires full antimicrobial sanitation of all affected surfaces per IICRC S500:2025 §6.3.",
        clauseRefs: [CLAUSE_CAT3_TREATMENT, CLAUSE_CAT_CLASSIFICATION],
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
        unitCost: pricingConfig.antimicrobialTreatmentRate,
        totalCost: pricingConfig.antimicrobialTreatmentRate * affectedAreaM2,
      });
    }
  }

  return items;
}
