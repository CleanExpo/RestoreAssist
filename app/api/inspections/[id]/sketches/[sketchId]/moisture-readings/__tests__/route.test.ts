/**
 * POST /api/inspections/[id]/sketches/[sketchId]/moisture-readings — S500 drying
 * log. Server computes dryStandardMet from the reading vs the material dry standard.
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
    claimSketch: { findFirst: vi.fn() },
    sketchElement: { findFirst: vi.fn() },
    sketchRoom: { findFirst: vi.fn() },
    material: { findUnique: vi.fn() },
    sketchMoistureReading: { create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockTenancy = assertInspectionTenancy as unknown as ReturnType<
  typeof vi.fn
>;

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: { findFirst: ReturnType<typeof vi.fn> };
  sketchElement: { findFirst: ReturnType<typeof vi.fn> };
  sketchRoom: { findFirst: ReturnType<typeof vi.fn> };
  material: { findUnique: ReturnType<typeof vi.fn> };
  sketchMoistureReading: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.claimSketch.findFirst.mockResolvedValue({ id: "s1" });
  p.sketchElement.findFirst.mockResolvedValue({ id: "e1" });
  p.sketchRoom.findFirst.mockResolvedValue({ id: "room1" });
  p.material.findUnique.mockResolvedValue({
    id: "mat_timber",
    slug: "timber-framing",
  });
  p.sketchMoistureReading.create.mockImplementation(async ({ data }: any) => ({
    id: "mr_1",
    ...data,
  }));
});

function post(body: object): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/i1/sketches/s1/moisture-readings",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const params = { params: Promise.resolve({ id: "i1", sketchId: "s1" }) };

describe("POST moisture-readings", () => {
  it("flags not-yet-dry when the reading exceeds the material dry standard", async () => {
    const res = await POST(
      post({
        materialSlug: "timber-framing",
        currentMc: 22,
        waterCategory: "cat3",
      }),
      params,
    );
    expect(res.status).toBe(201);
    const created = p.sketchMoistureReading.create.mock.calls[0][0].data;
    expect(created.dryStandardMet).toBe(false);
    expect(created.targetMc).toBe(16);
    expect(created.materialId).toBe("mat_timber");
    expect(created.sketchId).toBe("s1");
  });

  it("flags dry when the reading is at or below the dry standard", async () => {
    const res = await POST(
      post({ materialSlug: "timber-framing", currentMc: 14 }),
      params,
    );
    expect(res.status).toBe(201);
    expect(
      p.sketchMoistureReading.create.mock.calls[0][0].data.dryStandardMet,
    ).toBe(true);
  });

  it("422 when neither materialSlug nor targetMc allows a dry-standard", async () => {
    const res = await POST(post({ currentMc: 10 }), params);
    expect(res.status).toBe(422);
    expect(p.sketchMoistureReading.create).not.toHaveBeenCalled();
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(
      post({ materialSlug: "timber-framing", currentMc: 14 }),
      params,
    );
    expect(res.status).toBe(401);
  });

  it("403 when the caller fails the inspection tenancy check", async () => {
    mockTenancy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
    const res = await POST(
      post({ materialSlug: "timber-framing", currentMc: 14 }),
      params,
    );
    expect(res.status).toBe(403);
  });

  it("404s before writing when the sketch belongs to another inspection", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    const res = await POST(
      post({ materialSlug: "timber-framing", currentMc: 14 }),
      params,
    );
    expect(res.status).toBe(404);
    expect(p.sketchMoistureReading.create).not.toHaveBeenCalled();
  });

  it("rejects a room from another sketch", async () => {
    p.sketchRoom.findFirst.mockResolvedValueOnce(null);
    const res = await POST(
      post({
        materialSlug: "timber-framing",
        currentMc: 14,
        sketchRoomId: "foreign",
      }),
      params,
    );
    expect(res.status).toBe(422);
    expect(p.sketchMoistureReading.create).not.toHaveBeenCalled();
  });
});
