/**
 * RA-864 — scope-mould.ts
 *
 * Deterministic scope generation for mould remediation jobs following
 * IICRC S520:2015. Each returned item carries its S520 clause reference,
 * quantity, unit, and — where mappable — the unit cost from the company
 * pricing config.
 *
 * Driving factors:
 *   - contaminationClass — S520:2015 §4.2 contamination classification
 *     drives containment + filtration intensity.
 *   - affectedAreaM2     — quantity scaling for area-based items.
 *   - estimatedDays      — drives daily-rated equipment (air scrubber).
 *   - hvacInvolved       — Class 4 (concealed / HVAC) always, but HVAC
 *     presence can also upgrade lower classes to include NADCA inspection.
 *   - pricingConfig      — unit-rate source where a mapping exists.
 */

import { CompanyPricingRates } from "./nir-cost-estimation";
import type { ScopeItemDraft } from "./scope-fire";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** IICRC S520:2015 §4.2 — Contamination classification */
export type ContaminationClass = 1 | 2 | 3 | 4;

// ─── S520 CLAUSE REFS ────────────────────────────────────────────────────────

const S520_CLASSIFICATION = "S520:2015 §4.2";
const S520_CONTAINMENT = "S520:2015 §5.3";
const S520_HEPA_FILTRATION = "S520:2015 §6.1";
const S520_CLEARANCE = "S520:2015 §7.2";

/** NADCA ACR 2021 is the industry standard for HVAC inspection + cleaning. */
const NADCA_HVAC = "NADCA ACR:2021 §5";

// ─── SCOPE GENERATION ────────────────────────────────────────────────────────

/**
 * Generate required scope items for a mould remediation job.
 *
 * Class 1 (<1 m²) — minimal: HEPA vacuum + antimicrobial wipe.
 * Class 2 (1-10 m²) — adds containment and air scrubber.
 * Class 3 (>10 m²) — full negative-air containment + clearance testing.
 * Class 4 (HVAC / concealed) — Class 3 scope + NADCA HVAC inspection.
 */
export function generateMouldScope(params: {
  contaminationClass: ContaminationClass;
  affectedAreaM2: number;
  estimatedDays: number;
  hvacInvolved: boolean;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[] {
  const {
    contaminationClass,
    affectedAreaM2,
    estimatedDays,
    hvacInvolved,
    pricingConfig,
  } = params;
  const items: ScopeItemDraft[] = [];

  // Area used for scope quantities. Guard against non-positive values.
  const area = Math.max(0, affectedAreaM2);
  const days = Math.max(0, estimatedDays);

  // ── Class 1 baseline (always present for Class ≥ 1) ────────────────────
  items.push({
    itemType: "hepa_vacuum",
    description: "HEPA vacuum contaminated surfaces",
    justification:
      "HEPA vacuuming removes settled spores and fine particulate per IICRC S520:2015 §6.1 (HEPA filtration).",
    iicrcReference: S520_HEPA_FILTRATION,
    quantity: area,
    unit: "m²",
    isRequired: true,
  });

  items.push({
    itemType: "antimicrobial_wipe",
    description: "Antimicrobial wipe-down",
    justification:
      "Apply EPA-registered antimicrobial to remediated surfaces to inhibit regrowth (S520:2015 §4.2 Class control measures).",
    iicrcReference: S520_CLASSIFICATION,
    quantity: area,
    unit: "m²",
    unitCostAud: pricingConfig.mouldRemediationTreatmentRate,
    isRequired: true,
  });

  // ── Class 2+ adds containment + air scrubbing ───────────────────────────
  if (contaminationClass >= 2) {
    items.push({
      itemType: "containment_setup",
      description:
        contaminationClass >= 3
          ? "Full negative-pressure containment"
          : "Critical barrier containment",
      justification:
        contaminationClass >= 3
          ? "Class 3 (>10 m²) requires full containment under negative pressure to prevent cross-contamination during remediation (S520:2015 §5.3)."
          : "Class 2 (1-10 m²) requires critical barriers to isolate the work area (S520:2015 §5.3).",
      iicrcReference: S520_CONTAINMENT,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });

    items.push({
      itemType: "hepa_air_scrubber",
      description: "HEPA air scrubber",
      justification:
        "Continuous HEPA air filtration during remediation maintains containment integrity and captures airborne spores per IICRC S520:2015 §6.1.",
      iicrcReference: S520_HEPA_FILTRATION,
      quantity: days,
      unit: "day",
      unitCostAud: pricingConfig.afdUnitLargeDailyRate,
      isRequired: true,
    });

    // Clearance testing is mandatory from Class 2 up — PRV verifies the
    // remediated environment before the client re-enters.
    items.push({
      itemType: "clearance_testing",
      description: "Post-remediation clearance testing",
      justification:
        "Independent visual inspection + air sampling verifies remediation success before re-occupancy per IICRC S520:2015 §7.2.",
      iicrcReference: S520_CLEARANCE,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  // ── Class 3 adds negative-air machine + worker decontamination ─────────
  if (contaminationClass >= 3) {
    items.push({
      itemType: "negative_air_machine",
      description: "Negative air machine",
      justification:
        "Negative air machine maintains pressure differential across containment during Class 3 remediation (S520:2015 §5.3 + §6.1).",
      iicrcReference: S520_CONTAINMENT,
      quantity: days,
      unit: "day",
      unitCostAud: pricingConfig.afdUnitLargeDailyRate,
      isRequired: true,
    });

    items.push({
      itemType: "worker_decon",
      description: "Worker decontamination setup",
      justification:
        "Decontamination chamber between contaminated zone and clean zone limits cross-contamination during Class 3 remediation (S520:2015 §5.3).",
      iicrcReference: S520_CONTAINMENT,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  // ── Class 4 OR HVAC-involved — NADCA HVAC inspection ───────────────────
  if (contaminationClass === 4 || hvacInvolved) {
    items.push({
      itemType: "hvac_inspection",
      description: "HVAC inspection and remediation plan (NADCA)",
      justification:
        "Concealed/HVAC contamination requires NADCA ACR:2021 §5 inspection of ductwork, coils and air handlers before remediation can be scoped.",
      iicrcReference: NADCA_HVAC,
      quantity: 1,
      unit: "job",
      isRequired: true,
    });
  }

  return items;
}
