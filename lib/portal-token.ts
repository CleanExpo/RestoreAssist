import { createHmac, timingSafeEqual } from "crypto";

// Fail hard at module load if secret is absent — prevents silent fallback to
// a known string that would allow any attacker to forge valid portal tokens
if (!process.env.PORTAL_SECRET) {
  throw new Error(
    "PORTAL_SECRET environment variable is required. " +
      "Generate with: openssl rand -hex 32",
  );
}
const PORTAL_SECRET = process.env.PORTAL_SECRET;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function toBase64Url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const paddedStr = pad ? padded + "=".repeat(4 - pad) : padded;
  return Buffer.from(paddedStr, "base64").toString("utf8");
}

function computeHmac(payload: string): string {
  return createHmac("sha256", PORTAL_SECRET).update(payload).digest("hex");
}

/**
 * Generate a 7-day HMAC-signed portal token for an inspection.
 * Token format (base64url): `${inspectionId}:${expiryUnixSeconds}:${hmac}`
 */
export function generatePortalToken(inspectionId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${inspectionId}:${expiry}`;
  const hmac = computeHmac(payload);
  return toBase64Url(`${payload}:${hmac}`);
}

/**
 * Verify a portal token.
 * Returns `{ inspectionId }` on success, or `null` if invalid/expired.
 */
export function verifyPortalToken(
  token: string,
): { inspectionId: string } | null {
  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return null;
  }

  // Format: inspectionId:expiryUnixSeconds:hmac
  // inspectionId is a cuid which contains no colons, so split from the right
  const lastColon = decoded.lastIndexOf(":");
  if (lastColon === -1) return null;
  const providedHmac = decoded.slice(lastColon + 1);
  const payload = decoded.slice(0, lastColon);

  // payload = inspectionId:expiryUnixSeconds
  const secondLastColon = payload.lastIndexOf(":");
  if (secondLastColon === -1) return null;
  const inspectionId = payload.slice(0, secondLastColon);
  const expiryStr = payload.slice(secondLastColon + 1);
  const expiry = parseInt(expiryStr, 10);

  if (!inspectionId || isNaN(expiry)) return null;

  // Verify HMAC via timing-safe comparison
  const expectedHmac = computeHmac(payload);
  try {
    const a = Buffer.from(providedHmac, "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  // Check expiry
  if (Math.floor(Date.now() / 1000) > expiry) return null;

  return { inspectionId };
}

/** Returns the ISO expiry date for a freshly-generated token. */
export function portalTokenExpiresAt(): string {
  return new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
}

// ─── Insurer Report Tokens (RA-428) ──────────────────────────────────────────
// Separate token namespace for insurer-facing report share links.
// 30-day TTL, report-scoped, no login required on portal.

const INSURER_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days
const INSURER_PREFIX = "ins"; // namespace prefix — prevents cross-use with inspection tokens

/**
 * Generate a 30-day HMAC-signed token granting an insurer read access to a report.
 * Token format (base64url): `ins:${reportId}:${expiryUnixSeconds}:${hmac}`
 */
export function generateInsurerToken(reportId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + INSURER_TOKEN_TTL;
  const payload = `${INSURER_PREFIX}:${reportId}:${expiry}`;
  const hmac = computeHmac(payload);
  return toBase64Url(`${payload}:${hmac}`);
}

/**
 * Verify an insurer token.
 * Returns `{ reportId }` on success, or `null` if invalid/expired/wrong namespace.
 */
export function verifyInsurerToken(token: string): { reportId: string } | null {
  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return null;
  }

  // Format: ins:reportId:expiryUnixSeconds:hmac
  const lastColon = decoded.lastIndexOf(":");
  if (lastColon === -1) return null;
  const providedHmac = decoded.slice(lastColon + 1);
  const payload = decoded.slice(0, lastColon);

  // payload = ins:reportId:expiryUnixSeconds
  const secondLastColon = payload.lastIndexOf(":");
  if (secondLastColon === -1) return null;
  const idPart = payload.slice(0, secondLastColon); // "ins:reportId"
  const expiryStr = payload.slice(secondLastColon + 1);
  const expiry = parseInt(expiryStr, 10);

  // Must start with namespace prefix
  if (!idPart.startsWith(`${INSURER_PREFIX}:`)) return null;
  const reportId = idPart.slice(INSURER_PREFIX.length + 1);

  if (!reportId || isNaN(expiry)) return null;

  // Timing-safe HMAC check
  const expectedHmac = computeHmac(payload);
  try {
    const a = Buffer.from(providedHmac, "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  if (Math.floor(Date.now() / 1000) > expiry) return null;

  return { reportId };
}

/** Returns the ISO expiry date for a freshly-generated insurer token. */
export function insurerTokenExpiresAt(): string {
  return new Date(Date.now() + INSURER_TOKEN_TTL * 1000).toISOString();
}
