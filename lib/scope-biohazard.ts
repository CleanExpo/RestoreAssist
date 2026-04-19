/**
 * RA-866 — scope-biohazard.ts
 *
 * Deterministic scope generation for biohazard, sewage, decomposition,
 * chemical and blood/trauma contamination jobs. High-margin job type with
 * zero current scope generation on sandbox — every biohazard claim ships
 * today with under-itemised line items.
 *
 * Driving factors:
 *   - biohazardType   — scope skeleton
 *   - affectedAreaM2  — area-scaled quantities
 *   - state           — AU jurisdiction for EPA waste manifest + licence refs
 *   - pricingConfig   — unit-rate source (biohazardTreatmentRate, etc.)
 *
 * Compliance anchors:
 *   - Safe Work Australia — PPE + biohazard handling
 *   - State EPA — waste disposal + manifest
 *   - AS/NZS 4360:2004 — risk management (superseded by ISO 31000:2018 in
 *     most jurisdictions, cited for historical continuity with insurer
 *     protocols that still reference AS/NZS 4360)
 *   - IICRC S540:2021 — trauma + crime-scene cleaning
 */

import { CompanyPricingRates } from "./nir-cost-estimation";
import type { ScopeItemDraft } from "./scope-fire";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type BiohazardType =
  | "sewage_overflow"
  | "decomposition"
  | "chemical_spill"
  | "blood_trauma";

/** Australian state / territory codes matching nir-jurisdictional-matrix. */
export type AustralianState =
  | "NSW"
  | "VIC"
  | "QLD"
  | "WA"
  | "SA"
  | "TAS"
  | "ACT"
  | "NT";

// ─── COMPLIANCE CLAUSE REFS ──────────────────────────────────────────────────

const SAFEWORK_BIOHAZARD = "Safe Work Australia — Biological hazards CoP";
const SAFEWORK_PPE = "Safe Work Australia — PPE Model Code of Practice";
const AS_NZS_4360 = "AS/NZS 4360:2004 §3.2 (risk controls)";
const S500_CAT3 = "S500:2025 §6.3 (Category 3 treatment)";
const S540_TRAUMA = "IICRC S540:2021 §5";
const S520_HEPA = "S520:2015 §6.1";

// Each state's primary EPA regulator reference used in the manifest item.
const STATE_EPA_REF: Record<AustralianState, string> = {
  NSW: "NSW EPA Waste Classification Guidelines 2014 (Clinical/Related Waste)",
  VIC: "EPA Victoria — Industrial Waste Resource Guidelines (IWRG 611)",
  QLD: "Department of Environment and Science — Waste Reduction and Recycling Regulation 2011",
  WA: "DWER Controlled Waste Tracking System (CWTS)",
  SA: "EPA South Australia — Waste Management Policies (Clinical/Related)",
  TAS: "EPA Tasmania — Controlled Waste tracking forms",
  ACT: "ACT EPA — Environment Protection Regulation 2005",
  NT: "NT EPA — Waste Management and Pollution Control (Administration) Regulations",
};

/** Premium PPE rate — decomp + blood-trauma jobs need Level-C suit kits. */
const PREMIUM_PPE_PER_JOB_AUD = 280;
const STANDARD_PPE_PER_JOB_AUD = 95;

// ─── SCOPE GENERATION ────────────────────────────────────────────────────────

/**
 * Generate required scope items for a biohazard job.
 *
 * Guarantees (unit-tested):
 *   - Every biohazard type returns at least 5 scope items
 *   - PPE line is premium ($280) for decomposition + blood_trauma,
 *     standard ($95) for sewage + chemical
 *   - EPA waste manifest item always references the state's regulator
 *   - Every item carries a compliance reference string
 *   - Clearance testing present for sewage + decomposition + blood_trauma
 */
export function generateBiohazardScope(params: {
  biohazardType: BiohazardType;
  affectedAreaM2: number;
  state: AustralianState;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[] {
  const { biohazardType, affectedAreaM2, state, pricingConfig } = params;
  const items: ScopeItemDraft[] = [];

  const area = Math.max(0, affectedAreaM2);
  const isPremiumPpe =
    biohazardType === "decomposition" || biohazardType === "blood_trauma";

  // ── PPE (always first) ─────────────────────────────────────────────────

  items.push({
    itemType: isPremiumPpe ? "ppe_premium" : "ppe_standard",
    description: isPremiumPpe
      ? "Premium PPE kit (Level-C suits, respirator cartridges, double gloves)"
      : "Standard PPE kit (coveralls, respirator, gloves, boot covers)",
    justification: isPremiumPpe
      ? "Level-C chemical-resistant suits + positive-pressure respiration are mandatory for decomposition and blood/trauma contact per Safe Work Australia PPE CoP."
      : "Disposable coveralls + half-face respirator + nitrile gloves per Safe Work Australia PPE CoP.",
    iicrcReference: SAFEWORK_PPE,
    quantity: 1,
    unit: "job",
    unitCostAud: isPremiumPpe
      ? PREMIUM_PPE_PER_JOB_AUD
      : STANDARD_PPE_PER_JOB_AUD,
    isRequired: true,
  });

  // ── HEPA vacuum — present on every type ────────────────────────────────

  items.push({
    itemType: "hepa_vacuum",
    description: "HEPA vacuum contaminated surfaces",
    justification:
      "HEPA vacuuming removes settled particulate, dried tissue, and airborne spores before wet-cleaning per IICRC S520:2015 §6.1.",
    iicrcReference: S520_HEPA,
    quantity: area,
    unit: "m²",
    isRequired: true,
  });

  // ── Type-specific body ────────────────────────────────────────────────

  if (biohazardType === "sewage_overflow") {
    items.push({
      itemType: "cat3_sanitation",
      description: "Category 3 sanitation (sewage)",
      justification:
        "Sewage overflow is Category 3 water per IICRC S500:2025 §6.3 — full sanitation treatment of all affected surfaces.",
      iicrcReference: S500_CAT3,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "antimicrobial_pass_1",
      description: "Antimicrobial treatment — first pass",
      justification:
        "Initial antimicrobial application reduces surface bioburden ahead of mechanical cleaning per S500:2025 §6.3.",
      iicrcReference: S500_CAT3,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "antimicrobial_pass_2",
      description: "Antimicrobial treatment — second pass",
      justification:
        "Secondary antimicrobial application after mechanical cleaning, per S500:2025 §6.3 two-pass sewage protocol.",
      iicrcReference: S500_CAT3,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "hepa_air_scrubber",
      description: "HEPA air scrubber",
      justification:
        "Continuous HEPA air filtration during sewage remediation captures airborne bacteria per IICRC S520:2015 §6.1.",
      iicrcReference: S520_HEPA,
      quantity: 1,
      unit: "job",
      unitCostAud: pricingConfig.afdUnitLargeDailyRate,
      isRequired: true,
    });
  }

  if (biohazardType === "decomposition") {
    items.push({
      itemType: "enzyme_treatment",
      description: "Enzyme digestion treatment",
      justification:
        "Enzyme digestion breaks down proteinaceous residue from decomposition per IICRC S540:2021 §5.",
      iicrcReference: S540_TRAUMA,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "odour_bomb",
      description: "Hydroxyl / ozone odour neutralisation",
      justification:
        "Volatile odour compounds from decomposition must be neutralised at the molecular level before reoccupancy per S540:2021 §5.",
      iicrcReference: S540_TRAUMA,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "porous_removal",
      description: "Removal + disposal of contaminated porous materials",
      justification:
        "Carpet, underlay, plasterboard that has absorbed decomposition fluids cannot be remediated — remove and dispose per S540:2021 §5.",
      iicrcReference: S540_TRAUMA,
      quantity: area,
      unit: "m²",
      isRequired: true,
    });
    items.push({
      itemType: "ppe_consumables_bulk",
      description: "PPE consumables — bulk replacement",
      justification:
        "High-frequency PPE replacement during decomposition remediation (3× standard rate per Safe Work AU PPE CoP Appendix B).",
      iicrcReference: SAFEWORK_PPE,
      quantity: 3,
      unit: "kit",
      unitCostAud: PREMIUM_PPE_PER_JOB_AUD,
      isRequired: true,
    });
  }

  if (biohazardType === "chemical_spill") {
    items.push({
      itemType: "chemical_identification",
      description: "Chemical identification + SDS review",
      justification:
        "MSDS/SDS identification of spilled chemical drives neutralisation method selection per AS/NZS 4360:2004 §3.2 risk controls.",
      iicrcReference: AS_NZS_4360,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "neutralisation_agent",
      description: "Neutralisation agent application",
      justification:
        "Chemical-specific neutralising agent rendered safe for mechanical cleanup per AS/NZS 4360:2004 §3.2.",
      iicrcReference: AS_NZS_4360,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "specialist_disposal",
      description: "Specialist chemical waste disposal",
      justification:
        "Chemical waste must be disposed through licensed facility with tracked EPA manifest — cannot enter general waste stream.",
      iicrcReference: STATE_EPA_REF[state],
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "air_quality_clearance",
      description: "Air quality clearance testing",
      justification:
        "VOC + gas testing to confirm air is safe for re-occupancy post-chemical-spill per AS/NZS 4360:2004 §3.2.",
      iicrcReference: AS_NZS_4360,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  if (biohazardType === "blood_trauma") {
    items.push({
      itemType: "pathogen_treatment",
      description: "Broad-spectrum pathogen treatment (bloodborne)",
      justification:
        "EPA-registered pathogen treatment rated against HIV/HBV/HCV per IICRC S540:2021 §5.",
      iicrcReference: S540_TRAUMA,
      quantity: area,
      unit: "m²",
      unitCostAud: pricingConfig.biohazardTreatmentRate,
      isRequired: true,
    });
    items.push({
      itemType: "sharps_disposal",
      description: "Sharps + biohazard bag disposal",
      justification:
        "Any sharps on-site disposed via licensed sharps containers; biohazard waste bagged and tracked per state EPA.",
      iicrcReference: STATE_EPA_REF[state],
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "licensed_disposal",
      description: "Licensed clinical-waste disposal",
      justification:
        "All contaminated materials disposed through licensed clinical-waste carrier with EPA tracking manifest.",
      iicrcReference: STATE_EPA_REF[state],
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
    items.push({
      itemType: "scene_decontamination",
      description: "Scene decontamination + clearance",
      justification:
        "Crime-scene / trauma decontamination per IICRC S540:2021 §5 with clearance verification before family re-entry.",
      iicrcReference: S540_TRAUMA,
      quantity: area,
      unit: "m²",
      isRequired: true,
    });
  }

  // ── Always-last items (present on every type) ─────────────────────────

  items.push({
    itemType: "biohazard_handling_compliance",
    description: "Biohazard handling compliance (Safe Work AU)",
    justification:
      "Documented SWMS + biohazard handling procedures per Safe Work Australia Biological Hazards Code of Practice.",
    iicrcReference: SAFEWORK_BIOHAZARD,
    quantity: 1,
    unit: "job",
    isRequired: true,
  });

  items.push({
    itemType: "epa_waste_manifest",
    description: `EPA waste manifest (${state})`,
    justification: `Waste handling + tracking manifest per ${STATE_EPA_REF[state]}. Required for licensed disposal of biohazard waste from the site.`,
    iicrcReference: STATE_EPA_REF[state],
    quantity: 1,
    unit: "job",
    isRequired: true,
  });

  // Clearance for sewage + decomposition + blood_trauma (not chemical spill,
  // which has its own air-quality test above).
  if (biohazardType !== "chemical_spill") {
    items.push({
      itemType: "clearance_testing",
      description: "Post-remediation clearance testing",
      justification:
        "Independent verification that bioburden is reduced below action thresholds before re-occupancy per IICRC S540:2021 §5.",
      iicrcReference: S540_TRAUMA,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  return items;
}
