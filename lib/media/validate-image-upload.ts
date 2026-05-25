export type ImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

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
