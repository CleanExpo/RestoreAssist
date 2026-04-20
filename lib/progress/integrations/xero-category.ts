/**
 * xero-category.ts — RA-854
 *
 * Fine-grained Xero account-code category taxonomy for invoice routing.
 *
 * Replaces the old damage-type-only approach (WATER / FIRE / MOULD / STORM)
 * with per-scope-category routing so different cost types can flow to their
 * own Xero account codes per AU accounting conventions (distinguishing own
 * labour from subcontract labour, own equipment from pass-through hire,
 * third-party disbursements, etc).
 *
 * The classification is derived from `docs/gst-treatment-matrix.md` — every
 * `itemType` listed there is assigned a `XeroCategory` below. The matrix is
 * the authoritative source; this file codifies the routing layer on top of it.
 *
 * Wire-up:
 *   - Scope generators emit `itemType` strings (scope-prelims, scope-fire,
 *     scope-mould, scope-storm, scope-biohazard).
 *   - `classifyScopeItem(itemType)` returns a `XeroCategory`.
 *   - `lib/integrations/xero/account-code-resolver.ts` looks up the
 *     `XeroAccountCodeMapping` row keyed by that category string.
 *   - If no per-category mapping is configured, the resolver falls back to
 *     the built-in defaults (see `XERO_CATEGORY_DEFAULT_CODES`) and then to
 *     the per-integration default row, preserving backward compatibility
 *     with the previous damage-type-only setup.
 */

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

export type XeroCategory =
  | "LABOUR_OWN" // own-staff labour (OUTPUT GST)
  | "LABOUR_SUBCONTRACT" // subcontractor labour we onsell (OUTPUT GST)
  | "EQUIPMENT_HIRE_OWN" // own equipment at daily rates (OUTPUT)
  | "EQUIPMENT_HIRE_EXTERNAL" // hired-in equipment at-cost (INPUT pass-through)
  | "CONSUMABLES" // PPE, chemicals (OUTPUT)
  | "WASTE_DISPOSAL" // tipping fees, licensed disposal
  | "THIRD_PARTY_DISBURSEMENT" // structural engineer, IEP testing (INPUT pass-through)
  | "PROJECT_MANAGEMENT" // PM fee (OUTPUT)
  | "DISCOUNT" // negative OUTPUT
  | "INSURANCE_EXCESS"; // OUT_OF_SCOPE

/**
 * All XeroCategory values, in display order, for UI and iteration.
 */
export const XERO_CATEGORIES: readonly XeroCategory[] = [
  "LABOUR_OWN",
  "LABOUR_SUBCONTRACT",
  "EQUIPMENT_HIRE_OWN",
  "EQUIPMENT_HIRE_EXTERNAL",
  "CONSUMABLES",
  "WASTE_DISPOSAL",
  "THIRD_PARTY_DISBURSEMENT",
  "PROJECT_MANAGEMENT",
  "DISCOUNT",
  "INSURANCE_EXCESS",
] as const;

/**
 * Built-in default Xero account codes for each category. Operators override
 * these via `XeroAccountCodeMapping` rows; these are the safe fallbacks when
 * no override is configured.
 *
 * Codes are grouped in the 400s to sit outside the legacy 200–205 range used
 * by the coarse RA-869 resolver (LABOUR / EQUIPMENT / MATERIALS / …), so
 * both schemes can co-exist during the migration window.
 */
export const XERO_CATEGORY_DEFAULT_CODES: Record<XeroCategory, string> = {
  LABOUR_OWN: "400",
  LABOUR_SUBCONTRACT: "401",
  EQUIPMENT_HIRE_OWN: "402",
  EQUIPMENT_HIRE_EXTERNAL: "403",
  CONSUMABLES: "404",
  WASTE_DISPOSAL: "405",
  THIRD_PARTY_DISBURSEMENT: "406",
  PROJECT_MANAGEMENT: "407",
  DISCOUNT: "408",
  INSURANCE_EXCESS: "409",
};

/**
 * Human-readable descriptions, used by the settings UI and for diagnostics.
 */
export const XERO_CATEGORY_DESCRIPTIONS: Record<XeroCategory, string> = {
  LABOUR_OWN: "Own-staff labour (OUTPUT GST)",
  LABOUR_SUBCONTRACT: "Subcontractor labour onsold (OUTPUT GST)",
  EQUIPMENT_HIRE_OWN: "Own equipment at daily rates (OUTPUT)",
  EQUIPMENT_HIRE_EXTERNAL:
    "External equipment hire passed through at cost (INPUT)",
  CONSUMABLES: "PPE, chemicals, own consumables (OUTPUT)",
  WASTE_DISPOSAL: "Tipping fees, licensed disposal",
  THIRD_PARTY_DISBURSEMENT:
    "Structural engineer, IEP, pass-through third-party (INPUT)",
  PROJECT_MANAGEMENT: "Project management fee (OUTPUT)",
  DISCOUNT: "Discount line item (negative OUTPUT)",
  INSURANCE_EXCESS:
    "Insurance excess collected on behalf of insurer (OUT_OF_SCOPE)",
};

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Mapping from scope-generator `itemType` strings to a `XeroCategory`.
 * Sourced directly from `docs/gst-treatment-matrix.md` (RA-859). Keep the two
 * in sync — a new scope-generator item MUST be added here before it can be
 * routed to the correct Xero account.
 */
const ITEM_TYPE_TO_CATEGORY: Record<string, XeroCategory> = {
  // scope-prelims (RA-859)
  mobilisation: "LABOUR_OWN",
  daily_monitoring: "LABOUR_OWN",
  waste_disposal_standard: "WASTE_DISPOSAL",
  waste_disposal_contaminated: "WASTE_DISPOSAL",
  safety_ppe: "CONSUMABLES",
  ppe_standard: "CONSUMABLES",
  ppe_premium: "CONSUMABLES",
  project_management: "PROJECT_MANAGEMENT",
  equipment_transport: "EQUIPMENT_HIRE_OWN",

  // scope-fire — own labour + consumables; ozone/hydroxyl are own equipment
  fire_soot_cleaning: "LABOUR_OWN",
  fire_odour_neutralisation: "CONSUMABLES",
  fire_sealant_application: "CONSUMABLES",
  ozone_treatment: "EQUIPMENT_HIRE_OWN",
  hydroxyl_treatment: "EQUIPMENT_HIRE_OWN",
  thermal_fogging: "EQUIPMENT_HIRE_OWN",

  // scope-mould — own labour + equipment; third-party inspection/testing pass-through
  mould_class_1: "LABOUR_OWN",
  mould_class_2: "LABOUR_OWN",
  mould_class_3: "LABOUR_OWN",
  mould_class_4: "LABOUR_OWN",
  hvac_inspection: "THIRD_PARTY_DISBURSEMENT",
  clearance_testing: "THIRD_PARTY_DISBURSEMENT",
  post_remediation_verification: "THIRD_PARTY_DISBURSEMENT",

  // scope-storm — own equipment + labour; structural engineer pass-through
  storm_extraction: "EQUIPMENT_HIRE_OWN",
  storm_drying: "EQUIPMENT_HIRE_OWN",
  temporary_weatherproof: "LABOUR_OWN",
  structural_inspection: "THIRD_PARTY_DISBURSEMENT",
  cat3_sanitation: "CONSUMABLES",
  antimicrobial_treatment: "CONSUMABLES",

  // scope-biohazard (RA-866)
  biohazard_handling_compliance: "LABOUR_OWN",
  licensed_disposal: "WASTE_DISPOSAL",
  sharps_disposal: "WASTE_DISPOSAL",
  specialist_disposal: "WASTE_DISPOSAL",
  epa_waste_manifest: "LABOUR_OWN",
  decomposition_odour_bomb: "CONSUMABLES",
  enzyme_treatment: "CONSUMABLES",
  porous_material_removal: "LABOUR_OWN",
  chemical_neutralisation: "CONSUMABLES",
  chemical_identification: "LABOUR_OWN",

  // billing module
  insurance_excess: "INSURANCE_EXCESS",
  discount: "DISCOUNT",
};

/**
 * Classify a scope item's `itemType` into a `XeroCategory`.
 *
 * Unknown itemTypes default to `LABOUR_OWN` (the most common safe choice for
 * own-staff work). Callers that care about unknown inputs should check with
 * {@link isKnownItemType} first — the resolver treats the fallback as a
 * signal to use the per-integration default rather than a specific category.
 */
export function classifyScopeItem(itemType: string): XeroCategory {
  if (!itemType) return "LABOUR_OWN";
  const normalized = itemType.trim().toLowerCase();
  return ITEM_TYPE_TO_CATEGORY[normalized] ?? "LABOUR_OWN";
}

/**
 * Returns true if the itemType has an explicit classification in the matrix.
 * Callers can use this to distinguish "fell back to default" from "matched".
 */
export function isKnownItemType(itemType: string): boolean {
  if (!itemType) return false;
  return Object.prototype.hasOwnProperty.call(
    ITEM_TYPE_TO_CATEGORY,
    itemType.trim().toLowerCase(),
  );
}

/**
 * List of all known itemTypes — exported for test coverage and diagnostics.
 */
export const KNOWN_ITEM_TYPES: readonly string[] = Object.freeze(
  Object.keys(ITEM_TYPE_TO_CATEGORY),
);
