/**
 * Weather snapshot provider for AU (BOM) and NZ (NIWA).
 *
 * AU: Uses BOM public JSON observation feeds — no API key required.
 * NZ: Stubbed (NIWA CliFlo requires registration) — returns UNAVAILABLE.
 *     TODO: RA-XXXX integrate NIWA CliFlo API for NZ weather data.
 */

import { lookupAuStation } from "./au-postcode-to-station";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeatherSnapshot = {
  source: "BOM" | "NIWA" | "UNAVAILABLE";
  stationName?: string;
  stationDistanceKm?: number;
  observedAt?: Date;
  rainfall24hMm?: number | null;
  maxTempC?: number | null;
  minTempC?: number | null;
  humidityAvgPercent?: number | null;
  windGustMaxKph?: number | null;
  /** true if windGustMax >= 90 kph */
  isCyclone?: boolean;
  /** true if rainfall24h >= 100 mm */
  isFloodLikely?: boolean;
  /** true if maxTempC >= 40 */
  isExtremeHeat?: boolean;
  /** source URL for audit trail */
  rawUrl?: string;
};

export type WeatherRequest = {
  country: "AU" | "NZ";
  postcode: string;
  date: Date;
};

// ─── BOM response shape (minimal) ────────────────────────────────────────────

interface BomObservation {
  local_date_time_full?: string;
  air_temp?: number | null;
  rel_hum?: number | null;
  rain_trace?: string | null;
  wind_gust_kt?: number | null;
  [key: string]: unknown;
}

interface BomResponse {
  observations?: {
    header?: Array<{
      ID?: string;
      name?: string;
      [key: string]: unknown;
    }>;
    data?: BomObservation[];
  };
}

// ─── BOM helpers ─────────────────────────────────────────────────────────────

const BOM_BASE = "http://www.bom.gov.au/fwo";

/** BOM FWO product ID per state */
const STATE_PRODUCT: Record<string, string> = {
  NSW: "IDN60901",
  ACT: "IDN60903",
  VIC: "IDV60901",
  QLD: "IDQ60901",
  SA: "IDS60901",
  WA: "IDW60901",
  TAS: "IDT60901",
  NT: "IDD60901",
};

function knotsToKph(knots: number): number {
  return Math.round(knots * 1.852 * 10) / 10;
}

function parseRainfallMm(trace: string | null | undefined): number | null {
  if (trace == null) return null;
  const cleaned = trace.trim();
  if (cleaned === "" || cleaned === "-") return null;
  // BOM uses "Trace" for < 0.2 mm
  if (cleaned.toLowerCase() === "trace") return 0.1;
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function derivedFlags(snap: {
  windGustMaxKph?: number | null;
  rainfall24hMm?: number | null;
  maxTempC?: number | null;
}): Pick<WeatherSnapshot, "isCyclone" | "isFloodLikely" | "isExtremeHeat"> {
  return {
    isCyclone:
      snap.windGustMaxKph != null ? snap.windGustMaxKph >= 90 : undefined,
    isFloodLikely:
      snap.rainfall24hMm != null ? snap.rainfall24hMm >= 100 : undefined,
    isExtremeHeat: snap.maxTempC != null ? snap.maxTempC >= 40 : undefined,
  };
}

function parseBomDate(dtFull: string): Date | undefined {
  // Format: "20240315153000" → 2024-03-15T15:30:00
  if (dtFull.length < 14) return undefined;
  const y = dtFull.slice(0, 4);
  const mo = dtFull.slice(4, 6);
  const d = dtFull.slice(6, 8);
  const h = dtFull.slice(8, 10);
  const mi = dtFull.slice(10, 12);
  const s = dtFull.slice(12, 14);
  const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

async function fetchBomSnapshot(
  postcode: string,
  date: Date,
): Promise<WeatherSnapshot> {
  const station = lookupAuStation(postcode);
  if (!station) {
    return { source: "UNAVAILABLE" };
  }

  const product = STATE_PRODUCT[station.state] ?? "IDN60901";
  const url = `${BOM_BASE}/${product}/${product}.${station.stationId}.json`;

  let raw: BomResponse;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "RestoreAssist/1.0 (weather-provider)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[weather] BOM fetch failed: ${response.status} ${url}`);
      return { source: "UNAVAILABLE", rawUrl: url };
    }

    raw = (await response.json()) as BomResponse;
  } catch (err) {
    console.warn("[weather] BOM fetch error:", err);
    return { source: "UNAVAILABLE", rawUrl: url };
  }

  const observations = raw?.observations?.data ?? [];
  if (observations.length === 0) {
    return { source: "BOM", stationName: station.stationName, rawUrl: url };
  }

  // Find observations matching the requested date (local date comparison).
  // BOM local_date_time_full format: "20240315153000" (YYYYMMDDHHmmss)
  const targetDateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  const dayObs = observations.filter((o) =>
    o.local_date_time_full?.startsWith(targetDateStr),
  );

  // Use day's observations for daily aggregates; fall back to recent obs
  const pool = dayObs.length > 0 ? dayObs : observations.slice(0, 48);

  const temps = pool
    .map((o) => o.air_temp)
    .filter((t): t is number => t != null);
  const humidity = pool
    .map((o) => o.rel_hum)
    .filter((h): h is number => h != null);
  const gusts = pool
    .map((o) => o.wind_gust_kt)
    .filter((g): g is number => g != null);
  const rainfalls = pool
    .map((o) => parseRainfallMm(o.rain_trace))
    .filter((r): r is number => r != null);

  const maxTempC = temps.length > 0 ? Math.max(...temps) : null;
  const minTempC = temps.length > 0 ? Math.min(...temps) : null;
  const humidityAvgPercent =
    humidity.length > 0
      ? Math.round(humidity.reduce((a, b) => a + b, 0) / humidity.length)
      : null;
  const windGustMaxKph =
    gusts.length > 0 ? knotsToKph(Math.max(...gusts)) : null;
  const rainfall24hMm = rainfalls.length > 0 ? Math.max(...rainfalls) : null;

  const latestObs = pool[0];
  const observedAt = latestObs?.local_date_time_full
    ? parseBomDate(latestObs.local_date_time_full)
    : undefined;

  const partial = {
    maxTempC,
    minTempC,
    humidityAvgPercent,
    windGustMaxKph,
    rainfall24hMm,
  };

  return {
    source: "BOM",
    stationName: station.stationName,
    observedAt,
    rawUrl: url,
    ...partial,
    ...derivedFlags(partial),
  };
}

// ─── NIWA (NZ) stub ───────────────────────────────────────────────────────────

/**
 * NIWA CliFlo (https://cliflo.niwa.co.nz) requires account registration.
 * TODO: RA-XXXX full NIWA CliFlo integration — obtain API credentials,
 * implement station lookup by NZ postcode, and fetch daily climate data.
 */
function fetchNiwaStub(): WeatherSnapshot {
  return {
    source: "UNAVAILABLE",
    rawUrl: "https://cliflo.niwa.co.nz",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches a weather snapshot for the given country/postcode/date.
 *
 * AU: Uses BOM public JSON feeds — no credentials required.
 * NZ: Stubbed — returns UNAVAILABLE until NIWA integration is complete.
 */
export async function fetchWeatherSnapshot(
  req: WeatherRequest,
): Promise<WeatherSnapshot> {
  if (req.country === "AU") {
    return fetchBomSnapshot(req.postcode, req.date);
  }
  if (req.country === "NZ") {
    return fetchNiwaStub();
  }
  return { source: "UNAVAILABLE" };
}
