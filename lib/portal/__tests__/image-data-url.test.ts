import { describe, it, expect } from "vitest";
import { decodeImageDataUrl } from "../image-data-url";

// Minimal valid magic-byte headers padded to satisfy length checks.
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20),
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20),
]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(8),
]);
const dataUrl = (mime: string, b: Buffer) =>
  `data:${mime};base64,${b.toString("base64")}`;

describe("decodeImageDataUrl", () => {
  it("accepts jpeg/png/webp with matching magic bytes", () => {
    expect(decodeImageDataUrl(dataUrl("image/jpeg", jpeg), 1e6)?.ext).toBe(
      "jpg",
    );
    expect(decodeImageDataUrl(dataUrl("image/png", png), 1e6)?.ext).toBe("png");
    expect(decodeImageDataUrl(dataUrl("image/webp", webp), 1e6)?.ext).toBe(
      "webp",
    );
  });

  it("rejects when declared MIME doesn't match the magic bytes (smuggling)", () => {
    // PNG bytes labelled as jpeg → reject
    expect(decodeImageDataUrl(dataUrl("image/jpeg", png), 1e6)).toBeNull();
  });

  it("rejects non-image / unsupported MIME and non-data-url strings", () => {
    expect(
      decodeImageDataUrl(
        `data:application/pdf;base64,${jpeg.toString("base64")}`,
        1e6,
      ),
    ).toBeNull();
    expect(decodeImageDataUrl("https://x/y.jpg", 1e6)).toBeNull();
    expect(decodeImageDataUrl("not a data url", 1e6)).toBeNull();
  });

  it("enforces the byte cap and rejects non-strings/empty", () => {
    expect(decodeImageDataUrl(dataUrl("image/jpeg", jpeg), 10)).toBeNull(); // over cap
    expect(decodeImageDataUrl(123, 1e6)).toBeNull();
    expect(decodeImageDataUrl("", 1e6)).toBeNull();
  });
});
