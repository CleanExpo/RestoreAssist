/**
 * ANSI/IICRC S500:2021 water categories (spec §5.2).
 *
 * Category describes contamination (clean / grey / black) and drives required
 * PPE, containment, and disposal scope. It is assessed on site, not derived from
 * moisture content (that is the drying validation — see `dry-standard.ts`).
 */

export type WaterCategory = "cat1" | "cat2" | "cat3";

export const WATER_CATEGORIES: WaterCategory[] = ["cat1", "cat2", "cat3"];

export interface CategoryRequirements {
  category: WaterCategory;
  label: string;
  description: string;
  /** Required minimum PPE for working in the affected area. */
  ppe: string[];
  /** Physical containment / negative pressure required. */
  containmentRequired: boolean;
  /** Affected materials must be disposed of as contaminated waste. */
  disposalAsContaminated: boolean;
  /** Porous materials may be cleaned and retained rather than removed. */
  porousMaterialsSalvageable: boolean;
}

const REQUIREMENTS: Record<WaterCategory, CategoryRequirements> = {
  cat1: {
    category: "cat1",
    label: "Category 1 — Clean water",
    description:
      "Water from a sanitary source (e.g. supply line, tap). No substantial contamination.",
    ppe: ["gloves"],
    containmentRequired: false,
    disposalAsContaminated: false,
    porousMaterialsSalvageable: true,
  },
  cat2: {
    category: "cat2",
    label: "Category 2 — Grey water",
    description:
      "Water with significant contamination that could cause illness (e.g. washing-machine overflow, dishwasher discharge).",
    ppe: ["gloves", "eye protection", "P2 respirator"],
    containmentRequired: true,
    disposalAsContaminated: false,
    porousMaterialsSalvageable: true,
  },
  cat3: {
    category: "cat3",
    label: "Category 3 — Black water",
    description:
      "Grossly contaminated water (e.g. sewage, rising flood water). Harmful pathogens and toxigenic agents present.",
    ppe: [
      "gloves",
      "eye protection",
      "full-face respirator",
      "fluid-resistant coveralls",
      "boot covers",
    ],
    containmentRequired: true,
    disposalAsContaminated: true,
    porousMaterialsSalvageable: false,
  },
};

export function categoryRequirements(
  category: WaterCategory,
): CategoryRequirements {
  return REQUIREMENTS[category];
}
