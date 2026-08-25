import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { fetch } from "undici";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import type { ImageManifest } from "../images/source.js";
import { JOBS } from "../jobs/index.js";
import { validateBaseline, type Baseline } from "./baseline.js";

const root = process.cwd();
const manifestPath = path.resolve(root, "src/images/manifest.json");
const cacheDirectory = path.resolve(root, "src/images/cache");
const baselinePath = path.resolve(root, "baselines/sandbox.json");
const baselineSourceReportPath = path.resolve(root, "baselines/source-report.json");
const execFileAsync = promisify(execFile);

export interface UnsplashAttributionRecord {
  id: string;
  sourceUrl: string;
  photoPageUrl: string;
  photographer: string;
  photographerUrl: string;
}

export type AttributionLookup = (
  photoId: string,
) => Promise<UnsplashAttributionRecord>;
export type SourceBytesLookup = (sourceUrl: string) => Promise<Buffer>;

export function validateServerJudgeKeyEnv(env: NodeJS.ProcessEnv = process.env): void {
  const key = env.PILOT_TESTER_JUDGE_API_KEY;
  if (typeof key !== "string" || key.trim().length < 16) {
    throw new Error("PILOT_TESTER_JUDGE_API_KEY is required for the server-owned pilot judge");
  }
}

export function createUnsplashAttributionLookup(apiKey: string | undefined): AttributionLookup {
  if (!apiKey) {
    throw new Error("UNSPLASH_ACCESS_KEY is required to bind cached photos to live attribution");
  }
  return async (photoId) => {
    const response = await fetch(`https://api.unsplash.com/photos/${encodeURIComponent(photoId)}`, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Unsplash attribution lookup failed for ${photoId}: HTTP ${response.status}`);
    }
    const photo = (await response.json()) as {
      id?: string;
      urls?: { regular?: string };
      links?: { html?: string };
      user?: { name?: string; links?: { html?: string } };
    };
    if (
      typeof photo.id !== "string" ||
      typeof photo.urls?.regular !== "string" ||
      typeof photo.links?.html !== "string" ||
      typeof photo.user?.name !== "string" ||
      typeof photo.user.links?.html !== "string"
    ) {
      throw new Error(`Unsplash attribution lookup returned incomplete metadata for ${photoId}`);
    }
    return {
      id: photo.id,
      sourceUrl: photo.urls.regular,
      photoPageUrl: photo.links.html,
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
    };
  };
}

export function createSourceBytesLookup(): SourceBytesLookup {
  return async (sourceUrl) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Unsplash source download failed: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  };
}

function sameUrlResource(left: string, right: string): boolean {
  const a = new URL(left);
  const b = new URL(right);
  return a.protocol === b.protocol && a.hostname === b.hostname && a.pathname === b.pathname;
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label} is missing or unreadable at ${filePath}: ${String(error)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${String(error)}`);
  }
}

export async function validateImages(
  manifest: ImageManifest,
  options: {
    cacheDirectory?: string;
    requiredJobs?: ReadonlyArray<{
      key: string;
      imageTopic: ImageManifest["entries"][number]["topic"];
      photoCount: number;
    }>;
    attributionLookup?: AttributionLookup;
    sourceBytesLookup?: SourceBytesLookup;
  } = {},
): Promise<void> {
  const resolvedCacheDirectory = options.cacheDirectory ?? cacheDirectory;
  const requiredJobs = options.requiredJobs ?? JOBS;
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("image manifest has no licensed evidence entries");
  }
  const attributionLookup =
    options.attributionLookup ??
    createUnsplashAttributionLookup(process.env.UNSPLASH_ACCESS_KEY);
  const sourceBytesLookup = options.sourceBytesLookup ?? createSourceBytesLookup();
  const cacheKeys = new Set<string>();
  const contentHashes = new Set<string>();
  const photoIds = new Set<string>();
  for (const entry of manifest.entries) {
    if (!entry?.cacheKey || !/^[0-9a-f]{40}$/i.test(entry.cacheKey) || cacheKeys.has(entry.cacheKey)) {
      throw new Error(`image manifest contains an absent or duplicate cacheKey: ${entry?.cacheKey}`);
    }
    if (
      typeof entry.sourceUrl !== "string" ||
      createHash("sha1").update(entry.sourceUrl).digest("hex") !== entry.cacheKey
    ) {
      throw new Error(`image manifest cacheKey is not the SHA-1 of sourceUrl: ${entry.cacheKey}`);
    }
    let source: URL;
    let photographer: URL;
    let photoPage: URL;
    try {
      source = new URL(entry.sourceUrl);
      photographer = new URL(entry.photographerUrl);
      photoPage = new URL(entry.unsplashUrl);
    } catch {
      throw new Error(`image manifest entry ${entry.cacheKey} has an invalid attribution URL`);
    }
    if (
      source.protocol !== "https:" ||
      !["images.unsplash.com", "plus.unsplash.com"].includes(source.hostname) ||
      photographer.protocol !== "https:" ||
      photographer.hostname !== "unsplash.com" ||
      !/^\/@[^/]+\/?$/.test(photographer.pathname) ||
      photoPage.protocol !== "https:" ||
      photoPage.hostname !== "unsplash.com" ||
      !photoPage.pathname.startsWith("/photos/") ||
      typeof entry.photographer !== "string" ||
      entry.photographer.trim().length === 0 ||
      typeof entry.unsplashPhotoId !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(entry.unsplashPhotoId) ||
      photoIds.has(entry.unsplashPhotoId) ||
      typeof entry.contentSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(entry.contentSha256) ||
      contentHashes.has(entry.contentSha256.toLowerCase()) ||
      entry.mimeType !== "image/jpeg" ||
      Number.isNaN(Date.parse(entry.cachedAt))
    ) {
      throw new Error(
        `image manifest entry ${entry.cacheKey} lacks unique, valid Unsplash licence metadata`,
      );
    }
    const photoSlug = photoPage.pathname.replace(/\/$/, "").split("/").pop() ?? "";
    if (
      photoSlug !== entry.unsplashPhotoId &&
      !photoSlug.endsWith(`-${entry.unsplashPhotoId}`)
    ) {
      throw new Error(
        `image manifest entry ${entry.cacheKey} photo page is not bound to Unsplash photo ${entry.unsplashPhotoId}`,
      );
    }
    const liveAttribution = await attributionLookup(entry.unsplashPhotoId);
    if (
      liveAttribution.id !== entry.unsplashPhotoId ||
      !sameUrlResource(liveAttribution.sourceUrl, entry.sourceUrl) ||
      !sameUrlResource(liveAttribution.photoPageUrl, entry.unsplashUrl) ||
      liveAttribution.photographer !== entry.photographer ||
      !sameUrlResource(liveAttribution.photographerUrl, entry.photographerUrl)
    ) {
      throw new Error(
        `image manifest entry ${entry.cacheKey} does not match live Unsplash attribution`,
      );
    }
    cacheKeys.add(entry.cacheKey);
    photoIds.add(entry.unsplashPhotoId);
    contentHashes.add(entry.contentSha256.toLowerCase());
    const filePath = path.join(resolvedCacheDirectory, `${entry.cacheKey}.jpg`);
    const stat = await fs.stat(filePath);
    const bytes = await fs.readFile(filePath);
    const liveSourceBytes = await sourceBytesLookup(entry.sourceUrl);
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    let decoded;
    let metadata;
    try {
      metadata = await sharp(bytes, { failOn: "error" }).metadata();
      decoded = await sharp(bytes, { failOn: "error" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new Error(`cached image ${entry.cacheKey}.jpg is not a decodable JPEG`);
    }
    if (
      !stat.isFile() ||
      stat.size < 20_000 ||
      contentSha256 !== entry.contentSha256.toLowerCase() ||
      liveSourceBytes.length !== bytes.length ||
      !liveSourceBytes.equals(bytes) ||
      metadata.format !== "jpeg" ||
      decoded.info.format !== "raw" ||
      decoded.data.length === 0 ||
      decoded.info.width < 640 ||
      decoded.info.height < 480
    ) {
      throw new Error(`cached image ${entry.cacheKey}.jpg is absent, unbound, invalid, or below 640×480`);
    }
  }
  for (const job of requiredJobs) {
    const available = manifest.entries.filter((entry) => entry.topic === job.imageTopic).length;
    if (available < job.photoCount) {
      throw new Error(
        `job ${job.key} requires ${job.photoCount} ${job.imageTopic} image(s), manifest contains ${available}`,
      );
    }
  }
}

export async function main(): Promise<number> {
  try {
    validateServerJudgeKeyEnv();
    const manifest = await readJson<ImageManifest>(manifestPath, "image manifest");
    const baseline = await readJson<Baseline>(baselinePath, "sandbox baseline");
    const sourceReportBytes = await fs.readFile(baselineSourceReportPath, "utf8");
    await validateImages(manifest);
    validateBaseline(baseline, { requireExactPopulation: true, sourceReportBytes });
    const repositoryRoot = path.resolve(root, "../..");
    await execFileAsync("git", ["cat-file", "-e", `${baseline.source.revision}^{commit}`], {
      cwd: repositoryRoot,
    });
    await execFileAsync("git", ["merge-base", "--is-ancestor", baseline.source.revision, "HEAD"], {
      cwd: repositoryRoot,
    });
  } catch (error) {
    console.error(`[pilot-tester preflight] FAIL: ${String(error)}`);
    return 1;
  }
  console.log(
    `[pilot-tester preflight] PASS: ${SYNTHETIC_COMPANIES.length} companies × ${JOBS.length} jobs; baseline shape and attributed image cache are complete`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
