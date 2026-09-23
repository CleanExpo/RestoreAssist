/**
 * RA-7713 part 12 — PATCH /api/inspections/[id]/moisture/[readingId]
 * persists a reading's floor-plan position (MoistureReading.mapX / mapY,
 * normalised 0-1). Before this there was no route that could set the
 * position of an EXISTING reading, so the job-page moisture map could never
 * save a placement.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const resolveInspectionWrite = vi.fn();
const updateMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: (...a: unknown[]) => resolveInspectionWrite(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: vi.fn(),
    },
    inspection: { findFirst: vi.fn() },
  },
}));

import { PATCH } from "../route";

const params = Promise.resolve({ id: "insp_1", readingId: "r1" });
const ownerFilter = { OR: [{ userId: "u1" }] };

function patch(body: unknown) {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/moisture/r1",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  getServerSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  resolveInspectionWrite.mockReset().mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "insp_1", ...ownerFilter },
      inspectionManyWhere: { id: "insp_1", ...ownerFilter },
      childInspectionFilter: ownerFilter,
    },
  });
  updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("PATCH moisture reading position (RA-7713 part 12)", () => {
  it("writes mapX/mapY scoped to the inspection and the caller write reach", async () => {
    const res = await PATCH(patch({ mapX: 0.25, mapY: 0.5 }), { params });
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "r1", inspectionId: "insp_1", inspection: ownerFilter },
      data: { mapX: 0.25, mapY: 0.5 },
    });
    expect(await res.json()).toEqual({
      reading: { id: "r1", mapX: 0.25, mapY: 0.5 },
    });
  });

  it("clamps to the normalised 0-1 range", async () => {
    await PATCH(patch({ mapX: 1.7, mapY: -0.2 }), { params });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mapX: 1, mapY: 0 } }),
    );
  });

  it("clears the position when both are null", async () => {
    const res = await PATCH(patch({ mapX: null, mapY: null }), { params });
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mapX: null, mapY: null } }),
    );
  });

  it.each([
    [{ mapX: "abc", mapY: 0.5 }],
    [{ mapX: "0.5", mapY: 0.5 }],
    [{ mapX: 0.5 }],
    [{ mapX: 0.5, mapY: null }],
    ["not-an-object"],
  ])("rejects %j with 400 and writes nothing", async (body) => {
    const res = await PATCH(patch(body), { params });
    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns the tenancy status and writes nothing without write reach", async () => {
    resolveInspectionWrite.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await PATCH(patch({ mapX: 0.1, mapY: 0.1 }), { params });
    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    resolveInspectionWrite.mockResolvedValue({
      ok: false,
      status: 401,
      reason: "Unauthorized",
    });
    const res = await PATCH(patch({ mapX: 0.1, mapY: 0.1 }), { params });
    expect(res.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the reading is not on this inspection", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(patch({ mapX: 0.1, mapY: 0.1 }), { params });
    expect(res.status).toBe(404);
  });
});
