// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";

let uninstall: () => void;
let boundary: typeof import("../offline/account-boundary");
const A = { userId: "user-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "user-a" };
const B = { userId: "user-b", organizationId: "org-b", workspaceId: "ws-b", workspaceOwnerId: "user-b" };
let serverOwner: typeof A | null;
let uploadStatus: number;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  uninstall = installFakeIndexedDB();
  serverOwner = A;
  uploadStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => url === "/api/auth/offline-context"
    ? new Response(JSON.stringify({ owner: serverOwner }), { status: serverOwner ? 200 : 401 })
    : new Response(JSON.stringify({ transcript: "synthetic" }), { status: uploadStatus }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_name, _options, work) => work()) } });
});
afterEach(() => { uninstall(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function legacyVoiceNote() {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = indexedDB.open("ra-voice-note-queue", 1);
    req.onupgradeneeded = (event) => (event.target as IDBOpenDBRequest).result.createObjectStore("notes", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
  });
  await new Promise<void>((resolve) => {
    const req = db.transaction("notes", "readwrite").objectStore("notes").put({
      id: "legacy-note", inspectionId: "synthetic-inspection", fieldLabel: "notes",
      blob: new Blob(["synthetic"], { type: "audio/webm" }), mimeType: "audio/webm",
      queuedAt: "2020-01-01T00:00:00.000Z", status: "pending", retryCount: 0,
    });
    req.onsuccess = () => resolve();
  });
  return db;
}

async function login(owner = A) {
  boundary = await import("../offline/account-boundary");
  serverOwner = owner;
  boundary.setOfflineSession(owner.userId);
  expect(await boundary.refreshOfflineOwner()).toEqual(owner);
  fetchMock.mockClear();
}

async function rows(name: string, store: string): Promise<Record<string, any>[]> {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = indexedDB.open(name, 1); req.onsuccess = () => resolve(req.result);
  });
  return new Promise((resolve) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function put(name: string, store: string, row: Record<string, any>) {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = indexedDB.open(name, 1); req.onsuccess = () => resolve(req.result);
  });
  await new Promise<void>((resolve) => {
    const req = db.transaction(store, "readwrite").objectStore(store).put(row);
    req.onsuccess = () => resolve();
  });
}

const replayCalls = () => fetchMock.mock.calls.filter(([url]) => url !== "/api/auth/offline-context");
const audio = () => new Blob(["synthetic"], { type: "audio/webm" });

describe("offline ownership containment", () => {
  it("quarantines an ownerless voice note without replaying or pruning it", async () => {
    const db = await legacyVoiceNote();
    const queue = await import("../voice-note-queue");
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(await queue.pruneVoiceNoteQueue()).toBe(0);
    expect(await queue.getPendingTranscripts()).toEqual([]);
    const row = await new Promise<unknown>((resolve) => {
      const req = db.transaction("notes", "readonly").objectStore("notes").get("legacy-note");
      req.onsuccess = () => resolve(req.result);
    });
    expect(row).toMatchObject({ id: "legacy-note", status: "pending", retryCount: 0 });
  });

  it("requires server-verified identity before accepting new queued work", async () => {
    const voice = await import("../voice-note-queue");
    const nir = await import("../nir-sync-queue");
    const photos = await import("../evidence-upload-queue");
    await expect(voice.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" })).rejects.toThrow(/verify your account/);
    await expect(nir.queueWrite({ type: "moisture-reading", endpoint: "/api/inspections/i/moisture", method: "POST", payload: {}, inspectionId: "i" })).rejects.toThrow(/verify your account/);
    await expect(photos.queueEvidenceUpload({ inspectionId: "i", blob: audio(), filename: "p", mimeType: "image/webp" })).rejects.toThrow(/verify your account/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stamps new voice work, hides it from B, and resumes it only for A", async () => {
    await login();
    const queue = await import("../voice-note-queue");
    const id = await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ id, owner: A }]);
    await login(B);
    expect(await queue.getQueuedVoiceNoteCount()).toBe(0);
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(0);
    await queue.markTranscriptConsumed(id);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ status: "pending" }]);
    await login(A);
    expect(await queue.drainVoiceNoteQueue()).toBe(1);
    const [, init] = replayCalls()[0];
    expect(JSON.parse(decodeURIComponent(init.headers.get("x-restoreassist-offline-owner")))).toEqual(A);
  });

  it("keeps mixed legacy and foreign voice rows intact while draining the current owner's row", async () => {
    await legacyVoiceNote();
    await login();
    const queue = await import("../voice-note-queue");
    const id = await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    const original = (await rows("ra-voice-note-queue", "notes")).find((r) => r.id === id)!;
    await put("ra-voice-note-queue", "notes", { ...original, id: "foreign", owner: B });
    expect(await queue.drainVoiceNoteQueue()).toBe(1);
    expect(await queue.pruneVoiceNoteQueue()).toBe(0);
    expect(await rows("ra-voice-note-queue", "notes")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy-note", status: "pending", retryCount: 0 }),
      expect.objectContaining({ id: "foreign", owner: B, status: "pending", retryCount: 0 }),
    ]));
  });

  it.each([401, 403])("preserves photos and pauses on HTTP %s instead of deleting them", async (status) => {
    await login();
    const queue = await import("../evidence-upload-queue");
    await queue.getQueuedEvidenceCount();
    const photo = { id: "p", owner: A, inspectionId: "i", blob: audio(), filename: "p.webp", mimeType: "image/webp", queuedAt: "2020-01-01", retryCount: 0 };
    await put("ra-evidence-queue", "uploads", photo);
    uploadStatus = status;
    expect(await queue.drainEvidenceQueue()).toBe(0);
    expect(await rows("ra-evidence-queue", "uploads")).toEqual([photo]);
    expect(boundary.getOfflineOwner()).toBeNull();
  });

  it("preserves exhausted and ownerless photos and skips foreign uploads", async () => {
    await login();
    const queue = await import("../evidence-upload-queue");
    await queue.getQueuedEvidenceCount();
    const photo = { id: "p", owner: A, inspectionId: "i", blob: audio(), filename: "p.webp", mimeType: "image/webp", retryCount: 5 };
    await put("ra-evidence-queue", "uploads", photo);
    await put("ra-evidence-queue", "uploads", { ...photo, id: "legacy", owner: undefined, retryCount: 0 });
    await put("ra-evidence-queue", "uploads", { ...photo, id: "foreign", owner: B, retryCount: 0 });
    expect(await queue.drainEvidenceQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(0);
    expect(await rows("ra-evidence-queue", "uploads")).toHaveLength(3);
  });

  it("rejects NIR reads, direct retry, discard and replay under another identity", async () => {
    await login();
    const queue = await import("../nir-sync-queue");
    const id = await queue.queueWrite({ type: "moisture-reading", endpoint: "/api/inspections/i/moisture", method: "POST", payload: { value: 1 }, inspectionId: "i" });
    const original = (await rows("nir-offline-queue", "sync-queue"))[0];
    await put("nir-offline-queue", "sync-queue", { ...original, status: "failed" });
    await login(B);
    expect(await queue.getPendingEntries("i")).toEqual([]);
    expect(await queue.getFailedEntries()).toEqual([]);
    expect(await queue.retryFailedEntry(id)).toBe(false);
    await queue.removeFailedEntry(id);
    expect(await queue.drainQueue()).toBe(0);
    expect(await rows("nir-offline-queue", "sync-queue")).toMatchObject([{ id, owner: A, status: "failed" }]);
    expect(replayCalls()).toHaveLength(0);
  });

  it("drains owned NIR work once and leaves legacy and foreign entries unchanged", async () => {
    await login();
    const queue = await import("../nir-sync-queue");
    await queue.queueWrite({ type: "moisture-reading", endpoint: "/api/inspections/i/moisture", method: "POST", payload: {}, inspectionId: "i" });
    const original = (await rows("nir-offline-queue", "sync-queue"))[0];
    await put("nir-offline-queue", "sync-queue", { ...original, id: "legacy", owner: undefined });
    await put("nir-offline-queue", "sync-queue", { ...original, id: "foreign", owner: B });
    await Promise.all([queue.drainQueue(), queue.drainQueue()]);
    expect(replayCalls()).toHaveLength(1);
    expect(await rows("nir-offline-queue", "sync-queue")).toHaveLength(2);
  });

  it("does not replay after sign-out, restart, or a revoked server context", async () => {
    await login();
    const queue = await import("../voice-note-queue");
    await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    boundary.clearOfflineContext();
    expect(await queue.getQueuedVoiceNoteCount()).toBe(0);
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    vi.resetModules();
    const restarted = await import("../voice-note-queue");
    expect(await restarted.getQueuedVoiceNoteCount()).toBe(0);
    expect(await restarted.drainVoiceNoteQueue()).toBe(0);
    await login();
    serverOwner = null;
    expect(await restarted.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(0);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ owner: A, status: "pending", retryCount: 0 }]);
  });

  it.each([
    { ...A, workspaceId: "ws-other" },
    { ...A, workspaceOwnerId: "new-owner" },
    { ...A, organizationId: "org-other" },
  ])("quarantines old work when account scope changes: %j", async (changed) => {
    await login();
    const queue = await import("../voice-note-queue");
    await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    serverOwner = changed;
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(0);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ owner: A, status: "pending" }]);
  });

  it("coalesces repeated voice drain attempts and uses the browser's cross-tab lock", async () => {
    await login();
    const queue = await import("../voice-note-queue");
    await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    await Promise.all([queue.drainVoiceNoteQueue(), queue.drainVoiceNoteQueue()]);
    expect(replayCalls()).toHaveLength(1);
    expect(navigator.locks.request).toHaveBeenCalledWith("ra-voice-note-drain", { mode: "exclusive" }, expect.any(Function));
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
  });

  it.each([500, 502, 503])("never automatically resubmits voice after ambiguous HTTP %s", async (status) => {
    await login();
    const queue = await import("../voice-note-queue");
    const id = await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    uploadStatus = status;
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(1);
    await queue.markTranscriptConsumed(id);
    expect(await queue.pruneVoiceNoteQueue()).toBe(0);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ status: "error", error: expect.stringMatching(/unconfirmed/), blob: expect.any(Blob) }]);
  });

  it.each([{}, { transcript: "   " }, { transcript: 123 }])("preserves malformed or empty success audio through UI consumption: %j", async (body) => {
    await login();
    const queue = await import("../voice-note-queue");
    const id = await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(url === "/api/auth/offline-context" ? { owner: A } : body)));
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    await queue.markTranscriptConsumed(id);
    expect(await queue.pruneVoiceNoteQueue()).toBe(0);
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(1);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ id, status: "error", blob: expect.any(Blob) }]);
  });

  it("keeps work pending when a cross-tab lock is unavailable", async () => {
    await login();
    const queue = await import("../voice-note-queue");
    await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(replayCalls()).toHaveLength(0);
  });

  it("pauses intact when the cookie changes between verification and the replay request", async () => {
    await login();
    const queue = await import("../voice-note-queue");
    await queue.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    fetchMock.mockImplementation(async (url: string) => url === "/api/auth/offline-context"
      ? new Response(JSON.stringify({ owner: A }))
      : new Response("{}", { status: 409, headers: { "x-restoreassist-offline-paused": "1" } }));
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
    expect(await rows("ra-voice-note-queue", "notes")).toMatchObject([{ owner: A, status: "error", retryCount: 0 }]);
    await login();
    expect(await queue.drainVoiceNoteQueue()).toBe(0);
  });

  it("ignores the old unscoped job cache and never writes A's response into B's cache", async () => {
    await login();
    const cache = await import("../offline/job-cache");
    const jobs = [{ id: "i", inspectionNumber: "SYNTHETIC", propertyAddress: "Synthetic Street", status: "DRAFT", inspectionDate: "2026-10-01", moistureReadingCount: 0, criticalMissing: 0, readyToLeave: false }];
    await cache.cacheJobs(jobs, A);
    await put("ra-field-cache", "jobs", { key: "active-jobs", jobs, fetchedAt: "2026-10-01" });
    await login(B);
    expect((await cache.getCachedJobs()).jobs).toEqual([]);
    await cache.cacheJobs(jobs, A);
    expect((await cache.getCachedJobs()).jobs).toEqual([]);
    await login(A);
    expect((await cache.getCachedJobs()).jobs).toEqual(jobs);
    expect(await rows("ra-field-cache", "jobs")).toHaveLength(2);
  });

  it("all reconnect and service-worker entry points stay paused after sign-out", async () => {
    const messages = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: messages });
    await login();
    const nir = await import("../nir-sync-queue");
    const voice = await import("../voice-note-queue");
    const photos = await import("../evidence-upload-queue");
    await nir.queueWrite({ type: "moisture-reading", endpoint: "/api/inspections/i/moisture", method: "POST", payload: {}, inspectionId: "i" });
    await voice.queueVoiceNote(audio(), { inspectionId: "i", fieldLabel: "notes" });
    boundary.clearOfflineContext();
    const cleanups = [nir.initSyncOnReconnect(), voice.initVoiceNoteSyncOnReconnect(), photos.initEvidenceSyncOnReconnect()];
    window.dispatchEvent(new Event("online"));
    for (const tag of ["nir-inspection-sync", "evidence-upload-sync", "voice-note-sync"]) {
      messages.dispatchEvent(new MessageEvent("message", { data: { type: "NIR_SYNC_TRIGGER", tag } }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replayCalls()).toHaveLength(0);
    for (const cleanup of cleanups) cleanup();
    await login();
    messages.dispatchEvent(new MessageEvent("message", { data: { type: "NIR_SYNC_TRIGGER" } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replayCalls()).toHaveLength(0);
    expect(await rows("nir-offline-queue", "sync-queue")).toHaveLength(1);
    expect(await rows("ra-voice-note-queue", "notes")).toHaveLength(1);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  });
});
