/**
 * BOM postcode-prefix → station mapping for major AU cities.
 * Covers 8 cities per RA-1131 requirements.
 *
 * Station IDs sourced from BOM public observation feeds:
 * http://www.bom.gov.au/fwo/
 */

export interface BomStation {
  stationId: string;
  stationName: string;
  state: string;
}

/**
 * Maps the first 1–4 digits of an AU postcode to a BOM weather station.
 * Longer prefix takes priority (more specific match).
 */
const AU_POSTCODE_PREFIX_MAP: Record<string, BomStation> = {
  // Sydney — Observatory Hill (NSW)
  "2": {
    stationId: "066037",
    stationName: "Sydney (Observatory Hill)",
    state: "NSW",
  },

  // Melbourne — Melbourne Olympic Park (VIC)
  "3": {
    stationId: "086071",
    stationName: "Melbourne (Olympic Park)",
    state: "VIC",
  },

  // Brisbane — Brisbane Airport (QLD)
  "4": { stationId: "040913", stationName: "Brisbane", state: "QLD" },

  // Adelaide — Kent Town (SA)
  "5": {
    stationId: "023034",
    stationName: "Adelaide (Kent Town)",
    state: "SA",
  },

  // Perth — Metro (WA)
  "6": { stationId: "009225", stationName: "Perth Metro", state: "WA" },

  // Hobart — Ellerslie Road (TAS)
  "7": {
    stationId: "094029",
    stationName: "Hobart (Ellerslie Road)",
    state: "TAS",
  },

  // Darwin — Darwin Airport (NT) — NT postcodes start with 08xx/09xx
  "08": { stationId: "014015", stationName: "Darwin Airport", state: "NT" },
  "09": { stationId: "014015", stationName: "Darwin Airport", state: "NT" },

  // Canberra — Canberra Airport (ACT) — ACT postcodes: 2600–2699, 2900–2920
  "26": { stationId: "070351", stationName: "Canberra Airport", state: "ACT" },
  "29": { stationId: "070351", stationName: "Canberra Airport", state: "ACT" },
};

/**
 * Looks up the BOM station for a given AU postcode.
 * Tries 4-digit, 3-digit, 2-digit, then 1-digit prefix matches.
 */
export function lookupAuStation(postcode: string): BomStation | null {
  const digits = postcode.replace(/\D/g, "");
  for (let len = Math.min(digits.length, 4); len >= 1; len--) {
    const prefix = digits.slice(0, len);
    const station = AU_POSTCODE_PREFIX_MAP[prefix];
    if (station) return station;
  }
  return null;
}
