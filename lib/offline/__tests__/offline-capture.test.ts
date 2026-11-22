// @vitest-environment jsdom
/**
 * RA-7877 — start a claim with no signal, from a cold start.
 *
 * Covers the three promises that must hold on the device:
 *   1. the device identity opens offline capture, expires, and is wiped
 *   2. a captured claim is scoped to the account that captured it
 *   3. on reconnect it is created exactly once and never lost
 * Server behaviour (idempotent replay, owner check) is covered by the existing
 * route tests and proxy guard; here the server is a counted fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

const A = { userId: "user-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "user-a" };
const B = { userId: "user-b", organizationId: "org-b", workspaceId: "ws-b", workspaceOwnerId: "user-b" };
const HOUR = 60 * 60 * 1000;

let uninstall: () => void;
let serverOwner: typeof A | null;
let createStatus: number;
const createdBodies: Array<{ key: string | null; body: Record<string, unknown>; ownerHeader: string | null }> = [];
const fetchMock = vi.fn();
// The evidence queue has its own tests; here it is only the hand-over target.
const handOver = vi.fn();

type Boundary = typeof import("@/lib/offline/account-boundary");
type Identity = typeof import("@/lib/offline/device-identity");
type Queue = typeof import("@/lib/offline/claim-capture-queue");
let boundary: Boundary;
let identity: Identity;
let queue: Queue;

beforeEach(async () => {
  vi.resetModules();
  handOver.mockReset();
  handOver.mockResolvedValue("entry-1");
  vi.doMock("@/lib/evidence-upload-queue", () => ({ queueEvidenceUpload: handOver, getQueuedEvidenceForInspection: async () => [] }));
  uninstall = installFakeIndexedDB();
  serverOwner = A;
  createStatus = 201;
  createdBodies.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/offline-context") {
      return new Response(JSON.stringify({ owner: serverOwner }), { status: serverOwner ? 200 : 401 });
    }
    if (url === "/api/inspections" && init?.method === "POST") {
      const headers = new Headers(init.headers);
      createdBodies.push({
        key: headers.get("Idempotency-Key"),
        body: JSON.parse(String(init.body)),
        ownerHeader: headers.get("x-restoreassist-offline-owner"),
      });
      return new Response(JSON.stringify({ inspection: { id: "inspection-1" } }), { status: createStatus });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: vi.fn(async (_name, _options, work) => work()) },
  });
  boundary = await import("@/lib/offline/account-boundary");
  identity = await import("@/lib/offline/device-identity");
  queue = await import("@/lib/offline/claim-capture-queue");
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function signInOnline(owner = A) {
  serverOwner = owner;
  boundary.setOfflineSession(owner.userId);
  expect(await boundary.refreshOfflineOwner()).toEqual(owner);
  await new Promise((r) => setTimeout(r, 0));
}

/** The cold start: nothing verified in memory, only the device copy remains. */
async function coldStart() {
  vi.resetModules();
  boundary = await import("@/lib/offline/account-boundary");
  identity = await import("@/lib/offline/device-identity");
  queue = await import("@/lib/offline/claim-capture-queue");
}

const photo = () => new File([new Uint8Array([1, 2, 3])], "wall.jpg", { type: "image/jpeg" });

describe("device identity", () => {
  it("is written after the server verifies the owner and read back on a cold start", async () => {
    await signInOnline();
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(A);
  });

  it("is refused and removed once expired", async () => {
    await identity.rememberDeviceIdentity(A, Date.now() - identity.DEVICE_IDENTITY_TTL_MS - 1000);
    expect(await identity.loadDeviceIdentity()).toBeNull();
    expect(await identity.loadDeviceIdentity(Date.now() - 2 * identity.DEVICE_IDENTITY_TTL_MS)).toBeNull();
  });

  it.each([
    ["malformed owner", { owner: { userId: "" }, verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + HOUR).toISOString() }],
    ["lives longer than the rule allows", { owner: A, verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90 * 24 * HOUR).toISOString() }],
    ["dated in the future", { owner: A, verifiedAt: new Date(Date.now() + 5 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 6 * HOUR).toISOString() }],
    ["not an object", "owner"],
  ])("is unusable when %s", (_name, value) => {
    expect(identity.usableDeviceIdentity(value)).toBeNull();
  });

  it("is wiped on sign-out", async () => {
    await signInOnline();
    // Positive control: the copy exists before sign-out, so its absence after is a wipe.
    expect(await identity.loadDeviceIdentity()).not.toBeNull();
    boundary.endOfflineSession();
    await coldStart();
    expect(await identity.loadDeviceIdentity()).toBeNull();
  });

  it("survives the provider clearing its in-memory context (a session refresh), so a basement cold start still opens", async () => {
    await signInOnline();
    boundary.clearOfflineContext();
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(A);
  });

  it("survives a server error from the context endpoint, which proves nothing about the session", async () => {
    await signInOnline();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    await boundary.refreshOfflineOwner();
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(A);
  });

  it("is removed when an online check finds no session (signed out or expired elsewhere)", async () => {
    await signInOnline();
    serverOwner = null;
    await coldStart();
    await identity.confirmDeviceIdentityOnline();
    expect(await identity.loadDeviceIdentity()).toBeNull();
  });

  it("is replaced by an online check that names a different account, so one account's copy is never shown to another", async () => {
    await signInOnline(A);
    serverOwner = B;
    await coldStart();
    await identity.confirmDeviceIdentityOnline();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(B);
  });

  it("is kept by an online check that cannot reach the server", async () => {
    await signInOnline();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await coldStart();
    await identity.confirmDeviceIdentityOnline();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(A);
  });

  it("is replaced, never shared, when a different account signs in", async () => {
    await signInOnline(A);
    boundary.endOfflineSession();
    await signInOnline(B);
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(B);
  });

  it("is wiped when the server refuses the owner", async () => {
    await signInOnline();
    expect(await identity.loadDeviceIdentity()).not.toBeNull();
    serverOwner = null;
    await boundary.refreshOfflineOwner();
    await coldStart();
    expect(await identity.loadDeviceIdentity()).toBeNull();
  });

  it("is kept when the refresh fails only because the device is offline", async () => {
    await signInOnline();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await boundary.refreshOfflineOwner();
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(A);
  });
});

describe("capturing a claim offline", () => {
  it("refuses, and saves nothing, with no verified account and no device identity", async () => {
    await expect(queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toThrow(/Sign in/);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("refuses with an expired device identity", async () => {
    await identity.rememberDeviceIdentity(A, Date.now() - identity.DEVICE_IDENTITY_TTL_MS - 1000);
    await expect(queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toThrow(/Sign in/);
  });

  it("saves a claim and photo for the cold-start identity, with a client UUID and no invented date", async () => {
    await signInOnline();
    await coldStart();
    const claim = await queue.captureOfflineClaim({ propertyAddress: " 1 Test St ", propertyPostcode: "4000", notes: "Burst pipe", photo: photo() });
    expect(claim.clientUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(claim.owner).toEqual(A);
    expect(claim.propertyAddress).toBe("1 Test St");
    expect(claim).not.toHaveProperty("inspectionDate");
    expect(claim.photo?.mimeType).toBe("image/jpeg");
  });

  it.each([
    ["no address", { propertyAddress: "  ", propertyPostcode: "4000" }, /address/],
    ["no postcode", { propertyAddress: "1 Test St", propertyPostcode: "" }, /postcode/],
  ])("rejects %s", async (_name, input, message) => {
    await signInOnline();
    await expect(queue.captureOfflineClaim(input)).rejects.toThrow(message);
  });

  it("rejects a file that is not an image and an oversize photo", async () => {
    await signInOnline();
    const text = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: text })).rejects.toThrow(/image/);
    const big = new File([new Uint8Array(queue.MAX_CLAIM_PHOTO_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: big })).rejects.toThrow(/15 MB/);
  });

  it("never shows another account's claims", async () => {
    await signInOnline(A);
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    boundary.endOfflineSession();
    await signInOnline(B);
    expect(await queue.listOwnClaims()).toEqual([]);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });
});

describe("sending on reconnect", () => {
  it("creates the claim exactly once, scoped to its owner, and never sends a date", async () => {
    await signInOnline();
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", notes: "Burst pipe" });
    expect(await queue.drainOfflineClaims()).toBe(1);
    expect(await queue.drainOfflineClaims()).toBe(0);
    expect(createdBodies).toHaveLength(1);
    expect(createdBodies[0].key).toMatch(/^offline-claim-[0-9a-f-]{36}$/);
    expect(createdBodies[0].body).toEqual({ propertyAddress: "1 Test St", propertyPostcode: "4000", lossDescription: "Burst pipe" });
    expect(JSON.parse(decodeURIComponent(createdBodies[0].ownerHeader!))).toEqual(A);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("does not send while the device is offline, and keeps the claim", async () => {
    await signInOnline();
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await queue.drainOfflineClaims()).toBe(0);
    expect(createdBodies).toHaveLength(0);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });

  it("never sends one account's claim under another account, and keeps it", async () => {
    await signInOnline(A);
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    boundary.clearOfflineContext();
    await signInOnline(B);
    expect(await queue.drainOfflineClaims()).toBe(0);
    expect(createdBodies).toHaveLength(0);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
    // Back to the owner: it is sent then.
    boundary.clearOfflineContext();
    await signInOnline(A);
    expect(await queue.drainOfflineClaims()).toBe(1);
  });

  it("keeps a claim the server refuses, with the reason, and does not retry it", async () => {
    await signInOnline();
    createStatus = 400;
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(1);
    const [held] = await queue.listQueuedClaims();
    expect(held).toMatchObject({ state: "failed", lastStatus: 400 });
  });

  it("keeps and retries a claim after a server error, with the same idempotency key", async () => {
    await signInOnline();
    createStatus = 503;
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    createStatus = 201;
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(2);
    expect(createdBodies[1].key).toBe(createdBodies[0].key);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("never re-sends a created claim when its photo could not be handed over", async () => {
    await signInOnline();
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    handOver.mockRejectedValueOnce(new Error("storage full"));
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(1);
    const [held] = await queue.listQueuedClaims();
    expect(held.serverInspectionId).toBe("inspection-1");
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(1);
    expect(handOver).toHaveBeenCalledTimes(2);
    expect(handOver.mock.calls[1][0]).toMatchObject({ inspectionId: "inspection-1", filename: "wall.jpg" });
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("holds an uncertain send for review once the idempotency window has passed, instead of risking a duplicate", async () => {
    await signInOnline();
    createStatus = 503;
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    createStatus = 201;
    await queue.drainOfflineClaims(Date.now() + queue.CLAIM_IDEMPOTENCY_WINDOW_MS + HOUR);
    expect(createdBodies).toHaveLength(1);
    expect((await queue.listQueuedClaims())[0].state).toBe("needs_review");
  });
});

describe("signing out with unsent claims", () => {
  it("counts every unsent claim on the device for the sign-out notice, and keeps them", async () => {
    const { unsentClaimsMessage } = await import("@/components/offline/UnsentClaimsNotice");
    await signInOnline(A);
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.captureOfflineClaim({ propertyAddress: "2 Test St", propertyPostcode: "4000" });
    boundary.endOfflineSession();
    await coldStart();
    expect(await queue.countUnsentClaims()).toBe(2);
    expect(unsentClaimsMessage(2)).toBe("You have 2 claims not yet sent. They stay on this device until you sign in and send them.");
    expect(unsentClaimsMessage(1)).toBe("You have 1 claim not yet sent. They stay on this device until you sign in and send them.");
    expect(unsentClaimsMessage(0)).toBeNull();
  });

  it("holds nothing once the server has confirmed every claim: only unsent work rests on the device", async () => {
    await signInOnline(A);
    await queue.captureOfflineClaim({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await queue.captureOfflineClaim({ propertyAddress: "2 Test St", propertyPostcode: "4000" });
    expect(await queue.countUnsentClaims()).toBe(2);
    expect(await queue.drainOfflineClaims()).toBe(2);
    expect(await queue.countUnsentClaims()).toBe(0);
  });
});

describe("the drain lock", () => {
  it("calls the drain with no arguments, as the evidence queue reads its first argument as an entry id", async () => {
    // A real browser passes the Lock object to the callback; the stub above does not.
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: vi.fn(async (_name, _options, work) => work({ name: "lock", mode: "exclusive" })) },
    });
    const seen: unknown[][] = [];
    await boundary.withOfflineDrainLock("ra-test-drain", async (...args: unknown[]) => { seen.push(args); return 0; });
    expect(seen).toEqual([[]]);
  });
});
