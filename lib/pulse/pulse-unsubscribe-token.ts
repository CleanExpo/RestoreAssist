import { createHmac, timingSafeEqual } from "crypto";

const PREFIX = "pulse-opt-out";

function getSecret(): string {
  const secret =
    process.env.PORTAL_SECRET?.trim() ||
    process.env.CLIENT_PORTAL_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "PORTAL_SECRET or CLIENT_PORTAL_JWT_SECRET required for Pulse unsubscribe links",
    );
  }
  return secret;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
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

function sign(subject: string): string {
  return createHmac("sha256", getSecret())
    .update(`${PREFIX}:${subject}`)
    .digest("hex");
}

/**
 * A keyed fingerprint of an address, so a token can name the address it was sent
 * to without carrying it. Case and outer spaces do not change who it reaches.
 */
export function pulseAddressTag(email: string): string {
  return createHmac("sha256", getSecret())
    .update(`${PREFIX}-address:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Pass the address the email is going to. A record's address can be replaced, and
 * an old link must not then opt out the new one. Leaving it out makes the older
 * token form, which exists for links already in inboxes.
 */
export function generatePulseUnsubscribeToken(
  clientId: string,
  email?: string,
): string {
  if (email === undefined) {
    return toBase64Url(`${PREFIX}:${clientId}:${sign(clientId)}`);
  }
  const tag = pulseAddressTag(email);
  return toBase64Url(`${PREFIX}:${clientId}:${tag}:${sign(`${clientId}:${tag}`)}`);
}

export interface PulseUnsubscribeToken {
  clientId: string;
  /** Null on a link issued before tokens named their address. */
  addressTag: string | null;
}

export function readPulseUnsubscribeToken(
  token: string,
): PulseUnsubscribeToken | null {
  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return null;
  }
  const parts = decoded.split(":");
  if ((parts.length !== 3 && parts.length !== 4) || parts[0] !== PREFIX) {
    return null;
  }
  const clientId = parts[1];
  const addressTag = parts.length === 4 ? parts[2] : null;
  const provided = parts[parts.length - 1];
  if (!clientId || !provided || addressTag === "") return null;
  const expected = sign(addressTag ? `${clientId}:${addressTag}` : clientId);
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { clientId, addressTag };
}

export function verifyPulseUnsubscribeToken(token: string): string | null {
  return readPulseUnsubscribeToken(token)?.clientId ?? null;
}

/**
 * An unsubscribe link only works from an inbox if it is absolute, and RFC 8058
 * requires HTTPS. Throwing makes both senders suppress with MISSING_ENV rather
 * than send an email with no working way out.
 */
function appOrigin(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!URL.canParse(base) || new URL(base).protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must be an https URL for Pulse unsubscribe links");
  }
  return base;
}

export function buildPulseUnsubscribeUrl(clientId: string, email: string): string {
  const base = appOrigin();
  const token = generatePulseUnsubscribeToken(clientId, email);
  return `${base}/pulse/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * The RFC 8058 target a mail client POSTs to. The body link stays on the page,
 * which asks first, because mail scanners open links without anyone clicking.
 */
export function buildPulseOneClickUnsubscribeUrl(
  clientId: string,
  email: string,
): string {
  const base = appOrigin();
  const token = generatePulseUnsubscribeToken(clientId, email);
  return `${base}/api/pulse/unsubscribe?token=${encodeURIComponent(token)}`;
}
