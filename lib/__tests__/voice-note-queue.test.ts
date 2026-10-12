// @vitest-environment jsdom
/**
 * RA-1609 — voice-note offline queue.
 *
 * Uses a hand-rolled in-memory IndexedDB fake (lib/__tests__/helpers/fake-indexeddb.ts)
 * since jsdom has no IndexedDB implementation and the repo has no
 * fake-indexeddb dependency. vi.resetModules() + a dynamic import per test
 * keeps the module's cached `_db` from leaking between tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";
import { SYNC_QUEUE_CHANGED_EVENT } from "@/lib/offline/sync-status-event";

// These tests isolate the pre-existing audio/custody behaviour. The real
// identity and replay boundary is exercised in offline-containment.test.ts.
vi.mock("@/lib/offline/account-boundary", () => ({
  getOfflineOwner: () => ({ userId: "synthetic", organizationId: null, workspaceId: null, workspaceOwnerId: null }),
  requireOfflineOwner: () => ({ userId: "synthetic", organizationId: null, workspaceId: null, workspaceOwnerId: null }),
  ownsOfflineEntry: (entry: { owner?: { userId: string } }) => entry.owner?.userId === "synthetic",
  fetchOfflineReplay: async (_owner: unknown, url: string, init: RequestInit, beforeSend?: () => Promise<void>) => {
    await beforeSend?.();
    return fetch(url, init);
  },
  withOfflineDrainLock: (_name: string, drain: () => Promise<number>) => drain(),
}));

let uninstall: () => void;
let queue: typeof import("../voice-note-queue");

beforeEach(async () => {
  uninstall = installFakeIndexedDB();
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });
  queue = await import("../voice-note-queue");
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeBlob() {
  return new Blob(["fake-audio-bytes"], { type: "audio/webm" });
}

describe("queueVoiceNote", () => {
  it("stores the blob and increments the pending count", async () => {
    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    await expect(queue.getQueuedVoiceNoteCount()).resolves.toBe(1);
  });

  it("wakes the sync badge after a recording is stored", async () => {
    const changed = vi.fn();
    window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, changed);
    try {
      await queue.queueVoiceNote(makeBlob(), { inspectionId: "insp-1", fieldLabel: "kitchen-notes" });
      await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    } finally {
      window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, changed);
    }
  });
});

describe("drainVoiceNoteQueue", () => {
  it("does nothing while offline (no fetch call)", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false });
    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    const transcribed = await queue.drainVoiceNoteQueue();

    expect(transcribed).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts each pending entry to /api/ai/voice-note-transcribe and keeps the transcript", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ transcript: "  Category 2 water damage in kitchen  " }),
    });

    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    const transcribed = await queue.drainVoiceNoteQueue();

    expect(transcribed).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/ai/voice-note-transcribe",
      expect.objectContaining({ method: "POST" }),
    );

    const pending = await queue.getPendingTranscripts();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      status: "done",
      transcript: "Category 2 water damage in kitchen",
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });
  });

  it("surfaces a 402 (no active subscription) instead of silently dropping the note", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: "Active subscription required",
        upgradeRequired: true,
      }),
    });

    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    const transcribed = await queue.drainVoiceNoteQueue();
    expect(transcribed).toBe(0);

    const pending = await queue.getPendingTranscripts();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("error");
    expect(pending[0].error).toBe("Active subscription required");

    // Still counted as unresolved — the UI must not lose track of it.
    await expect(queue.getQueuedVoiceNoteCount()).resolves.toBe(1);
  });

  it("keeps draining the other notes when one note's queue write aborts", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ transcript: "Second note still transcribed" }),
    });
    const stuckId = await queue.queueVoiceNote(makeBlob(), { inspectionId: "insp-1", fieldLabel: "a" });
    const healthyId = await queue.queueVoiceNote(makeBlob(), { inspectionId: "insp-1", fieldLabel: "b" });

    const db = await new Promise<any>((resolve) => {
      const req = (globalThis as any).indexedDB.open("ra-voice-note-queue", 1);
      req.onsuccess = () => resolve(req.result);
    });
    // Push the first note past the retry limit with a real write.
    const stuck = await new Promise<any>((resolve) => {
      const req = db.transaction("notes", "readonly").objectStore("notes").get(stuckId);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put({ ...stuck, retryCount: 99 });
      tx.oncomplete = () => resolve();
    });

    // From now on, writing the stuck note aborts its transaction.
    const txProto = Object.getPrototypeOf(db.transaction("notes", "readwrite"));
    const realObjectStore = txProto.objectStore;
    vi.spyOn(txProto, "objectStore").mockImplementation(function (this: any, name: string) {
      const store = realObjectStore.call(this, name);
      const realPut = store.put.bind(store);
      store.put = (value: { id: string }) => {
        if (value.id !== stuckId) return realPut(value);
        queueMicrotask(() => this.abort());
        return {};
      };
      return store;
    });

    await expect(queue.drainVoiceNoteQueue()).resolves.toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const entries = await queue.getPendingTranscripts();
    expect(entries.find((e) => e.id === healthyId)).toMatchObject({
      status: "done",
      transcript: "Second note still transcribed",
    });
  });

  it("preserves an unconfirmed recording after a 5xx without replaying it", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Upstream unavailable" }),
    });

    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    await queue.drainVoiceNoteQueue();

    await queue.drainVoiceNoteQueue();
    expect(fetch).toHaveBeenCalledTimes(1);
    const entries = await queue.getPendingTranscripts();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: "error", error: expect.stringContaining("unconfirmed") });
    await expect(queue.getQueuedVoiceNoteCount()).resolves.toBe(1);
  });
});

describe("markTranscriptConsumed + pruneVoiceNoteQueue", () => {
  it("prune drops consumed entries", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ transcript: "Ready to consume" }),
    });

    const id = await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });
    await queue.drainVoiceNoteQueue();

    await queue.markTranscriptConsumed(id);
    // Consumed but not yet pruned — getPendingTranscripts only returns
    // done/error, so it should already be excluded from that view.
    await expect(queue.getPendingTranscripts()).resolves.toEqual([]);

    const pruned = await queue.pruneVoiceNoteQueue();
    expect(pruned).toBe(1);
    await expect(queue.getQueuedVoiceNoteCount()).resolves.toBe(0);
  });

  it("rejects instead of hanging when a queue write transaction aborts", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ transcript: "Ready to consume" }),
    });
    const id = await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });
    await queue.drainVoiceNoteQueue();
    // Reach the same fake database the queue opened, then make its next put
    // abort the transaction with no request error, as a commit-time abort does.
    const db = await new Promise<any>((resolve) => {
      const req = (globalThis as any).indexedDB.open("ra-voice-note-queue", 1);
      req.onsuccess = () => resolve(req.result);
    });
    const txProto = Object.getPrototypeOf(db.transaction("notes", "readwrite"));
    const realObjectStore = txProto.objectStore;
    vi.spyOn(txProto, "objectStore").mockImplementation(function (this: any, name: string) {
      const store = realObjectStore.call(this, name);
      store.put = () => {
        queueMicrotask(() => this.abort());
        return {};
      };
      return store;
    });

    const outcome = await Promise.race([
      queue.markTranscriptConsumed(id).then(() => "resolved", () => "rejected"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 200)),
    ]);
    expect(outcome).toBe("rejected");
  });

  it("prune leaves unconsumed, non-stale entries alone", async () => {
    await queue.queueVoiceNote(makeBlob(), {
      inspectionId: "insp-1",
      fieldLabel: "kitchen-notes",
    });

    const pruned = await queue.pruneVoiceNoteQueue();

    expect(pruned).toBe(0);
    await expect(queue.getQueuedVoiceNoteCount()).resolves.toBe(1);
  });
});
