/**
 * RA-7744 — the latest environmental reading for the field screen.
 *
 * GET /api/inspections/[id] returns `environmentalData` as an ARRAY (a time
 * series since RA-1383). The screen read it as one object, so the fields
 * loaded as "undefined".
 *
 * MIRROR of `latestEnvironmentalReading` in the web app's
 * `lib/inspections/latest-environmental-reading.ts`. `mobile/` is a
 * self-contained Expo project (see mobile/README.md): Metro only bundles
 * files under `mobile/`, so it cannot import the web copy. Keep the two in
 * step — `tests/unit/ra7744-mobile-environmental-reading.test.ts` fails when
 * they disagree.
 */

interface TimedReading {
  recordedAt?: string | null;
  createdAt?: string | null;
}

function parseTime(value: string | null | undefined): number {
  const t = Date.parse(value ?? "");
  return Number.isNaN(t) ? -Infinity : t;
}

function timeOf(r: TimedReading): number {
  return parseTime(r.recordedAt ?? r.createdAt);
}

// recordedAt first; createdAt breaks a tie so array order does not decide.
function isLater(r: TimedReading, than: TimedReading): boolean {
  const a = timeOf(r);
  const b = timeOf(than);
  if (a !== b) return a > b;
  return parseTime(r.createdAt) > parseTime(than.createdAt);
}

/** The most recent reading, or null when there is none. */
export function latestEnvironmentalReading<T extends TimedReading>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  return value.reduce((latest, r) => (isLater(r, latest) ? r : latest));
}
