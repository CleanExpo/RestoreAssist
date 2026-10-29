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

function sign(clientId: string): string {
  return createHmac("sha256", getSecret())
    .update(`${PREFIX}:${clientId}`)
    .digest("hex");
}

export function generatePulseUnsubscribeToken(clientId: string): string {
  const payload = `${PREFIX}:${clientId}:${sign(clientId)}`;
  return toBase64Url(payload);
}

export function verifyPulseUnsubscribeToken(token: string): string | null {
  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return null;
  }
  const parts = decoded.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const clientId = parts[1];
  const provided = parts[2];
  if (!clientId || !provided) return null;
  const expected = sign(clientId);
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return clientId;
}

export function buildPulseUnsubscribeUrl(clientId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const token = generatePulseUnsubscribeToken(clientId);
  return `${base}/pulse/unsubscribe?token=${encodeURIComponent(token)}`;
}
