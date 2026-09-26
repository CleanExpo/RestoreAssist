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

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockTenancy = assertInspectionTenancy as unknown as ReturnType<
  typeof vi.fn
>;

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  material: { findMany: ReturnType<typeof vi.fn> };
  claimSketch: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.inspection.findUnique.mockResolvedValue({ propertyAddress: "1 Test St" });
  p.material.findMany.mockResolvedValue([
    { slug: "fibro", name: "Fibro", isPotentialAcm: true },
  ]);
  p.claimSketch.findMany.mockResolvedValue([
    { moisturePoints: [], country: "AU" },
  ]);
});

const FLOORS = [
  {
    label: "Ground",
    fabricJson: {
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 400 },
            { x: 0, y: 400 },
          ],
          data: {
            type: "room",
            material: "fibro",
            label: "Bathroom",
            provenance: "operator_measured",
          },
        },
      ],
    },
  },
];

const post = (body: object) =>
  new NextRequest("http://localhost/api/inspections/i1/sketches/scope-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST scope-report", () => {
  it("returns structured + narrative together in one call", async () => {
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.structured.schemaVersion).toBe("1.1");
    expect(body.structured.floors[0].rooms[0].areaM2).toBeCloseTo(12, 5);
    expect(body.narrative).toContain("# Scope of Works");
    expect(body.narrative).toContain("ANSI/IICRC S500:2021");
  });

  it("RA-7617: bills an untagged legacy room the same as a tagged one", async () => {
    const untagged = [
      {
        label: "Ground",
        fabricJson: {
          objects: [
            {
              type: "polygon",
              points: [
                { x: 0, y: 0 },
                { x: 300, y: 0 },
                { x: 300, y: 400 },
                { x: 0, y: 400 },
              ],
              data: {
                type: "room",
                material: "fibro",
                label: "Legacy Bathroom",
              },
            },
          ],
        },
      },
    ];
    const res = await POST(post({ floors: untagged }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.structured.floors[0].rooms[0].areaM2).toBeCloseTo(12, 5);
    expect(body.narrative).toContain("Legacy Bathroom");
  });

  it("422 when floors[] is missing", async () => {
    const res = await POST(post({}), params);
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(401);
  });

  it("403 when the caller fails the inspection tenancy check", async () => {
    mockTenancy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(403);
  });
});

// RA-7640 — a room flagged by photo AI or an accepted voice note stays flagged
// in the handover document, whatever material it carries now.
describe("POST scope-report — raise-only ACM latches (RA-7640)", () => {
  const LATCHED_PHOTO = {
    metadata: { photoAi: { whsLatch: { aiRaisedAcm: true } } },
  };
  const nonAcmFloors = (extra: Record<string, unknown> = {}) => [
    {
      ...FLOORS[0],
      fabricJson: {
        objects: [
          {
            ...FLOORS[0].fabricJson.objects[0],
            data: {
              type: "room",
              material: "timber-framing",
              label: "Laundry",
              provenance: "operator_measured",
              ...extra,
            },
          },
        ],
      },
    },
  ];

  beforeEach(() => {
    p.material.findMany.mockResolvedValue([
      { slug: "fibro", name: "Fibro", isPotentialAcm: true },
      { slug: "timber-framing", name: "Timber framing", isPotentialAcm: false },
    ]);
  });

  it("asks the database only for photos whose AI latch is raised", async () => {
    await POST(post({ floors: nonAcmFloors() }), params);
    const arg = p.inspection.findUnique.mock.calls[0][0];
    expect(arg.select.photos).toEqual({
      where: {
        metadata: { path: ["photoAi", "whsLatch", "aiRaisedAcm"], equals: true },
      },
      select: { metadata: true },
      take: 1,
    });
  });

  it("flags a non-ACM room when photo AI raised the latch on the job", async () => {
    p.inspection.findUnique.mockResolvedValue({
      propertyAddress: "1 Test St",
      photos: [LATCHED_PHOTO],
    });
    const res = await POST(post({ floors: nonAcmFloors() }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.structured.compliance.acmElements).toEqual(["Laundry"]);
  });

  it("flags a non-ACM room whose voice latch is set", async () => {
    const res = await POST(
      post({ floors: nonAcmFloors({ voiceRaisedAcm: true }) }),
      params,
    );
    const body = await res.json();
    expect(body.structured.compliance.acmElements).toEqual(["Laundry"]);
  });

  it("shows no flag for a non-ACM room with neither latch", async () => {
    p.inspection.findUnique.mockResolvedValue({
      propertyAddress: "1 Test St",
      photos: [],
    });
    const res = await POST(post({ floors: nonAcmFloors() }), params);
    const body = await res.json();
    expect(body.structured.compliance.acmElements).toEqual([]);
  });
});
