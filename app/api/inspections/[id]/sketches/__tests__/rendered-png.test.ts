/**
 * PR2 (RA-120) — POST /api/inspections/[id]/sketches persists the client-
 * rasterised floor PNG (renderedPngUrl) so the canonical report can embed it.
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

const PNG_URL = "https://x/inspections/i1/exports/floor-0.png";

describe("sketch POST → renderedPngUrl persistence", () => {
  it("stores renderedPngUrl when creating a new floor sketch", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_1" });

    const res = await POST(makePost({ floorNumber: 0, renderedPngUrl: PNG_URL }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(res.status).toBe(201);
    expect(p.claimSketch.create.mock.calls[0][0].data).toMatchObject({
      renderedPngUrl: PNG_URL,
    });
  });

  it("stores renderedPngUrl when updating an existing floor sketch", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_existing",
      updatedAt: new Date("2026-01-01"),
    });
    p.claimSketch.update.mockResolvedValueOnce({ id: "s_existing" });

    const res = await POST(makePost({ floorNumber: 0, renderedPngUrl: PNG_URL }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data).toMatchObject({
      renderedPngUrl: PNG_URL,
    });
  });

  it("leaves renderedPngUrl untouched when the field is omitted", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_2" });

    await POST(makePost({ floorNumber: 1 }), {
      params: Promise.resolve({ id: "i1" }),
    });

    // undefined → Prisma leaves the column as-is (no accidental null wipe).
    expect(p.claimSketch.create.mock.calls[0][0].data.renderedPngUrl).toBeUndefined();
  });
});
