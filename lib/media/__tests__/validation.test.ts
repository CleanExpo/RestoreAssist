import { describe, expect, it } from "vitest";
import {
  detectImageMimeType,
  sha256Hex,
  validateImageUpload,
} from "../validation";

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function fileFrom(buffer: Buffer, type: string, name = "photo.bin") {
  return new File([buffer], name, { type });
}

describe("media validation", () => {
  it("detects image type from magic bytes", () => {
    expect(detectImageMimeType(pngBytes)).toBe("image/png");
    expect(detectImageMimeType(jpegBytes)).toBe("image/jpeg");
    expect(detectImageMimeType(Buffer.from("not-an-image"))).toBeNull();
  });

  it("rejects spoofed image content even when the declared MIME is valid", async () => {
    const result = await validateImageUpload(
      fileFrom(Buffer.from("not-an-image"), "image/png"),
      { maxBytes: 1024 },
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid file type. Only images are allowed.",
    });
  });

  it("returns a stable hash and detected MIME for accepted images", async () => {
    const result = await validateImageUpload(fileFrom(jpegBytes, "image/jpg"), {
      maxBytes: 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sha256).toBe(sha256Hex(jpegBytes));
  });

  it("can restrict routes to specific image types", async () => {
    const result = await validateImageUpload(fileFrom(pngBytes, "image/png"), {
      maxBytes: 1024,
      allowedTypes: ["image/jpeg"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("Unsupported file type — use JPEG");
  });
});
