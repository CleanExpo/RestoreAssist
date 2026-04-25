/**
 * Weather lookup adapter — BOM (AU) + Open-Meteo historical fallback.
 *
 * Retrieves weather conditions at a given location on a given date for
 * "weather at loss date" tagging on inspections. Uses:
 *   1. Open-Meteo historical API (free, no key) for historical data
 *   2. BOM observations API for AU current/recent conditions
 *
 * The Open-Meteo archive API covers 1940–present for AU and 1979–present
 * for NZ; no API key required.
 *
 * P1-INT10 — RA-1128
 */

const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const TIMEOUT_MS = 10_000;

export interface WeatherAtDate {
  date: string; // ISO YYYY-MM-DD
  latitude: number;
  longitude: number;
  maxTempC: number | null;
  minTempC: number | null;
  precipMm: number | null;
  maxWindSpeedKmh: number | null;
  /** Dominant weather code (WMO code) for the day */
  weatherCode: number | null;
  weatherDescription: string;
  /** True if the conditions suggest a flood/storm loss origin */
  floodRiskIndicator: boolean;
}

// WMO weather code → human description (subset covering storm/flood relevant codes)
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

// Codes that indicate storm/flood conditions
const FLOOD_RISK_CODES = new Set([63, 65, 80, 81, 82, 95, 96, 99]);

export class WeatherLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_DATE" | "OUT_OF_RANGE" | "UPSTREAM_ERROR",
  ) {
    super(message);
    this.name = "WeatherLookupError";
  }
}

export async function getWeatherAtDate(
  latitude: number,
  longitude: number,
  date: Date | string,
): Promise<WeatherAtDate> {
  const d = typeof date === "string" ? new Date(date) : date;
  const isoDate = d.toISOString().slice(0, 10);

  // Open-Meteo archive requires dates in the past (at least 5 days lag)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 5);
  if (d > cutoff) {
    throw new WeatherLookupError(
      "Weather archive requires a date at least 5 days in the past",
      "OUT_OF_RANGE",
    );
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: isoDate,
    end_date: isoDate,
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "windspeed_10m_max",
      "weathercode",
    ].join(","),
    timezone: "auto",
  });

  const url = `${OPEN_METEO_ARCHIVE}?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new WeatherLookupError(`Open-Meteo error ${res.status}`, "UPSTREAM_ERROR");
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof WeatherLookupError) throw err;
    throw new WeatherLookupError(`Weather fetch failed: ${String(err)}`, "UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }

  const daily = data["daily"] as Record<string, unknown[]> | undefined;
  if (!daily) {
    throw new WeatherLookupError("No daily data returned", "UPSTREAM_ERROR");
  }

  const maxTemp = (daily["temperature_2m_max"]?.[0] as number | null) ?? null;
  const minTemp = (daily["temperature_2m_min"]?.[0] as number | null) ?? null;
  const precip = (daily["precipitation_sum"]?.[0] as number | null) ?? null;
  const windSpeed = (daily["windspeed_10m_max"]?.[0] as number | null) ?? null;
  const code = (daily["weathercode"]?.[0] as number | null) ?? null;

  return {
    date: isoDate,
    latitude,
    longitude,
    maxTempC: maxTemp,
    minTempC: minTemp,
    precipMm: precip,
    maxWindSpeedKmh: windSpeed,
    weatherCode: code,
    weatherDescription: code !== null ? (WMO_DESCRIPTIONS[code] ?? `WMO code ${code}`) : "Unknown",
    floodRiskIndicator:
      code !== null
        ? FLOOD_RISK_CODES.has(code) || (precip !== null && precip > 50)
        : false,
  };
}

/**
 * Reverse-geocode a postcode to approximate lat/lon for weather queries.
 * Uses a static table for AU state capitals as a coarse fallback when no
 * coordinates are available on the inspection.
 */
export function postcodeToApproximateCoords(
  postcode: string,
): { latitude: number; longitude: number } | null {
  const p = parseInt(postcode, 10);
  // AU state capital approximations by postcode range
  if (p >= 2000 && p <= 2999) return { latitude: -33.87, longitude: 151.21 }; // Sydney
  if (p >= 3000 && p <= 3999) return { latitude: -37.81, longitude: 144.96 }; // Melbourne
  if (p >= 4000 && p <= 4999) return { latitude: -27.47, longitude: 153.02 }; // Brisbane
  if (p >= 5000 && p <= 5799) return { latitude: -34.93, longitude: 138.6 };  // Adelaide
  if (p >= 6000 && p <= 6797) return { latitude: -31.95, longitude: 115.86 }; // Perth
  if (p >= 7000 && p <= 7999) return { latitude: -42.88, longitude: 147.32 }; // Hobart
  if (p >= 800 && p <= 999) return { latitude: -12.46, longitude: 130.84 };   // Darwin
  if (p >= 2600 && p <= 2618) return { latitude: -35.28, longitude: 149.13 }; // Canberra
  // NZ approximation — Auckland
  if (p >= 100 && p <= 199) return { latitude: -36.87, longitude: 174.77 };
  return null;
}
