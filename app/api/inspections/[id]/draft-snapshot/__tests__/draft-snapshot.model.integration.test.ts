/**
 * Generated schedules: the NIR form's draft save vs evidence captured elsewhere (B23).
 *
 * A fast-check model over event schedules on one DRAFT job, against a real
 * database. Events: the form loads, another screen captures a reading, the
 * form adds / edits / removes rows locally, the form autosaves, and an old tab
 * saves a payload with no record of what it loaded.
 *
 * Invariants checked after every event, by reading the database:
 *   1. A reading the form never loaded survives every form save.
 *   2. After a save, the job holds exactly: readings the form did not load,
 *      plus the form's own rows. Nothing is duplicated.
 *   3. A loaded reading the form kept, edited or not, keeps its id (photo
 *      and pin links point at reading ids).
 *   5. A captured reading that survives keeps every column the form does not
 *      own: pin, sketch room, flags, source, photo, device, notes, area,
 *      recorded and created time. The list is read from the Prisma model, so a column
 *      added later is covered without editing this test.
 *   6. A photo linked to a reading by id (InspectionPhoto.moistureReadingLink, a
 *      plain text link no foreign key protects) still exists, still points at
 *      it, and keeps every other column after every save that keeps the
 *      reading. Its planted values are built from the Prisma model, so a column
 *      added later is covered. A test fails if another such link field appears.
 *   4. A save with no record of what it loaded is refused (409) and changes
 *      nothing.
 *
 * Payload contract (claude-review-findings part 5, item 1): loaded rows carry
 * their `id`; the save carries `baseIds.moistureReadings`, the ids the form
 * loaded. `formPayload` is the one place this test binds to that contract.
 *
 * Deterministic: no model calls. Replay a failure with SCENARIO_SEED and
 * SCENARIO_PATH from the report. SCENARIO_RUNS sets the run count. Generated,
 * executed and asserted counts go on each test's own record (`task.meta`), so
 * they reach the runner's JSON report with that test's verdict. The test
 * writes no receipt of its own.
 *
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PUT } from "../route";
import { POST as captureMoisture } from "../../moisture/route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `dsmodel-${Date.now().toString(36)}`;
const SEED = Number(process.env.SCENARIO_SEED ?? 20261002);
const RUNS = Number(process.env.SCENARIO_RUNS ?? 60);
const PATH = process.env.SCENARIO_PATH;
if (!Number.isInteger(RUNS) || RUNS < 1) {
  throw new Error(`SCENARIO_RUNS must be a whole number of at least 1, got ${process.env.SCENARIO_RUNS}`);
}

type Event =
  | { t: "capture" }
  | { t: "add" }
  | { t: "edit"; k: number }
  | { t: "remove"; k: number }
  | { t: "save" }
  | { t: "reload" }
  | { t: "staleSave" };

const eventArb = (staleSaves: boolean): fc.Arbitrary<Event> => fc.oneof(
  { arbitrary: fc.constant({ t: "capture" } as const), weight: 3 },
  { arbitrary: fc.constant({ t: "add" } as const), weight: 2 },
  { arbitrary: fc.nat(20).map((k) => ({ t: "edit", k }) as const), weight: 2 },
  { arbitrary: fc.nat(20).map((k) => ({ t: "remove", k }) as const), weight: 2 },
  { arbitrary: fc.constant({ t: "save" } as const), weight: 3 },
  { arbitrary: fc.constant({ t: "reload" } as const), weight: 1 },
  { arbitrary: fc.constant({ t: "staleSave" } as const), weight: staleSaves ? 2 : 0 },
);

interface FormRow {
  id?: string;
  level: number;
  location: string;
  surfaceType: string;
  depth: string;
}

/** Every stored field the form round-trips, so a save that keeps the id and
 *  level but rewrites another field is caught. */
const tuple = (r: { moistureLevel?: number; level?: number; location: string; surfaceType: string; depth: string }) =>
  `${r.moistureLevel ?? r.level}|${r.location}|${r.surfaceType}|${r.depth}`;

/** Columns the NIR form owns (it sends them), plus id, inspectionId and
 *  updatedAt, which an in-place update legitimately changes. createdAt is
 *  pinned: a save must not rewrite when a reading was first captured. */
const FORM_OWNED = new Set([
  "id", "inspectionId", "location", "surfaceType", "moistureLevel", "depth", "updatedAt",
]);
/** Every other column: other screens set these and a draft save must keep them. */
const PINNED = Object.values(Prisma.MoistureReadingScalarFieldEnum).filter((f) => !FORM_OWNED.has(f));

/** A distinct, non-default value for every pinned column, set on capture. */
function plantedPin(level: number, i: number, sketchRoomId: string): Record<string, unknown> {
  const values: Record<string, unknown> = {
    mapX: level / 100, mapY: 1 - level / 100, sketchRoomId,
    isBaseline: i % 2 === 0, isMonitoringPoint: true, source: "ble",
    photoUrl: `photo-${level}.jpg`, unit: "PERCENT_MC", deviceVendor: "Delmhorst", deviceModel: "Navigator Pro",
    notes: `note ${level}`, affectedArea: "Bedroom 4", recordedAt: new Date(Date.UTC(2026, 9, 2, 3, 0, i)),
    createdAt: new Date(Date.UTC(2026, 9, 1, 22, 0, i)),
  };
  const missing = PINNED.filter((f) => !(f in values));
  // A new MoistureReading column must get a planted value here, or nothing
  // would show a save wiping it.
  expect(missing, "pinned columns with no planted value").toEqual([]);
  return values;
}

/** Fields outside MoistureReading that hold a reading id as plain text. */
const READING_LINK_FIELDS = Prisma.dmmf.datamodel.models.flatMap((m) =>
  m.name === "MoistureReading"
    ? []
    : m.fields
        .filter((f) => f.kind === "scalar" && /moisturereading(?:id|link)$/i.test(f.name))
        .map((f) => `${m.name}.${f.name}`),
);

const PHOTO_MODEL = Prisma.dmmf.datamodel.models.find((m) => m.name === "InspectionPhoto")!;
/** Every photo column a save must leave alone: all but id and updatedAt. inspectionId is
 *  pinned too: photos are loaded by id, so a save that moved them to another job would
 *  otherwise go unseen. */
const PHOTO_PINNED = PHOTO_MODEL.fields.filter(
  (f) => f.kind !== "object" && !["id", "updatedAt"].includes(f.name),
);

/** The runtime model has no list flags or defaults, so read those from the schema. */
const PHOTO_SCHEMA = readFileSync(fileURLToPath(new URL("../../../../../../prisma/schema.prisma", import.meta.url)), "utf8")
  .split(/^model InspectionPhoto \{$/m)[1]
  .split(/^\}$/m)[0];
const PHOTO_LISTS = new Set(
  [...PHOTO_SCHEMA.matchAll(/^\s*(\w+)\s+\w+\[\]/gm)]
    .map((m) => m[1])
    .filter((name) => PHOTO_PINNED.some((f) => f.name === name)), // columns, not relations
);
const PHOTO_TRUE_DEFAULTS = new Set([...PHOTO_SCHEMA.matchAll(/^\s*(\w+)\s+Boolean\b.*@default\(true\)/gm)].map((m) => m[1]));

/** A distinct, non-default value for every photo column, from its type. */
function plantedPhoto(level: number, inspectionId: string, readingId: string, roomId: string): Record<string, unknown> {
  const k = Math.round(level * 10);
  const values: Record<string, unknown> = {};
  for (const f of PHOTO_PINNED) {
    let v: unknown;
    if (f.name === "inspectionId") v = inspectionId;
    else if (f.name === "moistureReadingLink") v = readingId;
    else if (f.name === "roomId") v = roomId;
    else if (f.type === "String") v = `${f.name}-${k}`;
    else if (f.type === "Int") v = k + 1;
    else if (f.type === "Float") v = k + 0.25;
    else if (f.type === "Boolean") v = !PHOTO_TRUE_DEFAULTS.has(f.name);
    else if (f.type === "DateTime") v = new Date(Date.UTC(2026, 8, 30, 1, 0, k));
    else if (f.type === "Json") v = { planted: f.name, k };
    // A column type this cannot plant would leave that column unchecked.
    expect(v, `planted value for InspectionPhoto.${f.name} (${f.type})`).not.toBeUndefined();
    values[f.name] = PHOTO_LISTS.has(f.name) ? [v] : v;
  }
  return values;
}

const photoPinOf = (r: Record<string, unknown> | undefined) =>
  r === undefined
    ? "deleted"
    : JSON.stringify(PHOTO_PINNED.map(({ name }) => (r[name] instanceof Date ? (r[name] as Date).toISOString() : r[name])));

const pinOf = (r: Record<string, unknown>) =>
  JSON.stringify(PINNED.map((f) => (r[f] instanceof Date ? (r[f] as Date).toISOString() : r[f])));

let counts = { generated: 0, executed: 0, asserted: 0, runs: 0 };

/** The one binding to the draft-snapshot contract under test. */
function formPayload(rows: FormRow[], baseIds: string[] | null) {
  return {
    environmentalData: null,
    moistureReadings: rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      location: r.location,
      surfaceType: r.surfaceType,
      moistureLevel: r.level,
      depth: r.depth,
    })),
    affectedAreas: [],
    scopeItems: [],
    ...(baseIds ? { baseIds: { moistureReadings: baseIds } } : {}),
  };
}

async function dbRows(inspectionId: string) {
  return prisma.moistureReading.findMany({
    where: { inspectionId },
  });
}

const sorted = (xs: string[]) => [...xs].sort();

async function runSchedule(events: Event[], inspectionId: string, sketchRoomId: string, roomId: string) {
  // Unique levels identify rows: 0.1 apart, never reused within a run.
  let n = 0;
  const fresh = () => Math.round((1 + n++ * 0.1) * 10) / 10;
  const model = new Map<number, string>(); // level -> tuple the job must hold
  // level -> the reading id that must still hold it. A capture and every loaded
  // row the form keeps have a known id; a row the form adds does not.
  const ids = new Map<number, string>();
  let base = new Map<number, string>(); // level -> id, as the form loaded them
  let local: FormRow[] = [];
  const pins = new Map<string, string>(); // reading id -> pin it must keep
  const photoPins = new Map<string, { reading: string; pin: string }>(); // photo id -> its reading and pin

  const load = async () => {
    const rows = await dbRows(inspectionId);
    base = new Map(rows.map((r) => [r.moistureLevel, r.id]));
    local = rows.map((r) => ({
      id: r.id, level: r.moistureLevel, location: r.location, surfaceType: r.surfaceType, depth: r.depth,
    }));
  };
  const check = async (step: string) => {
    const db = await dbRows(inspectionId);
    expect(sorted(db.map(tuple)), `after ${step}`).toEqual(sorted([...model.values()]));
    counts.asserted++;
    // Same values are not enough: a reading deleted and re-created under a new
    // id loses its pins and orphans its photos.
    const dbById = new Map(db.map((r) => [r.id, tuple(r)]));
    for (const [level, id] of ids) {
      expect(dbById.get(id) ?? "missing", `${step} reading ${id}`).toBe(model.get(level));
      counts.asserted++;
    }
    const alive = new Set(db.map((r) => r.id));
    const photos = await prisma.inspectionPhoto.findMany({ where: { id: { in: [...photoPins.keys()] } } });
    const photoById = new Map(photos.map((p) => [p.id, p as Record<string, unknown>]));
    for (const [photoId, { reading, pin }] of photoPins) {
      if (alive.has(reading)) {
        // A deleted photo reads as "deleted", so it fails too.
        expect(photoPinOf(photoById.get(photoId)), `${step} photo of ${reading}`).toBe(pin);
        counts.asserted++;
      }
    }
    for (const r of db) {
      if (pins.has(r.id)) {
        expect(pinOf(r), `${step} pin of ${r.id}`).toBe(pins.get(r.id));
        counts.asserted++;
      }
    }
  };
  const put = (body: unknown) =>
    PUT(
      new NextRequest(`http://localhost/api/inspections/${inspectionId}/draft-snapshot`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: inspectionId }) },
    );

  await load();
  for (const [i, e] of events.entries()) {
    counts.executed++;
    const step = `${i}:${e.t}`;
    if (e.t === "capture") {
      const level = fresh();
      const res = await captureMoisture(
        new NextRequest(`http://localhost/api/inspections/${inspectionId}/moisture`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": `${S}-${inspectionId}-${i}` },
          body: JSON.stringify({ location: `Room ${level}`, surfaceType: "Drywall", moistureLevel: level, depth: "Surface" }),
        }),
        { params: Promise.resolve({ id: inspectionId }) },
      );
      expect(res.status, step).toBe(201);
      // Another screen pins it on the floor plan and flags it.
      const [captured] = await prisma.moistureReading.findMany({
        where: { inspectionId, moistureLevel: level }, select: { id: true },
      });
      const pinned = await prisma.moistureReading.update({
        where: { id: captured.id },
        data: plantedPin(level, i, sketchRoomId),
      });
      pins.set(pinned.id, pinOf(pinned));
      const photo = await prisma.inspectionPhoto.create({
        data: plantedPhoto(level, inspectionId, pinned.id, roomId) as Prisma.InspectionPhotoUncheckedCreateInput,
      });
      photoPins.set(photo.id, { reading: pinned.id, pin: photoPinOf(photo as Record<string, unknown>) });
      model.set(level, tuple({ level, location: `Room ${level}`, surfaceType: "Drywall", depth: "Surface" }));
      ids.set(level, pinned.id);
      await check(step);
    } else if (e.t === "add") {
      const level = fresh();
      local.push({ level, location: `Room ${level}`, surfaceType: "Plasterboard", depth: "Surface" });
    } else if (e.t === "edit" && local.length > 0) {
      const level = fresh();
      // An edit changes the value and the other fields, so a save that
      // keeps the level but drops a field is visible.
      local[e.k % local.length] = {
        ...local[e.k % local.length], level, location: `Room ${level}`, surfaceType: "Timber", depth: "Subsurface",
      };
    } else if (e.t === "remove" && local.length > 0) {
      local.splice(e.k % local.length, 1);
    } else if (e.t === "save") {
      const res = await put(formPayload(local, [...base.values()]));
      expect(res.status, step).toBeLessThan(300);
      for (const level of base.keys()) {
        model.delete(level);
        ids.delete(level);
      }
      const loadedIds = new Set(base.values());
      for (const r of local) {
        model.set(r.level, tuple(r));
        if (r.id && loadedIds.has(r.id)) ids.set(r.level, r.id);
      }
      await check(step);
      // Invariant 3: every loaded row the form kept, edited or not, is the
      // same row afterwards (photo and pin links point at reading ids).
      const byId = new Map((await dbRows(inspectionId)).map((r) => [r.id, tuple(r)]));
      for (const r of local) {
        if (r.id && loadedIds.has(r.id)) {
          expect(byId.get(r.id), `${step} row ${r.id}`).toBe(tuple(r));
          counts.asserted++;
        }
      }
      await load();
    } else if (e.t === "reload") {
      await load();
    } else if (e.t === "staleSave") {
      const res = await put(formPayload(local.map(({ id: _id, ...r }) => r), null));
      expect(res.status, step).toBe(409);
      counts.asserted++;
      await check(step);
    }
  }
}

describe.skipIf(!HAS_DB)("draft snapshot vs field capture (generated schedules)", () => {
  afterAll(async () => {
    await prisma.inspectionPhoto.deleteMany({
      where: { inspection: { inspectionNumber: { startsWith: S } } },
    });
    await prisma.moistureReading.deleteMany({
      where: { inspection: { inspectionNumber: { startsWith: S } } },
    });
    await prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  let run = 0;
  const property = (staleSaves: boolean) =>
    fc.assert(
      fc.asyncProperty(fc.array(eventArb(staleSaves), { minLength: 1, maxLength: 10 }), async (events) => {
        counts.runs++;
        counts.generated += events.length;
        // One owner per run: the capture route allows 60 a minute per user.
        const owner = await prisma.user.create({
          data: { email: `${S}-owner-${run}@test.local`, role: "ADMIN" },
        });
        getServerSession.mockResolvedValue({ user: { id: owner.id } });
        const insp = await prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-${run++}`,
            propertyAddress: "1 Model St",
            propertyPostcode: "4068",
            userId: owner.id,
            status: "DRAFT",
          },
        });
        const sketch = await prisma.claimSketch.create({ data: { inspectionId: insp.id } });
        const room = await prisma.sketchRoom.create({
          data: { sketchId: sketch.id, fabricObjectId: `${S}-room-${run}`, name: "Bedroom 4" },
        });
        const photoRoom = await prisma.room.create({ data: { inspectionId: insp.id, name: "Bedroom 4" } });
        await runSchedule(events, insp.id, room.id, photoRoom.id);
      }),
      { seed: SEED, numRuns: RUNS, ...(PATH ? { path: PATH } : {}) },
    );

  /** A property that ran no schedule proves nothing: fail it. A replay
   *  (SCENARIO_PATH) runs the recorded case, so only "at least one" holds. */
  const expectItRan = () => {
    if (PATH) expect(counts.runs, "schedules run").toBeGreaterThan(0);
    else expect(counts.runs, "schedules run").toBe(RUNS);
    expect(counts.executed, "events executed").toBeGreaterThan(0);
  };

  /** Counts ride on the test's own record into the runner's JSON report. */
  const record = (task: { meta: object }) => {
    Object.assign(task.meta, { scenario: { test: "draft-snapshot.model", seed: SEED, path: PATH ?? null, runsRequested: RUNS, ...counts } });
    console.log(`[scenario-counts] ${JSON.stringify(counts)}`);
  };

  it("reads the photo list columns from the schema", () => {
    // If the parse breaks, list columns would be planted as plain strings.
    expect([...PHOTO_LISTS].sort()).toEqual(["affectedMaterial", "secondaryDamageIndicators"]);
  });

  it("knows every field that links to a reading by id", () => {
    // A new one needs a planted link and a check above, or a save could
    // break it unseen.
    expect(READING_LINK_FIELDS).toEqual(["InspectionPhoto.moistureReadingLink"]);
  });

  it("keeps every reading the form never loaded, and only those plus the form's rows", async ({ task }) => {
    counts = { generated: 0, executed: 0, asserted: 0, runs: 0 };
    try {
      await property(false);
      expectItRan();
    } finally {
      record(task);
    }
  }, 600_000);

  it("refuses a save that does not say what it loaded, and changes nothing", async ({ task }) => {
    counts = { generated: 0, executed: 0, asserted: 0, runs: 0 };
    try {
      await property(true);
      expectItRan();
    } finally {
      record(task);
    }
  }, 600_000);
});
