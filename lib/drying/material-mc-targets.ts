/**
 * Material moisture content (MC) targets for structural drying.
 *
 * finalMC  — the target equilibrium MC% the material must reach (dry standard).
 * baseK    — exponential decay rate constant (per day) under standard conditions
 *            (Cat 1, Class 2, 50 L/day dehumidifier, ~25 m³ room).
 *            Derived from field data and S500:2025 §12.2.2 drying rate guidance.
 *
 * References:
 *   AS-IICRC S500:2025 §12.2.2 — Restoration drying rate factors
 *   AS-IICRC S500:2025 Appendix C — Per-material dry standard references
 */

export interface MaterialTarget {
  /** Target final MC% at drying completion (equals IICRC dry threshold) */
  finalMC: number;
  /**
   * Base exponential decay constant k (day⁻¹).
   * Higher k → faster drying.
   * Formula: MC(d) = finalMC + (initialMC − finalMC) × exp(−k × d)
   */
  baseK: number;
}

/**
 * Lookup table keyed by material string (matches lib/iicrc-dry-standards.ts).
 * S500:2025 §12.2.2 lists drying rate factors; these k values are calibrated
 * to produce completion days consistent with IICRC Class 2 standard conditions.
 */
export const MATERIAL_TARGETS: Record<string, MaterialTarget> = {
  timber: { finalMC: 19, baseK: 0.25 }, // S500:2025 §12.2.2, Appendix C
  softwood: { finalMC: 19, baseK: 0.28 }, // Softwood dries slightly faster than hardwood
  plasterboard: { finalMC: 1.5, baseK: 0.35 }, // Gypsum board — high surface area
  concrete: { finalMC: 3.5, baseK: 0.12 }, // Dense — slowest drying material
  carpet: { finalMC: 3.0, baseK: 0.45 }, // Fast surface evaporation
  vinyl: { finalMC: 3.5, baseK: 0.4 }, // Impermeable face — dries from edges
  particleboard: { finalMC: 10, baseK: 0.18 }, // Dense composite — moderate rate
  brick: { finalMC: 4.0, baseK: 0.1 }, // Porous masonry — slow deep drying
  insulation: { finalMC: 2.0, baseK: 0.5 }, // Fibreglass sheds moisture quickly
  other: { finalMC: 15, baseK: 0.2 }, // Conservative fallback
};

/** Category multipliers on k — Cat 3 contamination requires slower approach / more caution */
export const CATEGORY_K_MULTIPLIER: Record<string, number> = {
  "Category 1": 1.1, // Clean water — slightly faster
  "Category 2": 1.0, // Grey water — baseline
  "Category 3": 0.8, // Black water — slower (remediation slows drying)
};

/** Water class multipliers on k — Class 4 (specialty) materials dry much slower */
export const CLASS_K_MULTIPLIER: Record<string, number> = {
  "Class 1": 1.2,
  "Class 2": 1.0,
  "Class 3": 0.85,
  "Class 4": 0.6,
};
