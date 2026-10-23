/**
 * RA-7656 — an empty save never deletes or detaches floor-plan rooms.
 *
 * The route keeps the stored drawing when a save arrives with no canvas
 * objects (a disposed Fabric canvas posts an empty blob). Room sync and the
 * SketchElement rebuild must honour the same decision: reconciling the room
 * graph against an empty blob makes every stored room look removed, so the
 * owner's save deleted them and the technician's detached them, while the
 * drawing that still shows them survived.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma as scopePrisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const gate = vi.hoisted(() => ({ viaAssignment: false, storageConfigured: false }));
const render = vi.hoisted(() => ({
  storeVerifiedCleanRender: vi.fn(async () => ({
    storagePath: "inspections/i1/exports/verified/floor-0-new.png",
    storageLocator: "storage://sketch-media/inspections/i1/exports/verified/floor-0-new.png",
    renderSha256: "new",
  })),
}));

vi.mock("@/lib/supabase-server", () => ({
  isSupabaseServerConfigured: () => gate.storageConfigured,
}));
vi.mock("@/lib/sketch/server-clean-render", () => render);
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
      viaAssignment: gate.viaAssignment,
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
    sketchUnderlayReference: { findFirst: vi.fn(async () => null), update: vi.fn() },
    material: { findMany: vi.fn(async () => []) },
    sketchElement: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchRoom: {
      findMany: vi.fn(),
      create: vi.fn(async () => ({ id: "sr_new" })),
      update: vi.fn(async () => ({ id: "sr_existing" })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchMoistureReading: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

type Fn = ReturnType<typeof vi.fn>;
const mockSession = getServerSession as unknown as Fn;
const p = prisma as unknown as {
  claimSketch: { findFirst: Fn; update: Fn };
  sketchElement: { deleteMany: Fn; createMany: Fn };
  sketchRoom: { findMany: Fn; create: Fn; update: Fn; deleteMany: Fn; updateMany: Fn };
  sketchMoistureReading: { findMany: Fn; deleteMany: Fn; createMany: Fn };
};

function roomObject(id: string, label: string, x: number) {
  return {
    type: "polygon",
    left: x,
    top: 0,
    points: [
      { x, y: 0 },
      { x: x + 300, y: 0 },
      { x: x + 300, y: 300 },
      { x, y: 300 },
    ],
    data: { type: "room", id, label, provenance: "operator_measured" },
  };
}

const kitchen = roomObject("room-kitchen", "Kitchen", 0);
const laundry = roomObject("room-laundry", "Laundry", 400);

/** Kitchen holds no evidence (the owner's sync would delete it); Laundry holds a pin (it would be detached). */
const storedRooms = [
  {
    id: "sr_kitchen",
    fabricObjectId: "room-kitchen",
    name: "Kitchen",
    geometryJson: kitchen,
    originalAreaM2: 9,
    originalGeometryJson: null,
    confirmedAt: null,
    confirmedBy: null,
    provenance: "operator_measured",
    counts: { evidencePins: 0, moistureReadings: 0, hazards: 0, jobMoistureReadings: 0 },
  },
  {
    id: "sr_laundry",
    fabricObjectId: "room-laundry",
    name: "Laundry",
    geometryJson: laundry,
    originalAreaM2: 9,
    originalGeometryJson: null,
    confirmedAt: null,
    confirmedBy: null,
    provenance: "operator_measured",
    counts: { evidencePins: 1, moistureReadings: 0, hazards: 0, jobMoistureReadings: 0 },
  },
];

function projectRooms(args: { select?: { _count?: unknown } }) {
  if (args?.select?._count) {
    return storedRooms.map(({ counts, ...r }) => ({ ...r, _count: counts }));
  }
  return storedRooms.map(({ id, name, fabricObjectId, geometryJson }) => ({
    id,
    name,
    fabricObjectId,
    geometryJson,
  }));
}

const NO_SKETCH_DATA = Symbol("missing");

function save(sketchData: unknown, extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = { floorNumber: 0, ...extra };
  if (sketchData !== NO_SKETCH_DATA) body.sketchData = sketchData;
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

function expectRoomsAndElementsUntouched() {
  expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
  expect(p.sketchRoom.updateMany).not.toHaveBeenCalled();
  expect(p.sketchElement.deleteMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.viaAssignment = false;
  gate.storageConfigured = false;
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.sketchRoom.findMany.mockImplementation(async (args) => projectRooms(args));
  p.claimSketch.findFirst.mockResolvedValue({
    id: "s_1",
    sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [kitchen, laundry] },
    moisturePoints: [{ x: 10, y: 10, wme: 22 }],
    renderedPngUrl: "storage://sketch-media/inspections/i1/exports/verified/floor-0-stored.png",
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  });
  p.claimSketch.update.mockResolvedValue({ id: "s_1" });
});

const roles = [
  { role: "owner", viaAssignment: false },
  { role: "technician", viaAssignment: true },
] as const;

describe("RA-7656 empty save", () => {
  it.each(roles)(
    "keeps the stored drawing, every room and every element ($role)",
    async ({ viaAssignment }) => {
      gate.viaAssignment = viaAssignment;
      const res = await save({ scaleConfig: { pxPerMetre: 100 }, objects: [] });

      expect(res.status).toBe(201);
      expect(p.claimSketch.update).toHaveBeenCalledTimes(1);
      expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toBeUndefined();
      expectRoomsAndElementsUntouched();
    },
  );
});

describe("RA-7656 degenerate", () => {
  const shapes: Array<[string, unknown]> = [
    ["sketchData missing", NO_SKETCH_DATA],
    ["sketchData null", null],
    ["sketchData {}", {}],
    ["objects null", { objects: null }],
    ["objects []", { objects: [] }],
  ];
  for (const { role, viaAssignment } of roles) {
    it.each(shapes)(`%s deletes, detaches and rebuilds nothing (${role})`, async (_label, data) => {
      gate.viaAssignment = viaAssignment;
      const res = await save(data);

      expect(res.status).toBe(201);
      expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toBeUndefined();
      expectRoomsAndElementsUntouched();
    });
  }
});

describe("RA-7656 positive control", () => {
  it("a save that removes the Kitchen deletes that room and keeps the Laundry (owner)", async () => {
    const res = await save({ scaleConfig: { pxPerMetre: 100 }, objects: [laundry] });

    expect(res.status).toBe(201);
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.deleteMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["sr_kitchen"] } },
    });
    expect(p.sketchRoom.updateMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.update).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.update.mock.calls[0][0].where).toEqual({ id: "sr_laundry" });
    expect(p.sketchElement.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("a save that removes the Kitchen detaches it instead (technician)", async () => {
    gate.viaAssignment = true;
    const res = await save({ scaleConfig: { pxPerMetre: 100 }, objects: [laundry] });

    expect(res.status).toBe(201);
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.updateMany).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sr_kitchen"] },
      detachedAt: null,
    });
  });
});

describe("RA-7656 pin readings", () => {
  it.each(roles)(
    "an empty-blob save that omits moisturePoints keeps the stored pin readings ($role)",
    async ({ viaAssignment }) => {
      gate.viaAssignment = viaAssignment;
      const res = await save({ scaleConfig: { pxPerMetre: 100 }, objects: [] });

      expect(res.status).toBe(201);
      // The stored pins column is left as it was, so the readings mirroring it must be too.
      expect(p.claimSketch.update.mock.calls[0][0].data.moisturePoints).toBeUndefined();
      expect(p.sketchMoistureReading.deleteMany).not.toHaveBeenCalled();
      expect(p.sketchMoistureReading.createMany).not.toHaveBeenCalled();
    },
  );

  it("a save that carries moisturePoints still re-syncs the pin readings (owner)", async () => {
    const res = await save(
      { scaleConfig: { pxPerMetre: 100 }, objects: [] },
      { moisturePoints: [{ x: 10, y: 10, wme: 31 }] },
    );

    expect(res.status).toBe(201);
    expect(p.sketchMoistureReading.deleteMany).toHaveBeenCalledWith({
      where: { sketchId: "s_1", source: "pin" },
    });
    expect(p.sketchMoistureReading.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("RA-7656 canonical render", () => {
  it("an empty save never renders the empty blob over the stored floor image", async () => {
    gate.storageConfigured = true;
    const res = await save(
      { scaleConfig: { pxPerMetre: 100 }, objects: [] },
      { requestCanonicalRender: true },
    );

    expect(res.status).toBe(201);
    expect(render.storeVerifiedCleanRender).not.toHaveBeenCalled();
    expect(p.claimSketch.update.mock.calls[0][0].data.renderedPngUrl).toBeUndefined();
  });

  it("a save with rooms still renders and stores the new floor image", async () => {
    gate.storageConfigured = true;
    const res = await save(
      { scaleConfig: { pxPerMetre: 100 }, objects: [kitchen, laundry] },
      { requestCanonicalRender: true },
    );

    expect(res.status).toBe(201);
    expect(render.storeVerifiedCleanRender).toHaveBeenCalledTimes(1);
    expect(p.claimSketch.update.mock.calls[0][0].data.renderedPngUrl).toBe(
      "storage://sketch-media/inspections/i1/exports/verified/floor-0-new.png",
    );
  });
});

describe("RA-7656 roomless", () => {
  const freehand = { type: "path", path: [["M", 0, 0], ["L", 50, 50]], data: { type: "freehand" } };
  const wall = { type: "line", x1: 0, y1: 0, x2: 300, y2: 0, data: { type: "wall" } };
  const door = { type: "rect", left: 10, top: 0, width: 80, height: 10, data: { type: "opening", kind: "door" } };
  const window = { type: "rect", left: 150, top: 0, width: 90, height: 10, data: { type: "opening", kind: "window" } };
  const fixture = { type: "rect", left: 40, top: 40, width: 30, height: 30, data: { type: "fixture" } };
  const damage = { type: "rect", left: 60, top: 60, width: 30, height: 30, data: { type: "damage" } };
  const text = { type: "i-text", text: "Kitchen", left: 20, top: 20, data: { type: "room-label" } };
  const shapes: Array<[string, unknown[], Record<string, unknown>]> = [
    ["freehand only", [freehand], {}],
    [
      "walls, doors, windows, fixtures, damage and text with pins but no room",
      [wall, door, window, fixture, damage, text],
      { moisturePoints: [{ x: 10, y: 10, wme: 22 }] },
    ],
  ];

  for (const { role, viaAssignment } of roles) {
    it.each(shapes)(
      `%s keeps the stored drawing, rooms and elements (${role})`,
      async (_label, objects, extra) => {
        gate.viaAssignment = viaAssignment;
        const res = await save({ scaleConfig: { pxPerMetre: 100 }, objects }, extra);

        expect(res.status).toBe(201);
        expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toBeUndefined();
        expect(p.sketchRoom.update).not.toHaveBeenCalled();
        expect(p.sketchRoom.create).not.toHaveBeenCalled();
        expectRoomsAndElementsUntouched();
      },
    );
  }

  it("the review repro: a freehand-only save with a render request keeps the drawing, rooms, elements and render", async () => {
    gate.storageConfigured = true;
    const res = await save(
      { objects: [{ type: "path", data: { type: "freehand" } }] },
      { requestCanonicalRender: true },
    );

    expect(res.status).toBe(201);
    const data = p.claimSketch.update.mock.calls[0][0].data;
    expect(data.sketchData).toBeUndefined();
    expect(data.renderedPngUrl).toBeUndefined();
    expect(render.storeVerifiedCleanRender).not.toHaveBeenCalled();
    expectRoomsAndElementsUntouched();
  });
});

describe("RA-7656 legacy", () => {
  /** A saved room polygon whose custom data Fabric 7 dropped (RA-7655). */
  const legacyPolygon = (x: number) => ({
    type: "Polygon",
    left: x,
    top: 0,
    fill: "rgba(28,46,71,0.08)",
    points: [
      { x, y: 0 },
      { x: x + 300, y: 0 },
      { x: x + 300, y: 300 },
    ],
  });
  const freehandOnly = { objects: [{ type: "path", data: { type: "freehand" } }] };

  function storeBlob(sketchData: unknown) {
    p.claimSketch.findFirst.mockResolvedValue({
      id: "s_1",
      sketchData,
      renderedPngUrl: "storage://sketch-media/inspections/i1/exports/verified/floor-0-stored.png",
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    });
  }

  function expectEverythingPreserved() {
    const data = p.claimSketch.update.mock.calls[0][0].data;
    expect(data.sketchData).toBeUndefined();
    expect(data.renderedPngUrl).toBeUndefined();
    expect(render.storeVerifiedCleanRender).not.toHaveBeenCalled();
    expectRoomsAndElementsUntouched();
  }

  it.each(roles)(
    "the review repro: legacy data-less room polygons + two room rows + a freehand-only render save keep everything ($role)",
    async ({ viaAssignment }) => {
      gate.viaAssignment = viaAssignment;
      gate.storageConfigured = true;
      storeBlob({ objects: [legacyPolygon(0), legacyPolygon(400)] });
      const res = await save(freehandOnly, { requestCanonicalRender: true });

      expect(res.status).toBe(201);
      expectEverythingPreserved();
    },
  );

  it.each(roles)(
    "room rows with an empty stored blob + a roomless save keep everything ($role)",
    async ({ viaAssignment }) => {
      gate.viaAssignment = viaAssignment;
      gate.storageConfigured = true;
      storeBlob({ objects: [] });
      const res = await save(freehandOnly, { requestCanonicalRender: true });

      expect(res.status).toBe(201);
      expectEverythingPreserved();
    },
  );

  it("legacy data-less room polygons with no room rows still keep the stored drawing and render", async () => {
    gate.storageConfigured = true;
    storeBlob({ objects: [legacyPolygon(0), legacyPolygon(400)] });
    p.sketchRoom.findMany.mockImplementation(async () => []);
    const res = await save(freehandOnly, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    expectEverythingPreserved();
  });

  it("a failed room-row read keeps the stored drawing and render (fails closed)", async () => {
    gate.storageConfigured = true;
    storeBlob({ objects: [] });
    p.sketchRoom.findMany.mockRejectedValueOnce(new Error("db down"));
    const res = await save(freehandOnly, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    expectEverythingPreserved();
  });

  it("room rows that are all detached do not block a roomless save (positive control)", async () => {
    gate.storageConfigured = true;
    storeBlob({ objects: [] });
    p.sketchRoom.findMany.mockImplementation(async (args) =>
      projectRooms(args).map((r) => ({ ...r, detachedAt: new Date("2026-10-01T00:00:00Z") })),
    );
    const res = await save(freehandOnly, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toEqual(freehandOnly);
    expect(render.storeVerifiedCleanRender).toHaveBeenCalledTimes(1);
  });
});

/**
 * Codex round 3 (e5ceacef): Clear Canvas, then a freehand stroke, posts a
 * roomless canvas. The editor marks that save with `userRemovedRooms: true`
 * and the route must honour it: save the new drawing, render it, and reconcile
 * the rooms exactly as a save that removed one room does. Without the flag the
 * RA-7656 keep behaviour above is unchanged.
 */
describe("RA-7656 user-removed-rooms intent", () => {
  /** Codex's exact editor payload from the round-3 probe. */
  const codexPayload = { objects: [{ type: "path", data: { type: "freehand" } }] };

  it("the review repro with the intent saves and renders the new drawing, deletes Kitchen and detaches Laundry (owner)", async () => {
    gate.storageConfigured = true;
    const res = await save(codexPayload, { requestCanonicalRender: true, userRemovedRooms: true });

    expect(res.status).toBe(201);
    const data = p.claimSketch.update.mock.calls[0][0].data;
    expect(data.sketchData).toEqual(codexPayload);
    expect(render.storeVerifiedCleanRender).toHaveBeenCalledTimes(1);
    expect(data.renderedPngUrl).toBe(
      "storage://sketch-media/inspections/i1/exports/verified/floor-0-new.png",
    );
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sr_kitchen"] } } });
    expect(p.sketchRoom.updateMany).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sr_laundry"] },
      detachedAt: null,
    });
    expect(p.sketchElement.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("the review repro with the intent detaches both rooms and deletes none (technician)", async () => {
    gate.viaAssignment = true;
    const res = await save(codexPayload, { requestCanonicalRender: true, userRemovedRooms: true });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toEqual(codexPayload);
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.updateMany).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sr_laundry", "sr_kitchen"] },
      detachedAt: null,
    });
  });

  it("a bare Clear Canvas (objects: []) with the intent saves the empty floor and reconciles the rooms (owner)", async () => {
    const cleared = { scaleConfig: { pxPerMetre: 100 }, objects: [] };
    const res = await save(cleared, { userRemovedRooms: true });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toEqual(cleared);
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sr_kitchen"] } } });
    expect(p.sketchRoom.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sr_laundry"] },
      detachedAt: null,
    });
  });

  it("the intent with a failed room-row read is refused non-2xx and writes nothing", async () => {
    gate.storageConfigured = true;
    p.sketchRoom.findMany.mockRejectedValueOnce(new Error("db down"));
    const res = await save(codexPayload, { requestCanonicalRender: true, userRemovedRooms: true });

    expect(res.status).toBe(503);
    expect(p.claimSketch.update).not.toHaveBeenCalled();
    expect(render.storeVerifiedCleanRender).not.toHaveBeenCalled();
    expectRoomsAndElementsUntouched();
  });

  it("the intent without an objects array is refused non-2xx and writes nothing", async () => {
    for (const shape of [NO_SKETCH_DATA, null, {}, { objects: null }]) {
      vi.clearAllMocks();
      const res = await save(shape, { userRemovedRooms: true });
      expect(res.status).toBe(400);
      expect(p.claimSketch.update).not.toHaveBeenCalled();
      expectRoomsAndElementsUntouched();
    }
  });

  it("a non-boolean intent is ignored: the roomless save keeps the stored drawing and rooms", async () => {
    for (const flag of ["true", 1, {}, [true]]) {
      vi.clearAllMocks();
      const res = await save(codexPayload, { requestCanonicalRender: true, userRemovedRooms: flag });
      expect(res.status).toBe(201);
      expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toBeUndefined();
      expectRoomsAndElementsUntouched();
    }
  });
});

describe("RA-7656 gaps", () => {
  const freehandOnly = { objects: [{ type: "path", data: { type: "freehand" } }] };

  it("a stored blob with tagged rooms but no room rows keeps the drawing, rooms and render", async () => {
    gate.storageConfigured = true;
    p.sketchRoom.findMany.mockImplementation(async () => []);
    const res = await save(freehandOnly, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    const data = p.claimSketch.update.mock.calls[0][0].data;
    expect(data.sketchData).toBeUndefined();
    expect(data.renderedPngUrl).toBeUndefined();
    expect(render.storeVerifiedCleanRender).not.toHaveBeenCalled();
    expectRoomsAndElementsUntouched();
  });

  it("legacy data-less polygons arriving in the save are not rooms: the stored drawing and rooms are kept", async () => {
    const legacy = {
      type: "Polygon",
      fill: "rgba(28,46,71,0.08)",
      points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }],
    };
    const res = await save({ objects: [legacy] }, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toBeUndefined();
    expectRoomsAndElementsUntouched();
  });

  it("room rows are read with detachedAt selected: all-detached rows (as Prisma projects them) let a roomless save through", async () => {
    gate.storageConfigured = true;
    p.claimSketch.findFirst.mockResolvedValue({
      id: "s_1",
      sketchData: { objects: [] },
      updatedAt: new Date("2026-09-20T00:00:00Z"),
    });
    // Prisma returns only selected fields: detachedAt exists only when selected.
    p.sketchRoom.findMany.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
      projectRooms(args).map((r) =>
        args?.select?.detachedAt ? { ...r, detachedAt: new Date("2026-10-01T00:00:00Z") } : r,
      ),
    );
    const res = await save(freehandOnly, { requestCanonicalRender: true });

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].data.sketchData).toEqual(freehandOnly);
  });
});
