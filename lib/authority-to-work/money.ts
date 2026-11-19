import type { Money } from "./types";

/** Two amounts can be added or compared only on the same currency and GST basis. */
export function sameBasis(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.gst === b.gst;
}

export function formatMoney(m: Money): string {
  if (!Number.isInteger(m.minor)) {
    throw new Error(`money must be integer minor units, got ${m.minor}`);
  }
  const symbol = m.currency === "AUD" ? "A$" : "NZ$";
  const sign = m.minor < 0 ? "-" : "";
  const abs = Math.abs(m.minor);
  const whole = Math.floor(abs / 100).toLocaleString("en-AU");
  const cents = String(abs % 100).padStart(2, "0");
  const gst = m.gst === "INC" ? "incl GST" : m.gst === "EX" ? "ex GST" : "GST n/a";
  return `${sign}${symbol}${whole}.${cents} ${gst}`;
}
