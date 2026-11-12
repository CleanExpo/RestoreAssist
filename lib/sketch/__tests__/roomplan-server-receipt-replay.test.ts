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
});
