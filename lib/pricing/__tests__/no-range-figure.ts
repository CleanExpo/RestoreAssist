/**
 * RA-8281 step 1: the one check that an output shows no NRPG range figure.
 *
 * Founder rule (2026-11-12): "We don't show our guideline or price." The
 * min and max in lib/nrpg-rate-ranges.ts are NRPG's private reference data,
 * so nothing a contractor can read (text, JSON body, screen, document,
 * assistant prompt) may hold either figure for the field in question.
 *
 * A figure is matched as a whole number, however it is written: min 100 is
 * found in "$100", "100-350", `"min":100`, "$100.00" and "100.0", and max
 * 1200 is also found as "1,200" and "1,200.00". It is not found inside 1100
 * or 100.5, which are other numbers. A comma is never read as part of a
 * number around the figure, so 100 is found in "[100,350]"; the cost is that
 * it is also found in "1,100", which is the safe way to be wrong. Callers
 * keep their own fixture numbers (quantities, the contractor's rates) clear
 * of the field's min and max, so a match is always a leak.
 */
import { expect } from "vitest";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";

export function figureToken(figure: number): RegExp {
  const [whole, fraction] = String(figure).split(".");
  // The whole part, plain or with thousands separators ("1200" or "1,200").
  const grouped = Number(whole).toLocaleString("en-AU").replace(/,/g, ",?");
  // A fraction may carry trailing zeros ("1.5" or "1.50"); a whole number may
  // carry a zero fraction ("100", "100.0" or "100.00").
  const tail = fraction ? `\\.${fraction}0*` : "(?:\\.0+)?";
  return new RegExp(`(?<![\\d.])${grouped}${tail}(?!\\d|\\.\\d)`);
}

/** The text a contractor would receive: a string as is, anything else as JSON. */
function asText(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output);
}

/**
 * The parts of a blocked answer that speak about a rate that is not set: the
 * error, the missing list, and every line that is not priced. Priced lines
 * are left out because they hold the contractor's own amounts, which can
 * equal a range figure by chance in a route test's fixture.
 */
export function blockedParts(body: {
  error?: unknown;
  blocked?: { missing?: unknown; lines?: Array<{ pricingStatus?: string }> };
}): unknown {
  const lines = (body.blocked?.lines ?? []).filter(
    (line) => line.pricingStatus !== "priced",
  );
  if (lines.length === 0) throw new Error("no blocked line to check");
  return { error: body.error, missing: body.blocked?.missing, lines };
}

/** Fails when `output` holds the min or the max recorded for `field`. */
export function expectNoRangeFigure(output: unknown, field: string): void {
  const range = NRPG_RATE_RANGES[field];
  if (!range) throw new Error(`${field} has no recorded range to check`);
  const text = asText(output);
  expect(text, "output is empty, so it proves nothing").not.toBe("");
  for (const [name, figure] of [
    ["min", range.min],
    ["max", range.max],
  ] as const) {
    expect(
      figureToken(figure).test(text),
      `the ${name} of ${field} (${figure}) is shown in: ${text.slice(0, 400)}`,
    ).toBe(false);
  }
  expect(text).not.toContain("nationalRange");
  expect(text).not.toMatch(/national range \$/);
}
