/**
 * Fire & Smoke Damage Scope Generation Engine
 *
 * Produces deterministic scope items for fire/smoke restoration jobs
 * following IICRC S700:2015.
 *
 * Driving factors:
 *   - smokeType     — cleaning method selection (S700:2015 §4.3)
 *   - charLevel     — structural damage severity (S700:2015 §6.2)
 *   - affectedAreaM2 — quantity scaling for area-based items
 *   - pricingConfig  — unit cost derivation from company rates where mappable
 */

import { CompanyPricingRates } from "./nir-cost-estimation";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** IICRC S700:2015 §4.3 smoke residue classification */
export type SmokeType = "wet" | "dry" | "protein" | "fuel_oil";

export interface ScopeItemDraft {
  itemType: string;
  description: string;
  justification: string;
  /** IICRC S700:2015 clause reference — e.g. "S700:2015 §4.3" */
  iicrcReference: string;
  quantity?: number;
  unit?: string;
  /** Unit cost in AUD derived from company pricing config where a mapping exists */
  unitCostAud?: number;
  isRequired: boolean;
}

// ─── IICRC S700:2015 CLAUSE REFS ─────────────────────────────────────────────

/** S700:2015 §4.3 — Smoke type classification */
const S700_SMOKE_CLASSIFICATION = "S700:2015 §4.3";

/** S700:2015 §6.2 — Dry residue cleaning */
const S700_DRY_RESIDUE = "S700:2015 §6.2";

/** S700:2015 §6.4 — Wet residue cleaning */
const S700_WET_RESIDUE = "S700:2015 §6.4";

/** S700:2015 §7.1 — Odour control */
const S700_ODOUR_CONTROL = "S700:2015 §7.1";

// ─── SCOPE GENERATION ────────────────────────────────────────────────────────

/**
 * Generate required scope items for a fire/smoke restoration job.
 *
 * Smoke type drives cleaning method selection per IICRC S700:2015 §4.3.
 * Charring level ≥ 3 triggers structural assessment per S700:2015 §6.2.
 *
 * All area quantities are in m² (Australian metric standard).
 */
export function generateFireScope(params: {
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
  affectedAreaM2: number;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[] {
  const { smokeType, charLevel, affectedAreaM2, pricingConfig } = params;
  const items: ScopeItemDraft[] = [];

  // ── Smoke-type-specific cleaning items ────────────────────────────────────

  switch (smokeType) {
    case "wet": {
      // S700:2015 §6.4 — Wet residue: degreaser + HEPA vacuum + ozone
      items.push({
        itemType: "degreaser_clean",
        description: "Degreaser Clean",
        justification:
          "Wet smoke deposits oily residue requiring degreaser application to emulsify and lift deposits per IICRC S700:2015 §6.4.",
        iicrcReference: S700_WET_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        unitCostAud: pricingConfig.antimicrobialTreatmentRate,
        isRequired: true,
      });
      items.push({
        itemType: "hepa_vacuum",
        description: "HEPA Vacuum",
        justification:
          "HEPA vacuuming removes loose wet smoke particles after degreaser application per IICRC S700:2015 §6.4.",
        iicrcReference: S700_WET_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      items.push({
        itemType: "ozone_treatment",
        description: "Ozone Treatment",
        justification:
          "Ozone treatment neutralises wet smoke odour compounds at the molecular level per IICRC S700:2015 §7.1.",
        iicrcReference: S700_ODOUR_CONTROL,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      break;
    }

    case "dry": {
      // S700:2015 §6.2 — Dry residue: dry sponge + HEPA vacuum + hydroxyl
      items.push({
        itemType: "dry_sponge_wipe",
        description: "Dry Sponge Wipe",
        justification:
          "Dry smoke residue must be removed with dry chemical sponges before any wet cleaning to prevent smearing per IICRC S700:2015 §6.2.",
        iicrcReference: S700_DRY_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      items.push({
        itemType: "hepa_vacuum",
        description: "HEPA Vacuum",
        justification:
          "HEPA vacuuming captures residual dry soot particles after dry sponge cleaning per IICRC S700:2015 §6.2.",
        iicrcReference: S700_DRY_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      items.push({
        itemType: "hydroxyl_treatment",
        description: "Hydroxyl Treatment",
        justification:
          "Hydroxyl generation eliminates dry smoke odours without requiring site evacuation per IICRC S700:2015 §7.1.",
        iicrcReference: S700_ODOUR_CONTROL,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      break;
    }

    case "protein": {
      // S700:2015 §4.3 — Protein residue: enzyme × 2 + ozone + deodorisation
      items.push({
        itemType: "enzyme_treatment_1",
        description: "Enzyme Treatment (Pass 1)",
        justification:
          "Protein smoke residue requires enzymatic treatment to break down organic compounds; two passes are required per IICRC S700:2015 §4.3.",
        iicrcReference: S700_SMOKE_CLASSIFICATION,
        quantity: affectedAreaM2,
        unit: "m²",
        unitCostAud: pricingConfig.mouldRemediationTreatmentRate,
        isRequired: true,
      });
      items.push({
        itemType: "enzyme_treatment_2",
        description: "Enzyme Treatment (Pass 2)",
        justification:
          "Second enzyme treatment pass required for complete breakdown of protein residues before odour control per IICRC S700:2015 §4.3.",
        iicrcReference: S700_SMOKE_CLASSIFICATION,
        quantity: affectedAreaM2,
        unit: "m²",
        unitCostAud: pricingConfig.mouldRemediationTreatmentRate,
        isRequired: true,
      });
      items.push({
        itemType: "ozone_treatment",
        description: "Ozone Treatment",
        justification:
          "Ozone treatment neutralises persistent protein smoke odour compounds after enzymatic cleaning per IICRC S700:2015 §7.1.",
        iicrcReference: S700_ODOUR_CONTROL,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      items.push({
        itemType: "deodorisation",
        description: "Deodorisation Treatment",
        justification:
          "Deodorisation eliminates residual protein odours following enzyme and ozone treatments per IICRC S700:2015 §7.1.",
        iicrcReference: S700_ODOUR_CONTROL,
        quantity: affectedAreaM2,
        unit: "m²",
        unitCostAud: pricingConfig.antimicrobialTreatmentRate,
        isRequired: true,
      });
      break;
    }

    case "fuel_oil": {
      // S700:2015 §6.2 — Fuel oil soot: chemical sponge + solvent + ozone
      items.push({
        itemType: "chemical_sponge_clean",
        description: "Chemical Sponge Clean",
        justification:
          "Fuel oil soot is removed with dry chemical sponges first to prevent petroleum residue from spreading during wet cleaning per IICRC S700:2015 §6.2.",
        iicrcReference: S700_DRY_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      items.push({
        itemType: "solvent_clean",
        description: "Solvent Clean",
        justification:
          "Solvent cleaning dissolves petroleum-based fuel oil soot deposits that cannot be removed by water-based methods per IICRC S700:2015 §6.2.",
        iicrcReference: S700_DRY_RESIDUE,
        quantity: affectedAreaM2,
        unit: "m²",
        unitCostAud: pricingConfig.antimicrobialTreatmentRate,
        isRequired: true,
      });
      items.push({
        itemType: "ozone_treatment",
        description: "Ozone Treatment",
        justification:
          "Ozone treatment neutralises fuel oil odour compounds at the molecular level per IICRC S700:2015 §7.1.",
        iicrcReference: S700_ODOUR_CONTROL,
        quantity: affectedAreaM2,
        unit: "m²",
        isRequired: true,
      });
      break;
    }
  }

  // ── Charring level ≥ 3: structural assessment + debris removal ─────────────

  if (charLevel >= 3) {
    items.push({
      itemType: "structural_assessment",
      description: "Structural Assessment",
      justification: `Charring level ${charLevel} indicates deep structural charring; a formal structural assessment is required before restoration proceeds per IICRC S700:2015 §6.2.`,
      iicrcReference: S700_DRY_RESIDUE,
      isRequired: true,
    });
    items.push({
      itemType: "debris_removal",
      description: "Debris Removal",
      justification: `Charring level ${charLevel} produces structural debris that must be removed before surface cleaning and restoration per IICRC S700:2015 §6.2.`,
      iicrcReference: S700_DRY_RESIDUE,
      quantity: affectedAreaM2,
      unit: "m²",
      isRequired: true,
    });
  }

  return items;
}
