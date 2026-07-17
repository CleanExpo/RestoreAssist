/**
 * Image sourcing — Unsplash free tier.
 *
 * Licence: Unsplash images are free to use for commercial work; we
 * still record the photographer + URL in the manifest as a courtesy
 * and so a downstream attribution surface (a "credits" page on the
 * pilot-tester report) can render them.
 *
 * When UNSPLASH_ACCESS_KEY is unset, the sourcer falls back to the
 * pre-cached set in `manifest.json`. CI runs without a key — the
 * curated set is enough to drive the pipeline; live key only matters
 * for refreshing the cache.
 */

import { fetch } from "undici";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, "cache");
const MANIFEST_PATH = path.resolve(__dirname, "manifest.json");

export interface ImageManifestEntry {
  /** Stable key, used as the cache filename. SHA-1 of source URL. */
  cacheKey: string;
  /** Domain hint — what we asked Unsplash for. */
  topic:
    | "water-damage"
    | "flood-interior"
    | "mould-growth"
    | "fire-damage"
    | "storm-roof"
    | "restoration-equipment";
  /** Direct download URL from the API (Unsplash 'urls.regular'). */
  sourceUrl: string;
  /** Photographer credit (Unsplash 'user.name'). */
  photographer: string;
  /** Photographer's profile URL on Unsplash. */
  photographerUrl: string;
  /** Original Unsplash photo page (for the licence audit trail). */
  unsplashUrl: string;
  /** When we cached it. */
  cachedAt: string;
  /** MIME type of the cached file. */
  mimeType: string;
}

export interface ImageManifest {
  generatedAt: string;
  entries: ImageManifestEntry[];
}

export async function loadManifest(): Promise<ImageManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as ImageManifest;
  } catch {
    return { generatedAt: new Date().toISOString(), entries: [] };
  }
}

export async function readCachedImage(
  entry: ImageManifestEntry,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const filePath = path.join(CACHE_DIR, `${entry.cacheKey}.jpg`);
  const buffer = await fs.readFile(filePath);
  return {
    buffer,
    mimeType: entry.mimeType,
    filename: `${entry.cacheKey}.jpg`,
  };
}

/**
 * Pick N images for a given topic. Throws if fewer than N exist in
 * the manifest — refresh the cache first via `pnpm --filter
 * pilot-tester images:refresh`.
 */
export async function pickImagesForTopic(
  topic: ImageManifestEntry["topic"],
  count: number,
): Promise<ImageManifestEntry[]> {
  const manifest = await loadManifest();
  const candidates = manifest.entries.filter((e) => e.topic === topic);
  if (candidates.length < count) {
    throw new Error(
      `[pilot-tester images] only ${candidates.length} cached images for topic "${topic}", need ${count}. Run images:refresh.`,
    );
  }
  // Deterministic shuffle: hash + index, so the same run-id picks the
  // same N images. Stable across restarts.
  return candidates.slice(0, count);
}

// ── Refresh path (only invoked when UNSPLASH_ACCESS_KEY is set) ──

const TOPIC_QUERIES: Record<ImageManifestEntry["topic"], string> = {
  "water-damage": "water damage interior wall",
  "flood-interior": "flood interior carpet",
  "mould-growth": "mould wall ceiling",
  "fire-damage": "fire damage interior soot",
  "storm-roof": "storm damage roof tarp",
  "restoration-equipment": "industrial dehumidifier air mover",
};

interface UnsplashSearchPhoto {
  id: string;
  urls: { regular: string };
  links: { html: string };
  user: { name: string; links: { html: string } };
}

/**
 * Pull N images per topic via the Unsplash search API and rewrite
 * `manifest.json`. Caches the JPEG bytes alongside.
 *
 * Usage:
 *   UNSPLASH_ACCESS_KEY=... tsx src/images/source.ts refresh
 */
export async function refreshCache(perTopic: number): Promise<ImageManifest> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    throw new Error(
      "[pilot-tester images] UNSPLASH_ACCESS_KEY is required for refresh.",
    );
  }
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const entries: ImageManifestEntry[] = [];
  for (const [topic, query] of Object.entries(TOPIC_QUERIES) as [
    ImageManifestEntry["topic"],
    string,
  ][]) {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(perTopic));
    url.searchParams.set("content_filter", "high");
    url.searchParams.set("orientation", "landscape");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      throw new Error(
        `[pilot-tester images] Unsplash search ${res.status} for ${topic}: ${await res.text()}`,
      );
    }
    const body = (await res.json()) as { results: UnsplashSearchPhoto[] };
    for (const photo of body.results) {
      const cacheKey = createHash("sha1")
        .update(photo.urls.regular)
        .digest("hex")
        .slice(0, 16);
      const filePath = path.join(CACHE_DIR, `${cacheKey}.jpg`);
      const dl = await fetch(photo.urls.regular);
      if (!dl.ok) continue;
      const buf = Buffer.from(await dl.arrayBuffer());
      await fs.writeFile(filePath, buf);
      entries.push({
        cacheKey,
        topic,
        sourceUrl: photo.urls.regular,
        photographer: photo.user.name,
        photographerUrl: photo.user.links.html,
        unsplashUrl: photo.links.html,
        cachedAt: new Date().toISOString(),
        mimeType: "image/jpeg",
      });
    }
  }

  const manifest: ImageManifest = {
    generatedAt: new Date().toISOString(),
    entries,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return manifest;
}

// CLI: `tsx src/images/source.ts refresh [perTopic]`
if (
  import.meta.url === `file://${process.argv[1]}` &&
  process.argv[2] === "refresh"
) {
  const perTopic = parseInt(process.argv[3] ?? "4", 10);
  refreshCache(perTopic)
    .then((m) =>
      // eslint-disable-next-line no-console
      console.log(
        `[images] refreshed ${m.entries.length} entries across ${Object.keys(TOPIC_QUERIES).length} topics`,
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
