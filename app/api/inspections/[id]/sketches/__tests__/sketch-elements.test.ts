/**
 * Mapping V2 dual-write — POST /api/inspections/[id]/sketches also derives
 * normalized SketchElement rows from the Fabric blob (spec §6.4, T1.2).
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
    claimSketch: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    material: { findMany: vi.fn() },
    sketchElement: { deleteMany: vi.fn(), createMany: vi.fn() },
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
    create: ReturnType<typeof vi.fn>;
  };
  material: { findMany: ReturnType<typeof vi.fn> };
  sketchElement: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

const SKETCH_DATA = {
  scaleConfig: { pxPerMetre: 100 },
  objects: [
    {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 400 },
        { x: 0, y: 400 },
      ],
      data: { type: "room", material: "carpet" },
    },
    { type: "i-text", text: "label", data: {} },
  ],
};

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sketch POST → SketchElement dual-write", () => {
  it("decomposes the blob into element rows resolving material slug → id", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_1" });
    p.material.findMany.mockResolvedValueOnce([
      { id: "mat_carpet", slug: "carpet" },
    ]);
    p.sketchElement.deleteMany.mockResolvedValueOnce({ count: 0 });
    p.sketchElement.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(
      makePost({ floorNumber: 0, sketchData: SKETCH_DATA }),
      {
        params: Promise.resolve({ id: "i1" }),
      },
    );

    expect(res.status).toBe(201);
    expect(p.sketchElement.deleteMany).toHaveBeenCalledWith({
      where: { sketchId: "s_1" },
    });
    const created = p.sketchElement.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1); // only the canonical room, not the label
    expect(created[0]).toMatchObject({
      sketchId: "s_1",
      type: "room",
      materialId: "mat_carpet",
      provenance: "operator_measured",
    });
  });

  it("still saves the sketch (201) even if element decomposition throws", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_2" });
    p.material.findMany.mockRejectedValueOnce(new Error("db blip"));

    const res = await POST(
      makePost({ floorNumber: 0, sketchData: SKETCH_DATA }),
      {
        params: Promise.resolve({ id: "i1" }),
      },
    );

    expect(res.status).toBe(201); // blob save is authoritative; element sync is non-fatal
  });
});
