/**
 * Zoho CRM data-centre hosts.
 *
 * Accounts (OAuth) and the CRM API live on different hosts per region.
 * Only hosts in these tables are ever fetched. A token response's
 * `api_domain` is accepted only when it matches one of them.
 *
 * Published hosts: https://www.zoho.com/crm/developer/docs/api/v6/multi-dc.html
 * AU / US / EU are the regions a contractor can pick. IN, JP, CA and SA are
 * accepted when Zoho's callback names them, so a mismatched pick does not
 * send the refresh to the wrong data centre.
 */

export const ZOHO_REGIONS = ["AU", "US", "EU", "IN", "JP", "CA", "SA"] as const;
export type ZohoRegion = (typeof ZOHO_REGIONS)[number];

/** Regions offered on the Integrations card. */
export const ZOHO_CONNECT_REGIONS = ["AU", "US", "EU"] as const;
export type ZohoConnectRegion = (typeof ZOHO_CONNECT_REGIONS)[number];

const ACCOUNTS_SERVER: Record<ZohoRegion, string> = {
  AU: "https://accounts.zoho.com.au",
  US: "https://accounts.zoho.com",
  EU: "https://accounts.zoho.eu",
  IN: "https://accounts.zoho.in",
  JP: "https://accounts.zoho.jp",
  CA: "https://accounts.zohocloud.ca",
  SA: "https://accounts.zoho.sa",
};

const API_DOMAIN: Record<ZohoRegion, string> = {
  AU: "https://www.zohoapis.com.au",
  US: "https://www.zohoapis.com",
  EU: "https://www.zohoapis.eu",
  IN: "https://www.zohoapis.in",
  JP: "https://www.zohoapis.jp",
  CA: "https://www.zohoapis.ca",
  SA: "https://www.zohoapis.sa",
};

const LOCATION_CODE: Record<string, ZohoRegion> = {
  au: "AU",
  us: "US",
  eu: "EU",
  in: "IN",
  jp: "JP",
  ca: "CA",
  sa: "SA",
};

export function isZohoConnectRegion(value: string): value is ZohoConnectRegion {
  return (ZOHO_CONNECT_REGIONS as readonly string[]).includes(value);
}

export function accountsServerForRegion(region: ZohoRegion): string {
  return ACCOUNTS_SERVER[region];
}

export function apiDomainForRegion(region: ZohoRegion): string {
  return API_DOMAIN[region];
}

/** Accept a Zoho `api_domain` only when it is one of the published CRM hosts. */
export function allowApiDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  for (const domain of Object.values(API_DOMAIN)) {
    if (trimmed === domain) return domain;
  }
  return null;
}

export function regionFromApiDomain(value: string | null | undefined): ZohoRegion | null {
  const domain = allowApiDomain(value);
  if (!domain) return null;
  const match = (Object.keys(API_DOMAIN) as ZohoRegion[]).find(
    (region) => API_DOMAIN[region] === domain,
  );
  return match ?? null;
}

/** Map Zoho's callback `accounts-server` onto a region. Unknown hosts are ignored. */
export function regionFromAccountsServer(value: string | null | undefined): ZohoRegion | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  const match = (Object.keys(ACCOUNTS_SERVER) as ZohoRegion[]).find(
    (region) => ACCOUNTS_SERVER[region] === trimmed,
  );
  return match ?? null;
}

/** Map Zoho's callback `location` code (`au`, `us`, `eu`, …). */
export function regionFromLocation(value: string | null | undefined): ZohoRegion | null {
  if (!value) return null;
  return LOCATION_CODE[value.trim().toLowerCase()] ?? null;
}

/**
 * Prefer the API domain stored after token exchange. Fall back to the region
 * the contractor picked, then Australia (the product's home data centre).
 */
export function resolveZohoRegion(input: {
  apiDomain?: string | null;
  companyId?: string | null;
}): ZohoRegion {
  return (
    regionFromApiDomain(input.apiDomain) ??
    (input.companyId && (ZOHO_REGIONS as readonly string[]).includes(input.companyId)
      ? (input.companyId as ZohoRegion)
      : null) ??
    "AU"
  );
}
