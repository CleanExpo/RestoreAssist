/**
 * Synthetic company profiles.
 *
 * The orchestrator iterates over these. Each must have a matching
 * entry in the user pool (PILOT_TESTER_USER_POOL) keyed by
 * `companyKey`. Postcodes drive the state-derivation in domain
 * plug-ins (e.g. STORM uses NSW vs QLD postcode for cyclone-zone).
 */

export interface SyntheticCompany {
  /** Stable key — matches user-pool entries. */
  key: string;
  /** Human-readable name shown in reports. */
  name: string;
  /** Property address used for inspections. */
  defaultAddress: string;
  /** Postcode → state derivation. */
  defaultPostcode: string;
  /** Free-form note shown in the report header. */
  notes: string;
}

export const SYNTHETIC_COMPANIES: readonly SyntheticCompany[] = [
  {
    key: "beyond-clean",
    name: "Beyond Clean — Sunshine Coast",
    defaultAddress: "47 Rosella Street, Buderim QLD",
    defaultPostcode: "4556",
    notes: "Sub-tropical residential — water + mould most common.",
  },
  {
    key: "elite-restoration",
    name: "Elite Restoration — Sydney Northern Beaches",
    defaultAddress: "12 Pittwater Road, Manly NSW",
    defaultPostcode: "2095",
    notes: "Coastal storm + flood — high cat-3 ratio.",
  },
  {
    key: "crsa",
    name: "CRSA — Greater Melbourne",
    defaultAddress: "199 Toorak Road, South Yarra VIC",
    defaultPostcode: "3141",
    notes: "Heritage residential — careful around plaster and brick.",
  },
  {
    key: "tropical-recovery",
    name: "Tropical Recovery — Far North QLD",
    defaultAddress: "8 Esplanade, Cairns QLD",
    defaultPostcode: "4870",
    notes: "Cyclone region — wind region C, BAL zone applies.",
  },
  {
    key: "outback-clean",
    name: "Outback Clean — Alice Springs",
    defaultAddress: "21 Todd Street, Alice Springs NT",
    defaultPostcode: "0870",
    notes: "Remote — labour-hire common, biohazard rare.",
  },
];

export function findCompany(key: string): SyntheticCompany {
  const c = SYNTHETIC_COMPANIES.find((x) => x.key === key);
  if (!c) {
    throw new Error(
      `[pilot-tester] unknown company key "${key}". Known: ${SYNTHETIC_COMPANIES.map((x) => x.key).join(", ")}`,
    );
  }
  return c;
}
