/**
 * RA-8281 (B1): price-list screen inputs.
 *
 * A rate the contractor has not set is null. A blank input stays null and an
 * unset rate renders as an empty input; neither is ever turned into 0. A
 * typed 0 is kept: it is a deliberate waived fee, not a missing rate.
 */

/** A typed rate, or null when the input is blank, non-numeric or negative. */
export function parseRateInput(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The value an `<input type="number">` shows for a stored rate. */
export function rateInputValue(rate: number | null | undefined): number | "" {
  return typeof rate === "number" && Number.isFinite(rate) ? rate : "";
}
