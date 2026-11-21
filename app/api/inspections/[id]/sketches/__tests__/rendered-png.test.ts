/**
 * Canonical report PNGs are rendered server-side from saved geometry. Client
 * image bytes/locators are never accepted as report evidence.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const storeVerifiedCleanRender = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// D-028: create/update handlers gate on assertInspectionAssignedWrite.
vi.mock("@/lib/auth/assert-tenancy", () => ({
  // D-028: scoped writes run their work against the mocked client here;
  // the claim itself is proven against Postgres in the integration table.
  writeWithinInspectionScope: async (
    _scope: unknown,
    _data: unknown,
    work: (tx: unknown) => unknown,
  ) => work(scopePrisma),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "insp-1" },
      inspectionManyWhere: { id: "insp-1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  })),
}));
vi.mock("@/lib/sketch/server-clean-render", () => ({ storeVerifiedCleanRender }));
vi.mock("@/lib/supabase-server", () => ({
  isSupabaseServerConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
    },
    sketchUnderlayReference: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    material: { findMany: vi.fn() },
    sketchElement: { deleteMany: vi.fn(), createMany: vi.fn() },
    sketchMoistureReading: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async () => []),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isSupabaseServerConfigured } from "@/lib/supabase-server";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  material: { findMany: ReturnType<typeof vi.fn> };
  sketchUnderlayReference: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.material.findMany.mockResolvedValue([]);
  storeVerifiedCleanRender.mockResolvedValue({
    storagePath: `inspections/i1/exports/verified/floor-0-${"b".repeat(64)}.png`,
    storageLocator: `storage://sketch-media/inspections/i1/exports/verified/floor-0-${"b".repeat(64)}.png`,
    renderSha256: "b".repeat(64),
  });
});

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/sketches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PNG_URL = "storage://sketch-media/inspections/i1/exports/floor-0.png";

describe("sketch POST → renderedPngUrl persistence", () => {
  it("rejects a client-supplied render locator before database writes", async () => {
    const res = await POST(makePost({ floorNumber: 0, renderedPngUrl: PNG_URL }), {
      params: Promise.resolve({ id: "i1" }),
    });

    expect(res.status).toBe(409);
    expect(p.claimSketch.create).not.toHaveBeenCalled();
    expect(p.claimSketch.update).not.toHaveBeenCalled();
  });

  it("stores only a source-free server render for a manual sketch", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_1" });
    const sketchData = { objects: [] };

    const res = await POST(
      makePost({ floorNumber: 0, sketchData, requestCanonicalRender: true }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(res.status).toBe(201);
    expect(storeVerifiedCleanRender).toHaveBeenCalledWith("i1", 0, sketchData);
    expect(p.claimSketch.create.mock.calls[0][0].data.renderedPngUrl).toBe(
      `storage://sketch-media/inspections/i1/exports/verified/floor-0-${"b".repeat(64)}.png`,
    );
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

  it("revokes previous underlay verification before saving a new blob", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_3" });
    p.sketchUnderlayReference.findFirst.mockResolvedValueOnce({ id: "reference-1" });

    const response = await POST(
      makePost({ floorNumber: 0, sketchData: { objects: [] } }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    expect(p.sketchUnderlayReference.update).toHaveBeenCalledWith({
      where: { id: "reference-1" },
      data: {
        verifiedByUserId: null,
        verifiedAt: null,
        verificationMethod: null,
        verificationJson: null,
      },
    });
  });

  it("creates a source-free server render after underlay verification", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_4" });
    p.sketchUnderlayReference.findFirst.mockResolvedValueOnce({ id: "reference-2" });
    const sketchData = {
      raSketchMeta: { fieldComplete: true },
      scaleConfig: {
        pxPerMetre: 100,
        description: "Known wall = 4 m",
        pointA: { x: 0, y: 0 },
        pointB: { x: 400, y: 0 },
        realMetres: 4,
      },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
          ],
          data: { type: "room", provenance: "operator_measured" },
        },
      ],
    };

    const response = await POST(
      makePost({
        floorNumber: 0,
        sketchData,
        requestCanonicalRender: true,
        confirmUnderlayVerification: true,
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    expect(storeVerifiedCleanRender).toHaveBeenCalledWith("i1", 0, sketchData);
    expect(p.claimSketch.create.mock.calls[0][0].data.renderedPngUrl).toBe(
      `storage://sketch-media/inspections/i1/exports/verified/floor-0-${"b".repeat(64)}.png`,
    );
  });

  it("RA-7617: requests a canonical render for an untagged room", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_untagged" });
    const sketchData = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
          ],
          data: { type: "room", label: "Legacy" },
        },
      ],
    };

    const response = await POST(
      makePost({
        floorNumber: 0,
        sketchData,
        requestCanonicalRender: true,
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    // RA-8239: rendered from the server-trusted drawing, where the legacy
    // untagged room resolves as technician-measured, so it still prints.
    const rendered = storeVerifiedCleanRender.mock.calls[0][2] as {
      objects: Array<{ data: Record<string, unknown> }>;
    };
    expect(rendered.objects).toHaveLength(1);
    expect(rendered.objects[0].data).toMatchObject({
      type: "room",
      label: "Legacy",
      provenance: "operator_measured",
    });
  });

  it("RA-8239: renders the server-trusted provenance, not the tag the client posted", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_ai" });
    // The Vision import recorded this room id as an AI suggestion on the job.
    p.claimSketch.findMany.mockResolvedValueOnce([
      { sketchData: { raSketchMeta: { aiSuggestedRoomIds: ["room-ai"] } } },
    ]);
    const sketchData = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
          ],
          // The client claims it was measured; it was never confirmed.
          data: { type: "room", id: "room-ai", label: "Bed 2", provenance: "operator_measured" },
        },
      ],
    };

    const response = await POST(
      makePost({ floorNumber: 0, sketchData, requestCanonicalRender: true }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    const rendered = storeVerifiedCleanRender.mock.calls[0][2] as {
      objects: Array<{ data: Record<string, unknown> }>;
    };
    expect(rendered.objects[0].data.provenance).toBe("ai_suggested");
  });

  it("still saves geometry when sketch storage is not configured", async () => {
    (isSupabaseServerConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      false,
    );
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_local" });

    const response = await POST(
      makePost({
        floorNumber: 0,
        sketchData: { objects: [{ type: "rect", data: { type: "room" } }] },
        requestCanonicalRender: true,
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    expect(storeVerifiedCleanRender).not.toHaveBeenCalled();
    const json = await response.json();
    expect(json._saveMeta?.canonicalRender?.status).toBe("skipped");
  });
});
