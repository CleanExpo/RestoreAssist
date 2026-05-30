import { describe, expect, it } from "vitest";
import {
  detectImageMediaType,
  validateImageUpload,
} from "../validate-image-upload";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38]);
const webp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("validate image upload", () => {
  it("detects supported image magic bytes", () => {
    expect(detectImageMediaType(jpeg)).toBe("image/jpeg");
    expect(detectImageMediaType(png)).toBe("image/png");
    expect(detectImageMediaType(gif)).toBe("image/gif");
    expect(detectImageMediaType(webp)).toBe("image/webp");
  });

  it("rejects spoofed content-type when bytes are not an allowed image", () => {
    const result = validateImageUpload({
      declaredType: "image/jpeg",
      sizeBytes: 7,
      buffer: Buffer.from("%PDF-1."),
      maxBytes: 10 * 1024 * 1024,
      allowedTypes: ["image/jpeg", "image/png"],
    });

    expect(result).toEqual({ ok: false, reason: "unsupported-type" });
  });

  it("normalises image/jpg declarations to JPEG", () => {
    const result = validateImageUpload({
      declaredType: "image/jpg",
      sizeBytes: jpeg.length,
      buffer: jpeg,
      maxBytes: 10 * 1024 * 1024,
      allowedTypes: ["image/jpeg"],
    });

    expect(result).toEqual({ ok: true, mediaType: "image/jpeg" });
  });

  it("enforces per-route allowlists after magic-byte detection", () => {
    const result = validateImageUpload({
      declaredType: "image/webp",
      sizeBytes: webp.length,
      buffer: webp,
      maxBytes: 10 * 1024 * 1024,
      allowedTypes: ["image/jpeg", "image/png"],
    });

    expect(result).toEqual({ ok: false, reason: "unsupported-type" });
  });

  it("rejects files over the route size cap", () => {
    const result = validateImageUpload({
      declaredType: "image/png",
      sizeBytes: 11,
      buffer: png,
      maxBytes: 10,
      allowedTypes: ["image/png"],
    });

    expect(result).toEqual({ ok: false, reason: "too-large" });
  });
});
