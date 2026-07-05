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
 *
 * RA-6997 adds a second describe block below exercising the full
 * queue → drain round trip against the shared fake-indexeddb helper (also
 * used by voice-note-queue.test.ts), to prove the chain-of-custody hash sent
 * on drain actually matches the bytes uploaded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompressionResult } from "../image-compression";
import { computeSha256 } from "../capture/cocoa-client";
import { installFakeIndexedDB as installSharedFakeIndexedDB } from "./helpers/fake-indexeddb";

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
    // RA-6997: the custody hash must cover the compressed bytes actually
    // stored (and later uploaded), not the pre-compression original.
    expect(entry?.cocoaSha256).toBe(await computeSha256(compressedBlob));
    expect(entry?.cocoaSha256).not.toBe(await computeSha256(originalBlob));
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

describe("drainEvidenceQueue — RA-6997 custody + metadata round trip", () => {
  it("uploads a queued entry with a cocoaSha256 that matches the bytes actually sent", async () => {
    vi.resetModules();
    const uninstall = installSharedFakeIndexedDB();
    try {
      vi.stubGlobal("fetch", vi.fn());
      Object.defineProperty(window.navigator, "onLine", {
        value: true,
        configurable: true,
      });

      const { compressImageForUpload } = await import("../image-compression");
      const compressedBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: "image/webp",
      });
      vi.mocked(compressImageForUpload).mockResolvedValue({
        blob: compressedBlob,
        originalSize: 4,
        compressedSize: 4,
        format: "image/webp",
        skipped: true,
      } satisfies CompressionResult);

      const { queueEvidenceUpload, drainEvidenceQueue } = await import(
        "../evidence-upload-queue"
      );

      await queueEvidenceUpload({
        inspectionId: "insp-9",
        blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" }),
        filename: "site.jpg",
        mimeType: "image/jpeg",
        caption: "moisture behind dishwasher",
        gps: { lat: -27.47, lng: 153.03 },
        capturedAtUtc: "2026-07-05T09:00:00.000Z",
      });

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ photo: { id: "p1" } }),
      });

      const uploaded = await drainEvidenceQueue();
      expect(uploaded).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);

      const [, requestInit] = (fetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      const form = requestInit.body as FormData;
      const uploadedFile = form.get("file") as File;

      // The hash sent must match the SHA-256 of the bytes actually posted —
      // this is exactly what app/api/inspections/[id]/photos/route.ts
      // re-verifies server-side.
      const actualHash = await computeSha256(uploadedFile);
      expect(form.get("cocoaSha256")).toBe(actualHash);
      expect(form.get("capturedAtUtc")).toBe("2026-07-05T09:00:00.000Z");
      expect(form.get("caption")).toBe("moisture behind dishwasher");
      expect(form.get("gpsLat")).toBe("-27.47");
      expect(form.get("gpsLng")).toBe("153.03");
    } finally {
      uninstall();
      vi.unstubAllGlobals();
    }
  });
});
