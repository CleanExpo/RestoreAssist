/**
 * RA-7005 Wave 5 — hazard-driven claim recommendations.
 *
 * Every report should surface the full set of considerations a competent
 * restorer would raise for the claim's hazard profile — not just the priced
 * scope. The "caution" classes (Category 3 water, mould, biohazard/trauma,
 * methamphetamine/chemical, fire/smoke) carry mandatory occupant-safety,
 * contents, perishables, secondary-damage and specialty-drying considerations
 * that are easy to omit and costly (health/liability) when missed.
 *
 * This module maps a hazard profile to a categorised, severity-ranked set of
 * recommendations with clause citations. The text is professional guidance
 * (paraphrase + cite), never a reproduction of standard text; RA-7000's
 * copyright guard protects the report output. RA-7005 W3 additionally grounds
 * the narrative in the S500/S520/S540/S700/RIA RAG at generation time.
 */
import type { HazardProfile } from "@/lib/restoration/ppe-requirements";
import { standardCite } from "@/lib/nir-standards-mapping";

export type RecCategory =
  | "habitability"
  | "safety"
  | "security"
  | "contents"
  | "perishables"
  | "animals_plants"
  | "secondary_damage"
  | "specialty_drying"
  | "soft_goods"
  | "replacement"
  | "documentation";

export type RecSeverity = "caution" | "required" | "advisory";

export interface Recommendation {
  category: RecCategory;
  severity: RecSeverity;
  text: string;
  /** Standard/reg clause this is grounded in (cite, don't reproduce). */
  clause: string;
}

/** Extended hazard inputs beyond PPE (fire/smoke, class, observed cupping). */
export interface ClaimHazardInputs extends HazardProfile {
  /** Water loss class 1-4 (4 = bound-water / specialty drying). */
  waterClass?: number | null;
  /** Fire / smoke damage present. */
  fireSmoke?: boolean;
  /** Timber/engineered floor observed cupping/buckling (bound water). */
  timberFloorCupping?: boolean;
  /** Property was unoccupied at loss (elevates security + secondary damage). */
  unoccupiedAtLoss?: boolean;
  /**
   * RA-8276: water is present even though category and class are not yet
   * known (e.g. a water claim before the tech has classified it). When unset,
   * water is present only if waterCategory or waterClass is set.
   */
  waterPresent?: boolean;
  /**
   * RA-8276: the scope includes ceilings, light fittings, fans, high windows
   * or HVAC heads.
   */
  highLevelWork?: boolean;
  /** RA-8276: number of storeys, when known. */
  storeys?: number | null;
  /** RA-8276: ceiling height in metres, when known. */
  ceilingHeightM?: number | null;
}

const CAT3 = (h: ClaimHazardInputs) => h.waterCategory === "3";
const MOULD = (h: ClaimHazardInputs) => (h.mouldCondition ?? 0) >= 2;
/** RA-8276: water items are only emitted when water is actually present. */
export const WATER_PRESENT = (h: ClaimHazardInputs): boolean =>
  h.waterPresent ?? (h.waterCategory != null || h.waterClass != null);
const CONTAMINATED = (h: ClaimHazardInputs) =>
  CAT3(h) || MOULD(h) || Boolean(h.biohazard) || Boolean(h.chemical);

/**
 * Build the categorised recommendation set for a claim. Recommendations are
 * additive across the hazards present; the caution classes add the mandatory
 * occupant/health items. Deduped by (category + text).
 */
export function claimRecommendations(h: ClaimHazardInputs): Recommendation[] {
  const recs: Recommendation[] = [];
  const add = (
    category: RecCategory,
    severity: RecSeverity,
    text: string,
    clause: string,
  ) => recs.push({ category, severity, text, clause });

  const contaminated = CONTAMINATED(h);
  const water = WATER_PRESENT(h);

  // ── Habitability / occupancy ──────────────────────────────────────────────
  if (contaminated) {
    add(
      "habitability",
      "caution",
      water
        ? "Assess habitability: contaminated (Category 3 / mould / biohazard) works under containment generally make the dwelling unsafe to occupy — recommend temporary accommodation / decant for the works."
        : "Assess habitability: contaminated (mould / biohazard / chemical) works under containment generally make the dwelling unsafe to occupy — recommend temporary accommodation / decant for the works.",
      water
        ? "IICRC S500:2021 §10 / S520:2024 (occupant protection)"
        : contaminantClause(h),
    );
    add(
      "habitability",
      "required",
      water
        ? "Equipment noise: LGR dehumidifiers and AFD/HEPA scrubbers run 24/7 at ~55–70 dB — over sleeping thresholds. If anyone remains on site, document noise and do not run air movers overnight in occupied rooms."
        : "Equipment noise: AFD/HEPA air scrubbers run 24/7 at ~55–70 dB — over sleeping thresholds. If anyone remains on site, document noise and do not run them overnight in occupied rooms.",
      water ? "WHS (noise) / S500:2021 §8" : "WHS (noise)",
    );
    add(
      "habitability",
      "required",
      "Vulnerable occupants (infants, elderly, asthmatic, immunocompromised) must not remain in the affected/containment zone.",
      water || MOULD(h)
        ? "IICRC S520:2024 §5 (Safety and Health)"
        : contaminantClause(h),
    );
  }
  if (h.chemical) {
    add(
      "habitability",
      "caution",
      "Chemical / methamphetamine decontamination: property must remain unoccupied until clearance sampling confirms remediation to the applicable guideline.",
      "AU meth remediation guideline / WHS",
    );
  }

  // ── Site safety ───────────────────────────────────────────────────────────
  add(
    "safety",
    "required",
    water
      ? "Trip hazards: tape down or ramp all power leads/cords (particularly a multi-air-mover run across circulation paths)."
      : "Trip hazards: tape down or ramp all power leads/cords (particularly leads to air scrubbers and work lights across circulation paths).",
    water ? `WHS / IICRC ${standardCite("S500", "8")}` : "WHS",
  );
  if (water) {
    add(
      "safety",
      "required",
      "Slip/wet-floor signage at every affected threshold; containment + biohazard signage on contaminated zones.",
      `WHS / IICRC ${standardCite("S520", "12")}`,
    );
  } else if (contaminated) {
    add(
      "safety",
      "required",
      "Containment + biohazard signage on contaminated zones.",
      `WHS / IICRC ${standardCite("S520", "12")}`,
    );
  }
  const height = workingAtHeight(h);
  add("safety", height.severity, height.text, "WHS (working at height)");
  add(
    "safety",
    "required",
    "Electrical: lock out isolated circuits; all equipment on RCD-protected leads; licensed electrician to certify re-energisation.",
    water
      ? `AS/NZS 3000 / IICRC ${standardCite("S500", "10.1")}`
      : "AS/NZS 3000 / WHS (electrical)",
  );

  // ── Property security ─────────────────────────────────────────────────────
  if (h.unoccupiedAtLoss || contaminated) {
    add(
      "security",
      "advisory",
      water
        ? "Secure the property during unoccupied drying: lock/board-up any access points opened for works, key register, alarm/monitoring; photo-document pre-existing condition to cap liability."
        : "Secure the property while it is unoccupied for the works: lock/board-up any access points opened for works, key register, alarm/monitoring; photo-document pre-existing condition to cap liability.",
      water
        ? "IICRC S500:2021 §9 (administrative procedures & risk)"
        : "General duty of care",
    );
  }

  // ── Contents ──────────────────────────────────────────────────────────────
  if (water) {
    add(
      "contents",
      "required",
      "Block-and-elevate salvageable items off wet floors immediately; itemised inventory with photographs; log valuables/irreplaceables separately.",
      `IICRC ${standardCite("S500", "14")} (Contents Evaluation, Restoration, and Remediation)`,
    );
  } else {
    add(
      "contents",
      "required",
      "Itemised contents inventory with photographs; log valuables/irreplaceables separately.",
      nonWaterClause(h),
    );
  }
  if (contaminated) {
    add(
      "contents",
      "caution",
      water
        ? "Pack-out affected/at-risk contents to off-site climate-controlled storage for the works; pack-back and re-place on completion. Porous contents with Category 3 / mould exposure are generally non-restorable."
        : "Pack-out affected/at-risk contents to off-site climate-controlled storage for the works; pack-back and re-place on completion. Porous contents exposed to mould, biohazard or chemical contamination are generally non-restorable.",
      water ? "IICRC S500:2021 §14 / S520:2024 §12" : contaminantClause(h),
    );
  }

  // ── Perishables & health-sensitive ────────────────────────────────────────
  if (contaminated) {
    add(
      "perishables",
      "caution",
      water
        ? "Dispose of Category-3-exposed / spoiled food and refrigerator/freezer contents; clean and sanitise the appliances."
        : "Dispose of contaminated or spoiled food and refrigerator/freezer contents; clean and sanitise the appliances.",
      water
        ? "IICRC S500:2021 §14 / public-health guidance"
        : "Public-health guidance",
    );
    add(
      "perishables",
      "caution",
      water
        ? "Medications, cosmetics and makeup exposed to contaminated water are porous/absorbent — dispose; do not attempt to salvage."
        : "Medications, cosmetics and makeup exposed to the contamination are porous/absorbent — dispose; do not attempt to salvage.",
      water ? "IICRC S500:2021 §12.2 (porous materials)" : contaminantClause(h),
    );
  }

  // ── Plants & animals ──────────────────────────────────────────────────────
  add(
    "animals_plants",
    "advisory",
    "Relocate indoor plants (chemicals, low light, disturbance).",
    "General duty of care",
  );
  if (contaminated) {
    add(
      "animals_plants",
      "caution",
      water
        ? "Relocate pets/animals for the works — contaminated water, antimicrobials, containment and equipment noise present a welfare and safety risk."
        : "Relocate pets/animals for the works — contamination, antimicrobials, containment and equipment noise present a welfare and safety risk.",
      "WHS / animal welfare duty",
    );
  }

  // ── Secondary damage ──────────────────────────────────────────────────────
  if (water) {
    add(
      "secondary_damage",
      "required",
      "Prevent secondary damage: protect metal fixtures, fasteners, appliance bases and hardware from rust/corrosion; treat tannin/water-mark bleed on timber, cabinetry and skirting before it sets.",
      `RIA CR Manual (corrosion / water marks) / IICRC ${standardCite("S500", "12")}`,
    );
  }
  if (MOULD(h) || CAT3(h)) {
    add(
      "secondary_damage",
      "caution",
      water
        ? "Uncontrolled moisture will amplify microbial growth within 24–72h and can delaminate engineered materials — maintain drying and containment continuously."
        : "Uncontrolled moisture will amplify microbial growth within 24–72h and can delaminate engineered materials — find and correct the moisture source and keep containment in place continuously.",
      water
        ? "IICRC S520:2024 §12 / S500:2021 §12.5"
        : `IICRC ${standardCite("S520")}`,
    );
  }
  if (h.fireSmoke) {
    add(
      "secondary_damage",
      "caution",
      "Smoke acids corrode metals quickly and odour off-gasses from porous materials — clean/neutralise and seal early to arrest ongoing damage.",
      "IICRC S700:2025 / RIA CR Manual (smoke chemistry)",
    );
  }

  // ── Specialty drying (Class 4 / bound water) ─────────────────────────────
  if (h.timberFloorCupping || h.waterClass === 4) {
    add(
      "specialty_drying",
      "caution",
      "Cupping/buckling engineered or timber flooring indicates bound water (Class 4) with low evaporation — deploy specialty mat/injection drying and monitor; if cupping is permanent after dry-down, replace rather than sand.",
      "IICRC S500:2021 §12.2 (specialty drying) / RIA CR Manual (bound water)",
    );
  }

  // ── Soft goods & laundry ──────────────────────────────────────────────────
  if (contaminated) {
    add(
      "soft_goods",
      "required",
      water
        ? "Remove curtains/blinds; launder or dispose if wicked with contaminated water. Antimicrobial-launder affected clothing, linen and bedding, or dispose where Category 3."
        : "Remove curtains/blinds; clean or dispose if contaminated. Antimicrobial-launder affected clothing, linen and bedding, or dispose where heavily contaminated.",
      water ? "IICRC S500:2021 §14 / §12.2" : contaminantClause(h),
    );
  }

  // ── Replacement ───────────────────────────────────────────────────────────
  if (CAT3(h) || MOULD(h)) {
    add(
      "replacement",
      "advisory",
      "Allow like-for-like replacement of removed non-restorable materials (carpet, underlay, skirting, paint) in addition to structural reinstatement.",
      water
        ? "IICRC S500:2021 §12 (structural restoration & reinstatement)"
        : `IICRC ${standardCite("S520")}`,
    );
  }

  // ── Documentation & monitoring ────────────────────────────────────────────
  if (water) {
    add(
      "documentation",
      "required",
      "Maintain daily psychrometric and moisture logs, per-stage photographs, and moisture maps; verify drying goals are met before reinstatement.",
      `IICRC ${standardCite("S500", "12.5.7")} / §9 (documentation)`,
    );
  } else {
    add(
      "documentation",
      "required",
      "Per-stage photographs (before, during, after) referenced to each room; record every test and reading taken, with its result.",
      nonWaterClause(h),
    );
  }

  // Dedupe by category + text.
  const seen = new Set<string>();
  return recs.filter((r) => {
    const k = `${r.category}::${r.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * RA-8276: the clause a contaminated item cites when no water is present.
 * Without water, "contaminated" means mould, biohazard or chemical.
 */
function contaminantClause(h: ClaimHazardInputs): string {
  if (MOULD(h)) return `IICRC ${standardCite("S520")}`;
  if (h.biohazard) return `IICRC ${standardCite("S540")}`;
  if (h.chemical) return "AU meth remediation guideline / WHS";
  return "General duty of care";
}

/**
 * The standard a non-water contents/documentation item cites: S700 for fire,
 * S520 for mould, S540 for biohazard, otherwise the general duty of care.
 */
function nonWaterClause(h: ClaimHazardInputs): string {
  if (h.fireSmoke) return `IICRC ${standardCite("S700")}`;
  if (MOULD(h)) return `IICRC ${standardCite("S520")}`;
  if (h.biohazard) return `IICRC ${standardCite("S540")}`;
  return "General duty of care";
}

/**
 * RA-8276 defect 2. Working at height is required whenever the scope includes
 * ceilings, light fittings, fans, high windows or HVAC heads (a fire/smoke
 * clean always does: residue deposits on ceilings first), or the property has
 * two or more storeys, or ceilings of 2.4 m or more. The wording names the
 * actual tasks rather than a water-only "ceiling moisture" case.
 */
export function workingAtHeight(h: ClaimHazardInputs): {
  severity: RecSeverity;
  text: string;
} {
  const tasks: string[] = [];
  if (h.fireSmoke) {
    tasks.push(
      "cleaning smoke residue from ceilings, cornices, light fittings, fans, high windows and HVAC heads",
    );
  } else if (h.highLevelWork) {
    tasks.push(
      "work on ceilings, light fittings, fans, high windows or HVAC heads",
    );
  }
  if ((h.storeys ?? 0) >= 2) tasks.push("stairwell and upper-floor access");
  if (h.ceilingHeightM != null && h.ceilingHeightM >= 2.4) {
    tasks.push(`ceilings at ${h.ceilingHeightM} m`);
  }
  const controls =
    "use a rated platform ladder or scaffold with fall controls and do not overreach.";
  if (tasks.length > 0) {
    return {
      severity: "required",
      text: `Working at height is required for this job (${tasks.join("; ")}): ${controls}`,
    };
  }
  return {
    severity: "advisory",
    text: `Working at height: if any task needs a ladder (for example ${
      WATER_PRESENT(h)
        ? "ceiling moisture checks"
        : "high-level cleaning or inspection"
    }), ${controls}`,
  };
}

/** True when the profile is a "caution" class needing the mandatory items. */
export function isCautionClaim(h: ClaimHazardInputs): boolean {
  return CONTAMINATED(h) || Boolean(h.fireSmoke) || Boolean(h.asbestos);
}
