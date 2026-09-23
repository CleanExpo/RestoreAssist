/**
 * RA-7611 P1 — POST /sketches stamps confirmedBy / confirmedAt from the
 * session and server clock. Client-supplied values are ignored.
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
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "sr_1" })),
      update: vi.fn(async () => ({ id: "sr_existing" })),
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
    create: ReturnType<typeof vi.fn>;
  };
  sketchRoom: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

function confirmedRoomData(overrides?: Record<string, unknown>) {
  return {
    type: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ],
    data: {
      type: "room",
      id: "ai-room-1",
      label: "AI Lounge",
      provenance: "operator_measured",
      confirmedAt: "1999-01-01T00:00:00.000Z",
      confirmedBy: "client-spoof",
      areaM2: 9,
      ...overrides,
    },
  };
}

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sketch POST — server confirm attribution", () => {
  it("sets confirmedBy from the session and confirmedAt from server time on unconfirmed → confirmed", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { objects: [confirmedRoomData()] },
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });
    p.sketchRoom.findMany
      .mockResolvedValueOnce([
        {
          id: "sr_existing",
          fabricObjectId: "ai-room-1",
          name: "AI Lounge",
          geometryJson: {},
          originalAreaM2: 9,
          originalGeometryJson: null,
          confirmedAt: null,
          confirmedBy: null,
          _count: { evidencePins: 0, moistureReadings: 0, hazards: 0 },
        },
      ])
      .mockResolvedValueOnce([]);

    const before = Date.now();
    const res = await POST(
      makePost({
        floorNumber: 0,
        sketchData: {
          scaleConfig: { pxPerMetre: 100 },
          objects: [confirmedRoomData()],
        },
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(p.sketchRoom.update).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.confirmedBy).toBe("u_1");
    expect(data.confirmedBy).not.toBe("client-spoof");
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(data.confirmedAt.toISOString()).not.toBe(
      "1999-01-01T00:00:00.000Z",
    );
    expect(data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.confirmedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("keeps the existing stamp when the room was already confirmed", async () => {
    const originalAt = new Date("2026-09-20T08:00:00.000Z");
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { objects: [] },
      updatedAt: originalAt,
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });
    p.sketchRoom.findMany
      .mockResolvedValueOnce([
        {
          id: "sr_existing",
          fabricObjectId: "ai-room-1",
          name: "AI Lounge",
          geometryJson: {},
          originalAreaM2: 9,
          originalGeometryJson: null,
          confirmedAt: originalAt,
          confirmedBy: "original-tech",
          _count: { evidencePins: 0, moistureReadings: 0, hazards: 0 },
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await POST(
      makePost({
        floorNumber: 0,
        sketchData: {
          scaleConfig: { pxPerMetre: 100 },
          objects: [confirmedRoomData()],
        },
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.confirmedBy).toBe("original-tech");
    expect(data.confirmedAt).toBe(originalAt);
  });

  it("stamps the session on create when the client sends a confirm", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_new" });

    const before = Date.now();
    const res = await POST(
      makePost({
        floorNumber: 0,
        sketchData: {
          scaleConfig: { pxPerMetre: 100 },
          objects: [confirmedRoomData()],
        },
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(p.sketchRoom.create).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.confirmedBy).toBe("u_1");
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.confirmedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("RA-7617 — untagged rooms on POST /sketches", () => {
  it("saves a room with no provenance tag without inventing a confirm stamp", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_new" });

    const res = await POST(
      makePost({
        floorNumber: 0,
        sketchData: {
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
              data: { type: "room", id: "legacy-1", label: "Legacy Lounge" },
            },
          ],
        },
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(p.sketchRoom.create).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.confirmedAt).toBeNull();
    expect(data.confirmedBy).toBeNull();
    expect(data.name).toBe("Legacy Lounge");
  });
});
