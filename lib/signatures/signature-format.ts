/**
 * Authority-form signature format — the single owner (RA-8604).
 *
 * A stored `AuthorityFormSignature.signatureData` value is written by the
 * signing screens, checked by the signing routes and read by the PDF maker.
 * Before this module each of those held its own idea of the format: the client
 * portal wrote an SVG, the PDF maker only decoded base64 PNG (and silently drew
 * nothing on failure), and the public signing route accepted any value. This
 * module is the one place the accepted shapes are defined; every writer, gate
 * and reader calls it.
 *
 * Accepted shapes:
 *   1. `data:image/png;base64,<payload>` — the drawn signature (canvas export).
 *   2. The typed-name SVG produced by `typedSignatureDataUrl()` — exactly that
 *      shape, nothing else. The PDF maker cannot embed SVG, so the reader
 *      recovers the typed name and the PDF draws it as script text.
 *
 * Reading is deliberately a little wider than writing: `decodeSignatureForPdf`
 * also accepts a bare base64 PNG (no `data:` prefix), because rows written
 * before this module existed may hold one. New writes must pass
 * `validateSignatureData`, which requires one of the two shapes above.
 */

/** Largest stored value accepted, in characters. A drawn canvas signature
 *  is typically under 40 KB of base64; the typed SVG is under 1 KB. */
export const SIGNATURE_DATA_MAX_CHARS = 300_000;

/** Longest typed name kept in a typed signature. */
export const TYPED_SIGNATURE_MAX_NAME_CHARS = 80;

/** Longest signatory name a signing route will store. */
export const SIGNATORY_NAME_MAX_CHARS = 120;

const PNG_PREFIX = "data:image/png;base64,";
const TYPED_PREFIX = "data:image/svg+xml;utf8,";

// The SVG is built from these two halves and parsed against the same halves,
// so the writer and the reader cannot drift apart.
const TYPED_SVG_OPEN =
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80">` +
  `<text x="12" y="52" font-family="'Brush Script MT',cursive" font-size="34" font-style="italic" fill="#0f172a">`;
const TYPED_SVG_CLOSE = `</text></svg>`;

/** Characters stripped from a typed name so it cannot break out of the SVG. */
const TYPED_NAME_FORBIDDEN = /[<>&"']/g;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Turn a client's typed full name into the stored typed-signature value.
 * Inline SVG (no canvas) so it is deterministic and renders in an <img> tag.
 */
export function typedSignatureDataUrl(name: string): string {
  const safe =
    name
      .replace(TYPED_NAME_FORBIDDEN, "")
      .trim()
      .slice(0, TYPED_SIGNATURE_MAX_NAME_CHARS) || "Signed";
  return `${TYPED_PREFIX}${encodeURIComponent(TYPED_SVG_OPEN + safe + TYPED_SVG_CLOSE)}`;
}

export type DecodedSignature =
  | { kind: "png"; bytes: Uint8Array }
  | { kind: "typed"; name: string };

export type SignatureDecodeResult =
  | ({ ok: true } & DecodedSignature)
  | { ok: false; error: string };

function decodeBase64Png(payload: string): SignatureDecodeResult {
  if (payload.length === 0 || !BASE64_RE.test(payload)) {
    return { ok: false, error: "Signature image is not valid base64" };
  }
  const bytes = new Uint8Array(Buffer.from(payload, "base64"));
  if (
    bytes.length < PNG_MAGIC.length ||
    PNG_MAGIC.some((b, i) => bytes[i] !== b)
  ) {
    return { ok: false, error: "Signature image is not a PNG" };
  }
  return { ok: true, kind: "png", bytes };
}

function decodeTyped(encoded: string): SignatureDecodeResult {
  let svg: string;
  try {
    svg = decodeURIComponent(encoded);
  } catch {
    return { ok: false, error: "Typed signature is not valid" };
  }
  if (!svg.startsWith(TYPED_SVG_OPEN) || !svg.endsWith(TYPED_SVG_CLOSE)) {
    return { ok: false, error: "Typed signature is not valid" };
  }
  const name = svg.slice(
    TYPED_SVG_OPEN.length,
    svg.length - TYPED_SVG_CLOSE.length,
  );
  if (
    name.trim().length === 0 ||
    name.length > TYPED_SIGNATURE_MAX_NAME_CHARS ||
    /[<>&"']/.test(name)
  ) {
    return { ok: false, error: "Typed signature is not valid" };
  }
  return { ok: true, kind: "typed", name };
}

function decode(value: unknown, allowBareBase64: boolean): SignatureDecodeResult {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: "Signature data is required" };
  }
  if (value.length > SIGNATURE_DATA_MAX_CHARS) {
    return { ok: false, error: "Signature data is too large" };
  }
  if (value.startsWith(PNG_PREFIX)) {
    return decodeBase64Png(value.slice(PNG_PREFIX.length));
  }
  if (value.startsWith(TYPED_PREFIX)) {
    return decodeTyped(value.slice(TYPED_PREFIX.length));
  }
  if (allowBareBase64 && !value.includes(",")) {
    return decodeBase64Png(value);
  }
  return {
    ok: false,
    error: "Signature must be a drawn PNG signature or a typed signature",
  };
}

/** Gate for every signing route. Accepts only the two writable shapes. */
export function validateSignatureData(value: unknown): SignatureDecodeResult {
  return decode(value, false);
}

/** Reader for the PDF maker. Also tolerates legacy bare-base64 PNG rows. */
export function decodeSignatureForPdf(value: unknown): SignatureDecodeResult {
  return decode(value, true);
}

/**
 * Optional signatory name sent with a signature. `undefined` / empty means
 * "keep the stored name". Anything else must be a short single-line string.
 */
export function validateSignatoryName(
  value: unknown,
): { ok: true; name: string | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, name: undefined };
  if (typeof value !== "string") {
    return { ok: false, error: "Signatory name must be text" };
  }
  const name = value.trim();
  if (name.length === 0) return { ok: true, name: undefined };
  if (name.length > SIGNATORY_NAME_MAX_CHARS) {
    return { ok: false, error: "Signatory name is too long" };
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "Signatory name contains invalid characters" };
  }
  return { ok: true, name };
}
