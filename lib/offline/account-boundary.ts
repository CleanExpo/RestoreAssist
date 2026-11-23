"use client";

import { OFFLINE_OWNER_HEADER, parseOfflineOwner, sameOfflineOwner, type OfflineOwner } from "./ownership";
import { forgetDeviceIdentity, loadDeviceIdentity, rememberDeviceIdentity } from "./device-identity";
export type { OfflineOwner } from "./ownership";

export const OFFLINE_CONTEXT_EVENT = "restoreassist-offline-context";
const INVALIDATE_KEY = "restoreassist-offline-context-invalidated";
let sessionUserId: string | null = null;
// Who the page's session says is signed in, whether or not that has been verified.
// clearOfflineContext() clears sessionUserId, so a FAILED verification would
// otherwise make the page forget that a different account is signed in
// (RA-7877). Only setOfflineSession() and endOfflineSession() change this.
let declaredUserId: string | null = null;
// Another tab changed or ended the session (storage invalidation). From then on
// this tab does not know who is signed in, whatever declaredUserId still says,
// so no device copy may be used for anyone until the server verifies an account
// here (RA-7877). Cleared only by a verified owner or by endOfflineSession().
let identityUncertain = false;
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

/**
 * Sign-out or sign-in as someone else: forget this tab's context AND the device
 * copy that lets a cold start open offline (RA-7877). clearOfflineContext alone
 * must not wipe it: the provider calls that on every session refresh, and a
 * refresh that fails offline must not strand a technician with no signal.
 */
export function endOfflineSession() {
  declaredUserId = null;
  identityUncertain = false;
  clearOfflineContext();
  void forgetDeviceIdentity();
}

export function setOfflineSession(userId: string | null) {
  declaredUserId = userId;
  if (sessionUserId === userId) return;
  clearOfflineContext(sessionUserId !== null);
  sessionUserId = userId;
}

export function listenForOfflineInvalidation(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== INVALIDATE_KEY) return;
    identityUncertain = true;
    clearOfflineContext(false);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function getOfflineOwner(): OfflineOwner | null {
  return context && context.userId === sessionUserId ? context : null;
}

/**
 * Who may START or LIST offline capture on this page right now. The one owner of
 * that rule (RA-7877):
 *   - a verified owner, else
 *   - the device copy, but never against a session this page already knows is
 *     someone else. A different account that is signed in but not yet verified
 *     (a failed or slow check) gets nothing, not the previous account's data.
 * A read that was overtaken by a wipe returns null (see loadDeviceIdentity).
 */
export async function resolveOfflineActor(): Promise<OfflineOwner | null> {
  const verified = getOfflineOwner();
  if (verified) return verified;
  if (identityUncertain) return null;
  const known = declaredUserId;
  const stored = (await loadDeviceIdentity())?.owner ?? null;
  if (!stored) return null;
  if (known !== null && stored.userId !== known) return null;
  // The session may have changed while the copy was being read.
  if (declaredUserId !== known || identityUncertain) return null;
  return stored;
}

export function requireOfflineOwner(): OfflineOwner {
  const owner = getOfflineOwner();
  if (!owner) throw new Error("Reconnect and verify your account before saving offline work. Existing work is preserved.");
  return { ...owner };
}

export function ownsOfflineEntry(entry: { owner?: OfflineOwner | null }): boolean {
  return sameOfflineOwner(parseOfflineOwner(entry.owner), getOfflineOwner());
}

/**
 * Never restore identity from storage or assign an owner to legacy rows.
 * (The device copy in device-identity.ts only lets the offline page START a
 * capture; it is never loaded into `context`, so no replay can use it.)
 */
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
      if (!owner || owner.userId !== userId) {
        // Only a definite answer ends the device copy: the server says this is
        // not a signed-in session (401), or it names someone else. A 5xx or a
        // malformed reply proves nothing about who is signed in.
        if (response.status === 401 || (owner && owner.userId !== userId)) void forgetDeviceIdentity();
        clearOfflineContext();
        return null;
      }
      if (context && !sameOfflineOwner(context, owner)) {
        // Refresh this tab's scope without cancelling another tab's verified
        // session. Every replay still rechecks its own scope with the server.
        clearOfflineContext(false);
        sessionUserId = userId;
      }
      const identityChanged = !sameOfflineOwner(context, owner);
      context = Object.freeze(owner);
      identityUncertain = false;
      void rememberDeviceIdentity(owner);
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

/**
 * `beforeSend` runs after the account is verified and just before the request.
 * `onNotSent` runs on EVERY exit where the request was definitely not processed
 * after `beforeSend` ran: the account changed or the call was cancelled before
 * fetch was invoked, or the gate answered 401, 403 or "paused". A caller that
 * marked the send as attempted undoes the mark there, so a claim that was never
 * created is never held back as "might have been created". Once fetch has been
 * invoked, a lost answer or a late account change is uncertain and keeps the
 * mark (RA-7877).
 */
export async function fetchOfflineReplay(owner: OfflineOwner | undefined, url: string, init: RequestInit, beforeSend?: () => Promise<void>, onNotSent?: () => Promise<void>): Promise<Response | null> {
  if (!url.startsWith("/api/") || /[\\\u0000-\u0020]/.test(url) || url.includes("://")) return null;
  const options = await offlineReplayOptions(owner);
  if (!options) return null;
  let invoked = false;
  const notSent = () => onNotSent?.().catch(() => undefined);
  try {
    await beforeSend?.();
    if (!ownsOfflineEntry({ owner }) || options.signal.aborted) {
      await notSent();
      return null;
    }
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(options.headers)) headers.set(name, value);
    invoked = true;
    const response = await fetch(url, { ...init, credentials: "same-origin", headers, signal: options.signal });
    if (!ownsOfflineEntry({ owner })) return null;
    if (response.status === 401 || response.status === 403 || response.headers?.get("x-restoreassist-offline-paused") === "1") {
      // A 401 is definite: no signed-in session. The device copy that opens
      // offline capture goes with it, even if the device drops offline before
      // any page can ask again (RA-7877).
      if (response.status === 401) void forgetDeviceIdentity();
      clearOfflineContext();
      await notSent();
      return null;
    }
    return response;
  } catch (error) {
    if (!invoked) {
      // beforeSend itself failed or was cancelled: nothing was sent.
      await notSent();
      if (options.signal.aborted || !ownsOfflineEntry({ owner })) return null;
      throw error;
    }
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
  // A real browser calls the callback with the Lock object. Passing `drain`
  // itself handed that object to drainEvidenceQueueImpl(onlyId), which took it for
  // an entry id and skipped every queued photo (RA-7877).
  const flight = navigator.locks.request(name, { mode: "exclusive" }, () => drain())
    .finally(() => { flights.delete(name); });
  flights.set(name, flight);
  return flight;
}
