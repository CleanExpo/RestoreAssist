// @vitest-environment jsdom
/**
 * RA-1762 — unit tests for the parts of the offline queue extension
 * that don't touch IndexedDB. The IDB-touching paths (enqueueSketchSave
 * coalescing, drainQueue staleness handling) are exercised by the
 * Playwright e2e suite where a real browser provides IndexedDB.
 *
 * Vitest in this repo runs in node environment with no jsdom or
 * fake-indexeddb dependency, so the IDB-touching helpers here would
 * just throw "IndexedDB unavailable in server context".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";

import type { QueueEntryType, SketchSavePayload } from "@/lib/nir-sync-queue";

describe("RA-1762 — QueueEntryType union includes sketch-save", () => {
  it("accepts 'sketch-save' as a valid type", () => {
    const t: QueueEntryType = "sketch-save";
    expect(t).toBe("sketch-save");
  });

  it("retains all pre-existing types", () => {
    const before: QueueEntryType[] = [
      "inspection-create",
      "inspection-update",
      "inspection-submit",
      "moisture-reading",
      "photo-upload",
      "environmental-data",
      "scope-item",
    ];
    expect(before).toHaveLength(7);
  });
});

describe("RA-1762 — SketchSavePayload contract", () => {
  it("requires floorNumber, floorLabel, and clientUpdatedAt", () => {
    const payload: SketchSavePayload = {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchType: "structural",
      sketchData: { version: "5.3.0" },
      backgroundImageUrl: null,
      moisturePoints: [],
      equipmentPoints: [],
      clientUpdatedAt: 1_700_000_000_000,
    };
    expect(payload.clientUpdatedAt).toBe(1_700_000_000_000);
    expect(payload.floorNumber).toBe(0);
  });

  it("clientUpdatedAt is a number (epoch ms), not an ISO string", () => {
    // Type-level assertion: this would fail to compile if clientUpdatedAt
    // were typed as `string`. Runtime check confirms the contract.
    const payload: SketchSavePayload = {
      floorNumber: 1,
      floorLabel: "First",
      clientUpdatedAt: Date.now(),
    };
    expect(typeof payload.clientUpdatedAt).toBe("number");
    expect(Number.isFinite(payload.clientUpdatedAt)).toBe(true);
  });
});

/**
 * RA-7656 — Clear Canvas marks its save `userRemovedRooms: true`. A save that
 * fails online is queued as-is, so the replay must send the flag back to the
 * route; otherwise it arrives roomless and unmarked and the route keeps the
 * rooms the user removed. (The editor keeps the flag on every save until one
 * is acknowledged online, so coalescing always keeps a flagged entry.)
 */
describe("RA-7656 queue keeps intent", () => {
  const owner = { userId: "user-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "user-a" };
  let uninstall: (() => void) | undefined;
  afterEach(() => {
    uninstall?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("RA-7656 queue keeps intent: a queued sketch save replays userRemovedRooms in the request body", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/auth/offline-context"
        ? new Response(JSON.stringify({ owner }), { status: 200 })
        : new Response(JSON.stringify({ id: "srv-1" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: vi.fn(async (_n: unknown, _o: unknown, work: () => unknown) => work()) },
    });
    const boundary = await import("../offline/account-boundary");
    boundary.setOfflineSession(owner.userId);
    expect(await boundary.refreshOfflineOwner()).toEqual(owner);
    const queue = await import("@/lib/nir-sync-queue");

    const payload: SketchSavePayload = {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchData: { objects: [{ type: "path", data: { type: "freehand" } }] },
      userRemovedRooms: true,
      clientUpdatedAt: 1_700_000_000_000,
    };
    await queue.queueWrite({
      type: "sketch-save",
      endpoint: "/api/inspections/i1/sketches",
      method: "POST",
      payload,
      inspectionId: "i1",
    });

    fetchMock.mockClear();
    expect(await queue.drainQueue()).toBe(1);
    const bodies = fetchMock.mock.calls
      .filter(([url]) => url === "/api/inspections/i1/sketches")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toEqual([payload]);
    expect(bodies[0].userRemovedRooms).toBe(true);
  });
});

/**
 * RA-7656 — the editor keeps `userRemovedRooms` on every save until one is
 * acknowledged online, and the queue keeps only the newest pending save per
 * floor. The entry that survives coalescing must still carry the flag.
 */
describe("RA-7656 queue coalescing keeps intent", () => {
  const owner = { userId: "user-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "user-a" };
  let uninstall: (() => void) | undefined;
  afterEach(() => {
    uninstall?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("RA-7656 queue coalescing keeps intent: two saves for one floor collapse to the newest, flag intact", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ owner }), { status: 200 })),
    );
    const boundary = await import("../offline/account-boundary");
    boundary.setOfflineSession(owner.userId);
    expect(await boundary.refreshOfflineOwner()).toEqual(owner);
    const queue = await import("@/lib/nir-sync-queue");

    await queue.enqueueSketchSave("i1", {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchData: { objects: [] },
      userRemovedRooms: true,
      clientUpdatedAt: 1,
    });
    await queue.enqueueSketchSave("i1", {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchData: { objects: [{ type: "path" }] },
      userRemovedRooms: true,
      clientUpdatedAt: 2,
    });
    await queue.enqueueSketchSave("i1", {
      floorNumber: 1,
      floorLabel: "First Floor",
      sketchData: { objects: [{ type: "path" }] },
      clientUpdatedAt: 3,
    });

    const entries = await queue.getPendingEntries("i1");
    const floor0 = entries.filter((e) => (e.payload as SketchSavePayload).floorNumber === 0);
    const floor1 = entries.filter((e) => (e.payload as SketchSavePayload).floorNumber === 1);
    expect(entries).toHaveLength(2);
    expect(floor0).toHaveLength(1);
    expect(floor0[0].payload).toMatchObject({ userRemovedRooms: true, clientUpdatedAt: 2 });
    expect(floor1).toHaveLength(1);
    expect((floor1[0].payload as SketchSavePayload).userRemovedRooms).toBeUndefined();
  });
});
