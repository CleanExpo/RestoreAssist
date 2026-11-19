/**
 * Wave 1 (W1-2) — honour client/device capture time instead of sync time.
 *
 * Accepts ISO strings from the field app. Rejects future times (with skew) and
 * implausible ages so backdated fraud is harder than typing a year.
 */

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 366 * 24 * 60 * 60 * 1000;

export function parseFieldCaptureTime(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  if (d.getTime() > now + MAX_CLOCK_SKEW_MS) return null;
  if (d.getTime() < now - MAX_AGE_MS) return null;
  return d;
}