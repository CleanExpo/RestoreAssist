/**
 * RA-8281 (B2): the one "blocked line" rule every pricing engine shares.
 *
 * A line priced from the contractor's price list reads one or more rate
 * fields. When a field is not set, the line is still shown, as a blocked
 * line: "Rate not set" plus which price-list field to set. The engine's total
 * is then blocked ("Total not available: rate not set"). It is never a
 * partial sum presented as complete.
 *
 * Rules held here, once, for every engine:
 *   - an unset rate never becomes $0, a midpoint, a cached figure or a value
 *     taken from the NRPG national range;
 *   - a figure that needs an unset rate is null, and null spreads to every
 *     sum that includes it (sumOrBlocked);
 *   - a blocked line never carries or shows a national range figure. The
 *     NRPG ranges are NRPG's private reference data (founder rule,
 *     2026-11-12: "We don't show our guideline or price"), so this file and
 *     everything it imports stay clear of lib/nrpg-rate-ranges.ts.
 *
 * This file is safe to import from client components: it has no server-only
 * imports. The HTTP response lives in blocked-line-response.ts.
 */
import { unsetRates } from "@/lib/pricing/rate-not-set";

/** What is shown in place of a rate or an amount that is not available. */
export const RATE_NOT_SET_LABEL = "Rate not set";

/** What is shown in place of a total when any of its lines is blocked. */
export const TOTAL_NOT_AVAILABLE_NOTE = "Total not available: rate not set";

/** One price-list field the contractor has not set. */
export interface BlockedRate {
  field: string;
  /** "Rate not set. Set <field> in your price list." */
  note: string;
}

/** The fields a blocked line carries. A priced line carries none of them. */
export interface BlockedLineFields {
  pricingStatus: "rate_not_set";
  /** The first unset field the line needs. */
  rateField: string;
  /** Every unset field's note, joined. */
  pricingNote: string;
}

/** One line of a blocked engine result, as every screen shows it. */
export interface BlockedPricingLine {
  description: string;
  quantity: number | null;
  unit: string | null;
  /** null: the rate is not set. */
  rate: number | null;
  /** null: the amount cannot be given. */
  subtotal: number | null;
  /**
   * unusable_line: a saved equipment line that cannot be read or priced
   * exactly (no equipment type, no valid quantity, or an amount too large).
   * It has no rate field, so it shows its note.
   */
  pricingStatus: "priced" | "rate_not_set" | "unusable_line";
  rateField?: string;
  pricingNote?: string;
}

/** An engine result whose total cannot be given. */
export interface BlockedPricing {
  status: "blocked";
  /** Every line of the result: priced lines with their amounts, blocked lines without. */
  lines: BlockedPricingLine[];
  total: null;
  totalNote: typeof TOTAL_NOT_AVAILABLE_NOTE;
  /** Every unset field a line needed, once each. */
  missing: BlockedRate[];
}

/** A price list, or none at all (every rate then reads as not set). */
type PriceList = object | null | undefined;

/**
 * The unset fields among `fields`, each with its note.
 * Whether a rate counts as set is decided by unsetRates (rate-not-set.ts),
 * the same rule B1's readers use.
 */
export function blockedRates(
  config: PriceList,
  fields: readonly string[],
): BlockedRate[] {
  return unsetRates(config, fields).map((u) => ({
    field: u.field,
    note: u.note,
  }));
}

function lineFields(blocked: readonly BlockedRate[]): BlockedLineFields {
  return {
    pricingStatus: "rate_not_set",
    rateField: blocked[0].field,
    pricingNote: blocked.map((b) => b.note).join(" "),
  };
}

export interface PriceListReader {
  /**
   * A figure made from price-list rates. `fn` receives the rates in the order
   * of `fields` and runs only when every one of them is set. When any is not
   * set the result is null: no stand-in is ever passed to `fn`.
   */
  calc(
    fields: readonly string[],
    fn: (...rates: number[]) => number,
  ): number | null;
  /**
   * Spread into a line that reads `fields`: nothing when every field is set,
   * the blocked-line fields when one is not.
   */
  lineFields(fields: readonly string[]): BlockedLineFields | {};
  /** Every unset field a calc or a line asked for so far, once each. */
  missing(): BlockedRate[];
}

/**
 * Wrap a price list for one engine run. An engine reads every rate through
 * the reader, so a line that needs an unset rate is blocked and the unset
 * field is recorded. Fields the run never asks for are never reported: only
 * the lines actually on the document can block it.
 */
export function priceListReader(config: PriceList): PriceListReader {
  const row = (config ?? {}) as Record<string, unknown>;
  const seen = new Map<string, BlockedRate>();
  const blockedAmong = (fields: readonly string[]): BlockedRate[] => {
    const blocked = blockedRates(config, fields);
    for (const b of blocked) seen.set(b.field, b);
    return blocked;
  };
  return {
    calc(fields, fn) {
      if (blockedAmong(fields).length > 0) return null;
      return fn(...fields.map((f) => row[f] as number));
    },
    lineFields(fields) {
      const blocked = blockedAmong(fields);
      return blocked.length > 0 ? lineFields(blocked) : {};
    },
    missing() {
      return [...seen.values()];
    },
  };
}

/**
 * The sum of `values`, or null when any of them is null (blocked). The sum
 * is plain left-to-right addition from the first value, so a complete result
 * is the same number the engine produced before blocked lines existed.
 */
export function sumOrBlocked(
  values: ReadonlyArray<number | null | undefined>,
): number | null {
  let sum: number | null = null;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    sum = sum === null ? v : sum + v;
  }
  return sum ?? 0;
}

/** One blocked result from an engine's lines and its unset fields. */
export function blockedPricing(
  lines: BlockedPricingLine[],
  missing: BlockedRate[],
): BlockedPricing {
  return {
    status: "blocked",
    lines,
    total: null,
    totalNote: TOTAL_NOT_AVAILABLE_NOTE,
    missing,
  };
}

/**
 * True for an engine result that is blocked. A complete result keeps the
 * shape it had before blocked lines existed (it carries no status key), so
 * what is saved and returned for a fully priced result is unchanged; only a
 * blocked result carries `status: "blocked"`.
 */
export function isBlockedResult<T extends object>(
  result: T,
): result is Extract<T, { status: "blocked" }> {
  return (result as { status?: unknown }).status === "blocked";
}

/**
 * The blocked result in a route's answer (blockedPricingResponse), or null
 * when the answer is anything else. Screens call this on a failed pricing
 * request so a blocked result is shown line by line, not as an error.
 */
export function readBlockedPricing(body: unknown): BlockedPricing | null {
  const blocked = (body as { blocked?: Partial<BlockedPricing> } | null)
    ?.blocked;
  return blocked?.status === "blocked" &&
    Array.isArray(blocked.lines) &&
    Array.isArray(blocked.missing)
    ? (blocked as BlockedPricing)
    : null;
}
