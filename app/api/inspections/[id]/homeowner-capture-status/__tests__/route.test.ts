import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: { findMany: vi.fn() },
    captureToken: { count: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mRead = assertInspectionReadable as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: { findMany: ReturnType<typeof vi.fn> };
  captureToken: { count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1" } });
  mRead.mockResolvedValue({ ok: true });
  p.claimSketch.findMany.mockResolvedValue([]);
  p.captureToken.count.mockResolvedValue(0);
});

const req = () =>
  new NextRequest(
    "http://localhost/api/inspections/i1/homeowner-capture-status",
  );
const params = { params: Promise.resolve({ id: "i1" }) };

describe("GET homeowner-capture-status", () => {
  it("401 without session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await GET(req(), params)).status).toBe(401);
  });

  it("returns pending summary", async () => {
    p.claimSketch.findMany.mockResolvedValue([
      {
        floorNumber: 0,
        floorLabel: "Ground",
        pendingHomeownerCapture: {
          sketchData: {
            objects: [{ data: { type: "room", id: "r1" } }],
          },
        },
        sketchData: null,
      },
    ]);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { pendingFloors: number } };
    expect(json.data.pendingFloors).toBe(1);
  });

  it("403 when tenancy fails", async () => {
    mRead.mockResolvedValueOnce({ ok: false, status: 403, reason: "nope" });
    expect((await GET(req(), params)).status).toBe(403);
  });

  it("includes promoted rooms needing measurement", async () => {
    p.claimSketch.findMany.mockResolvedValue([
      {
        floorNumber: 0,
        floorLabel: "Ground",
        pendingHomeownerCapture: null,
        sketchData: {
          objects: [
            {
              data: {
                type: "room",
                id: "ai-1",
                label: "Bed",
                provenance: "ai_suggested",
              },
            },
          ],
        },
      },
    ]);
    const res = await GET(req(), params);
    const json = (await res.json()) as {
      data: { roomsNeedingMeasurement: number; measurementRooms: unknown[] };
    };
    expect(json.data.roomsNeedingMeasurement).toBe(1);
    expect(json.data.measurementRooms[0]).toMatchObject({ id: "ai-1" });
  });
});
