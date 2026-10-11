/**
 * D-028 — the assigned technician's sketch save deletes no rows.
 *
 * The owner's save rebuilds the derived rows as before: geometry elements,
 * evidence-free rooms gone from the canvas, and pin moisture readings, each by
 * delete and recreate. The technician's save does none of those deletes:
 * elements are left for the owner's next save, stale rooms are detached, and
 * pin readings are only added.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const gate = vi.hoisted(() => ({ viaAssignment: true }));

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
      viaAssignment: gate.viaAssignment,
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
    sketchUnderlayReference: { findFirst: vi.fn(async () => null), update: vi.fn() },
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
      findMany: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

type Fn = ReturnType<typeof vi.fn>;
const mockSession = getServerSession as unknown as Fn;
const p = prisma as unknown as {
  claimSketch: { findFirst: Fn; update: Fn };
  sketchElement: { deleteMany: Fn; createMany: Fn };
  sketchRoom: { findMany: Fn; deleteMany: Fn; updateMany: Fn };
  sketchMoistureReading: { findMany: Fn; deleteMany: Fn; createMany: Fn };
};

/** A room no longer on the canvas, with nothing captured in it: deletable for the owner. */
const staleRoom = {
  id: "sr_stale",
  fabricObjectId: "room-gone",
  name: "Laundry",
  geometryJson: {},
  originalAreaM2: 4,
  originalGeometryJson: null,
  confirmedAt: new Date("2026-10-01T00:00:00Z"),
  confirmedBy: "owner-1",
  provenance: "operator_measured",
};

function projectRooms(args: { select?: { _count?: { select?: Record<string, boolean> } } }) {
  const countSelect = args?.select?._count?.select;
  if (!countSelect) return [];
  const _count: Record<string, number> = {};
  for (const key of Object.keys(countSelect)) _count[key] = 0;
  return [{ ...staleRoom, _count }];
}

const save = () =>
  POST(
    new NextRequest("http://localhost/api/inspections/i1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        floorNumber: 0,
        sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [] },
        // One pin the owner already recorded (12) and one new (30).
        moisturePoints: [
          { x: 1, y: 1, wme: 12 },
          { x: 2, y: 2, wme: 30 },
        ],
      }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.sketchRoom.findMany.mockImplementation(async (args) => projectRooms(args));
  p.claimSketch.findFirst.mockResolvedValue({
    id: "s_1",
    sketchData: { objects: [] },
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  });
  p.claimSketch.update.mockResolvedValue({ id: "s_1" });
  // The owner's earlier save recorded one pin reading, plus one since removed.
  p.sketchMoistureReading.findMany.mockResolvedValue([
    { currentMc: 12, sketchRoomId: null },
    { currentMc: 40, sketchRoomId: null },
  ]);
});

describe("sketch POST by the assigned technician (D-028)", () => {
  it("deletes nothing: no element rebuild, stale rooms detached, pin readings only added", async () => {
    gate.viaAssignment = true;
    const res = await save();
    expect(res.status, await res.clone().text()).toBe(201);
    expect(p.sketchElement.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchMoistureReading.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["sr_stale"] } }),
        data: expect.objectContaining({ detachedAt: expect.any(Date) }),
      }),
    );
    // Only the new pin is created; the one already on record is kept as is.
    const created = p.sketchMoistureReading.createMany.mock.calls.flatMap(
      (c) => c[0].data as Array<{ currentMc: number }>,
    );
    expect(created.map((r) => r.currentMc)).toEqual([30]);
  });

  it("positive control: the owner's save still rebuilds by delete and recreate", async () => {
    gate.viaAssignment = false;
    const res = await save();
    expect(res.status).toBe(201);
    expect(p.sketchElement.deleteMany).toHaveBeenCalledWith({ where: { sketchId: "s_1" } });
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sr_stale"] } } });
    expect(p.sketchMoistureReading.deleteMany).toHaveBeenCalledWith({
      where: { sketchId: "s_1", source: "pin" },
    });
  });
});
