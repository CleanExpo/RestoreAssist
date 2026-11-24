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

/**
 * What the offline form does: it is opened for whoever the page resolves at that
 * moment and saves under that account only (a change since is refused).
 */
async function capture(input: Omit<Parameters<Queue["captureOfflineClaim"]>[0], "openedFor">, openedFor?: typeof A) {
  const opened = openedFor ?? (await boundary.resolveOfflineActor());
  return queue.captureOfflineClaim({ ...input, openedFor: opened as typeof A });
}

/** The cold start: nothing verified in memory, only the device copy remains. */
async function coldStart() {
  vi.resetModules();
  boundary = await import("@/lib/offline/account-boundary");
  identity = await import("@/lib/offline/device-identity");
  queue = await import("@/lib/offline/claim-capture-queue");
}

async function rewriteClaim(clientUuid: string, patch: Record<string, unknown>) {
  const { storeOperation } = await import("@/lib/offline/idb-store");
  const spec = { db: "ra-offline-claims", version: 1, store: "claims", keyPath: "clientUuid" };
  const rows = (await storeOperation(spec, "readonly", (store) => store.getAll())) as Array<Record<string, unknown>>;
  const row = rows.find((entry) => entry.clientUuid === clientUuid)!;
  await storeOperation(spec, "readwrite", (store) => store.put({ ...row, ...patch }));
}
const settle = () => new Promise((r) => setTimeout(r, 0));
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

describe("device identity ordering (a slow answer must not undo a sign-out)", () => {
  it("is not restored by an online check that began before sign-out and answered after it", async () => {
    await signInOnline(A);
    await coldStart();
    let release!: () => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url !== "/api/auth/offline-context") return new Response("{}", { status: 404 });
      await new Promise<void>((resolve) => { release = resolve; });
      return new Response(JSON.stringify({ owner: A }), { status: 200 });
    });
    const pending = identity.confirmDeviceIdentityOnline();
    await settle();
    boundary.endOfflineSession();
    release();
    await pending;
    await settle();
    expect(await identity.loadDeviceIdentity()).toBeNull();
    // A cold start after that must not reopen capture for the signed-out account.
    await coldStart();
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toThrow(/Sign in/);
  });

  it("is not restored by a write that was asked for before a wipe", async () => {
    const write = identity.rememberDeviceIdentity(A);
    const wipe = identity.forgetDeviceIdentity();
    await Promise.all([write, wipe]);
    expect(await identity.loadDeviceIdentity()).toBeNull();
  });

  it("still lets a sign-in AFTER a wipe write its own copy", async () => {
    await signInOnline(A);
    boundary.endOfflineSession();
    await signInOnline(B);
    await coldStart();
    expect((await identity.loadDeviceIdentity())?.owner).toEqual(B);
  });

  it("is wiped by a definite 401 on a replay, even if the device goes offline straight after", async () => {
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/auth/offline-context"
        ? new Response(JSON.stringify({ owner: A }), { status: 200 })
        : new Response("{}", { status: 401 }),
    );
    await queue.drainOfflineClaims();
    await settle();
    await coldStart();
    expect(await identity.loadDeviceIdentity()).toBeNull();
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });
});

describe("a different account that is signed in but not yet verified (RA-7877 round 2)", () => {
  async function unverifiedB() {
    await signInOnline(A);
    await capture({ propertyAddress: "1 A Street", propertyPostcode: "4000", notes: "A's private notes" });
    // The page now knows the session is B, but B's check fails.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    boundary.setOfflineSession(B.userId);
    await boundary.refreshOfflineOwner();
  }

  it("shows B none of A's claims, even though A's device copy is still valid", async () => {
    await unverifiedB();
    expect(await queue.listOwnClaims()).toEqual([]);
    expect(await boundary.resolveOfflineActor()).toBeNull();
  });

  it("refuses to save B's entries under A, and saves nothing", async () => {
    await unverifiedB();
    await expect(capture({ propertyAddress: "9 B Street", propertyPostcode: "3000" })).rejects.toThrow(/Sign in/);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });

  it("still lets the SAME account start a claim when its check cannot run (the offline cold start)", async () => {
    await signInOnline(A);
    boundary.clearOfflineContext();
    boundary.setOfflineSession(A.userId);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await boundary.refreshOfflineOwner();
    expect(await boundary.resolveOfflineActor()).toEqual(A);
    await expect(capture({ propertyAddress: "2 A Street", propertyPostcode: "4000" })).resolves.toBeTruthy();
  });
});

describe("a form opened for one account is never saved under another (RA-7877 round 5)", () => {
  it("refuses A's typed entries once B is the verified account, and saves nothing", async () => {
    await signInOnline(A);
    boundary.endOfflineSession();
    await signInOnline(B);
    await expect(capture({ propertyAddress: "1 A Street", propertyPostcode: "4000", notes: "A's private notes" }, A)).rejects.toThrow(/account changed/);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("still saves when the form's account is the current one", async () => {
    await signInOnline(B);
    await expect(capture({ propertyAddress: "9 B Street", propertyPostcode: "3000" }, B)).resolves.toBeTruthy();
  });
});

describe("an account switch made in another tab (RA-7877 round 6)", () => {
  /** Tab 1 is A; another tab signs in as B and broadcasts; B's online check here then fails. */
  async function otherTabSwitchedToB() {
    await signInOnline(A);
    await capture({ propertyAddress: "1 A Street", propertyPostcode: "4000", notes: "A's private notes" });
    const stop = boundary.listenForOfflineInvalidation();
    window.dispatchEvent(new StorageEvent("storage", { key: "restoreassist-offline-context-invalidated", newValue: "1:2" }));
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    await boundary.refreshOfflineOwner();
    return stop;
  }

  it("does not fall back to A's device copy, and shows none of A's claims", async () => {
    const stop = await otherTabSwitchedToB();
    expect(await boundary.resolveOfflineActor()).toBeNull();
    expect(await queue.listOwnClaims()).toEqual([]);
    stop();
  });

  it("refuses to start a claim until the account is verified online again", async () => {
    const stop = await otherTabSwitchedToB();
    await expect(capture({ propertyAddress: "9 B Street", propertyPostcode: "3000" }, A)).rejects.toThrow(/Sign in/);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
    stop();
  });

  it("opens again for whoever the server verifies", async () => {
    const stop = await otherTabSwitchedToB();
    serverOwner = B;
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/auth/offline-context" ? new Response(JSON.stringify({ owner: B })) : new Response("{}", { status: 404 }));
    boundary.setOfflineSession(B.userId);
    expect(await boundary.refreshOfflineOwner()).toEqual(B);
    expect(await boundary.resolveOfflineActor()).toEqual(B);
    expect(await queue.listOwnClaims()).toEqual([]);
    stop();
  });
});

describe("a read overtaken by a wipe", () => {
  it("returns nothing when sign-out happens while the stored identity is being read", async () => {
    await signInOnline(A);
    await coldStart();
    const read = identity.loadDeviceIdentity();
    boundary.endOfflineSession();
    expect(await read).toBeNull();
  });
});

describe("a send cancelled before the request was made (RA-7877 round 2)", () => {
  it("calls onNotSent, and makes no request, when the account changes during beforeSend", async () => {
    await signInOnline(A);
    let notSent = 0;
    const result = await boundary.fetchOfflineReplay(
      A,
      "/api/inspections",
      { method: "POST" },
      async () => { boundary.endOfflineSession(); },
      async () => { notSent++; },
    );
    expect(result).toBeNull();
    expect(notSent).toBe(1);
    expect(createdBodies).toHaveLength(0);
  });

  it("keeps the attempt mark of a claim when the account changes after the request was made", async () => {
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/offline-context") return new Response(JSON.stringify({ owner: A }), { status: 200 });
      if (url === "/api/inspections" && init?.method === "POST") boundary.endOfflineSession(); // the answer arrives after sign-out
      return new Response(JSON.stringify({ inspection: { id: "inspection-1" } }), { status: 201 });
    });
    await queue.drainOfflineClaims();
    const [held] = await queue.listQueuedClaims();
    expect(held.postAttemptedAt).toBeDefined();
    expect(held.serverInspectionId).toBeUndefined();
  });

  it("clears the attempt mark of a claim when sign-out lands between the mark and the request", async () => {
    vi.resetModules();
    let armed = false;
    vi.doMock("@/lib/offline/idb-store", async () => {
      const real = await vi.importActual<typeof import("@/lib/offline/idb-store")>("@/lib/offline/idb-store");
      return {
        ...real,
        storeOperation: (...args: Parameters<typeof real.storeOperation>) => {
          const done = real.storeOperation(...args);
          if (armed && args[1] === "readwrite" && args[0].store === "claims") {
            armed = false;
            // The attempt mark has just been written: sign out before the request is made.
            return done.then((value) => { boundary.endOfflineSession(); return value; });
          }
          return done;
        },
      };
    });
    boundary = await import("@/lib/offline/account-boundary");
    identity = await import("@/lib/offline/device-identity");
    queue = await import("@/lib/offline/claim-capture-queue");
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    armed = true;
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(0);
    const [held] = await queue.listQueuedClaims();
    expect(held.postAttemptedAt).toBeUndefined();
    vi.doUnmock("@/lib/offline/idb-store");
  });
});

describe("capturing a claim offline", () => {
  it("refuses, and saves nothing, with no verified account and no device identity", async () => {
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toThrow(/Sign in/);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("refuses with an expired device identity", async () => {
    await identity.rememberDeviceIdentity(A, Date.now() - identity.DEVICE_IDENTITY_TTL_MS - 1000);
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toThrow(/Sign in/);
  });

  it("saves a claim and photo for the cold-start identity, with a client UUID and no invented date", async () => {
    await signInOnline();
    await coldStart();
    const claim = await capture({ propertyAddress: " 1 Test St ", propertyPostcode: "4000", notes: "Burst pipe", photo: photo() });
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
    await expect(capture(input)).rejects.toThrow(message);
  });

  it("rejects a file that is not an image and an oversize photo", async () => {
    await signInOnline();
    const text = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: text })).rejects.toThrow(/image/);
    const big = new File([new Uint8Array(queue.MAX_CLAIM_PHOTO_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: big })).rejects.toThrow(/15 MB/);
  });

  it("never shows another account's claims", async () => {
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    boundary.endOfflineSession();
    await signInOnline(B);
    expect(await queue.listOwnClaims()).toEqual([]);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });
});

describe("a save is not reported until the device has committed it", () => {
  it("rejects when the storage transaction aborts after the write request succeeded", async () => {
    await signInOnline();
    const real = indexedDB.open.bind(indexedDB);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = real("ra-offline-claims", 1);
      open.onupgradeneeded = (event) => {
        (event.target as IDBOpenDBRequest).result.createObjectStore("claims", { keyPath: "clientUuid" });
      };
      open.onsuccess = () => resolve(open.result);
    });
    const originalTransaction = db.transaction.bind(db);
    // A late quota or storage abort: the request succeeds, the transaction never completes.
    (db as unknown as { transaction: unknown }).transaction = (...args: Parameters<IDBDatabase["transaction"]>) => {
      const tx = originalTransaction(...args);
      Object.defineProperty(tx, "oncomplete", { configurable: true, set() { /* never completes */ }, get: () => null });
      setTimeout(() => (tx as unknown as { abort: () => void }).abort(), 5);
      return tx;
    };
    await expect(capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" })).rejects.toBeTruthy();
  });
});

describe("sending on reconnect", () => {
  it("creates the claim exactly once, scoped to its owner, and never sends a date", async () => {
    await signInOnline();
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", notes: "Burst pipe" });
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
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await queue.drainOfflineClaims()).toBe(0);
    expect(createdBodies).toHaveLength(0);
    expect(await queue.listQueuedClaims()).toHaveLength(1);
  });

  it("never sends one account's claim under another account, and keeps it", async () => {
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
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
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(1);
    const [held] = await queue.listQueuedClaims();
    expect(held).toMatchObject({ state: "failed", lastStatus: 400 });
  });

  it("keeps and retries a claim after a server error, with the same idempotency key", async () => {
    await signInOnline();
    createStatus = 503;
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    createStatus = 201;
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(2);
    expect(createdBodies[1].key).toBe(createdBodies[0].key);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("never re-sends a created claim when its photo could not be handed over", async () => {
    await signInOnline();
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
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
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    createStatus = 201;
    await queue.drainOfflineClaims(Date.now() + queue.CLAIM_IDEMPOTENCY_WINDOW_MS + HOUR);
    expect(createdBodies).toHaveLength(1);
    expect((await queue.listQueuedClaims())[0].state).toBe("needs_review");
  });
});

describe("what a send may have done (one rule: attemptState)", () => {
  it("classifies an attempt: never, recent, stale, and an unreadable time as invalid", () => {
    const now = Date.now();
    expect(queue.attemptState(undefined, now)).toBe("never");
    expect(queue.attemptState(new Date(now - HOUR).toISOString(), now)).toBe("recent");
    expect(queue.attemptState(new Date(now - queue.CLAIM_IDEMPOTENCY_WINDOW_MS - HOUR).toISOString(), now)).toBe("stale");
    expect(queue.attemptState("invalid", now)).toBe("invalid");
    expect(queue.attemptState(12345, now)).toBe("invalid");
    expect(queue.attemptState(new Date(now + 5 * HOUR).toISOString(), now)).toBe("invalid");
  });

  it("holds a claim whose recorded attempt time cannot be read, and never sends it", async () => {
    await signInOnline();
    const claim = await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await rewriteClaim(claim.clientUuid, { postAttemptedAt: "invalid" });
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(0);
    expect((await queue.listQueuedClaims())[0].state).toBe("needs_review");
  });

  it("does not start the 24 hour clock when the account could not be verified, so a never-sent claim is still sent later", async () => {
    await signInOnline();
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(0);
    expect((await queue.listQueuedClaims())[0].postAttemptedAt).toBeUndefined();
    // Service comes back more than a day later.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/offline-context") return new Response(JSON.stringify({ owner: A }), { status: 200 });
      if (url === "/api/inspections" && init?.method === "POST") {
        createdBodies.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: JSON.parse(String(init.body)), ownerHeader: null });
        return new Response(JSON.stringify({ inspection: { id: "inspection-1" } }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    });
    await signInOnline();
    expect(await queue.drainOfflineClaims(Date.now() + queue.CLAIM_IDEMPOTENCY_WINDOW_MS + HOUR)).toBe(1);
    expect(createdBodies).toHaveLength(1);
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("clears the attempt mark when the gate refuses the request (401), because nothing was created", async () => {
    await signInOnline();
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/auth/offline-context"
        ? new Response(JSON.stringify({ owner: A }), { status: 200 })
        : new Response("{}", { status: 401 }),
    );
    await queue.drainOfflineClaims();
    const [held] = await queue.listQueuedClaims();
    expect(held.state).toBe("queued");
    expect(held.postAttemptedAt).toBeUndefined();
  });

  it("keeps the attempt mark after a network error, because the request may have reached the server", async () => {
    await signInOnline();
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/offline-context") return new Response(JSON.stringify({ owner: A }), { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    await queue.drainOfflineClaims();
    expect((await queue.listQueuedClaims())[0].postAttemptedAt).toBeDefined();
  });
});

describe("the photo of a claim (stable id, one upload)", () => {
  it("hands the photo over under a stable id derived from the claim", async () => {
    await signInOnline();
    const claim = await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await queue.drainOfflineClaims();
    expect(handOver.mock.calls[0][0].id).toBe(`claim-photo-${claim.clientUuid}`);
  });

  it("re-hands the photo over under the SAME id after a crash that left no queue entry (uploaded and removed before the marker)", async () => {
    await signInOnline();
    const crashed = await capture({ propertyAddress: "3 Test St", propertyPostcode: "4000", photo: photo() });
    // The crashed state: job created, hand-over attempted, marker never written, queue empty.
    await rewriteClaim(crashed.clientUuid, {
      serverInspectionId: "inspection-9",
      postAttemptedAt: new Date().toISOString(),
      photoAttemptedAt: new Date().toISOString(),
    });
    await queue.drainOfflineClaims();
    expect(createdBodies).toHaveLength(0);
    expect(handOver).toHaveBeenCalledTimes(1);
    expect(handOver.mock.calls[0][0]).toMatchObject({ id: `claim-photo-${crashed.clientUuid}`, inspectionId: "inspection-9" });
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("holds a photo hand-over whose attempt is older than the server's window, rather than uploading it again", async () => {
    await signInOnline();
    const claim = await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await rewriteClaim(claim.clientUuid, {
      serverInspectionId: "inspection-1",
      postAttemptedAt: new Date(Date.now() - 3 * 24 * HOUR).toISOString(),
      photoAttemptedAt: new Date(Date.now() - 3 * 24 * HOUR).toISOString(),
    });
    await queue.drainOfflineClaims();
    expect(handOver).not.toHaveBeenCalled();
    expect((await queue.listQueuedClaims())[0].state).toBe("needs_review");
  });
});

describe("signing out with unsent claims", () => {
  it("counts every unsent claim on the device for the sign-out notice, and keeps them", async () => {
    const { describeUnsentClaims } = await import("@/lib/offline/unsent-claims-message");
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await capture({ propertyAddress: "2 Test St", propertyPostcode: "4000" });
    boundary.endOfflineSession();
    await coldStart();
    const counts = await queue.countUnsentClaims();
    expect(counts).toEqual({ queued: 2, failed: 0, needsReview: 0 });
    expect(describeUnsentClaims(counts, "signed-out")).toBe(
      "You have 2 claims not yet sent. They stay on this device until you sign in and send them.",
    );
  });

  it("RA-8641: a refused claim is not promised to send on sign-in", async () => {
    const { describeUnsentClaims } = await import("@/lib/offline/unsent-claims-message");
    await signInOnline(A);
    createStatus = 400;
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000" });
    await queue.drainOfflineClaims();
    boundary.endOfflineSession();
    await coldStart();
    const counts = await queue.countUnsentClaims();
    expect(counts).toEqual({ queued: 0, failed: 1, needsReview: 0 });
    const message = describeUnsentClaims(counts, "signed-out");
    expect(message).toBe("1 claim could not be sent and needs attention. It will not be sent automatically.");
    expect(message).not.toMatch(/sign in and send|waiting to send/i);
  });

  it("holds nothing once the server has confirmed every claim: only unsent work rests on the device", async () => {
    const none = { queued: 0, failed: 0, needsReview: 0 };
    await signInOnline(A);
    await capture({ propertyAddress: "1 Test St", propertyPostcode: "4000", photo: photo() });
    await capture({ propertyAddress: "2 Test St", propertyPostcode: "4000" });
    expect(await queue.countUnsentClaims()).toEqual({ ...none, queued: 2 });
    expect(await queue.drainOfflineClaims()).toBe(2);
    expect(await queue.countUnsentClaims()).toEqual(none);
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
