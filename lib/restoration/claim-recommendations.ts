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
}

const CAT3 = (h: ClaimHazardInputs) => h.waterCategory === "3";
const MOULD = (h: ClaimHazardInputs) => (h.mouldCondition ?? 0) >= 2;
const CONTAMINATED = (h: ClaimHazardInputs) =>
  CAT3(h) || MOULD(h) || Boolean(h.biohazard) || Boolean(h.chemical);

/**
 * Build the categorised recommendation set for a claim. Recommendations are
 * additive across the hazards present; the caution classes add the mandatory
 * occupant/health items. Deduped by (category + text).
 */
export function claimRecommendations(
  h: ClaimHazardInputs,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const add = (
    category: RecCategory,
    severity: RecSeverity,
    text: string,
    clause: string,
  ) => recs.push({ category, severity, text, clause });

  const contaminated = CONTAMINATED(h);

  // ── Habitability / occupancy ──────────────────────────────────────────────
  if (contaminated) {
    add(
      "habitability",
      "caution",
      "Assess habitability: contaminated (Category 3 / mould / biohazard) works under containment generally make the dwelling unsafe to occupy — recommend temporary accommodation / decant for the works.",
      "IICRC S500:2021 §10 / S520:2024 (occupant protection)",
    );
    add(
      "habitability",
      "required",
      "Equipment noise: LGR dehumidifiers and AFD/HEPA scrubbers run 24/7 at ~55–70 dB — over sleeping thresholds. If anyone remains on site, document noise and do not run air movers overnight in occupied rooms.",
      "WHS (noise) / S500:2021 §8",
    );
    add(
      "habitability",
      "required",
      "Vulnerable occupants (infants, elderly, asthmatic, immunocompromised) must not remain in the affected/containment zone.",
      "IICRC S520:2024 §14 (worker & occupant protection)",
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
    "Trip hazards: tape down or ramp all power leads/cords (particularly a multi-air-mover run across circulation paths).",
    "WHS / IICRC S500:2021 §8",
  );
  add(
    "safety",
    "required",
    "Slip/wet-floor signage at every affected threshold; containment + biohazard signage on contaminated zones.",
    "WHS / IICRC S520:2024 §12",
  );
  add(
    "safety",
    "advisory",
    "Working at height (ceiling/cornice moisture): use rated ladders/scaffold with fall controls; do not overreach.",
    "WHS (working at height) / RIA CR Manual",
  );
  add(
    "safety",
    "required",
    "Electrical: lock out isolated circuits; all equipment on RCD-protected leads; licensed electrician to certify re-energisation.",
    "AS/NZS 3000 / IICRC S500:2021 §10.1",
  );

  // ── Property security ─────────────────────────────────────────────────────
  if (h.unoccupiedAtLoss || contaminated) {
    add(
      "security",
      "advisory",
      "Secure the property during unoccupied drying: lock/board-up any access points opened for works, key register, alarm/monitoring; photo-document pre-existing condition to cap liability.",
      "IICRC S500:2021 §9 (administrative procedures & risk)",
    );
  }

  // ── Contents ──────────────────────────────────────────────────────────────
  add(
    "contents",
    "required",
    "Block-and-elevate salvageable items off wet floors immediately; itemised inventory with photographs; log valuables/irreplaceables separately.",
    "IICRC S500:2021 §14 (Contents Evaluation, Restoration, and Remediation)",
  );
  if (contaminated) {
    add(
      "contents",
      "caution",
      "Pack-out affected/at-risk contents to off-site climate-controlled storage for the works; pack-back and re-place on completion. Porous contents with Category 3 / mould exposure are generally non-restorable.",
      "IICRC S500:2021 §14 / S520:2024 §12",
    );
  }

  // ── Perishables & health-sensitive ────────────────────────────────────────
  if (contaminated) {
    add(
      "perishables",
      "caution",
      "Dispose of Category-3-exposed / spoiled food and refrigerator/freezer contents; clean and sanitise the appliances.",
      "IICRC S500:2021 §14 / public-health guidance",
    );
    add(
      "perishables",
      "caution",
      "Medications, cosmetics and makeup exposed to contaminated water are porous/absorbent — dispose; do not attempt to salvage.",
      "IICRC S500:2021 §12.2 (porous materials)",
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
      "Relocate pets/animals for the works — contaminated water, antimicrobials, containment and equipment noise present a welfare and safety risk.",
      "WHS / animal welfare duty",
    );
  }

  // ── Secondary damage ──────────────────────────────────────────────────────
  add(
    "secondary_damage",
    "required",
    "Prevent secondary damage: protect metal fixtures, fasteners, appliance bases and hardware from rust/corrosion; treat tannin/water-mark bleed on timber, cabinetry and skirting before it sets.",
    "RIA CR Manual (corrosion / water marks) / IICRC S500:2021 §12",
  );
  if (MOULD(h) || CAT3(h)) {
    add(
      "secondary_damage",
      "caution",
      "Uncontrolled moisture will amplify microbial growth within 24–72h and can delaminate engineered materials — maintain drying and containment continuously.",
      "IICRC S520:2024 §12 / S500:2021 §12.5",
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
      "Remove curtains/blinds; launder or dispose if wicked with contaminated water. Antimicrobial-launder affected clothing, linen and bedding, or dispose where Category 3.",
      "IICRC S500:2021 §14 / §12.2",
    );
  }

  // ── Replacement ───────────────────────────────────────────────────────────
  if (CAT3(h) || MOULD(h)) {
    add(
      "replacement",
      "advisory",
      "Allow like-for-like replacement of removed non-restorable materials (carpet, underlay, skirting, paint) in addition to structural reinstatement.",
      "IICRC S500:2021 §12 (structural restoration & reinstatement)",
    );
  }

  // ── Documentation & monitoring ────────────────────────────────────────────
  add(
    "documentation",
    "required",
    "Maintain daily psychrometric and moisture logs, per-stage photographs, and moisture maps; verify drying goals are met before reinstatement.",
    "IICRC S500:2021 §12.5.7 / §9 (documentation)",
  );

  // Dedupe by category + text.
  const seen = new Set<string>();
  return recs.filter((r) => {
    const k = `${r.category}::${r.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** True when the profile is a "caution" class needing the mandatory items. */
export function isCautionClaim(h: ClaimHazardInputs): boolean {
  return (
    CONTAMINATED(h) || Boolean(h.fireSmoke) || Boolean(h.asbestos)
  );
}
