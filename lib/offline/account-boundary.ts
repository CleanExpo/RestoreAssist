"use client";

import { OFFLINE_OWNER_HEADER, parseOfflineOwner, sameOfflineOwner, type OfflineOwner } from "./ownership";
export type { OfflineOwner } from "./ownership";

export const OFFLINE_CONTEXT_EVENT = "restoreassist-offline-context";
const INVALIDATE_KEY = "restoreassist-offline-context-invalidated";
let sessionUserId: string | null = null;
let context: OfflineOwner | null = null;
let generation = 0;
let pending: Promise<OfflineOwner | null> | null = null;
let controller = new AbortController();

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_CONTEXT_EVENT));
}

/** Call before sign-out; invalidates other tabs without sharing identity/data. */
export function clearOfflineContext(broadcast = true) {
  sessionUserId = null;
  generation++;
  context = null;
  pending = null;
  controller.abort();
  controller = new AbortController();
  if (broadcast && typeof window !== "undefined") {
    try { localStorage.setItem(INVALIDATE_KEY, `${Date.now()}:${Math.random()}`); } catch { /* storage can be disabled */ }
  }
  changed();
}

export function setOfflineSession(userId: string | null) {
  if (sessionUserId === userId) return;
  clearOfflineContext(sessionUserId !== null);
  sessionUserId = userId;
}

export function listenForOfflineInvalidation(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === INVALIDATE_KEY) clearOfflineContext(false);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function getOfflineOwner(): OfflineOwner | null {
  return context && context.userId === sessionUserId ? context : null;
}

export function requireOfflineOwner(): OfflineOwner {
  const owner = getOfflineOwner();
  if (!owner) throw new Error("Reconnect and verify your account before saving offline work. Existing work is preserved.");
  return { ...owner };
}

export function ownsOfflineEntry(entry: { owner?: OfflineOwner | null }): boolean {
  return sameOfflineOwner(parseOfflineOwner(entry.owner), getOfflineOwner());
}

/** Never restore identity from storage or assign an owner to legacy rows. */
export async function refreshOfflineOwner(): Promise<OfflineOwner | null> {
  if (!sessionUserId || typeof navigator === "undefined" || !navigator.onLine) return null;
  if (pending) return pending;
  const started = generation;
  const userId = sessionUserId;
  const attempt = (async () => {
    try {
      const response = await fetch("/api/auth/offline-context", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (generation !== started) return null;
      const owner = response.ok ? parseOfflineOwner((await response.json()).owner) : null;
      if (generation !== started) return null;
      if (!owner || owner.userId !== userId) { clearOfflineContext(); return null; }
      if (context && !sameOfflineOwner(context, owner)) {
        clearOfflineContext();
        sessionUserId = userId;
      }
      const identityChanged = !sameOfflineOwner(context, owner);
      context = Object.freeze(owner);
      if (identityChanged) changed();
      return context;
    } catch {
      // Offline data remains intact; replay still requires a fresh verification.
      return null;
    }
  })();
  pending = attempt;
  try { return await attempt; } finally { if (pending === attempt) pending = null; }
}

/** Server rechecks this restriction against the cookie on the SAME request. */
export async function offlineReplayOptions(owner: OfflineOwner | undefined): Promise<{ headers: Record<string, string>; signal: AbortSignal } | null> {
  if (!owner || !ownsOfflineEntry({ owner })) return null;
  const verified = await refreshOfflineOwner();
  if (!sameOfflineOwner(owner, verified) || !ownsOfflineEntry({ owner })) return null;
  return { headers: { [OFFLINE_OWNER_HEADER]: encodeURIComponent(JSON.stringify(owner)) }, signal: controller.signal };
}

export async function fetchOfflineReplay(owner: OfflineOwner | undefined, url: string, init: RequestInit, beforeSend?: () => Promise<void>): Promise<Response | null> {
  if (!url.startsWith("/api/") || /[\\\u0000-\u0020]/.test(url) || url.includes("://")) return null;
  const options = await offlineReplayOptions(owner);
  if (!options) return null;
  try {
    await beforeSend?.();
    if (!ownsOfflineEntry({ owner })) return null;
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(options.headers)) headers.set(name, value);
    const response = await fetch(url, { ...init, credentials: "same-origin", headers, signal: options.signal });
    if (!ownsOfflineEntry({ owner })) return null;
    if (response.status === 401 || response.status === 403 || response.headers?.get("x-restoreassist-offline-paused") === "1") {
      clearOfflineContext();
      return null;
    }
    return response;
  } catch (error) {
    if (options.signal.aborted || !ownsOfflineEntry({ owner })) return null;
    throw error;
  }
}

const flights = new Map<string, Promise<number>>();
export function withOfflineDrainLock(name: string, drain: () => Promise<number>): Promise<number> {
  const existing = flights.get(name);
  if (existing) return existing;
  // Without a cross-tab lock, simultaneous tabs can replay a paid transcription.
  // Keep the work pending on older browsers instead of guessing at exclusivity.
  if (!navigator.locks?.request) return Promise.resolve(0);
  const flight = navigator.locks.request(name, { mode: "exclusive" }, drain)
    .finally(() => { flights.delete(name); });
  flights.set(name, flight);
  return flight;
}
