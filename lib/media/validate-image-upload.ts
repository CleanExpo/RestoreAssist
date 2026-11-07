export type ImageMediaType =
  "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type ImageUploadValidationResult =
  | { ok: true; mediaType: ImageMediaType }
  | { ok: false; reason: "unsupported-type" | "too-large" };

const MIME_ALIASES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

function canonicalImageType(type: string): ImageMediaType | null {
  return MIME_ALIASES[type.toLowerCase()] ?? null;
}

export function detectImageMediaType(buffer: Buffer): ImageMediaType | null {
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isGif =
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;
  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";
  if (isGif) return "image/gif";
  if (isWebp) return "image/webp";
  return null;
}

export function validateImageUpload({
  declaredType,
  sizeBytes,
  buffer,
  maxBytes,
  allowedTypes,
}: {
  declaredType: string;
  sizeBytes: number;
  buffer: Buffer;
  maxBytes: number;
  allowedTypes: readonly ImageMediaType[];
}): ImageUploadValidationResult {
  const allowed = new Set(allowedTypes);
  const declaredMediaType = canonicalImageType(declaredType);
  if (!declaredMediaType || !allowed.has(declaredMediaType)) {
    return { ok: false, reason: "unsupported-type" };
  }

  if (sizeBytes > maxBytes) {
    return { ok: false, reason: "too-large" };
  }

  const detectedMediaType = detectImageMediaType(buffer);
  if (!detectedMediaType || !allowed.has(detectedMediaType)) {
    return { ok: false, reason: "unsupported-type" };
  }

  return { ok: true, mediaType: detectedMediaType };
}

/**
 * RA-8234 strict policy. One explicit set of limits for floor-plan uploads
 * that feed storage or the AI extractor. Dimensions come from the file header
 * (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X) so a pixel bomb is refused before
 * any decoder runs. No image library is needed for that read.
 */
export const STRICT_UPLOAD_POLICY = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxDimension: 10_000,
} as const;

export type StrictImageRejection =
  | "empty"
  | "too-large"
  | "unsupported-type"
  | "mime-mismatch"
  | "malformed"
  | "pixel-bomb";

export type StrictImageUploadResult =
  | { ok: true; mediaType: ImageMediaType; width: number; height: number }
  | { ok: false; reason: StrictImageRejection };

interface Dimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngDimensions(b: Buffer): Dimensions | null {
  if (b.length < 33 || PNG_SIGNATURE.some((byte, i) => b[i] !== byte)) {
    return null;
  }
  if (b.toString("latin1", 12, 16) !== "IHDR" || b.readUInt32BE(8) !== 13) {
    return null;
  }
  // Walk the chunk list: every chunk must fit and IEND must end the file.
  let offset = 8;
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset);
    const type = b.toString("latin1", offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (next > b.length) return null;
    if (type === "IEND") {
      if (next !== b.length) return null;
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    offset = next;
  }
  return null;
}

function jpegDimensions(b: Buffer): Dimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset++; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // ended before a frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const length = b.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > b.length) return null;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 8) return null;
      // Truncation check: an end-of-image marker must follow the frame header.
      // Trailing data after it (some cameras append it) is tolerated.
      if (b.lastIndexOf(Buffer.from([0xff, 0xd9])) < offset + 2 + length) {
        return null;
      }
      return {
        height: b.readUInt16BE(offset + 5),
        width: b.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(b: Buffer): Dimensions | null {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF") return null;
  if (b.toString("latin1", 8, 12) !== "WEBP") return null;
  if (b.readUInt32LE(4) + 8 !== b.length) return null;
  const fourcc = b.toString("latin1", 12, 16);
  const size = b.readUInt32LE(16);
  if (20 + size > b.length) return null;
  const d = 20;
  if (fourcc === "VP8 ") {
    if (
      size < 10 ||
      b[d + 3] !== 0x9d ||
      b[d + 4] !== 0x01 ||
      b[d + 5] !== 0x2a
    ) {
      return null;
    }
    return {
      width: b.readUInt16LE(d + 6) & 0x3fff,
      height: b.readUInt16LE(d + 8) & 0x3fff,
    };
  }
  if (fourcc === "VP8L") {
    if (size < 5 || b[d] !== 0x2f) return null;
    return {
      width: 1 + (b[d + 1] | ((b[d + 2] & 0x3f) << 8)),
      height:
        1 + ((b[d + 2] >> 6) | (b[d + 3] << 2) | ((b[d + 4] & 0x0f) << 10)),
    };
  }
  if (fourcc === "VP8X") {
    if (size < 10) return null;
    return {
      width: 1 + (b[d + 4] | (b[d + 5] << 8) | (b[d + 6] << 16)),
      height: 1 + (b[d + 7] | (b[d + 8] << 8) | (b[d + 9] << 16)),
    };
  }
  return null;
}

/**
 * Strict check on the actual bytes received. Size is the real buffer length,
 * never a client-supplied value. The declared MIME must equal the sniffed type.
 */
export function validateImageUploadStrict({
  declaredType,
  buffer,
  allowedTypes,
}: {
  declaredType: string;
  buffer: Buffer;
  allowedTypes: readonly ImageMediaType[];
}): StrictImageUploadResult {
  if (buffer.length === 0) return { ok: false, reason: "empty" };
  if (buffer.length > STRICT_UPLOAD_POLICY.maxBytes) {
    return { ok: false, reason: "too-large" };
  }

  const allowed = new Set(allowedTypes);
  const declared = canonicalImageType(declaredType.split(";")[0].trim());
  if (!declared || !allowed.has(declared)) {
    return { ok: false, reason: "unsupported-type" };
  }
  const sniffed = detectImageMediaType(buffer);
  if (!sniffed || !allowed.has(sniffed)) {
    return { ok: false, reason: "unsupported-type" };
  }
  if (sniffed !== declared) return { ok: false, reason: "mime-mismatch" };

  const dims =
    sniffed === "image/png"
      ? pngDimensions(buffer)
      : sniffed === "image/jpeg"
        ? jpegDimensions(buffer)
        : sniffed === "image/webp"
          ? webpDimensions(buffer)
          : null;
  if (!dims || dims.width < 1 || dims.height < 1) {
    return { ok: false, reason: "malformed" };
  }
  if (
    dims.width > STRICT_UPLOAD_POLICY.maxDimension ||
    dims.height > STRICT_UPLOAD_POLICY.maxDimension ||
    dims.width * dims.height > STRICT_UPLOAD_POLICY.maxPixels
  ) {
    return { ok: false, reason: "pixel-bomb" };
  }
  return { ok: true, mediaType: sniffed, ...dims };
}
