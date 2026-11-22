// @vitest-environment jsdom
/**
 * RA-7877 — the photo of an offline claim reaches the REAL evidence queue once.
 * (offline-capture.test.ts replaces that queue with a stub; this file does not.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

vi.mock("@/lib/image-compression", () => ({
  compressImageForUpload: vi.fn(async (blob: Blob) => ({
    blob, originalSize: blob.size, compressedSize: blob.size, format: blob.type, skipped: true,
  })),
}));

const A = { userId: "user-a", organizationId: "org-a", workspaceId: null, workspaceOwnerId: null };
let uninstall: () => void;
let creates = 0;
let photoPosts = 0;
let listingStatus = 200;
let listingPhotos: unknown[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  uninstall = installFakeIndexedDB();
  creates = 0;
  photoPosts = 0;
  listingStatus = 200;
  listingPhotos = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/offline-context") return new Response(JSON.stringify({ owner: A }));
    if (url === "/api/inspections" && init?.method === "POST") {
      creates++;
      return new Response(JSON.stringify({ inspection: { id: "inspection-1" } }), { status: 201 });
    }
    if (typeof url === "string" && url.endsWith("/photos")) {
      if (init?.method === "POST") {
        photoPosts++;
        // The first answer is always lost: the request may or may not have been processed.
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify({ photos: listingPhotos }), { status: listingStatus });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_n, _o, work) => work()) } });
});
afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup() {
  const boundary = await import("@/lib/offline/account-boundary");
  boundary.setOfflineSession(A.userId);
  await boundary.refreshOfflineOwner();
  return {
    queue: await import("@/lib/offline/claim-capture-queue"),
    evidence: await import("@/lib/evidence-upload-queue"),
  };
}
async function putClaim(row: Record<string, unknown>) {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const open = indexedDB.open("ra-offline-claims", 1);
    open.onsuccess = () => resolve(open.result);
  });
  await new Promise<void>((resolve) => {
    const req = db.transaction("claims", "readwrite").objectStore("claims").put(row);
    req.onsuccess = () => resolve();
  });
}
const photo = () => new File([new Uint8Array([1, 2, 3])], "wall.jpg", { type: "image/jpeg" });

describe("offline claim photo hand-over", () => {
  it("queues the photo once and removes the claim, and its bytes, as soon as the server confirms", async () => {
    const { queue, evidence } = await setup();
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await queue.drainOfflineClaims();
    await queue.drainOfflineClaims();
    expect(creates).toBe(1);
    expect(await queue.listQueuedClaims()).toEqual([]);
    expect(await evidence.getQueuedEvidenceForInspection("inspection-1")).toHaveLength(1);
  });

  it("gives the photo a stable id, which is also its upload Idempotency-Key", async () => {
    const { queue, evidence } = await setup();
    const claim = await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await queue.drainOfflineClaims();
    const entries = await evidence.getQueuedEvidenceForInspection("inspection-1");
    expect(entries.map((entry) => entry.id)).toEqual([`claim-photo-${claim.clientUuid}`]);
  });

  it("does not queue the photo again when an earlier attempt already handed it over but died before marking the claim", async () => {
    const { queue, evidence } = await setup();
    const claim = await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    // The crashed attempt: the job was created and the photo is already in the evidence queue under its stable id.
    await evidence.queueEvidenceUpload({ id: `claim-photo-${claim.clientUuid}`, inspectionId: "inspection-1", blob: photo(), filename: "wall.jpg", mimeType: "image/jpeg" });
    await putClaim({ ...claim, serverInspectionId: "inspection-1", postAttemptedAt: new Date().toISOString(), photoAttemptedAt: new Date().toISOString() });
    await queue.drainOfflineClaims();
    expect(creates).toBe(0);
    expect(await evidence.getQueuedEvidenceForInspection("inspection-1")).toHaveLength(1);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("still hands the claim's photo over when a different photo is already queued for the same inspection", async () => {
    const { queue, evidence } = await setup();
    const claim = await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await evidence.queueEvidenceUpload({ inspectionId: "inspection-1", blob: photo(), filename: "other-tab.jpg", mimeType: "image/jpeg" });
    await queue.drainOfflineClaims();
    const ids = (await evidence.getQueuedEvidenceForInspection("inspection-1")).map((entry) => entry.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(`claim-photo-${claim.clientUuid}`);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });
});

describe("evidence queue: a photo POST whose answer was lost (RA-7877 round 2)", () => {
  afterEach(() => vi.useRealTimers());

  async function lostFirstAnswer() {
    const { evidence } = await setup();
    await evidence.queueEvidenceUpload({ id: "photo-key-12345", inspectionId: "inspection-1", blob: photo(), filename: "wall.jpg", mimeType: "image/jpeg" });
    await evidence.drainEvidenceQueue();
    expect(photoPosts).toBe(1);
    return evidence;
  }

  it("repeats the POST under the same key while the server still recognises the key", async () => {
    const evidence = await lostFirstAnswer();
    await evidence.drainEvidenceQueue();
    expect(photoPosts).toBe(2);
  });

  it("does not repeat the POST after the key lifetime when the listing cannot prove the photo absent", async () => {
    const evidence = await lostFirstAnswer();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    listingStatus = 503;
    await evidence.drainEvidenceQueue();
    expect(photoPosts).toBe(1);
    expect(await evidence.getQueuedEvidenceForInspection("inspection-1")).toHaveLength(1);
  });

  it("never drops a queued photo because an earlier photo on the inspection has identical bytes", async () => {
    const evidence = await lostFirstAnswer();
    const [queued] = await evidence.getQueuedEvidenceForInspection("inspection-1");
    // Photo P, already on the inspection, has the same bytes (same hash) as the queued photo Q.
    listingPhotos = [{ id: "photo-p", url: "https://example.test/p.jpg", cocoaSha256: queued.cocoaSha256 }];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    await evidence.drainEvidenceQueue();
    const kept = await evidence.getQueuedEvidenceForInspection("inspection-1");
    expect(kept.map((entry) => entry.id)).toEqual(["photo-key-12345"]);
  });

  it("repeats the POST after the key lifetime only when the listing proves the photo absent", async () => {
    const evidence = await lostFirstAnswer();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    await evidence.drainEvidenceQueue();
    expect(photoPosts).toBe(2);
  });
});
