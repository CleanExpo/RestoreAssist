import crypto from "crypto";

export type ImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

const DECLARED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

interface ValidateImageUploadOptions {
  maxBytes: number;
  allowedTypes?: readonly ImageMimeType[];
}

export type ImageUploadValidationResult =
  | {
      ok: true;
      buffer: Buffer;
      mimeType: ImageMimeType;
      sha256: string;
    }
  | {
      ok: false;
      status: 400 | 413;
      error: string;
    };

export function detectImageMimeType(buffer: Buffer): ImageMimeType | null {
  const isJpeg =
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) return "image/jpeg";

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (isPng) return "image/png";

  const isGif =
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;
  if (isGif) return "image/gif";

  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
  if (isWebp) return "image/webp";

  return null;
}

export function sha256Hex(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function validateImageUpload(
  file: File,
  options: ValidateImageUploadOptions,
): Promise<ImageUploadValidationResult> {
  if (file.size > options.maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File too large — maximum ${Math.floor(options.maxBytes / 1024 / 1024)} MB`,
    };
  }

  if (file.type && !DECLARED_IMAGE_TYPES.has(file.type)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid file type. Only images are allowed.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) {
    return {
      ok: false,
      status: 400,
      error: "Invalid file type. Only images are allowed.",
    };
  }

  if (options.allowedTypes && !options.allowedTypes.includes(mimeType)) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported file type — use ${options.allowedTypes
        .map((type) => type.replace("image/", "").toUpperCase())
        .join(" or ")}`,
    };
  }

  return {
    ok: true,
    buffer,
    mimeType,
    sha256: sha256Hex(buffer),
  };
}
