/**
 * OpenRouter model catalogue.
 *
 * Phase 3 (multi-provider BYOK) asks for a frictionless in-onboarding key +
 * model picker offering the latest open models (Qwen, DeepSeek, MiniMax)
 * alongside Anthropic/OpenAI.
 *
 * Hardcoding slugs like `qwen/qwen3-…` would go stale the moment OpenRouter
 * ships the next revision — and a stale slug is a dead picker (a 404 from the
 * provider at report time). So the catalogue is read live from OpenRouter's
 * PUBLIC model index and the "recommended" set is derived from it: for each
 * recommended family, the newest models OpenRouter itself lists. No key is
 * required or sent — this endpoint is unauthenticated upstream.
 */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Bounds on the untrusted upstream body. OpenRouter publishes a few hundred
// models; anything wildly beyond that is malformed or hostile, and without a cap
// it would be sorted, cached for ten minutes, served to every signed-in caller
// and rendered as <option>s — freezing the very onboarding step this is meant to
// make frictionless. A violation degrades exactly like an outage.
export const MAX_UPSTREAM_ENTRIES = 2_000;
export const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;

/** Recommended open-model families, in the order they are surfaced. */
export const RECOMMENDED_FAMILIES = [
  { id: "deepseek", label: "DeepSeek" },
  { id: "qwen", label: "Qwen" },
  { id: "minimax", label: "MiniMax" },
] as const;

/** How many models per family are promoted into the recommended list. */
export const RECOMMENDED_PER_FAMILY = 3;

export interface CatalogueModel {
  /** OpenRouter routing slug, e.g. `deepseek/deepseek-chat`. */
  id: string;
  /** Human label as published by OpenRouter. */
  name: string;
  /** Owning family id when it matches a recommended family, else null. */
  family: string | null;
  /** Context window in tokens, when published. */
  contextLength: number | null;
}

export interface OpenRouterCatalogue {
  recommended: CatalogueModel[];
  models: CatalogueModel[];
  /** True when the upstream index could not be read — the UI falls back to a
   *  free-text slug field rather than blocking onboarding. */
  unavailable: boolean;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  created?: unknown;
  context_length?: unknown;
}

function familyOf(id: string): string | null {
  const vendor = id.split("/")[0]?.toLowerCase() ?? "";
  const match = RECOMMENDED_FAMILIES.find((f) => vendor.includes(f.id));
  return match ? match.id : null;
}

function normalise(
  raw: RawModel | null,
): (CatalogueModel & { created: number }) | null {
  // Upstream is third-party JSON — a null or non-object entry must not throw
  // and take the whole catalogue down with it.
  if (typeof raw !== "object" || raw === null) return null;
  if (typeof raw.id !== "string") return null;
  // A whitespace-only slug is not a routable model, and an absurdly long one is
  // upstream junk that would be rendered straight into an <option>. Drop the
  // entry rather than the catalogue — one bad model must not cost the rest.
  const id = raw.id.trim();
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return null;
  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
  const name = rawName && rawName.length <= MAX_NAME_LENGTH ? rawName : id;
  return {
    id,
    name,
    family: familyOf(id),
    contextLength:
      typeof raw.context_length === "number" && Number.isFinite(raw.context_length)
        ? raw.context_length
        : null,
    created: typeof raw.created === "number" ? raw.created : 0,
  };
}

/**
 * Shape the raw OpenRouter index into the catalogue the picker consumes.
 * Exported for tests — the network fetch lives in `fetchOpenRouterCatalogue`.
 */
export function buildCatalogue(rawModels: unknown): OpenRouterCatalogue {
  if (!Array.isArray(rawModels)) {
    return { recommended: [], models: [], unavailable: true };
  }
  // Reject before mapping and sorting, not after — the point of the cap is to
  // never do the O(n log n) work on a hostile array in the first place.
  if (rawModels.length > MAX_UPSTREAM_ENTRIES) {
    return { recommended: [], models: [], unavailable: true };
  }

  const all = rawModels
    .map((m) => normalise(m as RawModel))
    .filter((m): m is CatalogueModel & { created: number } => m !== null);

  const recommended: CatalogueModel[] = [];
  for (const family of RECOMMENDED_FAMILIES) {
    const newestFirst = all
      .filter((m) => m.family === family.id)
      // OpenRouter publishes `created` as a unix timestamp; newest first gives
      // "the latest Qwen/DeepSeek/MiniMax" without pinning a version number.
      .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
      .slice(0, RECOMMENDED_PER_FAMILY);
    recommended.push(...newestFirst.map(stripCreated));
  }

  const models = [...all]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(stripCreated);

  return { recommended, models, unavailable: false };
}

function stripCreated(m: CatalogueModel & { created: number }): CatalogueModel {
  const { created: _created, ...rest } = m;
  return rest;
}

/**
 * Read a response body as text, giving up as soon as it exceeds
 * `MAX_RESPONSE_BYTES`. Returns null when the cap is hit or the body cannot be
 * read.
 *
 * The cutoff has to happen WHILE streaming: a hostile chunked body declares no
 * content-length, so measuring after a `res.text()` means the allocation has
 * already happened and the cap measures a number it can no longer prevent.
 * The reader is cancelled on breach so the socket is not drained either.
 */
async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader?.();
  // No buffered fallback. A `res.text()` escape hatch here would restore the
  // exact unbounded read this function exists to prevent, on any response whose
  // body we could not stream — and "unbounded only on the odd path" is still
  // unbounded. This runs server-side on Node, where a body-bearing response
  // always has a ReadableStream, so refusing is a degradation of an optional
  // convenience rather than a lost capability.
  if (!reader) return null;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock?.();
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

let cache: { at: number; value: OpenRouterCatalogue } | null = null;

/**
 * The single in-flight load. The cache is only written after a fetch, a bounded
 * read, a parse and a build have all completed, so without this every
 * concurrent miss opens its own upstream request — and the per-response byte
 * cap bounds each one individually while bounding the aggregate not at all.
 * This route is a GET, so the repository's default middleware limiter (which
 * covers POST/PATCH/PUT/DELETE) does not apply.
 */
let inFlight: Promise<OpenRouterCatalogue> | null = null;

/** Reset the module cache. Tests only. */
export function __resetOpenRouterCatalogueCache() {
  cache = null;
  inFlight = null;
}

/**
 * Read the live OpenRouter catalogue, cached for `CACHE_TTL_MS`.
 * Never throws — an upstream failure returns `unavailable: true` so the
 * onboarding card can degrade to a free-text slug input.
 */
export async function fetchOpenRouterCatalogue(
  now: number = Date.now(),
): Promise<OpenRouterCatalogue> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  // Coalesce concurrent misses onto one upstream read. Assigned before any
  // await, so a caller arriving in the same tick sees it.
  if (inFlight) return inFlight;
  inFlight = loadCatalogue(now).finally(() => {
    // Cleared on EVERY settlement path, success or failure, or one failed load
    // would pin every later caller to the same rejected promise.
    inFlight = null;
  });
  return inFlight;
}

async function loadCatalogue(now: number): Promise<OpenRouterCatalogue> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { recommended: [], models: [], unavailable: true };
    }
    // Reject on a declared oversize first — the cheapest possible exit.
    const declared = Number(res.headers?.get?.("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      return { recommended: [], models: [], unavailable: true };
    }
    // OpenRouter's real response is chunked and declares no content-length, so
    // the header check alone protects nothing. `res.text()` (like `res.json()`)
    // materialises the WHOLE body before any length can be measured, which is
    // exactly the allocation this cap exists to prevent — so read the stream
    // and cut it off mid-flight instead.
    const text = await readCapped(res);
    if (text === null) {
      return { recommended: [], models: [], unavailable: true };
    }
    const body = JSON.parse(text) as { data?: unknown };
    const catalogue = buildCatalogue(body?.data);
    if (catalogue.unavailable) return catalogue;

    cache = { at: now, value: catalogue };
    return catalogue;
  } catch {
    // Timeout, DNS, malformed JSON — all degrade the same way.
    return { recommended: [], models: [], unavailable: true };
  }
}
