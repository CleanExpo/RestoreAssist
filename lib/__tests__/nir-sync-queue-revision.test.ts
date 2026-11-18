// @vitest-environment jsdom
/**
 * RA-8056 — the offline queue carries the floor revision the editor loaded.
 *
 * - A queued save replays its revision unchanged, also after an app restart,
 *   so a delayed replay is checked against the floor it was based on.
 * - A replay the route refuses as a revision conflict is kept (moved to the
 *   failed list the editor shows), never silently dropped like a stale one.
 * - Coalescing only collapses saves from the same editor session, so two
 *   tabs editing one floor offline do not delete each other's queued edit.
 * - A successful replay announces the floor's new revision, so the editor
 *   that queued it does not refuse its own next save as a conflict.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";
import type { SketchSavePayload } from "@/lib/nir-sync-queue";

const owner = {
  userId: "user-a",
  organizationId: "org-a",
  workspaceId: "ws-a",
  workspaceOwnerId: "user-a",
};
const LOADED = "a".repeat(64);
const SAVED = "b".repeat(64);

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function payload(extra: Partial<SketchSavePayload> = {}): SketchSavePayload {
  return {
    floorNumber: 0,
    floorLabel: "Ground Floor",
    sketchData: { objects: [{ type: "path", data: { type: "freehand" } }] },
    clientUpdatedAt: 1_700_000_000_000,
    baseRevision: LOADED,
    editorSessionId: "tab-a",
    ...extra,
  };
}

async function bootQueue(
  sketchResponse: () => Response | Promise<Response>,
) {
  const fetchMock = vi.fn(async (url: string) =>
    url === "/api/auth/offline-context"
      ? new Response(JSON.stringify({ owner }), { status: 200 })
      : sketchResponse(),
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: vi.fn(async (_n: unknown, _o: unknown, work: () => unknown) =>
        work(),
      ),
    },
  });
  const boundary = await import("../offline/account-boundary");
  boundary.setOfflineSession(owner.userId);
  expect(await boundary.refreshOfflineOwner()).toEqual(owner);
  const queue = await import("@/lib/nir-sync-queue");
  return { queue, fetchMock };
}

/** `getPendingEntries(inspectionId)` returns every status; keep the pending ones. */
async function pending(queue: typeof import("@/lib/nir-sync-queue")) {
  return (await queue.getPendingEntries("i1")).filter(
    (e) => e.status === "pending",
  );
}

function sketchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([url]) => url === "/api/inspections/i1/sketches",
  );
}

describe("RA-8056 queued revision", () => {
  it("replays the loaded revision unchanged after an app restart", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const first = await bootQueue(() => new Response("{}", { status: 503 }));
    await first.queue.enqueueSketchSave("i1", payload());

    // App restart: fresh modules, same IndexedDB.
    vi.resetModules();
    const second = await bootQueue(
      () =>
        new Response(JSON.stringify({ id: "s_1", revision: SAVED }), {
          status: 201,
        }),
    );
    expect(await second.queue.drainQueue()).toBe(1);

    const calls = sketchCalls(second.fetchMock);
    expect(calls).toHaveLength(1);
    const headers = new Headers((calls[0][1] as RequestInit).headers);
    expect(headers.get("x-sketch-revision")).toBe(LOADED);
    expect(await pending(second.queue)).toHaveLength(0);
  });

  it("keeps a replay refused as a revision conflict in the failed list instead of dropping it", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () =>
        new Response(
          JSON.stringify({ conflict: "revision", serverRevision: SAVED }),
          { status: 409 },
        ),
    );
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    expect(await pending(queue)).toHaveLength(0);
    const failed = await queue.getFailedEntries("i1");
    expect(failed).toHaveLength(1);
    expect(failed[0].payload).toMatchObject({
      baseRevision: LOADED,
      editorSessionId: "tab-a",
    });
  });

  it("still drops a replay the route calls stale (superseded by a newer save)", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () => new Response(JSON.stringify({ stale: true }), { status: 409 }),
    );
    await queue.enqueueSketchSave("i1", payload({ baseRevision: undefined }));

    await queue.drainQueue();

    expect(await pending(queue)).toHaveLength(0);
    expect(await queue.getFailedEntries("i1")).toHaveLength(0);
  });

  it("announces the new revision after a successful replay", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () =>
        new Response(JSON.stringify({ id: "s_1", revision: SAVED }), {
          status: 201,
        }),
    );
    await queue.enqueueSketchSave("i1", payload());
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(queue.SKETCH_SAVE_REPLAYED_EVENT, listener);

    await queue.drainQueue();
    window.removeEventListener(queue.SKETCH_SAVE_REPLAYED_EVENT, listener);

    expect(seen).toEqual([
      {
        inspectionId: "i1",
        floorNumber: 0,
        editorSessionId: "tab-a",
        baseRevision: LOADED,
        revision: SAVED,
      },
    ]);
  });
});

describe("RA-8056 a live save supersedes the session's own queued saves", () => {
  it("drops only this session's pending saves for that floor, so they never replay into Sync failed", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () => new Response("{}", { status: 503 }),
    );
    await queue.enqueueSketchSave("i1", payload({ editorSessionId: "tab-a" }));
    await queue.enqueueSketchSave("i1", payload({ editorSessionId: "tab-b" }));
    await queue.enqueueSketchSave(
      "i1",
      payload({ editorSessionId: "tab-a", floorNumber: 1 }),
    );

    await queue.discardSupersededSketchSaves("i1", 0, "tab-a");

    const left = (await pending(queue))
      .map((e) => e.payload as SketchSavePayload)
      .map((p) => `${p.editorSessionId}:${p.floorNumber}`)
      .sort();
    expect(left).toEqual(["tab-a:1", "tab-b:0"]);
  });

  it("never drops an edit the route refused as a conflict, even from the same session and floor", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () => new Response("{}", { status: 503 }),
    );
    await queue.enqueueSketchSave(
      "i1",
      payload({ editorSessionId: "tab-a", refusedAsConflict: true }),
    );

    await queue.discardSupersededSketchSaves("i1", 0, "tab-a");

    const left = await pending(queue);
    expect(left).toHaveLength(1);
    expect(left[0].payload).toMatchObject({ refusedAsConflict: true });
  });

  it("a later save from the same session does not coalesce away a refused edit", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () => new Response("{}", { status: 503 }),
    );
    await queue.enqueueSketchSave(
      "i1",
      payload({ clientUpdatedAt: 1, refusedAsConflict: true }),
    );
    await queue.enqueueSketchSave("i1", payload({ clientUpdatedAt: 2 }));

    const kept = (await pending(queue))
      .map((e) => (e.payload as SketchSavePayload).clientUpdatedAt)
      .sort();
    expect(kept).toEqual([1, 2]);
  });

  it("a replay refused after its entry was discarded mid-drain leaves no broken record", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    let queueRef: typeof import("@/lib/nir-sync-queue") | undefined;
    const { queue } = await bootQueue(async () => {
      // The editor's live save lands while this replay is in flight.
      await queueRef?.discardSupersededSketchSaves("i1", 0, "tab-a");
      return new Response(JSON.stringify({ conflict: "revision" }), {
        status: 409,
      });
    });
    queueRef = queue;
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    expect(await queue.getPendingEntries("i1")).toEqual([]);
    // Across every inspection: no half-written "failed" row without its entry.
    expect(await queue.getFailedEntries()).toEqual([]);
  });
});

describe("RA-8056 coalescing per editor session", () => {
  it("two tabs queueing one floor keep both edits; one tab's saves still collapse to its newest", async () => {
    vi.resetModules();
    uninstall = installFakeIndexedDB();
    const { queue } = await bootQueue(
      () => new Response("{}", { status: 503 }),
    );

    await queue.enqueueSketchSave(
      "i1",
      payload({ editorSessionId: "tab-a", clientUpdatedAt: 1 }),
    );
    await queue.enqueueSketchSave(
      "i1",
      payload({ editorSessionId: "tab-b", clientUpdatedAt: 2 }),
    );
    await queue.enqueueSketchSave(
      "i1",
      payload({ editorSessionId: "tab-a", clientUpdatedAt: 3 }),
    );

    const entries = await pending(queue);
    const bySession = entries
      .map((e) => e.payload as SketchSavePayload)
      .map((p) => `${p.editorSessionId}:${p.clientUpdatedAt}`)
      .sort();
    expect(bySession).toEqual(["tab-a:3", "tab-b:2"]);
  });
});
