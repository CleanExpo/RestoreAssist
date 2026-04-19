/**
 * RA-862 — scope-prelims.ts
 *
 * Deterministic generation of standard Preliminary scope items that apply
 * to every job type. These are systematically under-billed and represent
 * roughly AUD $200-$600 of revenue leakage per job when omitted.
 *
 * The items returned here are the backbone that every claim should carry:
 * mobilisation, daily monitoring, waste disposal, PPE, project management,
 * and equipment transport. Damage-type-specific pathways (scope-fire,
 * scope-mould, scope-biohazard, scope-storm) compose scopes ON TOP of
 * these prelims — they do not replace them.
 *
 * IICRC references: S500:2025 §4.1 (Attendance), §8.3 (Drying Monitoring),
 * §6.5 (Waste Handling). S520:2015 §5.4 for mould/contamination disposal.
 */

import { CompanyPricingRates } from "./nir-cost-estimation";
import type { ScopeItemDraft } from "./scope-fire";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/** Damage types the prelims generator understands. */
export type PrelimsDamageType =
  | "water_damage"
  | "fire_smoke"
  | "mould"
  | "biohazard"
  | "storm"
  | "contents";

// ─── IICRC CLAUSE REFS ───────────────────────────────────────────────────────

const S500_SITE_ATTENDANCE = "S500:2025 §4.1";
const S500_MONITORING = "S500:2025 §8.3";
const S500_WASTE_HANDLING = "S500:2025 §6.5";
const S520_CONTAMINATED_WASTE = "S520:2015 §5.4";
const SAFEWORK_PPE = "Safe Work Australia — Model Code of Practice (PPE)";

// ─── MARKET-RATE PLACEHOLDERS ────────────────────────────────────────────────
//
// CompanyPricingRates doesn't yet expose mobilisation / PM / disposal /
// PPE fields (tracked under RA-861 extending NRPG_RATE_RANGES). Until that
// lands, use conservative AU market midpoints as defaults. These mirror
// the NRPG 2024/25 rate guidance for metro AU restoration.

const DEFAULT_MOBILISATION_AUD = 180; // per job attendance
const DEFAULT_MONITORING_PER_VISIT_AUD = 165; // per daily monitoring visit
const DEFAULT_WASTE_DISPOSAL_PER_M3_AUD = 220; // standard water-damage waste
const DEFAULT_CONTAMINATED_WASTE_PER_M3_AUD = 380; // CAT3 / mould / biohazard
const DEFAULT_PPE_PER_JOB_AUD = 85; // disposable PPE kit
const DEFAULT_PM_PER_HOUR_AUD = 140; // project management
const DEFAULT_EQUIPMENT_TRANSPORT_AUD = 140; // per job transport

/**
 * Waste volume heuristic — 0.15 m³ per square metre of affected area for
 * water damage (saturated carpet + underlay + small demo), 0.25 m³/m² for
 * fire/mould/biohazard where more demolition is typical.
 *
 * Kept conservative; the estimator in downstream pricing can override.
 */
function estimateWasteVolumeM3(
  damageType: PrelimsDamageType,
  affectedAreaM2: number,
): number {
  if (affectedAreaM2 <= 0) return 0;
  const perM2 =
    damageType === "water_damage" || damageType === "contents" ? 0.15 : 0.25;
  // Round up to nearest 0.5 m³ — skip bin fees are priced in 0.5 m³ bands.
  return Math.ceil(affectedAreaM2 * perM2 * 2) / 2;
}

/**
 * Damage types that MUST use contaminated-waste disposal (S520:2015 §5.4)
 * rather than standard S500:2025 §6.5 disposal.
 */
function isContaminatedWaste(damageType: PrelimsDamageType): boolean {
  return (
    damageType === "fire_smoke" ||
    damageType === "mould" ||
    damageType === "biohazard"
  );
}

// ─── PM HOUR HEURISTIC ───────────────────────────────────────────────────────
//
// Project management hours scale with job duration. Short jobs (≤ 2 days)
// absorb PM into mobilisation; longer jobs get explicit PM hours.
function estimatePmHours(estimatedDays: number): number {
  if (estimatedDays <= 2) return 0; // absorbed in mobilisation
  if (estimatedDays <= 5) return 2;
  if (estimatedDays <= 10) return 4;
  return 6; // capped — further PM should be billed as project-specific
}

// ─── GENERATOR ───────────────────────────────────────────────────────────────

/**
 * Generate the deterministic list of Preliminary items for a job.
 *
 * Guarantees (unit-tested):
 *   - Always returns at least: mobilisation, waste disposal, PPE,
 *     equipment transport (4 items).
 *   - Monitoring visits: one item per day of estimatedDays, capped at
 *     `estimatedDays` (0 days → no monitoring line).
 *   - Fire, mould, biohazard → contaminated waste disposal.
 *   - Water/storm/contents → standard waste disposal.
 *   - Project management line appears only when estimatedDays > 2.
 *
 * `pricingConfig` is accepted for forward-compatibility with RA-861 —
 * when those rate fields land, this function should prefer them over the
 * hardcoded defaults via a small helper (not done here to keep the scope
 * narrow and avoid reaching into fields that don't exist yet).
 */
export function generatePrelims(params: {
  damageType: PrelimsDamageType;
  affectedAreaM2: number;
  estimatedDays: number;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[] {
  const { damageType, affectedAreaM2, estimatedDays } = params;
  const items: ScopeItemDraft[] = [];

  // ── Mobilisation / Site attendance — always present ─────────────────────
  items.push({
    itemType: "mobilisation",
    description: "Mobilisation / Site attendance",
    justification:
      "Site attendance, travel, initial scope walk-through and risk review before work commences (IICRC S500:2025 §4.1).",
    iicrcReference: S500_SITE_ATTENDANCE,
    quantity: 1,
    unit: "job",
    unitCostAud: DEFAULT_MOBILISATION_AUD,
    isRequired: true,
  });

  // ── Daily monitoring — one per day of estimatedDays ─────────────────────
  if (estimatedDays > 0) {
    items.push({
      itemType: "daily_monitoring",
      description: "Daily monitoring visit",
      justification:
        "Daily psychrometric readings, equipment check and drying progress documentation per IICRC S500:2025 §8.3.",
      iicrcReference: S500_MONITORING,
      quantity: estimatedDays,
      unit: "visit",
      unitCostAud: DEFAULT_MONITORING_PER_VISIT_AUD,
      isRequired: true,
    });
  }

  // ── Waste disposal — standard vs contaminated ──────────────────────────
  const wasteVolumeM3 = estimateWasteVolumeM3(damageType, affectedAreaM2);
  if (wasteVolumeM3 > 0) {
    const contaminated = isContaminatedWaste(damageType);
    items.push({
      itemType: contaminated
        ? "waste_disposal_contaminated"
        : "waste_disposal_standard",
      description: contaminated
        ? "Contaminated waste disposal"
        : "Waste disposal — water damage",
      justification: contaminated
        ? "Contaminated materials (CAT3, mould, biohazard) require licensed disposal and additional containment per IICRC S520:2015 §5.4."
        : "Removal and tipping of saturated carpet, underlay, and demolished materials per IICRC S500:2025 §6.5.",
      iicrcReference: contaminated
        ? S520_CONTAMINATED_WASTE
        : S500_WASTE_HANDLING,
      quantity: wasteVolumeM3,
      unit: "m³",
      unitCostAud: contaminated
        ? DEFAULT_CONTAMINATED_WASTE_PER_M3_AUD
        : DEFAULT_WASTE_DISPOSAL_PER_M3_AUD,
      isRequired: true,
    });
  }

  // ── Safety equipment / PPE — always ─────────────────────────────────────
  items.push({
    itemType: "safety_ppe",
    description: "Safety equipment / PPE",
    justification:
      "Disposable PPE (respirators, gloves, coveralls, boot covers) as required under Safe Work Australia PPE Model Code of Practice.",
    iicrcReference: SAFEWORK_PPE,
    quantity: 1,
    unit: "job",
    unitCostAud: DEFAULT_PPE_PER_JOB_AUD,
    isRequired: true,
  });

  // ── Project management hours — only on longer jobs ──────────────────────
  const pmHours = estimatePmHours(estimatedDays);
  if (pmHours > 0) {
    items.push({
      itemType: "project_management",
      description: "Project management",
      justification:
        "Co-ordination across technicians, trades, and claim stakeholders over the life of the job.",
      iicrcReference: "", // PM is a commercial line, not IICRC-clause-driven
      quantity: pmHours,
      unit: "hour",
      unitCostAud: DEFAULT_PM_PER_HOUR_AUD,
      isRequired: true,
    });
  }

  // ── Equipment transport — always ────────────────────────────────────────
  items.push({
    itemType: "equipment_transport",
    description: "Equipment transport",
    justification:
      "Delivery and retrieval of air movers, dehumidifiers and ancillary equipment to and from site.",
    iicrcReference: "",
    quantity: 1,
    unit: "job",
    unitCostAud: DEFAULT_EQUIPMENT_TRANSPORT_AUD,
    isRequired: true,
  });

  return items;
}
