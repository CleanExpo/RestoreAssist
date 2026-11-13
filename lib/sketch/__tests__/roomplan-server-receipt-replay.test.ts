/**
 * RA-8325 — a LiDAR scan taken offline must still get its server custody
 * receipt once the network returns. The receipt state is tracked separately
 * from the canvas `ingested` state and replayed until the server accepts it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setRoomPlanCustodyStoreForTests,
  createMemoryRoomPlanCustodyStore,
  enqueueRoomPlanCapture,
  flushRoomPlanServerReceipts,
  RECEIPT_POST_TIMEOUT_MS,
  getRoomPlanCapture,
  markRoomPlanCaptureIngested,
} from "../roomplan-custody-queue";
import type { CapturedRoom } from "../roomplan-to-fabric";

const ROOM: CapturedRoom = {
  rooms: [
    {
      label: "Laundry",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: 3 },
        { x: 0, z: 3 },
      ],
    },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RoomPlan server receipt replay (RA-8325)", () => {
  beforeEach(() => {
    __setRoomPlanCustodyStoreForTests(createMemoryRoomPlanCustodyStore());
  });
  afterEach(() => {
    __setRoomPlanCustodyStoreForTests(null);
  });

  it("a receipt that failed offline is sent exactly once on the next load and marked sent", async () => {
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-1",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    expect(entry.serverReceipt).toBe("pending");

    // Scan time: the technician is offline.
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const first = await flushRoomPlanServerReceipts("insp-1", offline);
    expect(offline).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ sent: 0, rejected: [] });

    // Canvas ingest still succeeds offline; that must not hide the receipt.
    await markRoomPlanCaptureIngested(entry.id);
    expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe("pending");

    // Reload with the network back.
    const online = vi.fn(async () => jsonResponse(201, { receipt: {} }));
    const second = await flushRoomPlanServerReceipts("insp-1", online);
    expect(online).toHaveBeenCalledTimes(1);
    const [url, init] = online.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/inspections/insp-1/roomplan-custody");
    const body = JSON.parse(String(init.body));
    expect(body.clientSha256).toBe(entry.contentSha256);
    expect(body.clientCustodyId).toBe(entry.id);
    expect(second).toEqual({ sent: 1, rejected: [] });
    expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe("sent");

    // A further load sends nothing.
    const third = vi.fn(async () => jsonResponse(200, {}));
    await flushRoomPlanServerReceipts("insp-1", third);
    expect(third).not.toHaveBeenCalled();
  });

  it("the route's duplicate answer (200 reused) counts as sent", async () => {
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-2",
      floorNumber: 1,
      capturedRoom: ROOM,
    });
    const res = await flushRoomPlanServerReceipts("insp-2", async () =>
      jsonResponse(200, { receipt: {}, reused: true }),
    );
    expect(res.sent).toBe(1);
    expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe("sent");
  });

  it("a server error (5xx), expired session (401) or rate limit (429) stays pending for retry", async () => {
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-3",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    for (const status of [500, 503, 401, 429]) {
      const res = await flushRoomPlanServerReceipts("insp-3", async () =>
        jsonResponse(status, { error: { message: "try later" } }),
      );
      expect(res).toEqual({ sent: 0, rejected: [] });
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe(
        "pending",
      );
    }
  });

  it("a permanent 4xx (hash mismatch) is rejected with the server message and never retried", async () => {
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-4",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    const message =
      "Hash mismatch — CapturedRoom may have been altered in transit";
    const res = await flushRoomPlanServerReceipts("insp-4", async () =>
      jsonResponse(400, { error: { code: "VALIDATION", message } }),
    );
    expect(res.sent).toBe(0);
    expect(res.rejected).toEqual([{ id: entry.id, message }]);
    const stored = await getRoomPlanCapture(entry.id);
    expect(stored?.serverReceipt).toBe("rejected");
    expect(stored?.serverReceiptError).toBe(message);

    const again = vi.fn(async () => jsonResponse(201, {}));
    const res2 = await flushRoomPlanServerReceipts("insp-4", again);
    expect(again).not.toHaveBeenCalled();
    expect(res2).toEqual({ sent: 0, rejected: [] });
  });

  it("entries stored before RA-8325 (no serverReceipt field) are replayed", async () => {
    const store = createMemoryRoomPlanCustodyStore();
    __setRoomPlanCustodyStoreForTests(store);
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-5",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    const legacy: Record<string, unknown> = { ...entry, status: "ingested" };
    delete legacy.serverReceipt;
    await store.put(legacy as unknown as typeof entry);

    const online = vi.fn(async () => jsonResponse(201, {}));
    const res = await flushRoomPlanServerReceipts("insp-5", online);
    expect(online).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(1);
  });

  it("two overlapping flushes (load and the online event) send each receipt once", async () => {
    await enqueueRoomPlanCapture({
      inspectionId: "insp-6",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    const online = vi.fn(async () => jsonResponse(201, {}));
    await Promise.all([
      flushRoomPlanServerReceipts("insp-6", online),
      flushRoomPlanServerReceipts("insp-6", online),
    ]);
    expect(online).toHaveBeenCalledTimes(1);
  });
  it("a receipt POST that hangs is aborted after 30 seconds, stays pending, and does not stall the next flush", async () => {
    vi.useFakeTimers();
    try {
      const entry = await enqueueRoomPlanCapture({
        inspectionId: "insp-7",
        floorNumber: 0,
        capturedRoom: ROOM,
      });
      expect(RECEIPT_POST_TIMEOUT_MS).toBe(30_000);

      let seen: AbortSignal | undefined;
      const hung = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            seen = init?.signal ?? undefined;
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const first = flushRoomPlanServerReceipts("insp-7", hung);
      await vi.advanceTimersByTimeAsync(RECEIPT_POST_TIMEOUT_MS - 1);
      expect(seen?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(seen?.aborted).toBe(true);
      expect(await first).toEqual({ sent: 0, rejected: [] });
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe(
        "pending",
      );

      // The chain is free again: the next flush runs and succeeds.
      const ok = vi.fn(async () => jsonResponse(201, {}));
      const second = await flushRoomPlanServerReceipts("insp-7", ok);
      expect(second.sent).toBe(1);
      // No leftover timer from the finished requests.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("an error answer whose body never finishes is cut off by the 30 second deadline and stays pending for retry", async () => {
    vi.useFakeTimers();
    try {
      const entry = await enqueueRoomPlanCapture({
        inspectionId: "insp-8",
        floorNumber: 0,
        capturedRoom: ROOM,
      });
      // Headers arrive at once; the body stalls until the request is aborted,
      // the way a real fetch body behaves.
      const stalledBody = vi.fn((_url: string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
          },
        });
        return Promise.resolve(new Response(body, { status: 400 }));
      });
      const first = flushRoomPlanServerReceipts("insp-8", stalledBody);
      await vi.advanceTimersByTimeAsync(RECEIPT_POST_TIMEOUT_MS);
      expect(await first).toEqual({ sent: 0, rejected: [] });
      // An incomplete answer is not a verdict: the receipt stays pending.
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe(
        "pending",
      );

      // The chain is free again and the retry succeeds.
      const next = await flushRoomPlanServerReceipts("insp-8", async () =>
        jsonResponse(201, {}),
      );
      expect(next).toEqual({ sent: 1, rejected: [] });
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe("sent");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a 2xx answer whose body never finishes is not a receipt: it stays pending and a retry sends it", async () => {
    vi.useFakeTimers();
    try {
      const entry = await enqueueRoomPlanCapture({
        inspectionId: "insp-9",
        floorNumber: 0,
        capturedRoom: ROOM,
      });
      const stalled201 = (_url: string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
          },
        });
        return Promise.resolve(new Response(body, { status: 201 }));
      };
      const first = flushRoomPlanServerReceipts("insp-9", stalled201);
      await vi.advanceTimersByTimeAsync(RECEIPT_POST_TIMEOUT_MS);
      expect(await first).toEqual({ sent: 0, rejected: [] });
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe(
        "pending",
      );

      const retry = await flushRoomPlanServerReceipts("insp-9", async () =>
        jsonResponse(201, {}),
      );
      expect(retry).toEqual({ sent: 1, rejected: [] });
      expect((await getRoomPlanCapture(entry.id))?.serverReceipt).toBe("sent");
    } finally {
      vi.useRealTimers();
    }
  });
  it("a failing first POST does not starve the later queued receipts", async () => {
    const first = await enqueueRoomPlanCapture({
      inspectionId: "insp-10",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    // Distinct capture time so the order is first, then second.
    await new Promise((r) => setTimeout(r, 5));
    const second = await enqueueRoomPlanCapture({
      inspectionId: "insp-10",
      floorNumber: 1,
      capturedRoom: ROOM,
    });
    const seen: string[] = [];
    const flaky = async (_url: string, init?: RequestInit) => {
      const id = JSON.parse(String(init?.body)).clientCustodyId as string;
      seen.push(id);
      if (id === first.id) throw new TypeError("Failed to fetch");
      return jsonResponse(201, {});
    };
    for (let i = 0; i < 2; i++) {
      await flushRoomPlanServerReceipts("insp-10", flaky);
    }
    expect(seen.filter((id) => id === second.id)).toHaveLength(1);
    expect((await getRoomPlanCapture(second.id))?.serverReceipt).toBe("sent");
    expect((await getRoomPlanCapture(first.id))?.serverReceipt).toBe("pending");
  });
});
