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

/** Line total for `qty` units at `rate` AUD per unit. */
export function lineTotal(qty: number, rate: number): number {
  return Math.round(rate * qty * 100) / 100;
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
 */
export function buildEstimateLines(
  estimate: EstimateLinesInput,
): PersistedEstimateLine[] {
  // Distribute contingency evenly across items, computed once.
  const contingencyPerItem =
    estimate.items.length > 0
      ? estimate.contingency / estimate.items.length
      : 0;
  return estimate.items.map((costItem) => ({
    scopeItemId: costItem.scopeItemId ?? null,
    category: costItem.category,
    description: costItem.description,
    quantity: costItem.quantity,
    unit: costItem.unit,
    rate: costItem.rate,
    subtotal: costItem.subtotal,
    costDatabaseId: costItem.costDatabaseId || null,
    isEstimated: costItem.isEstimated,
    contingency: contingencyPerItem,
    total: costItem.subtotal + contingencyPerItem,
  }));
}
