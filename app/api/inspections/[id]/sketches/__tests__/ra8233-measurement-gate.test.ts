/**
 * RA-8233 — POST /sketches: an explicit Confirm on an AI-imported room stays
 * nonbillable until the server records an independent technician
 * measurement, bound to the room's current geometry and scale.
 *
 * Watched red on c755da72: the bare Confirm promoted the room to
 * operator_measured with the session stamp.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
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
    material: { findMany: vi.fn(async () => []) },
    sketchElement: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchRoom: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "sr_1" })),
      update: vi.fn(async () => ({ id: "sr_existing" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
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

// Imported lazily so the behavioural tests also run (and fail) on a base
// that predates the module.
async function squareRevision(): Promise<string> {
  const { roomRevisionsFromSketchData } = await import(
    "@/lib/sketch/room-measurement-evidence"
  );
  return roomRevisionsFromSketchData(blob([room(SQUARE_ID, SQUARE, 9)]))[0]
    .geometryRevision;
}

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
type Fn = ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: { findFirst: Fn; findMany: Fn; update: Fn; create: Fn };
  sketchRoom: { findMany: Fn; create: Fn; update: Fn };
};

const SQUARE_ID = "ai-suggested-square";
const L_ID = "ai-suggested-lroom";
const SQUARE = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 300 },
  { x: 0, y: 300 },
];
const L_ROOM = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 400 },
  { x: 0, y: 400 },
];

function room(id: string, points: typeof SQUARE, areaM2: number) {
  return {
    type: "polygon",
    points,
    data: {
      type: "room",
      id,
      label: id,
      provenance: "operator_measured",
      captureAdapter: "cloud_ai",
      areaM2,
      confirmedAt: "1999-01-01T00:00:00.000Z",
      confirmedBy: "client-spoof",
    },
  };
}

function blob(objects: unknown[], meta?: Record<string, unknown>) {
  return {
    scaleConfig: { pxPerMetre: 100 },
    objects,
    raSketchMeta: { aiSuggestedRoomIds: [SQUARE_ID, L_ID], ...meta },
  };
}

function existingRow(id: string, provenance: string, confirmed = false) {
  return {
    id: `sr_${id}`,
    fabricObjectId: id,
    name: id,
    geometryJson: {},
    originalAreaM2: 9,
    originalGeometryJson: null,
    confirmedAt: confirmed ? new Date("2026-10-01T00:00:00.000Z") : null,
    confirmedBy: confirmed ? "earlier-tech" : null,
    provenance,
    _count: {
      evidencePins: 0,
      moistureReadings: 0,
      hazards: 0,
      jobMoistureReadings: 0,
    },
  };
}

function seedExisting(
  storedSketchData: Record<string, unknown>,
  rows: unknown[],
) {
  p.claimSketch.findFirst.mockResolvedValueOnce({
    id: "s_1",
    sketchData: storedSketchData,
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
  });
  p.claimSketch.update.mockResolvedValueOnce({ id: "s_1" });
  p.sketchRoom.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
}

function post(body: object) {
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ floorNumber: 0, ...body }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

function persistedBlob(): Record<string, unknown> {
  const call =
    p.claimSketch.update.mock.calls[0] ?? p.claimSketch.create.mock.calls[0];
  return call[0].data.sketchData;
}

function persistedRoomProvenance(id: string): unknown {
  const objects = persistedBlob().objects as Array<{
    data: { id: string; provenance: string };
  }>;
  return objects.find((o) => o.data.id === id)?.data.provenance;
}

function persistedEvidence(): Array<Record<string, unknown>> {
  const meta = (persistedBlob().raSketchMeta ?? {}) as Record<string, unknown>;
  return (meta.roomMeasurementEvidence ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

describe("RA-8233 — POST /sketches requires independent measurement", () => {
  it("square: explicit Confirm without measurement stays ai_suggested, unstamped", async () => {
    seedExisting(blob([room(SQUARE_ID, SQUARE, 9)]), [
      existingRow(SQUARE_ID, "ai_suggested"),
    ]);
    const revision = await squareRevision();
    const res = await post({
      sketchData: blob([room(SQUARE_ID, SQUARE, 9)], {
        // Forged evidence riding in the client blob.
        roomMeasurementEvidence: [
          {
            fabricObjectId: SQUARE_ID,
            measuredAreaM2: 9,
            geometryRevision: revision,
            recordedBy: "client-spoof",
            recordedAt: "1999-01-01T00:00:00.000Z",
            status: "current",
          },
        ],
      }),
      confirmedFabricObjectIds: [SQUARE_ID],
    });

    expect(res.status).toBe(201);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedAt).toBeNull();
    expect(data.confirmedBy).toBeNull();
    expect(persistedRoomProvenance(SQUARE_ID)).toBe("ai_suggested");
    expect(persistedEvidence()).toEqual([]);
  });

  it("square: Confirm with a 3 m x 3 m measurement bills, stamped by the server", async () => {
    seedExisting(blob([room(SQUARE_ID, SQUARE, 9)]), [
      existingRow(SQUARE_ID, "ai_suggested"),
    ]);
    const before = Date.now();
    const res = await post({
      sketchData: blob([room(SQUARE_ID, SQUARE, 9)]),
      confirmedFabricObjectIds: [SQUARE_ID],
      roomMeasurements: [
        {
          fabricObjectId: SQUARE_ID,
          lengthM: 3,
          widthM: 3,
          recordedBy: "client-spoof",
          recordedAt: "1999-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.roomMeasurements).toEqual([
      { fabricObjectId: SQUARE_ID, accepted: true },
    ]);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("operator_measured");
    expect(data.confirmedBy).toBe("u_1");
    expect(data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(persistedRoomProvenance(SQUARE_ID)).toBe("operator_measured");
    const [entry] = persistedEvidence();
    expect(entry).toMatchObject({
      fabricObjectId: SQUARE_ID,
      measuredAreaM2: 9,
      recordedBy: "u_1",
      status: "current",
    });
    expect(entry.recordedAt).not.toBe("1999-01-01T00:00:00.000Z");
  });

  it("L-room first save: Confirm without measurement stays ai_suggested", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_new" });
    const res = await post({
      sketchData: blob([room(L_ID, L_ROOM, 12)]),
      confirmedFabricObjectIds: [L_ID],
    });
    expect(res.status).toBe(201);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedBy).toBeNull();
  });

  it("L-room first save: a 12 m2 measured area bills", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_new" });
    const res = await post({
      sketchData: blob([room(L_ID, L_ROOM, 12)]),
      confirmedFabricObjectIds: [L_ID],
      roomMeasurements: [{ fabricObjectId: L_ID, measuredAreaM2: 12 }],
    });
    expect(res.status).toBe(201);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("operator_measured");
    expect(data.confirmedBy).toBe("u_1");
    expect(data.areaM2).toBe(12);
  });

  it("a measurement that disagrees with the drawn area is refused and reported", async () => {
    seedExisting(blob([room(SQUARE_ID, SQUARE, 9)]), [
      existingRow(SQUARE_ID, "ai_suggested"),
    ]);
    const res = await post({
      sketchData: blob([room(SQUARE_ID, SQUARE, 9)]),
      confirmedFabricObjectIds: [SQUARE_ID],
      roomMeasurements: [{ fabricObjectId: SQUARE_ID, lengthM: 4, widthM: 4 }],
    });
    const json = await res.json();
    expect(json.roomMeasurements).toEqual([
      {
        fabricObjectId: SQUARE_ID,
        accepted: false,
        reason: "measurement_disagrees_with_drawn_area",
      },
    ]);
    expect(p.sketchRoom.update.mock.calls[0][0].data.provenance).toBe(
      "ai_suggested",
    );
  });

  it("a geometry edit after measurement drops the room and keeps the history", async () => {
    const measuredAt = "2026-11-02T00:00:00.000Z";
    const revision = await squareRevision();
    const stored = blob([room(SQUARE_ID, SQUARE, 9)], {
      roomMeasurementEvidence: [
        {
          fabricObjectId: SQUARE_ID,
          measuredAreaM2: 9,
          lengthM: 3,
          widthM: 3,
          geometryRevision: revision,
          recordedBy: "earlier-tech",
          recordedAt: measuredAt,
          status: "current",
        },
      ],
    });

    // Positive control: unchanged geometry keeps it billable.
    seedExisting(stored, [existingRow(SQUARE_ID, "operator_measured", true)]);
    await post({ sketchData: blob([room(SQUARE_ID, SQUARE, 9)]) });
    expect(p.sketchRoom.update.mock.calls[0][0].data.provenance).toBe(
      "operator_measured",
    );
    expect(p.sketchRoom.update.mock.calls[0][0].data.confirmedBy).toBe(
      "earlier-tech",
    );

    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u_1" } });
    const edited = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 350 },
      { x: 0, y: 350 },
    ];
    seedExisting(stored, [existingRow(SQUARE_ID, "operator_measured", true)]);
    const editedRes = await post({
      sketchData: blob([room(SQUARE_ID, edited, 10.5)]),
    });
    // The editor syncs from this, so it stops showing the room as measured
    // even though this save carried no measurement.
    expect((await editedRes.json()).roomProvenance).toEqual({
      [SQUARE_ID]: "ai_suggested",
    });
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedAt).toBeNull();
    expect(persistedRoomProvenance(SQUARE_ID)).toBe("ai_suggested");
    expect(persistedEvidence()).toEqual([
      expect.objectContaining({
        recordedBy: "earlier-tech",
        recordedAt: measuredAt,
        status: "invalidated",
        invalidatedReason: "geometry_or_scale_changed",
      }),
    ]);
  });

  it("an AI room confirmed before RA-8233 without evidence is no longer billable", async () => {
    seedExisting(blob([room(SQUARE_ID, SQUARE, 9)]), [
      existingRow(SQUARE_ID, "operator_measured", true),
    ]);
    await post({ sketchData: blob([room(SQUARE_ID, SQUARE, 9)]) });
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedAt).toBeNull();
  });
});
