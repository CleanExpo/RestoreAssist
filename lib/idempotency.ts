import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

/**
 * Idempotency-Key middleware — Stripe-style request replay protection.
 *
 * Closes RA-1266. Clients on unreliable networks (mobile app, background
 * sync) retry POSTs when they don't see a response, which on a payment
 * or invoice-create endpoint can double-charge / double-insert.
 *
 * Opt-in per route. Wrap handler with {@link withIdempotency} and clients
 * supply an `Idempotency-Key` header (UUID v4 recommended). The same key
 * returns the cached response — a different body under the same key
 * returns 409.
 *
 * Storage: in-memory only for now (per-instance). Adequate for the
 * retry window (seconds, same warm instance); Redis-backed store can
 * slot in later via the same pluggable pattern as rate-limiter.ts.
 *
 * Scope is intentionally user-level — two users using "the same" key
 * don't collide. Key format: 8–255 chars, printable ASCII.
 */

const KEY_HEADER = "idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches Stripe
const MAX_KEY_LEN = 255;
const MIN_KEY_LEN = 8;
const MAX_BODY_CACHE_BYTES = 1_000_000; // 1MB — skip caching larger responses

interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
  fingerprint: string;
  expiresAt: number;
}

type StoreEntry =
  | { kind: "pending"; fingerprint: string; expiresAt: number }
  | { kind: "complete"; response: CachedResponse };

const store = new Map<string, StoreEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      const expiresAt =
        entry.kind === "complete" ? entry.response.expiresAt : entry.expiresAt;
      if (expiresAt < now) store.delete(key);
    }
  }, 60_000);
  if (
    typeof cleanupTimer === "object" &&
    cleanupTimer &&
    "unref" in cleanupTimer
  ) {
    cleanupTimer.unref();
  }
}

/**
 * Extract and validate Idempotency-Key from request headers.
 * Returns null if absent, or error if malformed.
 */
export function getIdempotencyKey(
  req: NextRequest,
): { ok: true; key: string | null } | { ok: false; reason: string } {
  const raw = req.headers.get(KEY_HEADER);
  if (raw === null) return { ok: true, key: null };
  const key = raw.trim();
  if (key.length < MIN_KEY_LEN || key.length > MAX_KEY_LEN) {
    return {
      ok: false,
      reason: `Idempotency-Key must be ${MIN_KEY_LEN}–${MAX_KEY_LEN} chars`,
    };
  }
  // Printable ASCII only — reject control chars and non-ASCII to prevent
  // cache-key poisoning via Unicode normalisation collisions.
  if (!/^[\x21-\x7E]+$/.test(key)) {
    return {
      ok: false,
      reason: "Idempotency-Key must be printable ASCII with no spaces",
    };
  }
  return { ok: true, key };
}

function fingerprintBody(method: string, path: string, body: string): string {
  return createHash("sha256")
    .update(`${method}\n${path}\n${body}`)
    .digest("hex");
}

function buildCacheKey(scope: string, key: string): string {
  return `idem:${scope}:${key}`;
}

function responseFromCache(cached: CachedResponse): NextResponse {
  return new NextResponse(cached.body, {
    status: cached.status,
    headers: {
      "Content-Type": cached.contentType,
      "Idempotent-Replayed": "true",
    },
  });
}

/**
 * Wrap a POST/PATCH handler with idempotency.
 *
 * When the client sends `Idempotency-Key`:
 *   - First request: executes handler, caches the response body + status
 *     for TTL_MS, returns it
 *   - Same key + identical body: returns the cached response with
 *     `Idempotent-Replayed: true` header
 *   - Same key + different body: returns 409 Conflict
 *   - Same key arriving while first is still in-flight: returns 409
 *
 * When absent: handler runs unchanged.
 *
 * @param req        The inbound request (consumed for body/path)
 * @param scope      Caller-provided scope (usually `session.user.id`) so
 *                   two users can't collide on each other's keys
 * @param handler    Your handler. Receives the already-parsed body to
 *                   avoid the double-consume problem on req.json().
 */
export async function withIdempotency(
  req: NextRequest,
  scope: string,
  handler: (parsedBody: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const keyResult = getIdempotencyKey(req);
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.reason }, { status: 400 });
  }

  const bodyText = await req.text();

  if (!keyResult.key) {
    // No key supplied — pass through untouched.
    return handler(bodyText);
  }

  ensureCleanup();
  const cacheKey = buildCacheKey(scope, keyResult.key);
  const fingerprint = fingerprintBody(
    req.method,
    req.nextUrl.pathname,
    bodyText,
  );
  const now = Date.now();
  const existing = store.get(cacheKey);

  if (existing) {
    if (existing.kind === "complete") {
      if (existing.response.expiresAt < now) {
        store.delete(cacheKey);
      } else if (existing.response.fingerprint !== fingerprint) {
        return NextResponse.json(
          {
            error:
              "Idempotency-Key reused with a different request body. Use a new key for new requests.",
          },
          { status: 409 },
        );
      } else {
        return responseFromCache(existing.response);
      }
    } else {
      // Pending — concurrent request with same key.
      if (existing.expiresAt < now) {
        store.delete(cacheKey);
      } else if (existing.fingerprint !== fingerprint) {
        return NextResponse.json(
          {
            error:
              "Idempotency-Key reused with a different request body. Use a new key for new requests.",
          },
          { status: 409 },
        );
      } else {
        return NextResponse.json(
          {
            error:
              "A request with this Idempotency-Key is already in progress. Retry shortly.",
          },
          { status: 409 },
        );
      }
    }
  }

  // Mark pending — 60s pending window (generous for slow AI/Stripe calls).
  store.set(cacheKey, {
    kind: "pending",
    fingerprint,
    expiresAt: now + 60_000,
  });

  let response: NextResponse;
  try {
    response = await handler(bodyText);
  } catch (err) {
    store.delete(cacheKey);
    throw err;
  }

  // Only cache successful/client-error responses (not 5xx — caller should
  // retry after a server error to recover). And only cache small bodies.
  if (response.status >= 500) {
    store.delete(cacheKey);
    return response;
  }

  const clonedBody = await response.clone().text();
  if (clonedBody.length > MAX_BODY_CACHE_BYTES) {
    store.delete(cacheKey);
    return response;
  }

  store.set(cacheKey, {
    kind: "complete",
    response: {
      status: response.status,
      body: clonedBody,
      contentType: response.headers.get("content-type") || "application/json",
      fingerprint,
      expiresAt: now + TTL_MS,
    },
  });

  return response;
}

/** Test-only: clear the in-memory store between tests. */
export function __resetIdempotencyStore(): void {
  store.clear();
}
