/**
 * RA-7005 Wave 4 — PPE requirements derived from the claim's hazard
 * classification. Required protective equipment must NEVER be left to the
 * technician's judgement or omitted: wrong/absent PPE on a Category 3 or mould
 * job is a WHS breach and a health/liability exposure. This module maps the
 * classification to a required PPE set with standard references, so the scope
 * and report state it every time and the completeness gate can flag its
 * absence.
 *
 * Standards: IICRC S500 (water), S520 (mould), S540 (trauma/biohazard);
 * WHS Act; AS/NZS 1715/1716 (respiratory protection selection + fit). Grounded
 * further in the S500/S520/S540/RIA RAG (RA-7000) at report time.
 */

export type WaterCategory = "1" | "2" | "3";
/** S520 mould condition: 1 = normal, 2 = settled spores, 3 = actual growth. */
export type MouldCondition = 0 | 1 | 2 | 3;

export interface HazardProfile {
  waterCategory?: WaterCategory | null;
  mouldCondition?: MouldCondition | null;
  asbestos?: boolean;
  biohazard?: boolean;
  chemical?: boolean; // e.g. meth decontamination
  /**
   * Fire/smoke/soot exposure. Soot is a fine respirable particulate carrying
   * PAHs/VOCs — routine restoration soot handling requires P2 minimum + skin
   * cover (IICRC S700). Callers (reconcile-pricing-safety) already derive this
   * flag; it must map to a PPE set rather than being silently dropped.
   */
  fireSmoke?: boolean;
}

/** Respiratory protection tiers, ordered — the highest required tier wins. */
export const RPE_TIERS = ["none", "P2", "P3", "PAPR"] as const;
export type RpeTier = (typeof RPE_TIERS)[number];

export interface PpeRequirement {
  /** Minimum respiratory protection (AS/NZS 1715/1716; fit-test at P3+). */
  respiratory: RpeTier;
  /** Body/skin protection items. */
  items: string[];
  /** Whether a formal decontamination procedure on exit is required. */
  decontamination: boolean;
  /** Standard/regulatory references that drive this set. */
  references: string[];
  /** Hard stops / escalations the estimator must action. */
  escalations: string[];
}

function maxRpe(a: RpeTier, b: RpeTier): RpeTier {
  return RPE_TIERS.indexOf(a) >= RPE_TIERS.indexOf(b) ? a : b;
}

/**
 * Derive the required PPE set from a hazard profile. When multiple hazards
 * co-occur the strictest wins (highest RPE tier, union of items, decon if any
 * hazard demands it). Asbestos returns a hard-stop escalation — RestoreAssist
 * technicians do not disturb asbestos; it goes to a licensed removalist.
 */
export function requiredPpe(hazard: HazardProfile): PpeRequirement {
  const items = new Set<string>([
    "Safety footwear",
    "Eye protection",
    "Work gloves",
  ]);
  const references = new Set<string>(["WHS Act / Regulations"]);
  const escalations: string[] = [];
  let respiratory: RpeTier = "none";
  let decontamination = false;

  const cat = hazard.waterCategory;
  if (cat === "2") {
    respiratory = maxRpe(respiratory, "P2");
    items.add("Nitrile gloves");
    items.add("Coveralls");
    references.add("IICRC S500:2021 §8 (Safety and Health)");
  }
  if (cat === "3") {
    respiratory = maxRpe(respiratory, "P3");
    items.add("Full-face or P3 respirator");
    items.add("Impervious hooded coveralls (e.g. Tyvek)");
    items.add("Rubber boots");
    items.add("Double nitrile gloves");
    items.add("Face/splash protection");
    decontamination = true;
    references.add("IICRC S500:2021 §8 (Safety and Health)");
    references.add("AS/NZS 1715/1716 (RPE)");
  }

  const mc = hazard.mouldCondition ?? 0;
  if (mc >= 2) {
    respiratory = maxRpe(respiratory, mc >= 3 ? "P3" : "P2");
    items.add("Disposable hooded coveralls");
    items.add("Sealed goggles");
    items.add("Nitrile gloves");
    if (mc >= 3) {
      respiratory = maxRpe(respiratory, "P3");
      escalations.push(
        "S520 Condition 3 (active growth): fit-tested RPE required (AS/NZS 1715); consider PAPR for heavy remediation.",
      );
    }
    references.add("IICRC S520:2024 §14 (worker protection)");
    references.add("AS/NZS 1715/1716 (RPE)");
    decontamination = decontamination || mc >= 3;
  }

  if (hazard.biohazard) {
    respiratory = maxRpe(respiratory, "P3");
    items.add("Fluid-resistant coveralls");
    items.add("Face shield");
    items.add("Double gloves");
    items.add("Boot covers");
    decontamination = true;
    references.add("IICRC S540 (trauma & biohazard)");
  }

  if (hazard.chemical) {
    respiratory = maxRpe(respiratory, "P2");
    items.add("Chemical-resistant gloves");
    items.add("Chemical-resistant suit");
    items.add("Cartridge respirator (appropriate to the chemical)");
    decontamination = true;
    references.add("SDS / WHS chemical handling");
  }

  if (hazard.fireSmoke) {
    respiratory = maxRpe(respiratory, "P2");
    items.add("Nitrile gloves");
    items.add("Coveralls");
    items.add("P2 particulate mask (soot)");
    references.add("IICRC S700:2025 §4 (Safety and Health)");
    escalations.push(
      "Heavy soot / confined or unventilated spaces: escalate to P3/PAPR and test for pre-1990 ACM before disturbing fire-damaged materials.",
    );
  }

  if (hazard.asbestos) {
    escalations.push(
      "ASBESTOS SUSPECTED — STOP. Do not disturb. Engage a licensed asbestos assessor/removalist; licensed asbestos PPE + decontamination unit apply (not general restoration PPE).",
    );
    references.add("WHS (asbestos) Regulations");
  }

  return {
    respiratory,
    items: Array.from(items),
    decontamination,
    references: Array.from(references),
    escalations,
  };
}

/** One-line human summary for a report/scope line. */
export function summarisePpe(ppe: PpeRequirement): string {
  const rpe =
    ppe.respiratory === "none"
      ? "no respiratory protection required"
      : `${ppe.respiratory} respiratory protection`;
  return `${rpe}; ${ppe.items.join(", ")}${
    ppe.decontamination ? "; decontamination on exit" : ""
  }.`;
}
