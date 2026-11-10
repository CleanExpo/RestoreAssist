/**
 * RA-8275 — reading an estimate whose lines may be unpriced.
 *
 * A line with no rate (rate not set, outside the NRPG range, no price-list
 * field, or no quantity) blocks the estimate total. Readers must show that
 * state, never sum it as $0. A line carried by labour hours is unpriced on
 * purpose and does not block.
 */

import type { EstimateLine } from "./types";

/** True when this line stops the estimate from having a total. */
export function isBlockingLine(line: EstimateLine): boolean {
  if (line.pricingStatus === "included_in_labour") return false;
  if (line.pricingStatus && line.pricingStatus !== "priced") return true;
  return line.rate === null || line.lineTotalExGst === null;
}

/** Plain text for a money cell: "$1,234.00", or the line's reason. */
export function formatLineMoney(
  value: number | null,
  line: Pick<EstimateLine, "pricingStatus">,
): string {
  if (value !== null) return `$${value.toFixed(2)}`;
  if (line.pricingStatus === "included_in_labour") return "In labour";
  return "Not priced";
}
