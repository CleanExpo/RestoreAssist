/**
 * RA-7610 — a room that holds job moisture readings (MoistureReading.sketchRoomId)
 * must be detached, not deleted, when it drops off the canvas. Deleting it would
 * SetNull the readings' room link and lose which room they were taken in.
 *
 * The sketchRoom.findMany mock projects _count from the query's own select,
 * the way Prisma does, so this fails if jobMoistureReadings is removed from
 * the route's _count select.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
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

/** The stored row: only job moisture readings hang off this room. */
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
    jobMoistureReadings: 2,
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

describe("RA-7610 — stale room holding job moisture readings", () => {
  it("detaches, and does not delete, a room whose only dependents are job moisture readings", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { objects: [] },
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });

    // The Kitchen room is no longer on the canvas.
    const res = await POST(
      new NextRequest("http://localhost/api/inspections/i1/sketches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          floorNumber: 0,
          sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [] },
        }),
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    const deletedIds = p.sketchRoom.deleteMany.mock.calls.flatMap(
      (c) => c[0]?.where?.id?.in ?? [],
    );
    expect(deletedIds).not.toContain("sr_kitchen");
    expect(p.sketchRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["sr_kitchen"] } }),
        data: expect.objectContaining({ detachedAt: expect.any(Date) }),
      }),
    );
  });
});
