// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";

let uninstall: () => void;
beforeEach(() => {
  vi.resetModules();
  uninstall = installFakeIndexedDB();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ transcript: "synthetic" }))));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
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
});
