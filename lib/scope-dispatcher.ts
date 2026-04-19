/**
 * RA-867: Scope Dispatcher
 *
 * Routes a job's damage classification to the appropriate IICRC checklist(s).
 * Replaces ad-hoc switch/case logic previously scattered across NIR sync,
 * inspection report generation, and estimate building.
 *
 * Supports multi-loss jobs (e.g. storm + water ingress + mould growth) by
 * returning a prioritised list of templates. Callers merge/dedupe line items
 * from the returned checklists.
 *
 * Covers: water / fire / mould / storm / biohazard
 */

import {
  IICRC_CHECKLISTS,
  type ChecklistTemplate,
  type ChecklistCategory,
} from "./iicrc-checklists";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DamageType =
  | "WATER"
  | "FIRE"
  | "MOULD"
  | "STORM"
  | "BIOHAZARD"
  | "MULTI_LOSS"
  | "GENERAL";

export type WaterCategory = "1" | "2" | "3";
export type WaterClass = "1" | "2" | "3" | "4";

export interface DispatchInput {
  /** Primary damage type — drives the main checklist selection. */
  damageType: DamageType;
  /** For water/biohazard — Cat 1 (clean), 2 (grey), 3 (black/sewage). */
  waterCategory?: WaterCategory | null;
  /** For water — Class 1 (minimal) through 4 (bound moisture). */
  waterClass?: WaterClass | null;
  /**
   * For storm — whether water ingress is present. When true, the storm-water-ingress
   * checklist is included alongside the wind-damage checklist.
   */
  stormWaterIngress?: boolean | null;
  /**
   * For biohazard — distinguishes trauma-scene (blood/OSR) from sewage (Cat 3 water).
   * Defaults to "sewage" for unclassified biohazards.
   */
  biohazardSubtype?: "sewage" | "trauma" | null;
  /**
   * For multi-loss — array of secondary damage types to include.
   * Each secondary type's checklist(s) are appended to the primary.
   */
  secondaryDamageTypes?: DamageType[] | null;
}

export interface DispatchResult {
  /** Primary checklist (first choice for UI default). */
  primary: ChecklistTemplate;
  /** Secondary checklists — applied alongside primary for multi-loss. */
  secondary: ChecklistTemplate[];
  /** Merged list — primary first, then secondaries in order. */
  all: ChecklistTemplate[];
  /** Category labels present in the dispatch (for UI grouping). */
  categories: ChecklistCategory[];
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

function findChecklist(id: string): ChecklistTemplate | null {
  return IICRC_CHECKLISTS.find((c) => c.id === id) ?? null;
}

function findByCategory(category: ChecklistCategory): ChecklistTemplate[] {
  return IICRC_CHECKLISTS.filter((c) => c.category === category);
}

/**
 * Pick the best water checklist for a given (category, class) combination.
 * Falls back through progressively coarser matches when no exact template exists.
 */
function dispatchWater(
  cat: WaterCategory | null | undefined,
  cls: WaterClass | null | undefined,
): ChecklistTemplate {
  // Cat 3 is treated as biohazard-sewage — it's the correct standard for Cat 3
  if (cat === "3") {
    const sewage = findChecklist("biohazard-sewage");
    if (sewage) return sewage;
  }

  // Try exact (cat, class) match
  if (cat && cls) {
    const exact = findChecklist(`water-cat${cat}-class${cls}`);
    if (exact) return exact;
  }

  // Fall back to any water checklist matching the category
  if (cat) {
    const byCat = IICRC_CHECKLISTS.find(
      (c) => c.category === "water" && c.damageClass?.startsWith(cat),
    );
    if (byCat) return byCat;
  }

  // Last resort — first water checklist (Cat 1 Class 1 is the safest coarse default)
  const anyWater = findByCategory("water")[0];
  if (anyWater) return anyWater;

  // Should never happen — the library always ships water checklists
  throw new Error(
    "[scope-dispatcher] No water checklist available — library misconfigured",
  );
}

function dispatchFire(): ChecklistTemplate {
  const t = findChecklist("fire-smoke");
  if (!t) {
    throw new Error("[scope-dispatcher] fire-smoke checklist missing");
  }
  return t;
}

function dispatchMould(): ChecklistTemplate {
  const t = findChecklist("mould-remediation");
  if (!t) {
    throw new Error("[scope-dispatcher] mould-remediation checklist missing");
  }
  return t;
}

function dispatchStorm(withWaterIngress: boolean | null | undefined): {
  primary: ChecklistTemplate;
  secondary: ChecklistTemplate[];
} {
  const wind = findChecklist("storm-wind-damage");
  if (!wind) {
    throw new Error("[scope-dispatcher] storm-wind-damage checklist missing");
  }
  const secondary: ChecklistTemplate[] = [];
  if (withWaterIngress) {
    const ingress = findChecklist("storm-water-ingress");
    if (ingress) secondary.push(ingress);
  }
  return { primary: wind, secondary };
}

function dispatchBiohazard(subtype: "sewage" | "trauma" | null | undefined): {
  primary: ChecklistTemplate;
  secondary: ChecklistTemplate[];
} {
  const id = subtype === "trauma" ? "biohazard-trauma" : "biohazard-sewage";
  const t = findChecklist(id);
  if (!t) {
    throw new Error(`[scope-dispatcher] ${id} checklist missing`);
  }
  // RA-877: Safe Work Australia biohazard CoP always overlays IICRC scope.
  const secondary: ChecklistTemplate[] = [];
  const swa = findChecklist("safe-work-biohazard");
  if (swa) secondary.push(swa);
  return { primary: t, secondary };
}

/**
 * Dispatch a single primary damage type to its primary + secondary checklists.
 * Broken out so multi-loss can call it per-type and merge results.
 */
function dispatchSingle(input: DispatchInput): {
  primary: ChecklistTemplate;
  secondary: ChecklistTemplate[];
} {
  switch (input.damageType) {
    case "WATER":
      return {
        primary: dispatchWater(input.waterCategory, input.waterClass),
        secondary: [],
      };
    case "FIRE":
      return { primary: dispatchFire(), secondary: [] };
    case "MOULD":
      return { primary: dispatchMould(), secondary: [] };
    case "STORM":
      return dispatchStorm(input.stormWaterIngress);
    case "BIOHAZARD":
      return dispatchBiohazard(input.biohazardSubtype);
    case "GENERAL":
    case "MULTI_LOSS":
    default:
      // Generic fallback — water cat-1 is the most benign default
      return {
        primary: dispatchWater("1", "1"),
        secondary: [],
      };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Returns the primary checklist and any secondary checklists
 * applicable to a multi-loss scope. Never throws for expected damage types.
 */
export function dispatchScope(input: DispatchInput): DispatchResult {
  const main = dispatchSingle(input);
  const secondary: ChecklistTemplate[] = [...main.secondary];

  // Append secondary-damage-type checklists (for MULTI_LOSS or explicit extras)
  if (input.secondaryDamageTypes?.length) {
    const seenIds = new Set<string>([
      main.primary.id,
      ...main.secondary.map((c) => c.id),
    ]);
    for (const extra of input.secondaryDamageTypes) {
      const extraResult = dispatchSingle({
        damageType: extra,
        waterCategory: input.waterCategory,
        waterClass: input.waterClass,
        stormWaterIngress: input.stormWaterIngress,
        biohazardSubtype: input.biohazardSubtype,
      });
      for (const c of [extraResult.primary, ...extraResult.secondary]) {
        if (!seenIds.has(c.id)) {
          secondary.push(c);
          seenIds.add(c.id);
        }
      }
    }
  }

  const all = [main.primary, ...secondary];
  const categories = Array.from(
    new Set<ChecklistCategory>(all.map((c) => c.category)),
  );

  return {
    primary: main.primary,
    secondary,
    all,
    categories,
  };
}

/**
 * List every checklist ID currently registered — useful for UI autocomplete.
 */
export function listChecklistIds(): string[] {
  return IICRC_CHECKLISTS.map((c) => c.id);
}

/**
 * Return all checklists matching a category. Useful for UI filters.
 */
export function listByCategory(
  category: ChecklistCategory,
): ChecklistTemplate[] {
  return findByCategory(category);
}
