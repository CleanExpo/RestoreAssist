/**
 * RA-8576 - a failure of the stale-room lock must never be answered as a
 * success. The route treats most room-graph failures as non-fatal (the drawing
 * is already saved), which would silently drop an owner's room removal: the
 * same silent-loss shape the lock exists to prevent.
 *
 *  - a transient failure (deadlock, lock timeout) is retried once and the
 *    removal then applies;
 *  - any other failure is refused with a 503 and nothing is deleted or
 *    detached.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  writeWithinInspectionScope: async (
    _scope: unknown,
    _data: unknown,
    work: (tx: unknown) => unknown,
  ) => work(scopePrisma),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "insp-1" },
      inspectionManyWhere: { id: "insp-1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
    },
    sketchUnderlayReference: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    material: { findMany: vi.fn(async () => []) },
    sketchElement: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchRoom: {
      findMany: vi.fn(),
      create: vi.fn(async () => ({ id: "sr_new" })),
      update: vi.fn(async () => ({ id: "sr_existing" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchMoistureReading: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  sketchRoom: {
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
};

/** The Kitchen holds nothing, so it is a deletion candidate. */
const kitchen = {
  id: "sr_kitchen",
  fabricObjectId: "room-kitchen",
  name: "Kitchen",
  geometryJson: {},
  originalAreaM2: 12,
  originalGeometryJson: null,
  confirmedAt: null,
  confirmedBy: null,
  provenance: "operator_measured",
  _count: {
    evidencePins: 0,
    moistureReadings: 0,
    hazards: 0,
    jobMoistureReadings: 0,
    scopeItems: 0,
    roomObservations: 0,
  },
};

const lounge = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
  ],
  data: { type: "room", id: "room-lounge", label: "Lounge" },
};

function save() {
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        floorNumber: 0,
        sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [lounge] },
      }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.claimSketch.findFirst.mockResolvedValue({
    id: "s_1",
    sketchData: { objects: [] },
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  });
  p.claimSketch.update.mockResolvedValue({ id: "s_1" });
  p.sketchRoom.findMany.mockImplementation(async () => [kitchen]);
  p.$queryRaw.mockImplementation(async () => []);
});

describe("RA-8576 failed stale-room lock", () => {
  it("refuses the save with a 503 and removes nothing when the lock fails", async () => {
    p.$queryRaw.mockRejectedValue(new Error("connection reset"));

    const res = await save();

    expect(res.status).toBe(503);
    expect(p.$queryRaw).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.updateMany).not.toHaveBeenCalled();
  });

  it("retries once after a deadlock and then applies the removal", async () => {
    p.$queryRaw
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockResolvedValue([]);

    const res = await save();

    expect(res.status).toBe(201);
    expect(p.$queryRaw).toHaveBeenCalledTimes(2);
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["sr_kitchen"] } },
    });
  });

  it("gives up with a 503 when the deadlock repeats", async () => {
    p.$queryRaw.mockRejectedValue(new Error("deadlock detected"));

    const res = await save();

    expect(res.status).toBe(503);
    expect(p.$queryRaw).toHaveBeenCalledTimes(2);
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
  });
});
