/**
 * RA-7640 — the sketch PDF route hands the photo-AI asbestos latch to the
 * generator. The generator's own tests (lib/__tests__/generate-sketch-pdf)
 * prove the annex prints the flag; this proves the route reads the latch and
 * passes it on. Prisma is mocked, so the `where` filter is asserted as the
 * argument the route sends, not executed.
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
    inspection: { findUnique: vi.fn() },
    material: { findMany: vi.fn() },
    claimSketch: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/generate-sketch-pdf", () => ({
  generateSketchPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: vi.fn(async () => [
    { label: "Ground", pngDataUrl: "data:image/png;base64,AA==" },
  ]),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateSketchPdf } from "@/lib/generate-sketch-pdf";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockGenerate = generateSketchPdf as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  material: { findMany: ReturnType<typeof vi.fn> };
  claimSketch: { findMany: ReturnType<typeof vi.fn> };
};

const LATCHED_PHOTO = {
  metadata: { photoAi: { whsLatch: { aiRaisedAcm: true } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.inspection.findUnique.mockResolvedValue({
    id: "i1",
    propertyAddress: "1 Test St",
    photos: [],
  });
  p.material.findMany.mockResolvedValue([
    { slug: "timber-framing", name: "Timber framing", isPotentialAcm: false },
  ]);
  p.claimSketch.findMany.mockResolvedValue([
    { floorLabel: "Ground", moisturePoints: [], country: "AU" },
  ]);
});

const post = () =>
  new NextRequest("http://localhost/api/inspections/i1/sketches/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ floors: [] }),
  });

const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST sketches/pdf — photo-AI asbestos latch (RA-7640)", () => {
  it("asks the database only for photos whose AI latch is raised", async () => {
    await POST(post(), params);
    const arg = p.inspection.findUnique.mock.calls[0][0];
    expect(arg.select.photos).toEqual({
      where: {
        metadata: {
          path: ["photoAi", "whsLatch", "aiRaisedAcm"],
          equals: true,
        },
      },
      select: { metadata: true },
      take: 1,
    });
  });

  it("passes the raised latch to the PDF generator", async () => {
    p.inspection.findUnique.mockResolvedValue({
      id: "i1",
      propertyAddress: "1 Test St",
      photos: [LATCHED_PHOTO],
    });
    const res = await POST(post(), params);
    expect(res.status).toBe(200);
    expect(mockGenerate.mock.calls[0][0].aiRaisedAcm).toBe(true);
  });

  it("passes false when no photo carries the latch", async () => {
    const res = await POST(post(), params);
    expect(res.status).toBe(200);
    expect(mockGenerate.mock.calls[0][0].aiRaisedAcm).toBe(false);
  });
});
