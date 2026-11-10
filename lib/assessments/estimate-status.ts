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
  if (line.rate === null || line.lineTotalExGst === null) return true;
  // RA-8281 review: rows stored before RA-8275 carry no pricingStatus and
  // priced a missing rate at $0. Every current domain sets pricingStatus, so a
  // status-less line without a positive rate is one of those and blocks.
  // A line marked "priced" at $0 is the contractor's own choice and does not.
  return !line.pricingStatus && !(line.rate > 0);
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
