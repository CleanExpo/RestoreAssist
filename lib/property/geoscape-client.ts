/**
 * geoscape-client.ts — fetch building footprints + addresses from Geoscape AU.
 *
 * Two upstream APIs:
 *   - Predictive (geocoding)   GET /v1/predictive  {?query, &state}
 *   - Buildings                GET /v2/buildings   {?gnafPid|bbox}
 *
 * Both are gated behind `GEOSCAPE_API_KEY`. When the key is unset, a
 * deterministic mock returns a 10 m × 10 m square at the geocoded address
 * (or Sydney CBD if no geocode) so the entire pipeline can be exercised in
 * dev without a paid sandbox.
 *
 * Pricing per Geoscape's published rate card is per-call; the API route
 * caches results in `GeoscapeFootprint` for 90 days (parity with
 * `PropertyLookup`). Caller is responsible for the cache check.
 *
 * BLOCKER for production rollout: API key + commercial agreement; mock path
 * is for dev only.
 */

const PREDICTIVE_BASE = "https://api.psma.com.au/v1/predictive";
const BUILDINGS_BASE = "https://api.psma.com.au/v2/buildings";

export interface GeocodeHit {
  /** GNAF Persistent Identifier */
  gnafPid: string;
  formatted: string;
  lat: number;
  lng: number;
  confidence: "high" | "medium" | "low";
}

export interface FootprintHit {
  buildingId: string | null;
  gnafPid: string | null;
  /** WGS84 GeoJSON Polygon with outer ring only. */
  geomGeoJson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  storeyCount: number | null;
  roofMaterial: string | null;
  /** Source label that ends up on `GeoscapeFootprint.source`. */
  source: "geoscape_buildings" | "test_fixture";
  /** Raw upstream response — kept for debugging / cache replay. */
  rawResponse: unknown;
}

export class GeoscapeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GeoscapeError";
  }
}

function getApiKey(): string | null {
  return process.env.GEOSCAPE_API_KEY?.trim() || null;
}

/**
 * Geocode a free-form address. Returns at most one hit (the top match).
 * Mock path produces a deterministic Sydney CBD lat/lng.
 */
export async function geocodeAddress(address: string): Promise<GeocodeHit | null> {
  const key = getApiKey();
  if (!key) return mockGeocode(address);

  const url = `${PREDICTIVE_BASE}?query=${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: key },
    });
  } catch (err) {
    throw new GeoscapeError(`Geoscape network error: ${(err as Error).message}`, 0, err);
  }
  if (!res.ok) {
    throw new GeoscapeError(`Geoscape predictive ${res.status}`, res.status);
  }
  const body = (await res.json()) as {
    suggest?: Array<{
      id: string;
      address: string;
      latitude: number;
      longitude: number;
      score?: number;
    }>;
  };
  const hit = body.suggest?.[0];
  if (!hit) return null;
  return {
    gnafPid: hit.id,
    formatted: hit.address,
    lat: hit.latitude,
    lng: hit.longitude,
    confidence:
      typeof hit.score === "number"
        ? hit.score > 0.85
          ? "high"
          : hit.score > 0.5
            ? "medium"
            : "low"
        : "medium",
  };
}

/**
 * Fetch a building footprint by GNAF PID. Falls back to a bbox query if PID
 * is null.
 */
export async function fetchFootprintByGnafPid(
  gnafPid: string,
): Promise<FootprintHit | null> {
  const key = getApiKey();
  if (!key) return mockFootprint(gnafPid);

  const url = `${BUILDINGS_BASE}?gnafPid=${encodeURIComponent(gnafPid)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: key } });
  } catch (err) {
    throw new GeoscapeError(`Geoscape network error: ${(err as Error).message}`, 0, err);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new GeoscapeError(`Geoscape buildings ${res.status}`, res.status);
  }
  const body = (await res.json()) as {
    features?: Array<{
      id: string;
      properties: { gnafPid?: string; storeys?: number; roofMaterial?: string };
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }>;
  };
  const feat = body.features?.[0];
  if (!feat) return null;
  return {
    buildingId: feat.id,
    gnafPid: feat.properties.gnafPid ?? gnafPid,
    geomGeoJson: feat.geometry,
    storeyCount: feat.properties.storeys ?? null,
    roofMaterial: feat.properties.roofMaterial ?? null,
    source: "geoscape_buildings",
    rawResponse: body,
  };
}

/**
 * Convenience: address → geocode → footprint. Returns the resolved footprint
 * with the geocode hit attached for caching.
 */
export async function fetchFootprintByAddress(
  address: string,
): Promise<{
  geocode: GeocodeHit | null;
  footprint: FootprintHit | null;
}> {
  const geocode = await geocodeAddress(address);
  if (!geocode) return { geocode: null, footprint: null };
  const footprint = await fetchFootprintByGnafPid(geocode.gnafPid);
  return { geocode, footprint };
}

/* ─── Mock implementations (dev / test) ──────────────────────────────────── */

/**
 * Deterministic geocode mock. Hashes the address into a small offset around
 * Sydney CBD so different addresses map to distinct lat/lng — useful for
 * development and unit tests without a Geoscape key.
 */
export function mockGeocode(address: string): GeocodeHit {
  const seed = simpleHash(address);
  const SYDNEY = { lat: -33.8688, lng: 151.2093 };
  return {
    gnafPid: `MOCK_${seed.toString(16).padStart(8, "0")}`,
    formatted: address,
    lat: SYDNEY.lat + ((seed % 1000) - 500) / 100_000,
    lng: SYDNEY.lng + (((seed >> 10) % 1000) - 500) / 100_000,
    confidence: "low",
  };
}

/**
 * Deterministic 10 m × 10 m square footprint mock at the geocoded location.
 * Lets the wall-graph import path run end-to-end without a Geoscape key.
 */
export function mockFootprint(gnafPid: string): FootprintHit {
  const seed = simpleHash(gnafPid);
  const SYDNEY = { lat: -33.8688, lng: 151.2093 };
  const lat = SYDNEY.lat + ((seed % 1000) - 500) / 100_000;
  const lng = SYDNEY.lng + (((seed >> 10) % 1000) - 500) / 100_000;
  // ~10m east-west, ~10m north-south at this latitude.
  const dLng = 0.000108;
  const dLat = 0.00009;
  return {
    buildingId: `MOCK_BLD_${seed.toString(16).padStart(8, "0")}`,
    gnafPid,
    geomGeoJson: {
      type: "Polygon",
      coordinates: [
        [
          [lng, lat],
          [lng + dLng, lat],
          [lng + dLng, lat + dLat],
          [lng, lat + dLat],
          [lng, lat],
        ],
      ],
    },
    storeyCount: 1,
    roofMaterial: "tile",
    source: "test_fixture",
    rawResponse: { mock: true, gnafPid },
  };
}

function simpleHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Shared address-key normalisation; matches PropertyLookup behaviour. */
export function normaliseAddressKey(address: string, postcode?: string): string {
  const a = address.trim().toUpperCase().replace(/\s+/g, " ");
  if (!postcode) return a;
  return `${a}|${postcode.trim()}`;
}
