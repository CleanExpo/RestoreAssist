/**
 * Estimate line money maths (RA-7708).
 *
 * Pure helpers shared by the two CostEstimate writers:
 *   - app/api/inspections/[id]/submit/route.ts
 *   - app/api/inspections/[id]/cost-estimates/route.ts
 *
 * Kept free of Prisma and pricing-config imports so the property tests in
 * tests/unit/estimate-engine.property.test.ts can exercise the exact rows the
 * writers persist.
 */
import Decimal from "decimal.js";

/**
 * Line total for `qty` units at `rate` AUD per unit: qty × rate, rounded to
 * cents with ROUND_HALF_UP in decimal (not binary floating point, which rounds
 * 1.005 × 1 down to 1.00).
 */
export function lineTotal(qty: number, rate: number): number {
  return new Decimal(qty)
    .mul(rate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** The engine fields the line builder reads. */
export interface EstimateLinesInput {
  items: Array<{
    scopeItemId?: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    subtotal: number;
    costDatabaseId?: string | null;
    isEstimated: boolean;
  }>;
  contingency: number;
  contingencyPercentage?: number;
}

/** One CostEstimate row as written by createMany (minus inspectionId). */
export interface PersistedEstimateLine {
  scopeItemId: string | null;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  subtotal: number;
  costDatabaseId: string | null;
  isEstimated: boolean;
  contingency: number;
  total: number;
}

/**
 * Turn an engine result into the CostEstimate rows both writers persist.
 *
 * Each priced line totals exactly its own qty × rate. The job-level
 * contingency is emitted once, as its own "Contingency (N%)" line, and never
 * added to the other lines. That row carries subtotal 0 and the amount in
 * `contingency` and `total`, so readers that sum the subtotal, contingency
 * and total columns separately (report route, NIR PDF) still reconcile:
 * Σsubtotal + Σcontingency = Σtotal = the grand total.
 */
export function buildEstimateLines(
  estimate: EstimateLinesInput,
): PersistedEstimateLine[] {
  const lines: PersistedEstimateLine[] = estimate.items.map((costItem) => ({
    scopeItemId: costItem.scopeItemId ?? null,
    category: costItem.category,
    description: costItem.description,
    quantity: costItem.quantity,
    unit: costItem.unit,
    rate: costItem.rate,
    subtotal: costItem.subtotal,
    costDatabaseId: costItem.costDatabaseId || null,
    isEstimated: costItem.isEstimated,
    contingency: 0,
    total: costItem.subtotal,
  }));

  if (estimate.contingency > 0) {
    const pct = estimate.contingencyPercentage;
    lines.push({
      scopeItemId: null,
      category: "Other",
      description: pct != null ? `Contingency (${pct}%)` : "Contingency",
      quantity: 1,
      unit: "job",
      rate: estimate.contingency,
      subtotal: 0,
      costDatabaseId: null,
      isEstimated: true,
      contingency: estimate.contingency,
      total: estimate.contingency,
    });
  }

  return lines;
}
