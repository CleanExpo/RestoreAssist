/**
 * PR4 (RA-120) — POST /api/inspections/[id]/sketches persists per-floor underlay
 * opacity (clamped 0..1) so the slider value survives reload (was React-only).
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
    sketchMoistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async () => []),
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.material.findMany.mockResolvedValue([]);
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sketch POST → backgroundImageOpacity persistence", () => {
  it("stores a valid opacity on create", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(
      makePost({ floorNumber: 0, backgroundImageOpacity: 0.6 }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(p.claimSketch.create.mock.calls[0][0].data.backgroundImageOpacity).toBe(0.6);
  });

  it("clamps out-of-range opacity into 0..1", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_x",
      updatedAt: new Date("2026-01-01"),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_x" });

    await POST(makePost({ floorNumber: 0, backgroundImageOpacity: 1.5 }), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(p.claimSketch.update.mock.calls[0][0].data.backgroundImageOpacity).toBe(1);

    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_2" });
    await POST(makePost({ floorNumber: 1, backgroundImageOpacity: -0.2 }), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(p.claimSketch.create.mock.calls[0][0].data.backgroundImageOpacity).toBe(0);
  });

  it("leaves opacity untouched when the field is omitted", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_3" });

    await POST(makePost({ floorNumber: 2 }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(
      p.claimSketch.create.mock.calls[0][0].data.backgroundImageOpacity,
    ).toBeUndefined();
  });
});
