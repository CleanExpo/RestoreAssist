/**
 * Damage marker types and severity definitions for SVG icon registry.
 * Covers Australian water damage restoration context (IICRC S500 / S520).
 */

/** Recognised damage categories for on-site markers. */
export type DamageType =
  | "water"
  | "fire"
  | "mold"
  | "structural"
  | "electrical"
  | "sewage"
  | "wind";

/** Traffic-light severity scale used to colour-code markers. */
export type SeverityLevel = "low" | "medium" | "high" | "critical";

/** Hex colours per severity — green → amber → orange → red. */
export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  low: "#22c55e", // green-500
  medium: "#f59e0b", // amber-500
  high: "#f97316", // orange-500
  critical: "#ef4444", // red-500
};

/** All recognised damage types in a stable array (useful for exhaustiveness checks). */
export const ALL_DAMAGE_TYPES: DamageType[] = [
  "water",
  "fire",
  "mold",
  "structural",
  "electrical",
  "sewage",
  "wind",
];

/** All severity levels in ascending order. */
export const ALL_SEVERITY_LEVELS: SeverityLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
];
