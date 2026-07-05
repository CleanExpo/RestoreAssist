// @vitest-environment jsdom
/**
 * RA-1610 — verifies queueEvidenceUpload() compresses before writing to
 * IndexedDB and records originalSize/compressedSize on the queued entry.
 *
 * IndexedDB isn't available in jsdom and this repo has no fake-indexeddb
 * dependency (see lib/__tests__/nir-sync-queue-sketch.test.ts), so this file
 * installs a small in-memory fake of just the IDB surface
 * lib/evidence-upload-queue.ts touches (open/add/count).
 * compressImageForUpload itself is covered in image-compression.test.ts, so
 * it's mocked here to isolate the queue's wiring.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompressionResult } from "../image-compression";

vi.mock("../image-compression", () => ({
  compressImageForUpload: vi.fn(),
}));

interface FakeRequest {
  result?: unknown;
  error?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

function makeRequest(): FakeRequest {
  return { onsuccess: null, onerror: null };
}

/** Minimal in-memory fake of the IndexedDB surface openDatabase()/queueEvidenceUpload() use. */
function installFakeIndexedDB() {
  const store = new Map<string, Record<string, unknown>>();

  const objectStore = {
    add(entry: Record<string, unknown>) {
      const req = makeRequest();
      queueMicrotask(() => {
        store.set(entry.id as string, entry);
        req.result = entry.id;
        req.onsuccess?.();
      });
      return req;
    },
    count() {
      const req = makeRequest();
      queueMicrotask(() => {
        req.result = store.size;
        req.onsuccess?.();
      });
      return req;
    },
  };

  const fakeDb = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
    transaction: () => ({ objectStore: () => objectStore }),
  };

  vi.stubGlobal("indexedDB", {
    open: () => {
      const req = makeRequest();
      queueMicrotask(() => {
        req.result = fakeDb;
        req.onsuccess?.();
      });
      return req;
    },
  });

  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("queueEvidenceUpload — RA-1610 compression wiring", () => {
  it("records originalSize/compressedSize and renames to .webp when compression ran", async () => {
    vi.resetModules();
    const store = installFakeIndexedDB();
    const { compressImageForUpload } = await import("../image-compression");
    const { queueEvidenceUpload } = await import("../evidence-upload-queue");

    const compressedBlob = new Blob([new Uint8Array(200)], {
      type: "image/webp",
    });
    vi.mocked(compressImageForUpload).mockResolvedValue({
      blob: compressedBlob,
      originalSize: 5_000_000,
      compressedSize: 200,
      format: "image/webp",
      skipped: false,
    } satisfies CompressionResult);

    const originalBlob = new Blob([new Uint8Array(5_000_000)], {
      type: "image/jpeg",
    });

    const id = await queueEvidenceUpload({
      inspectionId: "insp-1",
      blob: originalBlob,
      filename: "site-photo.jpg",
      mimeType: "image/jpeg",
    });

    expect(compressImageForUpload).toHaveBeenCalledWith(originalBlob);
    const entry = store.get(id);
    expect(entry).toMatchObject({
      inspectionId: "insp-1",
      filename: "site-photo.webp",
      mimeType: "image/webp",
      originalSize: 5_000_000,
      compressedSize: 200,
      blob: compressedBlob,
    });
  });

  it("keeps the original filename/blob when compression is skipped", async () => {
    vi.resetModules();
    const store = installFakeIndexedDB();
    const { compressImageForUpload } = await import("../image-compression");
    const { queueEvidenceUpload } = await import("../evidence-upload-queue");

    const originalBlob = new Blob([new Uint8Array(10)], {
      type: "image/webp",
    });
    vi.mocked(compressImageForUpload).mockResolvedValue({
      blob: originalBlob,
      originalSize: 10,
      compressedSize: 10,
      format: "image/webp",
      skipped: true,
    } satisfies CompressionResult);

    const id = await queueEvidenceUpload({
      inspectionId: "insp-2",
      blob: originalBlob,
      filename: "already-small.webp",
      mimeType: "image/webp",
    });

    const entry = store.get(id);
    expect(entry).toMatchObject({
      inspectionId: "insp-2",
      filename: "already-small.webp",
      mimeType: "image/webp",
      originalSize: 10,
      compressedSize: 10,
      blob: originalBlob,
    });
  });
});
