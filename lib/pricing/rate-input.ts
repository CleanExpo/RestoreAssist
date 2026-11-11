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

const SAVE_FAILED = "Failed to save pricing configuration";

/**
 * The text to show when the price-list save is refused (RA-8281 review round
 * 2). The route answers with either the structured envelope
 * `{ error: { code, message } }` or a flat `{ error: "...", field }` (the NRPG
 * range refusal). A missing rate is named in plain words, so a contractor who
 * cleared a rate sees which one needs a figure.
 */
export function pricingSaveErrorText(
  body: unknown,
  labelFor: (field: string) => string | undefined = () => undefined,
): string {
  const err = (body as { error?: unknown } | null)?.error;
  const message =
    typeof err === "string"
      ? err
      : typeof (err as { message?: unknown } | null)?.message === "string"
        ? (err as { message: string }).message
        : null;
  if (!message) return SAVE_FAILED;
  const missing = /^Missing required field: (\w+)$/.exec(message);
  if (missing) {
    const label = labelFor(missing[1]) ?? missing[1];
    return `${label} has no rate set. Enter your rate before saving; a blank rate is never priced at $0.`;
  }
  return message;
}
