/**
 * NZBN (New Zealand Business Number) lookup adapter.
 *
 * Resolves an NZBN to registered entity name, status, and entity type
 * using the NZ Companies Office API (api.business.govt.nz).
 *
 * Requires env var: NZBN_API_KEY (register at app.swaggerhub.com/apis/mbie-nz).
 *
 * P1-INT9 — RA-1128
 */

const NZBN_BASE = "https://api.business.govt.nz/services/v5/nzbn/entities";
const TIMEOUT_MS = 8_000;

export interface NzbnResult {
  nzbn: string;
  entityName: string;
  entityType: string;
  entityTypeCode: string;
  status: string;
  registrationDate: string | null;
  gstNumber: string | null;
}

export class NzbnLookupError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_API_KEY" | "NOT_FOUND" | "INVALID_NZBN" | "UPSTREAM_ERROR",
  ) {
    super(message);
    this.name = "NzbnLookupError";
  }
}

function normaliseNzbn(raw: string): string {
  return raw.replace(/\s|-/g, "");
}

export async function lookupNzbn(rawNzbn: string): Promise<NzbnResult> {
  const apiKey = process.env.NZBN_API_KEY;
  if (!apiKey) {
    throw new NzbnLookupError("NZBN_API_KEY env var not configured", "NO_API_KEY");
  }

  const nzbn = normaliseNzbn(rawNzbn);
  if (!/^\d{13}$/.test(nzbn)) {
    throw new NzbnLookupError(`Invalid NZBN format: ${rawNzbn}`, "INVALID_NZBN");
  }

  const url = `${NZBN_BASE}/${nzbn}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": apiKey,
      },
    });
    if (res.status === 404) {
      throw new NzbnLookupError(`NZBN not found: ${nzbn}`, "NOT_FOUND");
    }
    if (!res.ok) {
      throw new NzbnLookupError(`NZBN API error ${res.status}`, "UPSTREAM_ERROR");
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof NzbnLookupError) throw err;
    throw new NzbnLookupError(`NZBN fetch failed: ${String(err)}`, "UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }

  return {
    nzbn,
    entityName: String(data["entityName"] ?? "Unknown"),
    entityType: String(data["entityTypeDescription"] ?? "Unknown"),
    entityTypeCode: String(data["entityTypeCode"] ?? ""),
    status: String(data["entityStatusDescription"] ?? "Unknown"),
    registrationDate: data["registrationDate"] ? String(data["registrationDate"]) : null,
    gstNumber: data["gstNumber"] ? String(data["gstNumber"]) : null,
  };
}
