import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ImageManifest, ImageManifestEntry } from "../images/source.js";
import { validateImages, validateServerJudgeKeyEnv } from "../runner/preflight.js";

const photoId = "abc123_XY";
const sourceUrl = "https://images.unsplash.com/photo-1234567890-test?fit=crop&w=1080";

function entry(bytes: Buffer, overrides: Partial<ImageManifestEntry> = {}): ImageManifestEntry {
  return {
    cacheKey: createHash("sha1").update(sourceUrl).digest("hex"),
    topic: "water-damage",
    sourceUrl,
    photographer: "Sandbox Photographer",
    photographerUrl: "https://unsplash.com/@sandbox-photographer",
    unsplashUrl: `https://unsplash.com/photos/sandbox-photo-${photoId}`,
    cachedAt: new Date().toISOString(),
    mimeType: "image/jpeg",
    unsplashPhotoId: photoId,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    ...overrides,
  };
}

async function noisyImage(format: "jpeg" | "png"): Promise<Buffer> {
  const pixels = Buffer.alloc(640 * 480 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + (i >> 5)) % 256;
  const image = sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } });
  return format === "jpeg" ? image.jpeg({ quality: 90 }).toBuffer() : image.png().toBuffer();
}

async function fixture(bytes: Buffer, overrides: Partial<ImageManifestEntry> = {}) {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pilot-image-"));
  const canonical = entry(bytes);
  const manifestEntry = entry(bytes, overrides);
  await fs.writeFile(path.join(cacheDirectory, `${manifestEntry.cacheKey}.jpg`), bytes);
  const manifest: ImageManifest = {
    generatedAt: new Date().toISOString(),
    entries: [manifestEntry],
  };
  const requiredJobs = [{ key: "water", imageTopic: "water-damage" as const, photoCount: 1 }];
  const attributionLookup = async () => ({
    id: canonical.unsplashPhotoId,
    sourceUrl: canonical.sourceUrl,
    photoPageUrl: canonical.unsplashUrl,
    photographer: canonical.photographer,
    photographerUrl: canonical.photographerUrl,
  });
  const sourceBytesLookup = async () => bytes;
  return { cacheDirectory, manifest, requiredJobs, attributionLookup, sourceBytesLookup };
}

describe("pilot image preflight", () => {
  it("accepts a fully decoded JPEG bound to its Unsplash photo and attribution", async () => {
    const f = await fixture(await noisyImage("jpeg"));
    await expect(validateImages(f.manifest, f)).resolves.toBeUndefined();
  });

  it("rejects a PNG renamed .jpg even when the declared MIME and digest agree", async () => {
    const f = await fixture(await noisyImage("png"));
    await expect(validateImages(f.manifest, f)).rejects.toThrow(/not a decodable JPEG|invalid/);
  });

  it("rejects attribution URLs that are not bound to the declared photo", async () => {
    const f = await fixture(await noisyImage("jpeg"), {
      unsplashUrl: "https://unsplash.com/photos/unrelated-photo-otherId",
    });
    await expect(validateImages(f.manifest, f)).rejects.toThrow(/not bound/);
  });

  it("rejects a root photographer URL that proves no photographer identity", async () => {
    const f = await fixture(await noisyImage("jpeg"), {
      photographerUrl: "https://unsplash.com/",
    });
    await expect(validateImages(f.manifest, f)).rejects.toThrow(/licence metadata/);
  });

  it("rejects locally plausible metadata that disagrees with the live Unsplash record", async () => {
    const f = await fixture(await noisyImage("jpeg"), {
      photographer: "Invented Photographer",
    });
    await expect(validateImages(f.manifest, f)).rejects.toThrow(/live Unsplash attribution/);
  });

  it("rejects an arbitrary JPEG whose bytes do not match the live Unsplash source", async () => {
    const bytes = await noisyImage("jpeg");
    const f = await fixture(bytes);
    const different = await sharp(bytes).flip().jpeg({ quality: 91 }).toBuffer();
    await expect(
      validateImages(f.manifest, { ...f, sourceBytesLookup: async () => different }),
    ).rejects.toThrow(/unbound|invalid/);
  });
});

describe("pilot judge preflight", () => {
  it("requires the independent server-owned judge key without exposing it", () => {
    expect(() => validateServerJudgeKeyEnv({})).toThrow(/PILOT_TESTER_JUDGE_API_KEY/);
    expect(() => validateServerJudgeKeyEnv({ PILOT_TESTER_JUDGE_API_KEY: "short" })).toThrow(/PILOT_TESTER_JUDGE_API_KEY/);
    expect(() => validateServerJudgeKeyEnv({ PILOT_TESTER_JUDGE_API_KEY: "x".repeat(16) })).not.toThrow();
  });
});
