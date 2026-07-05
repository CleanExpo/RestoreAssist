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

  it("retries on a transient 5xx instead of marking it a terminal error", async () => {
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

    // Not yet terminal — no transcript, no surfaced error, still pending.
    await expect(queue.getPendingTranscripts()).resolves.toEqual([]);
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
