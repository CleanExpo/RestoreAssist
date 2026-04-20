/**
 * NIR Field Offline Service Worker
 * Implements OFFLINE_REQUIREMENTS.fullOfflineCapability from nir-field-reality-spec.ts
 *
 * Caching strategy:
 *   /_next/static/**  → Cache-first, permanent (content-hashed filenames)
 *   /api/**           → Network-only, no cache (auth-protected, fresh data required)
 *   All other GET     → Network-first, fallback to cache, fallback to offline shell
 *
 * Background Sync:
 *   Listens for 'nir-inspection-sync' tag registered by nir-sync-queue.ts
 *   Posts NIR_SYNC_TRIGGER message to all clients to drain the IndexedDB queue
 *
 * Version this file when changing the cache strategy or precache list.
 * Old caches are pruned on activate.
 */

const NIR_VERSION = "nir-v2.0";
const CACHE_APP = `${NIR_VERSION}-app`;
const CACHE_STATIC = `${NIR_VERSION}-static`;
const ALL_CACHES = [CACHE_APP, CACHE_STATIC];

/**
 * Pages to precache on install so the app shell is immediately available offline.
 * Keep this list small — only the inspection workflow entry points.
 */
const PRECACHE_URLS = ["/", "/portal/inspections", "/offline"];

// ─── INSTALL ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) =>
        // addAll is atomic — if any URL fails, no URLs are cached
        // Use individual add() calls so a 404 on one page doesn't break the whole install
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
      )
      .then(() => {
        // Take control immediately — don't wait for existing tabs to close
        self.skipWaiting();
      }),
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !ALL_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => {
        // Claim all existing clients immediately
        self.clients.claim();
      }),
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // ── Next.js static assets — cache-first (content-hashed, safe to cache forever)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── Static public assets (images, fonts, manifest)
  if (
    url.pathname.startsWith("/fonts/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff|woff2)$/)
  ) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── API routes — network-only, offline stub response
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnlyWithOfflineStub(request));
    return;
  }

  // ── App pages — network-first, offline fallback
  event.respondWith(networkFirstWithOfflineFallback(request));
});

// ─── BACKGROUND SYNC ──────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (
    event.tag === "nir-inspection-sync" ||
    event.tag === "evidence-upload-sync"
  ) {
    // Both tags drain via the same client-side handler — the client reads
    // the SW message and each queue module (nir-sync-queue, evidence-upload-queue)
    // decides what to drain. RA-1462.
    event.waitUntil(triggerClientSync(event.tag));
  }
});

// ─── STRATEGY IMPLEMENTATIONS ─────────────────────────────────────────────────

/**
 * Cache-first: return cached version if available, otherwise fetch and cache.
 * Used for content-hashed static assets that never change at the same URL.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Asset unavailable offline", { status: 503 });
  }
}

/**
 * Network-first: try the network, fall back to cache, fall back to offline shell.
 * Used for app pages that should show fresh content but must work offline.
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);

    // Cache successful HTML responses for offline fallback
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("text/html")
    ) {
      const cache = await caches.open(CACHE_APP);
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try the root offline shell
    const shell = await caches.match("/");
    if (shell) return shell;

    return new Response(
      `<!DOCTYPE html>
      <html lang="en-AU">
        <head><meta charset="utf-8"><title>RestoreAssist — Offline</title></head>
        <body>
          <h1>You are offline</h1>
          <p>Your inspection data is saved locally and will sync when you reconnect.</p>
        </body>
      </html>`,
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  }
}

/**
 * Network-only for API routes — returns a structured offline stub on failure.
 * The stub signals to nir-sync-queue.ts that the request should be queued.
 */
async function networkOnlyWithOfflineStub(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({
        error: "offline",
        message: "Request queued for sync when connectivity is restored.",
        shouldQueue: true,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-NIR-Offline": "true",
        },
      },
    );
  }
}

/**
 * Signal all active clients to drain the IndexedDB sync queue.
 * The nir-sync-queue.ts initSyncOnReconnect() listener handles the actual drain.
 */
async function triggerClientSync(tag) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) =>
    client.postMessage({
      type: "NIR_SYNC_TRIGGER",
      source: "background-sync",
      tag: tag || "nir-inspection-sync",
    }),
  );
}
