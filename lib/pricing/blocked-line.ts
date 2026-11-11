/**
 * RA-8281 (B2): the one "blocked line" rule every pricing engine shares.
 *
 * A line priced from the contractor's price list reads one or more rate
 * fields. When a field is not set, the line is still shown, as a blocked
 * line: "Rate not set" plus the NRPG national range for that field when
 * lib/nrpg-rate-ranges.ts has one, and no range when it does not. The
 * engine's total is then blocked ("Total not available: rate not set"). It is
 * never a partial sum presented as complete.
 *
 * Rules held here, once, for every engine:
 *   - an unset rate never becomes $0, a midpoint, a cached figure or a value
 *     taken from the national range. The range is shown for reference only;
 *     no amount is ever computed from it;
 *   - a figure that needs an unset rate is null, and null spreads to every
 *     sum that includes it (sumOrBlocked);
 *   - the range comes only from lib/nrpg-rate-ranges.ts. A field with no
 *     range there (the fire fields today) shows "Rate not set" and nothing
 *     else.
 *
 * This file is safe to import from client components: it has no server-only
 * imports. The HTTP response lives in blocked-line-response.ts.
 */
import { getFieldRange } from "@/lib/nrpg-rate-ranges";
import { unsetRates } from "@/lib/pricing/rate-not-set";

/** What is shown in place of a rate or an amount that is not available. */
export const RATE_NOT_SET_LABEL = "Rate not set";

/** What is shown in place of a total when any of its lines is blocked. */
export const TOTAL_NOT_AVAILABLE_NOTE = "Total not available: rate not set";

/** The NRPG national range for a field, for display only. */
export interface NationalRange {
  min: number;
  max: number;
  /** As recorded in lib/nrpg-rate-ranges.ts, e.g. "$/hr". */
  unit: string;
}

/** One price-list field the contractor has not set. */
export interface BlockedRate {
  field: string;
  /** "Rate not set. Set <field> in your price list (national range ...)." */
  note: string;
  /** null: lib/nrpg-rate-ranges.ts has no range for this field. */
  nationalRange: NationalRange | null;
}

/** The fields a blocked line carries. A priced line carries none of them. */
export interface BlockedLineFields {
  pricingStatus: "rate_not_set";
  /** The first unset field the line needs. */
  rateField: string;
  /** Every unset field's note, joined. */
  pricingNote: string;
  /** The national range of `rateField`, or null when there is none. */
  nationalRange: NationalRange | null;
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
   * It has no rate field, so it shows its note and no range.
   */
  pricingStatus: "priced" | "rate_not_set" | "unusable_line";
  rateField?: string;
  pricingNote?: string;
  nationalRange?: NationalRange | null;
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

/** "national range $60-$170 per hr", from the recorded range only. */
export function nationalRangeText(range: NationalRange): string {
  const per = range.unit.startsWith("$/")
    ? ` per ${range.unit.slice(2)}`
    : range.unit === "$"
      ? ""
      : ` ${range.unit}`;
  return `national range $${range.min}-$${range.max}${per}`;
}

/** The recorded national range for a field, or null when there is none. */
export function nationalRangeFor(field: string): NationalRange | null {
  return rangeOf(field);
}

function rangeOf(field: string): NationalRange | null {
  const range = getFieldRange(field);
  return range ? { min: range.min, max: range.max, unit: range.unit } : null;
}

/**
 * The unset fields among `fields`, each with its note and national range.
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
    nationalRange: rangeOf(u.field),
  }));
}

function lineFields(blocked: readonly BlockedRate[]): BlockedLineFields {
  return {
    pricingStatus: "rate_not_set",
    rateField: blocked[0].field,
    pricingNote: blocked.map((b) => b.note).join(" "),
    nationalRange: blocked[0].nationalRange,
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

/** What a rate cell shows: the label, with the national range when one exists. */
export function rateNotSetText(nationalRange?: NationalRange | null): string {
  return nationalRange
    ? `${RATE_NOT_SET_LABEL} (${nationalRangeText(nationalRange)})`
    : RATE_NOT_SET_LABEL;
}
