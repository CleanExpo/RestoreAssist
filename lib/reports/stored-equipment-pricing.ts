/**
 * RA-8281 B1 (class fix): the one way a stored equipment selection is priced
 * when a report, prompt or export reads it back.
 *
 * A selection stored on a report carries the daily rate the screen saw when
 * it was made. That rate is a cache: the contractor may have changed or
 * cleared it since, and older rows stored 0 for an unset rate. Every reader
 * here prices each selection from the CURRENT price list through
 * selectionDailyRate. A rate the price list leaves unset makes that line
 * "rate not set" and blocks the equipment total. It is never $0, never the
 * cached figure, and never a midpoint.
 */
import {
  getEquipmentGroupById,
  selectionDailyRate,
} from "@/lib/equipment-matrix";
import { RateNotSetError, type UnsetRate } from "@/lib/pricing/rate-not-set";

/** What a report shows in place of a money figure it cannot compute. */
export const RATE_NOT_SET_LABEL = "Rate not set";

export interface PricedEquipmentLine {
  groupId: string;
  name: string;
  quantity: number;
  durationDays: number;
  /** null: the contractor has not set this rate. */
  dailyRate: number | null;
  /** dailyRate × quantity, or null when the rate is not set. */
  dailyTotal: number | null;
  /** dailyRate × quantity × durationDays, or null when the rate is not set. */
  total: number | null;
  /** "Rate not set. Set <field> ..." when the rate is not set, else null. */
  note: string | null;
}

export interface PricedEquipment {
  lines: PricedEquipmentLine[];
  /** Sum of the daily totals, or null when any line's rate is not set. */
  dailyTotal: number | null;
  /** Sum of the line totals, or null when any line's rate is not set. */
  total: number | null;
  /** Every unset rate, one entry per field. */
  unset: UnsetRate[];
}

function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Price stored selections against the current price list. `pricingConfig`
 * is the report business's price list (resolveReportPricing); null or
 * undefined means none could be loaded, so every rate is unset.
 */
export function priceStoredEquipment(
  selections: unknown,
  pricingConfig: unknown,
  durationDays: number,
): PricedEquipment {
  const list = Array.isArray(selections) ? selections : [];
  const unset = new Map<string, UnsetRate>();
  const lines = list
    .filter(
      (sel): sel is { groupId: string; quantity?: unknown } =>
        !!sel && typeof sel.groupId === "string",
    )
    .map((sel): PricedEquipmentLine => {
      const group = getEquipmentGroupById(sel.groupId);
      const quantity = finiteOr(sel.quantity, 0);
      let dailyRate: number | null;
      let note: string | null = null;
      try {
        dailyRate = selectionDailyRate(
          sel as { groupId: string; dailyRate?: number },
          pricingConfig ?? undefined,
        );
      } catch (err) {
        if (!(err instanceof RateNotSetError)) throw err;
        dailyRate = null;
        note = err.message;
        for (const u of err.unset) unset.set(u.field, u);
      }
      return {
        groupId: sel.groupId,
        name: group?.name ?? sel.groupId,
        quantity,
        durationDays,
        dailyRate,
        dailyTotal: dailyRate === null ? null : dailyRate * quantity,
        total: dailyRate === null ? null : dailyRate * quantity * durationDays,
        note,
      };
    });
  const blocked = lines.some((l) => l.dailyRate === null);
  return {
    lines,
    dailyTotal: blocked
      ? null
      : lines.reduce((sum, l) => sum + (l.dailyTotal as number), 0),
    total: blocked
      ? null
      : lines.reduce((sum, l) => sum + (l.total as number), 0),
    unset: [...unset.values()],
  };
}

/** "$45.00", or "Rate not set" for a figure that could not be computed. */
export function moneyOrRateNotSet(value: number | null): string {
  return value === null ? RATE_NOT_SET_LABEL : `$${value.toFixed(2)}`;
}

/**
 * The sum of money figures, or null when any of them is not a number (a line
 * whose rate is not set). A blocked line blocks the total; it is never
 * counted as $0.
 */
export function sumOrNull(values: ReadonlyArray<unknown>): number | null {
  let sum = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}
