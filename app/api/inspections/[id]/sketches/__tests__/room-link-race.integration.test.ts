/**
 * RA-8576 - a sketch save must never blank the room link of a row another
 * writer files against the room at the same time.
 *
 * Every table that points at SketchRoom does so with onDelete: SetNull. A
 * save that deletes a room it believed was empty therefore does not fail when
 * a second writer files something against that room in the meantime: the
 * database waits for the writer to commit, deletes the room, and clears the
 * link on the writer's new row. The row survives; its room is lost.
 *
 * This runs on a real database with two sessions. Session A is a writer whose
 * transaction has inserted a row against the room and not yet committed (it
 * holds the foreign-key lock on the room). Session B is the owner's sketch
 * save, which starts after the insert and so cannot see it. The writer is
 * released only after the save is demonstrably waiting.
 *
 * The cases come from the Prisma schema: one per list relation on SketchRoom,
 * and a test fails if a relation appears with no case here. That is the point:
 * a new table that links to a room is covered by being listed, not by
 * somebody remembering to extend a hand-kept list.
 *
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SKETCH_ROOM_DEPENDENT_RELATIONS } from "@/lib/sketch/room-dependents";
import { POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra8576-${Date.now().toString(36)}`;

type Db = Prisma.TransactionClient;
interface Ids {
  inspectionId: string;
  sketchId: string;
  roomId: string;
}

/** One way to file a row against a room, per list relation on SketchRoom. */
const WRITERS: Record<
  string,
  {
    create: (db: Db, ids: Ids) => Promise<{ id: string }>;
    read: (id: string) => Promise<{ sketchRoomId: string | null } | null>;
  }
> = {
  evidencePins: {
    create: (db, i) =>
      db.evidencePin.create({
        data: { sketchId: i.sketchId, sketchRoomId: i.roomId, x: 1, y: 1 },
      }),
    read: (id) => prisma.evidencePin.findUnique({ where: { id } }),
  },
  moistureReadings: {
    create: (db, i) =>
      db.sketchMoistureReading.create({
        data: { sketchId: i.sketchId, sketchRoomId: i.roomId, currentMc: 21 },
      }),
    read: (id) => prisma.sketchMoistureReading.findUnique({ where: { id } }),
  },
  hazards: {
    create: (db, i) =>
      db.hazard.create({
        data: { sketchId: i.sketchId, sketchRoomId: i.roomId, type: "mould" },
      }),
    read: (id) => prisma.hazard.findUnique({ where: { id } }),
  },
  jobMoistureReadings: {
    create: (db, i) =>
      db.moistureReading.create({
        data: {
          inspectionId: i.inspectionId,
          sketchRoomId: i.roomId,
          location: "Kitchen wall",
          surfaceType: "plasterboard",
          moistureLevel: 18,
          depth: "surface",
        },
      }),
    read: (id) => prisma.moistureReading.findUnique({ where: { id } }),
  },
  scopeItems: {
    create: (db, i) =>
      db.scopeItem.create({
        data: {
          inspectionId: i.inspectionId,
          sketchRoomId: i.roomId,
          itemType: "water_extraction",
          description: "Extract standing water",
        },
      }),
    read: (id) => prisma.scopeItem.findUnique({ where: { id } }),
  },
  roomObservations: {
    create: (db, i) =>
      db.roomObservation.create({
        data: {
          inspectionId: i.inspectionId,
          sketchRoomId: i.roomId,
          roomLabel: "Kitchen",
          kind: "ODOUR",
        },
      }),
    read: (id) => prisma.roomObservation.findUnique({ where: { id } }),
  },
  // RA-8501: a contents item records the room it was found in.
  contentsPackOutItems: {
    create: (db, i) =>
      db.contentsPackOutItem.create({
        data: {
          inspectionId: i.inspectionId,
          sketchRoomId: i.roomId,
          itemDescription: "Timber dining chair",
        },
      }),
    read: (id) => prisma.contentsPackOutItem.findUnique({ where: { id } }),
  },
};

// The cases are keyed by the schema's own list of dependent relations.
const ROOM_LISTS = [...SKETCH_ROOM_DEPENDENT_RELATIONS];

const roomPolygon = (id: string, label: string) => ({
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
  ],
  data: { type: "room", id, label },
});

/** An owner, a job, a floor with Lounge and Kitchen, and both room rows. */
async function seedFloor(tag: string): Promise<Ids> {
  const owner = await prisma.user.create({
    data: { email: `${S}-${tag}@test.local`, role: "ADMIN" },
  });
  getServerSession.mockResolvedValue({ user: { id: owner.id } });
  const insp = await prisma.inspection.create({
    data: {
      inspectionNumber: `${S}-${tag}`,
      propertyAddress: "1 Race St",
      propertyPostcode: "4068",
      userId: owner.id,
      status: "DRAFT",
    },
  });
  const sketch = await prisma.claimSketch.create({
    data: {
      inspectionId: insp.id,
      floorNumber: 0,
      sketchData: {
        objects: [
          roomPolygon("room-lounge", "Lounge"),
          roomPolygon("room-kitchen", "Kitchen"),
        ],
      },
    },
  });
  await prisma.sketchRoom.create({
    data: { sketchId: sketch.id, fabricObjectId: "room-lounge", name: "Lounge" },
  });
  const kitchen = await prisma.sketchRoom.create({
    data: { sketchId: sketch.id, fabricObjectId: "room-kitchen", name: "Kitchen" },
  });
  return { inspectionId: insp.id, sketchId: sketch.id, roomId: kitchen.id };
}

/** The owner's save: Kitchen has been taken off the canvas, Lounge stays. */
function saveWithoutKitchen(ids: Ids) {
  return POST(
    new NextRequest(`http://localhost/api/inspections/${ids.inspectionId}/sketches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        floorNumber: 0,
        sketchData: {
          scaleConfig: { pxPerMetre: 100 },
          objects: [roomPolygon("room-lounge", "Lounge")],
        },
      }),
    }),
    { params: Promise.resolve({ id: ids.inspectionId }) },
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!HAS_DB)("RA-8576 sketch save vs a writer filing against the room", () => {
  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  it("has a writer case for every list relation on SketchRoom", () => {
    expect(ROOM_LISTS.length).toBeGreaterThan(0);
    expect(Object.keys(WRITERS).sort()).toEqual([...ROOM_LISTS].sort());
  });

  it("still removes a stale room that holds nothing", async () => {
    const ids = await seedFloor("empty");
    const res = await saveWithoutKitchen(ids);
    expect(res.status).toBe(201);
    expect(await prisma.sketchRoom.findUnique({ where: { id: ids.roomId } })).toBeNull();
  });

  describe.each(ROOM_LISTS)("%s", (relation) => {
    const w = WRITERS[relation];

    it("keeps the room link when the row was filed before the save", async () => {
      const ids = await seedFloor(`before-${relation}`);
      const row = await w.create(prisma, ids);
      const res = await saveWithoutKitchen(ids);
      expect(res.status).toBe(201);
      expect((await w.read(row.id))?.sketchRoomId).toBe(ids.roomId);
      const room = await prisma.sketchRoom.findUnique({ where: { id: ids.roomId } });
      expect(room?.detachedAt).not.toBeNull();
    });

    it("keeps the room link when the row is filed while the save is running", async () => {
      const ids = await seedFloor(`race-${relation}`);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let inserted!: () => void;
      let insertFailed!: (e: unknown) => void;
      const insertedP = new Promise<void>((r, j) => {
        inserted = r;
        insertFailed = j;
      });

      // Session A: the writer has inserted and holds its transaction open.
      const writer = prisma.$transaction(
        async (tx) => {
          let row: { id: string };
          try {
            row = await w.create(tx, ids);
          } catch (e) {
            insertFailed(e);
            throw e;
          }
          inserted();
          await gate;
          return row;
        },
        { timeout: 60_000, maxWait: 30_000 },
      );
      writer.catch(() => {});
      await insertedP;

      // Session B: the save starts after the insert, so it cannot see it.
      let settled = false;
      const save = saveWithoutKitchen(ids).finally(() => {
        settled = true;
      });
      await sleep(1500);
      // Positive control: the save really is waiting on the writer's lock.
      // If it had finished, nothing here would have been tested.
      expect(settled, "the save should be waiting for the writer").toBe(false);

      release();
      const row = await writer;
      const res = await save;
      expect(res.status).toBe(201);

      expect((await w.read(row.id))?.sketchRoomId, "room link on the writer's row").toBe(
        ids.roomId,
      );
      const room = await prisma.sketchRoom.findUnique({ where: { id: ids.roomId } });
      expect(room, "the room must survive").not.toBeNull();
      expect(room?.detachedAt).not.toBeNull();
    }, 60_000);
  });
});
