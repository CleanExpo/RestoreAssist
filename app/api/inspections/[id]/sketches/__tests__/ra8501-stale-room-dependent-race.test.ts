/**
 * RA-8501 review: the dependent counts a sketch save reads are stale by the time
 * it deletes. A room that read as empty (all counts 0) can gain a contents item,
 * scope item or evidence between the read and the delete; deleting it would
 * SetNull that item's room link. So the delete itself must match only a room
 * that still has no dependent of any kind, and the room it spared is detached.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// D-028: create/update handlers gate on assertInspectionAssignedWrite.
vi.mock("@/lib/auth/assert-tenancy", () => ({
  // D-028: scoped writes run their work against the mocked client here;
  // the claim itself is proven against Postgres in the integration table.
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
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";
import { ROOM_DEPENDENT_RELATIONS } from "@/lib/sketch/sync-room-graph";

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
};

/** The stored row reads as empty: nothing hangs off this room when counted. */
const kitchenRow = {
  id: "sr_kitchen",
  fabricObjectId: "room-kitchen",
  name: "Kitchen",
  geometryJson: {},
  originalAreaM2: 12,
  originalGeometryJson: null,
  confirmedAt: null,
  confirmedBy: null,
  provenance: "operator_measured",
  counts: {
    evidencePins: 0,
    moistureReadings: 0,
    hazards: 0,
    jobMoistureReadings: 0,
    scopeItems: 0,
    contentsPackOutItems: 0,
  } as Record<string, number>,
};

/** Return only the _count keys the query selected, as Prisma does. */
function projectRooms(args: {
  select?: { _count?: { select?: Record<string, boolean> } };
}) {
  const countSelect = args?.select?._count?.select;
  if (!countSelect) return [];
  const { counts, ...rest } = kitchenRow;
  const _count: Record<string, number> = {};
  for (const key of Object.keys(countSelect)) {
    if (countSelect[key]) _count[key] = counts[key];
  }
  return [{ ...rest, _count }];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.sketchRoom.findMany.mockImplementation(async (args) => projectRooms(args));
});

describe("RA-8501 — stale room that gains a dependent before the delete", () => {
  it("deletes only a room that still has no dependent, and detaches one it spared", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { objects: [] },
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(
      new NextRequest("http://localhost/api/inspections/i1/sketches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          floorNumber: 0,
          sketchData: {
            scaleConfig: { pxPerMetre: 100 },
            objects: [
              {
                type: "polygon",
                points: [
                  { x: 0, y: 0 },
                  { x: 300, y: 0 },
                  { x: 300, y: 300 },
                ],
                data: { type: "room", id: "room-lounge", label: "Lounge" },
              },
            ],
          },
        }),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    const del = p.sketchRoom.deleteMany.mock.calls.find((c) =>
      (c[0]?.where?.id?.in ?? []).includes("sr_kitchen"),
    );
    expect(del).toBeTruthy();
    // Every SetNull dependent is named in the delete's own where.
    for (const relation of ROOM_DEPENDENT_RELATIONS) {
      expect(del![0].where[relation]).toEqual({ none: {} });
    }
    // The room the delete spared (it matched nothing here) is detached.
    expect(p.sketchRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["sr_kitchen"] } }),
        data: expect.objectContaining({ detachedAt: expect.any(Date) }),
      }),
    );
  });
});
