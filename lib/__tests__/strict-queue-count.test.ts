// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getQueuedEvidenceCount } from "@/lib/evidence-upload-queue";
import { getQueuedVoiceNoteCount } from "@/lib/voice-note-queue";

function rejectDatabaseOpen() {
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: { error: Error; onerror?: () => void } = { error: new Error("IndexedDB unavailable") };
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  });
}

describe("strict offline queue counts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets the status badge distinguish unreadable photo and voice queues from empty queues", async () => {
    rejectDatabaseOpen();
    await expect(getQueuedEvidenceCount()).resolves.toBe(0);
    await expect(getQueuedVoiceNoteCount()).resolves.toBe(0);
    await expect(getQueuedEvidenceCount(true)).rejects.toThrow("IndexedDB unavailable");
    await expect(getQueuedVoiceNoteCount(true)).rejects.toThrow("IndexedDB unavailable");
  });
});
