/**
 * SP-7 Seam F — server-side headshot payload validation.
 *
 * Decodes a `data:<mime>;base64,<payload>` URL submitted by the invite
 * acceptance flow, then enforces the same JPEG/PNG + size envelope the
 * client validator advertises. Magic-byte checks are authoritative; the
 * data-URL `mime` prefix is informational only (CLAUDE.md rule 11 —
 * "validate magic bytes, not Content-Type").
 *
 * Returned bytes can be re-encoded to a data URL by the caller before
 * handing to Cloudinary, or used directly (Cloudinary accepts the data
 * URL the route already has — we only need this helper as a security
 * gate).
 */

const MAX_DECODED_BYTES = 6 * 1024 * 1024; // 6MB — client caps at 5MB pre-crop

export type HeadshotDataUrlValidation =
  | { ok: true; bytes: Buffer; mime: "image/jpeg" | "image/png" }
  | { ok: false; error: string };

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

export function validateHeadshotDataUrl(
  input: unknown,
): HeadshotDataUrlValidation {
  if (typeof input !== "string" || !input) {
    return { ok: false, error: "Headshot is required" };
  }

  const match = DATA_URL_RE.exec(input);
  if (!match) {
    return { ok: false, error: "Headshot must be a base64 data URL" };
  }

  const payload = match[2];
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return { ok: false, error: "Headshot payload could not be decoded" };
  }

  if (bytes.length === 0) {
    return { ok: false, error: "Headshot payload is empty" };
  }

  if (bytes.length > MAX_DECODED_BYTES) {
    return { ok: false, error: "Headshot too large — must be under 6MB" };
  }

  const mime = sniffImageMime(bytes);
  if (!mime) {
    return {
      ok: false,
      error: "Headshot must be a JPG or PNG (magic-byte check failed)",
    };
  }

  return { ok: true, bytes, mime };
}

function sniffImageMime(bytes: Buffer): "image/jpeg" | "image/png" | null {
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}
