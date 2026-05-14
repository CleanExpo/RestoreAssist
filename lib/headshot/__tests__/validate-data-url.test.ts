import { describe, expect, it } from "vitest";
import { validateHeadshotDataUrl } from "../validate-data-url";

// 1×1 JPEG (FF D8 FF E0 … FF D9) — the smallest decode-able JPEG.
const TINY_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
]);

// 1×1 PNG (89 50 4E 47 0D 0A 1A 0A …).
const TINY_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

describe("validateHeadshotDataUrl", () => {
  it("accepts a JPEG payload with image/jpeg prefix", () => {
    const result = validateHeadshotDataUrl(
      dataUrl("image/jpeg", TINY_JPEG_BYTES),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/jpeg");
      expect(result.bytes.equals(TINY_JPEG_BYTES)).toBe(true);
    }
  });

  it("accepts a PNG payload with image/png prefix", () => {
    const result = validateHeadshotDataUrl(
      dataUrl("image/png", TINY_PNG_BYTES),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/png");
    }
  });

  it("accepts a JPEG payload even when prefix says image/png (magic bytes are authoritative)", () => {
    const result = validateHeadshotDataUrl(
      dataUrl("image/png", TINY_JPEG_BYTES),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/jpeg");
    }
  });

  it("rejects a payload whose bytes are neither JPEG nor PNG", () => {
    // PDF magic: 25 50 44 46 ("%PDF")
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const result = validateHeadshotDataUrl(dataUrl("image/jpeg", pdfBytes));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JPG or PNG/);
    }
  });

  it("rejects a non-data: URL", () => {
    const result = validateHeadshotDataUrl("https://example.com/me.jpg");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed data URL", () => {
    const result = validateHeadshotDataUrl("data:image/jpeg,notbase64");
    expect(result.ok).toBe(false);
  });

  it("rejects a payload exceeding the 6MB decoded cap", () => {
    // Buffer of 6_500_000 zero bytes prefixed with a JPEG SOI marker so the
    // size check trips before the magic-byte check.
    const oversize = Buffer.alloc(6_500_000);
    oversize[0] = 0xff;
    oversize[1] = 0xd8;
    oversize[2] = 0xff;
    const result = validateHeadshotDataUrl(dataUrl("image/jpeg", oversize));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/too large|under/i);
    }
  });

  it("rejects an empty payload", () => {
    const result = validateHeadshotDataUrl("data:image/jpeg;base64,");
    expect(result.ok).toBe(false);
  });
});
