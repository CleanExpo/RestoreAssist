/**
 * RA-7610: the drying-status query uses sketchRoomId when present, falling
 * back to today's free-text location when null. On main the select does not
 * load the room, so a linked reading still reports as "North Wall".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockAssertTenancy = vi.fn();
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => mockAssertTenancy(...a),
}));

const mockMoistureFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      findMany: (...a: unknown[]) => mockMoistureFindMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function req() {
  return new NextRequest("http://localhost/api/inspections/i1/drying-status");
}
const ctx = { params: Promise.resolve({ id: "i1" }) };

describe("GET /api/inspections/[id]/drying-status — RA-7610 room link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names a wet reading after its SketchRoom when sketchRoomId is set", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true });
    mockMoistureFindMany.mockResolvedValue([
      {
        location: "Ref",
        sketchRoomId: null,
        sketchRoom: null,
        surfaceType: "drywall",
        moistureLevel: 0.4,
        unit: "PERCENT_MC",
        isBaseline: true,
      },
      {
        location: "North Wall",
        sketchRoomId: "sr-living",
        sketchRoom: { name: "Living room" },
        surfaceType: "drywall",
        moistureLevel: 22,
        unit: "PERCENT_MC",
        isBaseline: false,
      },
    ]);
    const { GET } = await import("../drying-status/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.wet[0].location).toBe("Living room");

    const findArgs = mockMoistureFindMany.mock.calls[0]?.[0] as {
      select: { sketchRoomId?: boolean; sketchRoom?: unknown };
    };
    expect(findArgs.select.sketchRoomId).toBe(true);
  });
});
