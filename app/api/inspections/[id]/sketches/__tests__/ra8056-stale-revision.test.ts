/**
 * RA-8056 — a stale tab's floor-plan save must not delete rooms another tab
 * added.
 *
 * The editor used to send only `x-client-updated-at = Date.now()` at save
 * time, so a tab opened before another tab added a room still looked fresh.
 * Its partial room snapshot then won and room sync deleted (owner) or
 * detached (technician) the newer room. The editor now sends the floor
 * revision it loaded (`x-sketch-revision`, a digest of the stored drawing, or
 * `none` for a floor it has never seen saved). The route refuses a save whose
 * revision is not the stored one with 409 `{ conflict: "revision" }` before
 * anything is written, and the floor write itself is conditional on that
 * revision so two saves racing past the check cannot both apply.
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
import { floorRevisionOf } from "@/lib/sketch/floor-revision-server";

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

const STORED_AT = new Date("2026-09-20T00:00:00.000Z");
const storedData = { scaleConfig: { pxPerMetre: 100 }, objects: [kitchen, laundry] };
/** The floor as the stale tab loaded it, before another tab added the Kitchen. */
const STALE_REVISION = floorRevisionOf({ scaleConfig: { pxPerMetre: 100 }, objects: [laundry] });
const STORED_REVISION = floorRevisionOf(storedData);
const savedData = { scaleConfig: { pxPerMetre: 100 }, objects: [laundry], saved: true };

function save(
  sketchData: unknown,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ floorNumber: 0, sketchData, ...extra }),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

/** The partial snapshot a stale tab holds: it never saw the Kitchen. */
const laundryOnly = { scaleConfig: { pxPerMetre: 100 }, objects: [laundry] };

function expectNothingWritten() {
  expect(p.claimSketch.update).not.toHaveBeenCalled();
  expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
  expect(p.sketchRoom.updateMany).not.toHaveBeenCalled();
  expect(p.sketchRoom.update).not.toHaveBeenCalled();
  expect(p.sketchRoom.create).not.toHaveBeenCalled();
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
    sketchData: storedData,
    moisturePoints: [],
    renderedPngUrl: null,
    updatedAt: STORED_AT,
  });
  p.claimSketch.update.mockResolvedValue({
    id: "s_1",
    sketchData: savedData,
    updatedAt: new Date("2026-09-20T00:05:00.000Z"),
  });
});

const roles = [
  { role: "owner", viaAssignment: false },
  { role: "technician", viaAssignment: true },
] as const;

describe("RA-8056 stale revision", () => {
  it.each(roles)(
    "the reviewer's repro: a fresh timestamp from a stale tab is refused and no room is deleted or detached ($role)",
    async ({ viaAssignment }) => {
      gate.viaAssignment = viaAssignment;
      const res = await save(laundryOnly, {
        "x-client-updated-at": String(Date.parse("2026-09-21T00:00:00.000Z")),
        "x-sketch-revision": STALE_REVISION,
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.conflict).toBe("revision");
      // Not `stale: true` - the offline queue silently drops stale entries,
      // and this edit must be kept for the user, not discarded.
      expect(body.stale).not.toBe(true);
      expect(body.serverRevision).toBe(STORED_REVISION);
      expectNothingWritten();
    },
  );

  it("a tab that has never seen this floor saved (`none`) cannot overwrite one another tab created", async () => {
    const res = await save(laundryOnly, { "x-sketch-revision": "none" });

    expect(res.status).toBe(409);
    expect((await res.json()).conflict).toBe("revision");
    expectNothingWritten();
  });

  it("a malformed revision is refused before anything is written", async () => {
    const res = await save(laundryOnly, { "x-sketch-revision": "not-a-revision" });

    expect(res.status).toBe(400);
    expectNothingWritten();
  });

  it("a save that loses the race after the check (row changed before the write) is refused and syncs no room", async () => {
    p.claimSketch.update.mockRejectedValueOnce(
      Object.assign(new Error("Record to update not found."), { code: "P2025" }),
    );
    p.claimSketch.findFirst
      .mockResolvedValueOnce({
        id: "s_1",
        sketchData: storedData,
        moisturePoints: [],
        renderedPngUrl: null,
        updatedAt: STORED_AT,
      })
      .mockResolvedValueOnce({ sketchData: savedData });

    const res = await save(laundryOnly, { "x-sketch-revision": STORED_REVISION });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe("revision");
    expect(body.serverRevision).toBe(floorRevisionOf(savedData));
    expect(p.sketchRoom.deleteMany).not.toHaveBeenCalled();
    expect(p.sketchRoom.updateMany).not.toHaveBeenCalled();
    expect(p.sketchElement.deleteMany).not.toHaveBeenCalled();
  });
});

describe("RA-8056 matching revision", () => {
  it("a deliberate single-room delete still applies when the revision matches (owner)", async () => {
    const res = await save(laundryOnly, { "x-sketch-revision": STORED_REVISION });

    expect(res.status).toBe(201);
    expect(p.sketchRoom.deleteMany).toHaveBeenCalledTimes(1);
    expect(p.sketchRoom.deleteMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["sr_kitchen"] } },
    });
    // The floor write is conditional on the revision the check passed.
    expect(p.claimSketch.update.mock.calls[0][0].where).toMatchObject({
      id: "s_1",
      updatedAt: STORED_AT,
    });
    // The new revision comes back so the editor's next save sends it.
    expect((await res.json()).revision).toBe(floorRevisionOf(savedData));
  });

  it("a deliberate single-room removal detaches it when the revision matches (technician)", async () => {
    gate.viaAssignment = true;
    const res = await save(laundryOnly, { "x-sketch-revision": STORED_REVISION });

    expect(res.status).toBe(201);
    expect(p.sketchRoom.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sr_kitchen"] },
      detachedAt: null,
    });
  });

  it("the import route recording Vision room ids does not change the revision", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce({
      id: "s_1",
      sketchData: { ...storedData, raSketchMeta: { aiSuggestedRoomIds: ["room-kitchen"] } },
      moisturePoints: [],
      renderedPngUrl: null,
      updatedAt: new Date("2026-09-20T00:02:00.000Z"),
    });

    const res = await save(laundryOnly, { "x-sketch-revision": STORED_REVISION });

    expect(res.status).toBe(201);
  });

  it("any other change to the stored drawing is a new revision", () => {
    expect(
      floorRevisionOf({ ...storedData, raSketchMeta: { fieldComplete: true } }),
    ).not.toBe(STORED_REVISION);
    // Key order (as Postgres JSONB may return it) does not change it.
    expect(floorRevisionOf({ objects: storedData.objects, scaleConfig: storedData.scaleConfig })).toBe(
      STORED_REVISION,
    );
  });

  it("`none` creates a floor that does not exist yet", async () => {
    p.claimSketch.findFirst.mockResolvedValueOnce(null);
    p.claimSketch.create.mockResolvedValueOnce({ id: "s_new", updatedAt: STORED_AT });

    const res = await save(laundryOnly, { "x-sketch-revision": "none" });

    expect(res.status).toBe(201);
    expect(p.claimSketch.create).toHaveBeenCalledTimes(1);
  });
});

describe("RA-8056 legacy callers", () => {
  it("a save without a revision (already-queued offline entries) keeps the old behaviour", async () => {
    const res = await save(laundryOnly);

    expect(res.status).toBe(201);
    expect(p.claimSketch.update.mock.calls[0][0].where).toEqual({ id: "s_1" });
  });
});
