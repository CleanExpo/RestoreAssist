/**
 * RA-7713 part 9 — one environmental reading for display.
 *
 * GET /api/inspections/[id] returns `environmentalData` as an ARRAY: the
 * relation became a time series in RA-1383 (EnvironmentalData[]). The job page
 * still read it as a single object, so every field was `undefined` and the
 * panel rendered "Temperature °C · Humidity %" with no numbers. The demo
 * inspection still returns a single object, so both shapes are accepted.
 */

export interface EnvironmentalReading {
  ambientTemperature: number | null;
  humidityLevel: number | null;
  dewPoint: number | null;
  airCirculation: boolean | null;
  weatherConditions?: string | null;
  notes?: string | null;
  recordedAt?: string | null;
  createdAt?: string | null;
}

function parseTime(value: string | null | undefined): number {
  const t = Date.parse(value ?? "");
  return Number.isNaN(t) ? -Infinity : t;
}

function timeOf(r: EnvironmentalReading): number {
  return parseTime(r.recordedAt ?? r.createdAt);
}

// RA-7744: two readings can share a recordedAt; createdAt breaks the tie so
// the answer does not depend on the order the database returned them in.
function isLater(r: EnvironmentalReading, than: EnvironmentalReading): boolean {
  const a = timeOf(r);
  const b = timeOf(than);
  if (a !== b) return a > b;
  return parseTime(r.createdAt) > parseTime(than.createdAt);
}

/** The most recent reading, or null when there is none. */
export function latestEnvironmentalReading(
  value: EnvironmentalReading | EnvironmentalReading[] | null | undefined,
): EnvironmentalReading | null {
  if (!value) return null;
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  return value.reduce((latest, r) => (isLater(r, latest) ? r : latest));
}

/** "—" only when the value is genuinely missing. */
export function formatEnvironmentalValue(
  value: number | null | undefined,
  unit: string,
  fractionDigits?: number,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text =
    fractionDigits === undefined ? String(value) : value.toFixed(fractionDigits);
  return `${text}${unit}`;
}

export function formatAirCirculation(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}
