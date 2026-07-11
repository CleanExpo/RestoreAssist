/**
 * Category-based revenue-leakage benchmarking (RA-7026).
 *
 * The owner's Ascora invoice line codes (FEN031, CCT003, UBS067…) do NOT match
 * the equipment rate-card SKUs (UBS070, AIM008…) — a straight partNumber join
 * finds ~0 overlap, so per-SKU benchmarking is impossible. But the line
 * DESCRIPTIONS map cleanly onto equipment/labour categories, and each category
 * has a defensible target rate — the owner's own pricing defaults
 * (lib/pricing/defaults-au.ts). This classifies each line into a category and
 * measures how far its charged rate sits below that target.
 *
 * Benchmarks are pulled from getDefaultPricing() so they stay in lock-step with
 * the pricing SSOT: change a default, the leakage benchmark moves with it.
 */
import { getDefaultPricing } from "@/lib/pricing/defaults-au";

export type EquipmentCategory =
  | "labour_tech"
  | "labour_senior"
  | "airmover"
  | "dehumidifier"
  | "afd"
  | "passthrough"
  | "other";

export interface LeakageLine {
  description: string | null;
  quantity: number | null;
  unitPriceExTax: number | null;
  amountExTax: number | null;
}

export interface CategoryLeakage {
  category: EquipmentCategory;
  lines: number;
  chargedTotal: number;
  avgUnitPrice: number;
  /** Target unit rate, or null for non-benchmarked categories. */
  targetRate: number | null;
  /** Σ max(0, target − unit) × qty. 0 for non-benchmarked categories. */
  underCharge: number;
}

export interface CategoryLeakageReport {
  byCategory: CategoryLeakage[];
  totalUnderCharge: number;
  totalCharged: number;
  benchmarkedCharged: number;
  linesAnalyzed: number;
}

/**
 * Classify a line by its description. Order matters: the more specific patterns
 * (injectidry → afd, project manager → senior) must precede the general ones
 * (labour, air mover) so a "Project Manager" line isn't caught as tech labour.
 */
export function classifyEquipmentCategory(
  description: string | null | undefined,
): EquipmentCategory {
  const d = (description ?? "").toLowerCase();
  if (!d.trim()) return "other";

  // Pass-through cost recovery — never a margin signal.
  if (/disposal|skip bin|\bwaste\b|3rd party|third party|subcontract|material|\bppe\b|consumable/.test(d)) {
    return "passthrough";
  }
  if (/air ?scrubber|\bafd\b|negative air|air filtration|injectidry|hepa/.test(d)) {
    return "afd";
  }
  if (/dehumidif/.test(d)) return "dehumidifier";
  if (/air ?mover/.test(d)) return "airmover";
  if (/project manager|supervisor|\bpm\b/.test(d)) return "labour_senior";
  if (/labour|technician|\/ ?hr|per hour|hourly/.test(d)) return "labour_tech";
  return "other";
}

/** Target unit rate per category, sourced from the pricing SSOT. null = not benchmarked. */
export function categoryBenchmarks(): Record<EquipmentCategory, number | null> {
  // National-median baseline (unknown state/entity ⇒ ×1.0 — the raw defaults).
  const p = getDefaultPricing({ state: "XX", entityType: "OTHER" });
  return {
    labour_tech: p.qualifiedTechnicianNormalHours,
    labour_senior: p.masterQualifiedNormalHours,
    airmover: p.airMoverAxialPerDay,
    dehumidifier: p.dehumidifierLgrPerDay,
    afd: p.afdNegativeAirPerDay,
    passthrough: null,
    other: null,
  };
}

export function analyzeCategoryLeakage(
  lines: readonly LeakageLine[],
  benchmarks: Record<EquipmentCategory, number | null> = categoryBenchmarks(),
): CategoryLeakageReport {
  const acc = new Map<
    EquipmentCategory,
    { lines: number; charged: number; unitSum: number; underCharge: number }
  >();

  for (const line of lines) {
    const category = classifyEquipmentCategory(line.description);
    const unit = line.unitPriceExTax ?? 0;
    const qty = line.quantity && line.quantity !== 0 ? line.quantity : 1;
    const charged = line.amountExTax ?? unit * qty;
    const target = benchmarks[category];

    const entry =
      acc.get(category) ?? { lines: 0, charged: 0, unitSum: 0, underCharge: 0 };
    entry.lines += 1;
    entry.charged += charged;
    entry.unitSum += unit;
    if (target != null && unit < target) {
      entry.underCharge += (target - unit) * qty;
    }
    acc.set(category, entry);
  }

  const byCategory: CategoryLeakage[] = [...acc.entries()]
    .map(([category, e]) => ({
      category,
      lines: e.lines,
      chargedTotal: round2(e.charged),
      avgUnitPrice: round2(e.unitSum / e.lines),
      targetRate: benchmarks[category],
      underCharge: round2(e.underCharge),
    }))
    .sort((a, b) => b.underCharge - a.underCharge || b.chargedTotal - a.chargedTotal);

  const benchmarkedCharged = byCategory
    .filter((c) => c.targetRate != null)
    .reduce((s, c) => s + c.chargedTotal, 0);

  return {
    byCategory,
    totalUnderCharge: round2(byCategory.reduce((s, c) => s + c.underCharge, 0)),
    totalCharged: round2(byCategory.reduce((s, c) => s + c.chargedTotal, 0)),
    benchmarkedCharged: round2(benchmarkedCharged),
    linesAnalyzed: lines.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
