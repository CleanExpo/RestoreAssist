/**
 * RA-7617 — the server must not trust a client-sent provenance tag.
 *
 * Confirm is a re-POST of /sketches with the room tagged operator_measured.
 * These cases fail on current main: the save path copies the client tag
 * into SketchRoom.provenance and will stamp confirm from client-supplied
 * confirmedAt even when the room is still ai_suggested.
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
import { isOperatorMeasuredProvenance } from "@/lib/sketch/measured-provenance";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
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

function roomObject(
  id: string,
  provenance: string | undefined,
  extra?: Record<string, unknown>,
) {
  return {
    type: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
      { x: 0, y: 400 },
    ],
    data: {
      type: "room",
      id,
      label: "Lounge",
      areaM2: 12,
      ...(provenance !== undefined ? { provenance } : {}),
      ...extra,
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

function existingSketch(overrides?: Record<string, unknown>) {
  return {
    id: "s_1",
    sketchData: { objects: [] },
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    ...overrides,
  };
}

function existingRoom(overrides?: Record<string, unknown>) {
  return {
    id: "sr_existing",
    fabricObjectId: "ai-room-1",
    name: "Lounge",
    geometryJson: {},
    originalAreaM2: 12,
    originalGeometryJson: null,
    confirmedAt: null,
    confirmedBy: null,
    provenance: "ai_suggested",
    _count: { evidencePins: 0, moistureReadings: 0, hazards: 0 },
    ...overrides,
  };
}

async function postRooms(
  objects: object[],
  sketch = existingSketch(),
  rooms: object[] = [existingRoom()],
  extraBody: Record<string, unknown> = {},
) {
  p.claimSketch.findFirst.mockResolvedValueOnce(sketch);
  p.claimSketch.update.mockResolvedValueOnce({ id: sketch.id });
  p.sketchRoom.findMany
    .mockResolvedValueOnce(rooms)
    .mockResolvedValueOnce([]);
  return POST(
    makePost({
      floorNumber: 0,
      sketchData: { scaleConfig: { pxPerMetre: 100 }, objects },
      ...extraBody,
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

describe("RA-7617 — server does not trust the client provenance tag", () => {
  it("confirms an existing ai_suggested room only when the client sends operator_measured, and stamps the session", async () => {
    const before = Date.now();
    const res = await postRooms([
      roomObject("ai-room-1", "operator_measured"),
    ]);
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(p.sketchRoom.update).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("operator_measured");
    expect(data.confirmedBy).toBe("u_1");
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.confirmedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("refuses to silently re-tag an existing ai_suggested room as underlay_reference", async () => {
    const res = await postRooms([
      roomObject("ai-room-1", "underlay_reference"),
    ]);

    expect(res.status).toBe(201);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedAt).toBeNull();
    expect(data.confirmedBy).toBeNull();
  });

  it("never downgrades an operator_measured room back to ai_suggested", async () => {
    const originalAt = new Date("2026-09-20T08:00:00.000Z");
    const res = await postRooms(
      [roomObject("ai-room-1", "ai_suggested")],
      existingSketch(),
      [
        existingRoom({
          provenance: "operator_measured",
          confirmedAt: originalAt,
          confirmedBy: "original-tech",
        }),
      ],
    );

    expect(res.status).toBe(201);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.provenance).toBe("operator_measured");
    expect(data.confirmedBy).toBe("original-tech");
    expect(data.confirmedAt).toBe(originalAt);
  });

  it("first save of a server-remembered AI room cannot claim operator_measured", async () => {
    const res = await postRooms(
      [roomObject("ai-room-1", "operator_measured")],
      existingSketch({
        sketchData: {
          raSketchMeta: { aiSuggestedRoomIds: ["ai-room-1"] },
          objects: [],
        },
      }),
      [],
    );

    expect(res.status).toBe(201);
    expect(p.sketchRoom.create).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(data.confirmedAt).toBeNull();
    expect(data.confirmedBy).toBeNull();
  });

  it("import then confirm before any save lands still bills the room", async () => {
    const before = Date.now();
    const res = await postRooms(
      [roomObject("ai-room-1", "operator_measured")],
      existingSketch({
        sketchData: {
          raSketchMeta: { aiSuggestedRoomIds: ["ai-room-1"] },
          objects: [],
        },
      }),
      [],
      { confirmedFabricObjectIds: ["ai-room-1"] },
    );
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(p.sketchRoom.create).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("operator_measured");
    expect(isOperatorMeasuredProvenance(data.provenance)).toBe(true);
    expect(data.confirmedBy).toBe("u_1");
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.confirmedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("remembers AI room ids across the whole inspection, not only the posted floor", async () => {
    p.claimSketch.findMany.mockResolvedValueOnce([
      {
        sketchData: {
          raSketchMeta: { aiSuggestedRoomIds: ["ai-room-1"] },
        },
      },
    ]);
    const res = await postRooms(
      [roomObject("ai-room-1", "operator_measured")],
      existingSketch({
        sketchData: { objects: [] },
      }),
      [],
    );

    expect(res.status).toBe(201);
    expect(p.sketchRoom.create).toHaveBeenCalledTimes(1);
    const data = p.sketchRoom.create.mock.calls[0][0].data;
    expect(data.provenance).toBe("ai_suggested");
    expect(isOperatorMeasuredProvenance(data.provenance)).toBe(false);
    expect(data.confirmedAt).toBeNull();
  });
});

describe("RA-7617 — already-confirmed rooms are never re-stamped", () => {
  it("keeps the original confirmedAt/confirmedBy when a different user saves the floor", async () => {
    mockSession.mockResolvedValue({ user: { id: "u_later" } });
    const originalAt = new Date("2026-09-20T08:00:00.000Z");
    const res = await postRooms(
      [
        roomObject("ai-room-1", "operator_measured", {
          confirmedAt: "1999-01-01T00:00:00.000Z",
          confirmedBy: "client-spoof",
        }),
      ],
      existingSketch(),
      [
        existingRoom({
          provenance: "operator_measured",
          confirmedAt: originalAt,
          confirmedBy: "original-tech",
        }),
      ],
    );

    expect(res.status).toBe(201);
    const data = p.sketchRoom.update.mock.calls[0][0].data;
    expect(data.confirmedBy).toBe("original-tech");
    expect(data.confirmedBy).not.toBe("u_later");
    expect(data.confirmedAt).toBe(originalAt);
  });
});
