// @vitest-environment jsdom
/**
 * RA-8242 — the sketch offline queue must not retry a save the server will
 * never accept.
 *
 * - A permanent rejection (4xx other than 408, 409, 429) moves the entry to the
 *   failed list the editor shows (retry, export, discard). The technician's
 *   payload is kept byte for byte, it is not replayed again, and the technician
 *   is told in plain words that the work is not saved.
 * - 5xx, 408, 429 and network errors keep retrying (positive control: a fix
 *   that stops all retries fails these).
 * - 409 keeps today's behaviour.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./helpers/fake-indexeddb";
import type { SketchSavePayload } from "@/lib/nir-sync-queue";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

const owner = {
  userId: "user-a",
  organizationId: "org-a",
  workspaceId: "ws-a",
  workspaceOwnerId: "user-a",
};

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  toastError.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function payload(): SketchSavePayload {
  return {
    floorNumber: 0,
    floorLabel: "Ground Floor",
    sketchData: { objects: [{ type: "path", data: { type: "freehand" } }] },
    clientUpdatedAt: 1_700_000_000_000,
    editorSessionId: "tab-a",
  };
}

async function bootQueue(
  sketchResponse: () => Response | Promise<Response>,
) {
  vi.resetModules();
  uninstall = installFakeIndexedDB();
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

describe("RA-8242 permanently rejected sketch saves", () => {
  it.each([400, 404, 410, 413, 422])(
    "stops retrying a %i, keeps the local copy and tells the technician",
    async (status) => {
      const { queue, fetchMock } = await bootQueue(
        () =>
          new Response(JSON.stringify({ error: "rooms share an id" }), {
            status,
          }),
      );
      await queue.enqueueSketchSave("i1", payload());

      await queue.drainQueue();
      expect(sketchCalls(fetchMock)).toHaveLength(1);

      // Not retried: nothing is left pending, so a second drain sends nothing.
      expect(await pending(queue)).toHaveLength(0);
      await queue.drainQueue();
      expect(sketchCalls(fetchMock)).toHaveLength(1);

      // Kept: the technician's work is in the failed list, untouched.
      const failed = await queue.getFailedEntries("i1");
      expect(failed).toHaveLength(1);
      expect(failed[0].payload).toEqual(payload());

      // Told: one clear message that names the floor and where the work is.
      expect(toastError).toHaveBeenCalledTimes(1);
      const message = String(toastError.mock.calls[0][0]);
      expect(message).toContain("Ground Floor");
      expect(message).toContain("not saved");
      expect(message).toContain("Sync failed");
    },
  );

  it.each([500, 502, 503, 408, 429])(
    "keeps retrying a %i",
    async (status) => {
      const { queue, fetchMock } = await bootQueue(
        () => new Response("{}", { status }),
      );
      await queue.enqueueSketchSave("i1", payload());

      await queue.drainQueue();

      expect(sketchCalls(fetchMock)).toHaveLength(1);
      const left = await pending(queue);
      expect(left).toHaveLength(1);
      expect(left[0].retryCount).toBe(1);
      expect(await queue.getFailedEntries("i1")).toHaveLength(0);
      expect(toastError).not.toHaveBeenCalled();
    },
  );

  it("keeps retrying after a network error", async () => {
    const { queue } = await bootQueue(() => {
      throw new TypeError("Failed to fetch");
    });
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    const left = await pending(queue);
    expect(left).toHaveLength(1);
    expect(left[0].retryCount).toBe(1);
    expect(await queue.getFailedEntries("i1")).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps today's 409 behaviour: a stale replay is dropped, not parked", async () => {
    const { queue } = await bootQueue(
      () => new Response(JSON.stringify({ stale: true }), { status: 409 }),
    );
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    expect(await pending(queue)).toHaveLength(0);
    expect(await queue.getFailedEntries("i1")).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps today's 409 behaviour: a revision conflict goes to the failed list with no extra message", async () => {
    const { queue } = await bootQueue(
      () =>
        new Response(
          JSON.stringify({ conflict: "revision", serverRevision: "b".repeat(64) }),
          { status: 409 },
        ),
    );
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    expect(await pending(queue)).toHaveLength(0);
    expect(await queue.getFailedEntries("i1")).toHaveLength(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps today's 409 behaviour: another 409 is stored as a conflict", async () => {
    const { queue } = await bootQueue(
      () => new Response(JSON.stringify({ other: true }), { status: 409 }),
    );
    await queue.enqueueSketchSave("i1", payload());

    await queue.drainQueue();

    expect(await pending(queue)).toHaveLength(0);
    expect((await queue.getQueueStats()).conflicts).toBe(1);
    expect(toastError).not.toHaveBeenCalled();
  });
});
