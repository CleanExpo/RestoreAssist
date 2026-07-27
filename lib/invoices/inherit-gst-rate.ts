/**
 * Pick the GST rate a variation (or other child document) should inherit
 * from its parent invoice's line items.
 *
 * RA-7096: a GST-free parent must not mint a 10% child by default when the
 * client omits `gstRate`. Mode (most frequent rate) wins; ties prefer the
 * first-seen rate among the tied modes so the result is deterministic.
 *
 * Empty / missing parent lines → Australian default (10%).
 */

export function inheritGstRate(
  lineItems: Array<{ gstRate?: number | null }> | undefined | null,
  fallback = 10,
): number {
  if (!lineItems?.length) return fallback;

  const counts = new Map<number, number>();
  const order: number[] = [];

  for (const item of lineItems) {
    const raw = item.gstRate;
    const rate =
      raw === undefined || raw === null || !Number.isFinite(Number(raw))
        ? fallback
        : Number(raw);
    if (!counts.has(rate)) order.push(rate);
    counts.set(rate, (counts.get(rate) ?? 0) + 1);
  }

  let bestRate = fallback;
  let bestCount = -1;
  for (const rate of order) {
    const count = counts.get(rate) ?? 0;
    if (count > bestCount) {
      bestRate = rate;
      bestCount = count;
    }
  }
  return bestRate;
}

/**
 * Resolve a request line's gstRate: explicit values (including 0) win;
 * nullish falls back to the inherited parent rate. Uses nullish coalescing
 * so `0` is never coerced to 10 (the RA-7096 `|| 10` bug).
 */
export function resolveLineGstRate(
  itemGstRate: number | null | undefined,
  inheritedGstRate: number,
): number {
  return itemGstRate === undefined || itemGstRate === null
    ? inheritedGstRate
    : Number(itemGstRate);
}
