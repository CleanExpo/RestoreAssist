/**
 * Icon registry for damage markers.
 *
 * Each icon definition bundles the SVG path, the severity it represents,
 * and the resolved hex colour for that severity.
 *
 * Public API:
 *   getIcon(type)           → IconDefinition | undefined
 *   getIconsBySeverity(s)   → IconDefinition[]
 *   getColor(severity)      → string | undefined
 *   listAll()               → readonly IconDefinition[]
 */

import {
  ALL_DAMAGE_TYPES,
  ALL_SEVERITY_LEVELS,
  SEVERITY_COLORS,
  type DamageType,
  type SeverityLevel,
} from "./damage-marker-types";
import { DAMAGE_SVG_PATHS } from "./damage-marker-svgs";

export interface IconDefinition {
  /** The damage category this icon represents. */
  type: DamageType;
  /** Severity level this damage type defaults to on a new marker. */
  severity: SeverityLevel;
  /** SVG path `d` attribute, 24×24 viewBox. */
  svgPath: string;
  /** Resolved hex colour for the severity level. */
  hexColor: string;
  /** Human-readable label for use in legends and tooltips. */
  label: string;
}

// ---------------------------------------------------------------------------
// Static severity defaults per damage type
// ---------------------------------------------------------------------------
const DEFAULT_SEVERITY: Record<DamageType, SeverityLevel> = {
  water: "medium",
  fire: "high",
  mold: "medium",
  structural: "high",
  electrical: "critical",
  sewage: "critical",
  wind: "low",
};

const LABELS: Record<DamageType, string> = {
  water: "Water Damage",
  fire: "Fire Damage",
  mold: "Mould / Mold",
  structural: "Structural Damage",
  electrical: "Electrical Hazard",
  sewage: "Sewage Contamination",
  wind: "Wind Damage",
};

// ---------------------------------------------------------------------------
// Build the registry once at module load — frozen for immutability
// ---------------------------------------------------------------------------
const _registry: ReadonlyMap<DamageType, IconDefinition> = new Map(
  ALL_DAMAGE_TYPES.map((type) => {
    const severity = DEFAULT_SEVERITY[type];
    const entry: IconDefinition = Object.freeze({
      type,
      severity,
      svgPath: DAMAGE_SVG_PATHS[type],
      hexColor: SEVERITY_COLORS[severity],
      label: LABELS[type],
    });
    return [type, entry];
  }),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the icon definition for a damage type, or `undefined` if unknown.
 */
export function getIcon(type: DamageType): IconDefinition | undefined {
  return _registry.get(type);
}

/**
 * Returns all icon definitions whose default severity matches `severity`.
 * Returns an empty array for an unrecognised severity value.
 */
export function getIconsBySeverity(severity: SeverityLevel): IconDefinition[] {
  if (!ALL_SEVERITY_LEVELS.includes(severity)) return [];
  const result: IconDefinition[] = [];
  for (const icon of _registry.values()) {
    if (icon.severity === severity) result.push(icon);
  }
  return result;
}

/**
 * Returns the hex colour for a severity level, or `undefined` if unknown.
 */
export function getColor(severity: SeverityLevel): string | undefined {
  return SEVERITY_COLORS[severity];
}

/**
 * Returns every registered icon definition in insertion order.
 */
export function listAll(): readonly IconDefinition[] {
  return Array.from(_registry.values());
}
