import { afterEach, describe, expect, it } from "vitest";
import {
  __setRoomPlanCustodyStoreForTests,
  createMemoryRoomPlanCustodyStore,
  enqueueRoomPlanCapture,
  hashCapturedRoomJson,
  listPendingRoomPlanCaptures,
  markRoomPlanCaptureFailed,
  markRoomPlanCaptureIngested,
  stableStringify,
  verifyRoomPlanCustodyIntegrity,
} from "../roomplan-custody-queue";
import type { CapturedRoom } from "../roomplan-to-fabric";

const ROOM: CapturedRoom = {
  rooms: [
    {
      label: "Hall",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: 5 },
        { x: 0, z: 5 },
      ],
    },
  ],
};

describe("roomplan-custody-queue", () => {
  afterEach(() => {
    __setRoomPlanCustodyStoreForTests(null);
  });

  it("stableStringify sorts object keys for deterministic hashing", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("hashCapturedRoomJson is stable across key order", async () => {
    const a = await hashCapturedRoomJson({
      rooms: [{ label: "A", floorPolygon: [{ x: 1, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 4 }] }],
    });
    const b = await hashCapturedRoomJson({
      rooms: [{ floorPolygon: [{ z: 2, x: 1 }, { z: 2, x: 3 }, { z: 4, x: 3 }], label: "A" }],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enqueue persists pending capture with sha256 of JSON bytes", async () => {
    __setRoomPlanCustodyStoreForTests(createMemoryRoomPlanCustodyStore());
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-1",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    expect(entry.status).toBe("pending_ingest");
    expect(entry.contentSha256).toBe(await hashCapturedRoomJson(ROOM));
    const pending = await listPendingRoomPlanCaptures("insp-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(entry.id);
  });

  it("mark ingested removes entry from pending list", async () => {
    __setRoomPlanCustodyStoreForTests(createMemoryRoomPlanCustodyStore());
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-1",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    await markRoomPlanCaptureIngested(entry.id);
    expect(await listPendingRoomPlanCaptures("insp-1")).toEqual([]);
  });

  it("failed captures stay pending for retry", async () => {
    __setRoomPlanCustodyStoreForTests(createMemoryRoomPlanCustodyStore());
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-1",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    await markRoomPlanCaptureFailed(entry.id, "canvas not ready");
    const pending = await listPendingRoomPlanCaptures("insp-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("failed");
    expect(pending[0].lastError).toBe("canvas not ready");
  });

  it("verifyRoomPlanCustodyIntegrity detects matching hash", async () => {
    __setRoomPlanCustodyStoreForTests(createMemoryRoomPlanCustodyStore());
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-1",
      floorNumber: 0,
      capturedRoom: ROOM,
    });
    expect(await verifyRoomPlanCustodyIntegrity(entry.id)).toBe(true);
  });
});
