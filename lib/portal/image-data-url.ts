/**
 * Validate + decode a base64 image data URL for the token-gated client evidence
 * upload (client portal Phase 2). Defends an unauthenticated surface: confirms
 * the declared MIME against the file's magic bytes (so a caller can't smuggle a
 * non-image or a mislabelled payload) and enforces a byte cap.
 */

export interface DecodedImage {
  buffer: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
}

const SIGNATURES: Record<
  DecodedImage["mime"],
  { ext: DecodedImage["ext"]; check: (b: Buffer) => boolean }
> = {
  "image/jpeg": {
    ext: "jpg",
    check: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    check: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  "image/webp": {
    ext: "webp",
    check: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
};

/**
 * Returns the decoded image, or null if the input is not a supported image data
 * URL, exceeds `maxBytes`, or the declared MIME doesn't match its magic bytes.
 */
export function decodeImageDataUrl(
  input: unknown,
  maxBytes: number,
): DecodedImage | null {
  if (typeof input !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    input,
  );
  if (!m) return null;
  const mime = m[1] as DecodedImage["mime"];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > maxBytes) return null;
  const sig = SIGNATURES[mime];
  if (!sig || !sig.check(buffer)) return null; // magic bytes must match declared MIME
  return { buffer, mime, ext: sig.ext };
}
