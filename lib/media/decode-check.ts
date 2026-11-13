import {
  STRICT_UPLOAD_POLICY,
  validateImageUploadStrict,
  type StrictImageUploadResult,
} from "./validate-image-upload";

/**
 * Strict header policy, then a real bounded decode with sharp (already a
 * dependency, server-side only). `limitInputPixels` caps the decoder at the
 * policy's pixel limit, so a file that passes the header checks but cannot be
 * decoded is refused before the AI extractor or storage see it.
 */
export async function validateImageUploadDecoded(
  args: Parameters<typeof validateImageUploadStrict>[0],
): Promise<StrictImageUploadResult> {
  const header = validateImageUploadStrict(args);
  if (!header.ok) return header;
  try {
    const sharp = (await import("sharp")).default;
    await sharp(args.buffer, {
      limitInputPixels: STRICT_UPLOAD_POLICY.maxPixels,
      failOn: "warning", // sharp default: refuse truncated or corrupt data
    })
      .raw()
      .toBuffer();
  } catch {
    return { ok: false, reason: "undecodable" };
  }
  return header;
}
