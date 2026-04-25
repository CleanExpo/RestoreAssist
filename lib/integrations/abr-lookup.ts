/**
 * ABR (Australian Business Register) lookup adapter.
 *
 * Uses the ABR JSON API (abn.business.gov.au) to resolve an ABN to:
 *   - Registered entity name
 *   - GST registration status
 *   - Entity type (company, sole trader, etc.)
 *   - ACN (if applicable)
 *
 * Requires env var: ABR_GUID (register at abr.business.gov.au for free).
 *
 * P1-INT8 — RA-1128
 */

const ABR_BASE = "https://abn.business.gov.au/json/AbnDetails.aspx";
const TIMEOUT_MS = 8_000;

export interface AbrResult {
  abn: string;
  entityName: string;
  entityType: string;
  gstRegistered: boolean;
  acn: string | null;
  postcode: string | null;
  state: string | null;
  status: "Active" | "Cancelled" | string;
}

export class AbrLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_GUID" | "NOT_FOUND" | "INVALID_ABN" | "UPSTREAM_ERROR",
  ) {
    super(message);
    this.name = "AbrLookupError";
  }
}

function normaliseAbn(raw: string): string {
  return raw.replace(/\s/g, "");
}

export async function lookupAbn(rawAbn: string): Promise<AbrResult> {
  const guid = process.env.ABR_GUID;
  if (!guid) {
    throw new AbrLookupError("ABR_GUID env var not configured", "NO_GUID");
  }

  const abn = normaliseAbn(rawAbn);
  if (!/^\d{11}$/.test(abn)) {
    throw new AbrLookupError(`Invalid ABN format: ${rawAbn}`, "INVALID_ABN");
  }

  const url = `${ABR_BASE}?abn=${abn}&guid=${guid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new AbrLookupError(`ABR API error ${res.status}`, "UPSTREAM_ERROR");
    }
    // ABR JSON API wraps response in a callback — strip it if present
    const text = await res.text();
    const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
    data = JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AbrLookupError) throw err;
    throw new AbrLookupError(`ABR fetch failed: ${String(err)}`, "UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }

  const abr = (data["ABRPayloadSearchResults"] as Record<string, unknown>)?.["response"] as Record<string, unknown> | undefined;
  if (!abr || (abr["exception"] as string)) {
    throw new AbrLookupError(`ABN not found: ${abn}`, "NOT_FOUND");
  }

  const entity = abr["businessEntity201408"] as Record<string, unknown> | undefined;
  if (!entity) {
    throw new AbrLookupError(`No entity data for ABN: ${abn}`, "NOT_FOUND");
  }

  const gst = (entity["goodsAndServicesTax"] as Record<string, unknown>)?.["effectiveFrom"];
  const mainName = (entity["mainName"] as Record<string, unknown>)?.["organisationName"]
    ?? (entity["legalName"] as Record<string, unknown>)
      ? [
          (entity["legalName"] as Record<string, unknown>)?.["givenName"],
          (entity["legalName"] as Record<string, unknown>)?.["familyName"],
        ]
          .filter(Boolean)
          .join(" ")
      : "Unknown";

  const mainAddress = entity["mainBusinessPhysicalAddress"] as Record<string, unknown> | undefined;

  return {
    abn,
    entityName: String(mainName ?? "Unknown"),
    entityType: String((entity["entityType"] as Record<string, unknown>)?.["entityDescription"] ?? "Unknown"),
    gstRegistered: !!gst,
    acn: String((entity["ASICNumber"] as string) ?? "") || null,
    postcode: String(mainAddress?.["postcode"] ?? "") || null,
    state: String(mainAddress?.["stateCode"] ?? "") || null,
    status: String((entity["entityStatus"] as Record<string, unknown>)?.["entityStatusCode"] ?? "Unknown"),
  };
}
