/**
 * RA-865 — scope-storm.ts
 *
 * Deterministic scope generation for storm damage jobs. Storm damage
 * combines water intrusion (S500:2025), potential Category 3 contamination,
 * and physical debris — the generator composes all three concerns driven
 * by the water entry-point type.
 *
 * Base items (always):
 *   - Water extraction
 *   - Structural drying (air movers)
 *   - Moisture mapping
 *   - Debris removal
 *
 * Entry-type-specific:
 *   - roof_penetration → temporary weatherproof covering + structural inspection
 *   - stormwater_ingress → automatically Category 3 sanitation overlay
 *   - wind_driven_rain → additional structural dry-out
 *   - flash_flood → mud/silt removal + automatic Category 3 protocol
 *
 * Category 3 water (either explicit or flash_flood / stormwater_ingress)
 * always adds sanitation + antimicrobial line items per S500:2025 §6.3.
 */

import { CompanyPricingRates } from "./nir-cost-estimation";
import type { ScopeItemDraft } from "./scope-fire";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type StormEntryType =
  | "roof_penetration"
  | "stormwater_ingress"
  | "wind_driven_rain"
  | "flash_flood";

export type StormWaterCategory = 1 | 2 | 3;

// ─── IICRC CLAUSE REFS ───────────────────────────────────────────────────────

const S500_WATER_CATEGORY = "S500:2025 §3.1";
const S500_CAT3_TREATMENT = "S500:2025 §6.3";
const S500_EXTRACTION = "S500:2025 §5.2";
const S500_DRYING = "S500:2025 §8.1";
const S500_MOISTURE_MAPPING = "S500:2025 §7.3";
const S500_WASTE_HANDLING = "S500:2025 §6.5";

// ─── SCOPE GENERATION ────────────────────────────────────────────────────────

/**
 * Some entry types implicitly elevate the water category:
 *   - flash_flood        → always Category 3 (grossly contaminated)
 *   - stormwater_ingress → always Category 3 (municipal stormwater mix)
 *   - wind_driven_rain   → Category 1/2 depending on intrusion path
 *   - roof_penetration   → Category 1/2 typically (clean rain water)
 */
function effectiveCategory(
  entryType: StormEntryType,
  declaredCategory: StormWaterCategory,
): StormWaterCategory {
  if (entryType === "flash_flood" || entryType === "stormwater_ingress") {
    return 3;
  }
  return declaredCategory;
}

/**
 * Generate required scope items for a storm damage job.
 */
export function generateStormScope(params: {
  entryType: StormEntryType;
  waterCategory: StormWaterCategory;
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

  const area = Math.max(0, affectedAreaM2);
  const days = Math.max(0, estimatedDays);
  const category = effectiveCategory(entryType, waterCategory);

  // ── BASE ITEMS (always present) ─────────────────────────────────────────

  items.push({
    itemType: "water_extraction",
    description: "Water extraction",
    justification:
      "Bulk water removal from structural surfaces and contents via truck-mount or electric extraction per IICRC S500:2025 §5.2.",
    iicrcReference: S500_EXTRACTION,
    quantity: area,
    unit: "m²",
    unitCostAud: pricingConfig.extractionElectricHourlyRate,
    isRequired: true,
  });

  items.push({
    itemType: "structural_drying",
    description: "Structural drying (air movers + dehumidification)",
    justification:
      "Air movers + dehumidification to dry the structure to industry-accepted moisture content per IICRC S500:2025 §8.1.",
    iicrcReference: S500_DRYING,
    quantity: days,
    unit: "day",
    unitCostAud: pricingConfig.dehumidifierLGRDailyRate,
    isRequired: true,
  });

  items.push({
    itemType: "moisture_mapping",
    description: "Moisture mapping + daily psychrometric readings",
    justification:
      "Document initial moisture content + daily readings to validate drying progress per IICRC S500:2025 §7.3.",
    iicrcReference: S500_MOISTURE_MAPPING,
    quantity: 1,
    unit: "job",
    unitCostAud: pricingConfig.thermalCameraUseCostPerAssessment,
    isRequired: true,
  });

  items.push({
    itemType: "debris_removal",
    description: "Debris removal",
    justification:
      "Removal of saturated/damaged materials, branches and wind-borne debris per IICRC S500:2025 §6.5.",
    iicrcReference: S500_WASTE_HANDLING,
    quantity: 1,
    unit: "job",
    isRequired: true,
  });

  // ── ENTRY-TYPE OVERLAYS ────────────────────────────────────────────────

  if (entryType === "roof_penetration") {
    items.push({
      itemType: "temporary_weatherproof",
      description: "Temporary weatherproof covering (tarp/shrink-wrap)",
      justification:
        "Temporary roof covering prevents further water intrusion while permanent repairs are scoped per ABCB/NCC secondary damage mitigation.",
      iicrcReference: "NCC 2022 Vol 2 §3.5 (Roof cladding)",
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "structural_inspection",
      description: "Structural inspection (engineer)",
      justification:
        "Roof penetration requires licensed structural engineer inspection before repair scope can be finalised.",
      iicrcReference: "AS 1170 (Structural design)",
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  if (entryType === "wind_driven_rain") {
    items.push({
      itemType: "cavity_drying",
      description: "Cavity structural dry-out (wall + ceiling voids)",
      justification:
        "Wind-driven rain penetrates wall/ceiling cavities; cavity drying targets trapped moisture behind cladding per IICRC S500:2025 §8.1.",
      iicrcReference: S500_DRYING,
      quantity: days,
      unit: "day",
      unitCostAud: pricingConfig.injectionDryingSystemDailyRate,
      isRequired: true,
    });
  }

  if (entryType === "flash_flood") {
    items.push({
      itemType: "mud_silt_removal",
      description: "Mud and silt removal",
      justification:
        "Flash-flood events deposit mud, silt, and sediment that must be removed before drying can commence per IICRC S500:2025 §6.3.",
      iicrcReference: S500_CAT3_TREATMENT,
      quantity: area,
      unit: "m²",
      isRequired: true,
    });
  }

  // ── CATEGORY 3 SANITATION OVERLAY ──────────────────────────────────────
  //
  // Declared Cat 3, flash flood, or stormwater ingress all reach here.
  if (category === 3) {
    items.push({
      itemType: "cat3_sanitation",
      description: "Category 3 sanitation treatment",
      justification:
        "Category 3 (grossly contaminated) water requires sanitation treatment of all affected porous/semi-porous surfaces per IICRC S500:2025 §6.3.",
      iicrcReference: S500_CAT3_TREATMENT,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.antimicrobialTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "cat3_antimicrobial",
      description: "EPA-registered antimicrobial application",
      justification:
        "Antimicrobial application to all surfaces after sanitation to inhibit microbial regrowth per IICRC S500:2025 §6.3.",
      iicrcReference: S500_CAT3_TREATMENT,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.antimicrobialTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "cat3_category_documentation",
      description: "Water category documentation + photo evidence",
      justification:
        "Category 3 classification must be documented with photos + readings per IICRC S500:2025 §3.1 for insurer audit.",
      iicrcReference: S500_WATER_CATEGORY,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  return items;
}
