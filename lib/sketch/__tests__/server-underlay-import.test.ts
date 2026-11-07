import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/scraping/safe-fetch", () => ({
  sanitizeScrapedImageUrl: vi.fn(),
}));
vi.mock("@/lib/security/safe-external-url", () => ({
  isSafePublicHttpsUrl: vi.fn(),
}));

import sharp from "sharp";
import { prepareUnderlayBytes } from "../server-underlay-import";
import { makePng } from "@/lib/media/__tests__/image-fixtures";

async function genuine(format: "png" | "jpeg" | "webp") {
  const image = sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  });
  return image[format]().toBuffer();
}

describe("prepareUnderlayBytes", () => {
  it.each([
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ] as const)(
    "keeps the genuine %s flow: watermarked PNG with exact stored-byte hash",
    async (fmt, mime) => {
      const src = await genuine(fmt);
      const out = await prepareUnderlayBytes(src, mime);
      expect(out.mimeType).toBe("image/png");
      expect(out.contentSha256).toBe(
        createHash("sha256").update(out.bytes).digest("hex"),
      );
      expect(out.sourceSizeBytes).toBe(src.length);
      const meta = await sharp(out.bytes).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([64, 48]);
      // The watermark must actually change pixels versus a plain re-encode.
      const plain = await sharp(src).png({ compressionLevel: 9 }).toBuffer();
      expect(out.bytes.equals(plain)).toBe(false);
    },
  );

  it("rejects spoofed, truncated, mismatched and bomb inputs before decoding", async () => {
    const png = await genuine("png");
    await expect(
      prepareUnderlayBytes(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png",
      ),
    ).rejects.toThrow();
    await expect(
      prepareUnderlayBytes(png.subarray(0, png.length - 20), "image/png"),
    ).rejects.toThrow();
    await expect(prepareUnderlayBytes(png, "image/jpeg")).rejects.toThrow();
    await expect(
      prepareUnderlayBytes(makePng(100_000, 100_000), "image/png"),
    ).rejects.toThrow();
  });
});

describe("prepareUnderlayBytes structural rejects", () => {
  it("rejects terminated files with no image data, and undecodable pixel data", async () => {
    const {
      makePngWithoutIdat,
      makePngWithGarbageIdat,
      makeJpegWithoutScan,
      makeWebpCanvasOnly,
    } = await import("@/lib/media/__tests__/image-fixtures");
    await expect(
      prepareUnderlayBytes(makePngWithoutIdat(), "image/png"),
    ).rejects.toThrow();
    await expect(
      prepareUnderlayBytes(makeJpegWithoutScan(), "image/jpeg"),
    ).rejects.toThrow();
    await expect(
      prepareUnderlayBytes(makeWebpCanvasOnly(), "image/webp"),
    ).rejects.toThrow();
    await expect(
      prepareUnderlayBytes(makePngWithGarbageIdat(), "image/png"),
    ).rejects.toThrow();
  });
});

describe("prepareUnderlayBytes EXIF orientation", () => {
  it.each([
    [3, 64, 48],
    [6, 48, 64],
    [8, 48, 64],
  ])(
    "orientation %i yields a %ix%i PNG with exact-byte hash",
    async (orientation, width, height) => {
      const { makeOrientedJpeg } =
        await import("@/lib/media/__tests__/image-fixtures");
      const src = await makeOrientedJpeg(orientation);
      const out = await prepareUnderlayBytes(src, "image/jpeg");
      const meta = await sharp(out.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
      expect(out.contentSha256).toBe(
        createHash("sha256").update(out.bytes).digest("hex"),
      );
    },
  );
});
