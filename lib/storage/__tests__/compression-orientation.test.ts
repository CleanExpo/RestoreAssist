/**
 * RA-8534 — stored copies must be upright.
 *
 * Phone cameras save landscape sensor pixels plus an EXIF Orientation tag.
 * Sharp drops EXIF on re-encode, so unless the orientation is applied first
 * the compressed and thumbnail copies come out sideways. The original is
 * evidence and must stay byte-for-byte untouched (its SHA-256 is the
 * chain-of-custody hash).
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compressImage, computeSha256 } from "../compression";

/**
 * A real EXIF-rotated JPEG: 600x300 landscape pixels tagged Orientation 6
 * ("rotate 90° clockwise to display"), so viewers show it as 300x600 portrait.
 * The left half is red and the right half blue so the rotation direction can
 * be checked as well as the aspect ratio.
 */
async function orientation6Jpeg(): Promise<Buffer> {
  const red = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 600, height: 300, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .composite([{ input: red, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

describe("compressImage EXIF orientation (RA-8534)", () => {
  it("fixture really carries EXIF orientation 6 on landscape pixels", async () => {
    const meta = await sharp(await orientation6Jpeg()).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(300);
  });

  it("stores compressed and thumbnail copies upright (portrait, no orientation tag left)", async () => {
    const original = await orientation6Jpeg();
    const result = await compressImage(original, "image/jpeg");

    for (const copy of [result.compressed, result.thumbnail]) {
      const meta = await sharp(copy).metadata();
      expect(meta.height).toBeGreaterThan(meta.width ?? 0);
      // No tag survives, so no viewer can rotate the copy a second time.
      expect(meta.orientation ?? 1).toBe(1);

      // Rotating 90° clockwise puts the red (left) half on top.
      const top = await pixel(copy, Math.floor((meta.width ?? 0) / 2), 5);
      const bottom = await pixel(copy, Math.floor((meta.width ?? 0) / 2), (meta.height ?? 0) - 5);
      expect(top.r).toBeGreaterThan(200);
      expect(top.b).toBeLessThan(60);
      expect(bottom.b).toBeGreaterThan(200);
      expect(bottom.r).toBeLessThan(60);
    }
  });

  it("leaves the original evidence buffer and its SHA-256 untouched", async () => {
    const original = await orientation6Jpeg();
    const before = Buffer.from(original);
    const hashBefore = computeSha256(original);

    await compressImage(original, "image/jpeg");

    expect(original.equals(before)).toBe(true);
    expect(computeSha256(original)).toBe(hashBefore);
    expect((await sharp(original).metadata()).orientation).toBe(6);
  });

  it("does not change an already-upright photo", async () => {
    const upright = await sharp({
      create: { width: 600, height: 300, channels: 3, background: { r: 0, g: 128, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const result = await compressImage(upright, "image/jpeg");
    const meta = await sharp(result.compressed).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(300);
  });
});
