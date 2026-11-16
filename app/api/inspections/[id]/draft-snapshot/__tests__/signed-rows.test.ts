/**
 * RA-8388 AMENDMENT 05 - the NIR form and readings a signature vouches for.
 *
 * The NIR form resubmits every reading it loaded and deletes the ones it no
 * longer sends. Before this amendment it would rewrite the values of a signed
 * reading in place, or delete it, without any signature. These tests pin what
 * it does now: it refuses both by name and changes nothing, and it still
 * saves everything a signature does not cover.
 *
 * The database is mocked here, so these prove the route's decisions, not the
 * foreign key. The key is proved on a real database in
 * lib/evidence/__tests__/authoritative-link.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/pulse/notify-client-change", () => ({
  notifyClientDryingChange: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const db = vi.hoisted(() => {
  const tx = {
    inspection: { updateMany: vi.fn() },
    environmentalData: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    moistureReading: { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    affectedArea: { deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    scopeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    waterDamageClassification: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    classification: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    tx,
    resolveInspectionWrite: vi.fn(),
    inspectionFindUnique: vi.fn(),
    readingFindMany: vi.fn(),
    readingFindFirst: vi.fn(),
    environmentalFindMany: vi.fn(),
    environmentalFindFirst: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: db.resolveInspectionWrite,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: db.inspectionFindUnique },
    affectedArea: { findMany: vi.fn().mockResolvedValue([]) },
    sketchRoom: { findMany: vi.fn().mockResolvedValue([]) },
    moistureReading: {
      findMany: db.readingFindMany,
      findFirst: db.readingFindFirst,
    },
    environmentalData: {
      findMany: db.environmentalFindMany,
      findFirst: db.environmentalFindFirst,
    },
    $transaction: db.transaction,
  },
}));

import { getServerSession } from "next-auth";
import { PUT } from "../route";

/** A reading written from a signed capture: it carries the evidence link. */
const SIGNED_READING = {
  id: "mr_signed",
  evidenceItemId: "ev_1",
  location: "Kitchen north wall",
  surfaceType: "Plasterboard",
  moistureLevel: 18.4,
  depth: "Surface",
};
/** A reading typed into the NIR form: no link, free to edit. */
const UNSIGNED_READING = {
  id: "mr_plain",
  evidenceItemId: null,
  location: "Hall",
  surfaceType: "Timber",
  moistureLevel: 12,
  depth: "Surface",
};
const SIGNED_AMBIENT = {
  id: "env_signed",
  evidenceItemId: "ev_2",
  ambientTemperature: 22.5,
  humidityLevel: 68,
  location: "Lounge",
};

const asSent = (row: typeof SIGNED_READING | typeof UNSIGNED_READING) => ({
  id: row.id,
  location: row.location,
  surfaceType: row.surfaceType,
  moistureLevel: row.moistureLevel,
  depth: row.depth,
});

function save(body: Record<string, unknown>) {
  return PUT(
    new NextRequest("http://localhost/api/inspections/insp_1/draft-snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environmentalData: null,
        moistureReadings: [],
        affectedAreas: [],
        scopeItems: [],
        baseIds: { moistureReadings: [] },
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

const nothingWritten = () => {
  expect(db.transaction).not.toHaveBeenCalled();
  expect(db.tx.moistureReading.updateMany).not.toHaveBeenCalled();
  expect(db.tx.moistureReading.deleteMany).not.toHaveBeenCalled();
  expect(db.tx.environmentalData.updateMany).not.toHaveBeenCalled();
  expect(db.tx.environmentalData.deleteMany).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
  db.resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "insp_1" },
      inspectionManyWhere: { id: "insp_1" },
      childInspectionFilter: undefined,
    },
  });
  db.inspectionFindUnique.mockResolvedValue({ id: "insp_1", status: "DRAFT" });
  db.readingFindMany.mockResolvedValue([]);
  db.readingFindFirst.mockResolvedValue(null);
  db.environmentalFindMany.mockResolvedValue([]);
  db.environmentalFindFirst.mockResolvedValue(null);
  db.tx.inspection.updateMany.mockResolvedValue({ count: 1 });
  db.tx.moistureReading.updateMany.mockResolvedValue({ count: 1 });
  db.tx.environmentalData.updateMany.mockResolvedValue({ count: 1 });
  db.transaction.mockImplementation(
    async (callback: (client: typeof db.tx) => unknown) => callback(db.tx),
  );
});

describe("the NIR form and a signed moisture reading", () => {
  it("refuses a save that changes the signed reading, and writes nothing", async () => {
    db.readingFindMany.mockResolvedValue([SIGNED_READING]);

    const response = await save({
      moistureReadings: [{ ...asSent(SIGNED_READING), moistureLevel: 22 }],
      baseIds: { moistureReadings: ["mr_signed"] },
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("signed evidence record");
    expect(JSON.stringify(body)).toContain("cannot be changed");
    nothingWritten();
  });

  it("refuses a save that changes where the signed reading was taken", async () => {
    db.readingFindMany.mockResolvedValue([SIGNED_READING]);

    const response = await save({
      moistureReadings: [{ ...asSent(SIGNED_READING), location: "Laundry" }],
      baseIds: { moistureReadings: ["mr_signed"] },
    });

    expect(response.status).toBe(409);
    nothingWritten();
  });

  it("refuses a save that would remove the signed reading, and writes nothing", async () => {
    // The form loaded it and no longer sends it: before, that deleted it.
    db.readingFindFirst.mockResolvedValue({ id: "mr_signed" });

    const response = await save({
      moistureReadings: [],
      baseIds: { moistureReadings: ["mr_signed"] },
    });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("cannot be removed");
    // It asked about exactly the dropped row, and only about signed rows.
    expect(db.readingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inspectionId: "insp_1",
          id: { in: ["mr_signed"] },
          evidenceItemId: { not: null },
        }),
      }),
    );
    nothingWritten();
  });

  it("saves an unchanged resubmission, with its pin and flags, and leaves the signed values alone", async () => {
    // The form resubmits every reading it loaded on every save. Refusing this
    // would lock the technician out of the whole form.
    db.readingFindMany.mockResolvedValue([SIGNED_READING]);

    const response = await save({
      moistureReadings: [
        { ...asSent(SIGNED_READING), mapX: 0.25, mapY: 0.5, isBaseline: true },
      ],
      baseIds: { moistureReadings: ["mr_signed"] },
    });

    expect(response.status).toBe(200);
    expect(db.tx.moistureReading.updateMany).toHaveBeenCalledTimes(1);
    const written = db.tx.moistureReading.updateMany.mock.calls[0][0].data;
    expect(written).toEqual({ mapX: 0.25, mapY: 0.5, isBaseline: true });
    for (const signed of ["location", "surfaceType", "moistureLevel", "depth"]) {
      expect(signed in written, `${signed} is not rewritten`).toBe(false);
    }
  });

  it("never deletes a signed reading even if the check were bypassed", async () => {
    // The transaction's own delete carries the same condition, so a row that
    // gains its link between the check and the write still survives.
    const response = await save({
      moistureReadings: [],
      baseIds: { moistureReadings: ["mr_plain"] },
    });

    expect(response.status).toBe(200);
    expect(db.tx.moistureReading.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ evidenceItemId: null }),
      }),
    );
    expect(db.tx.environmentalData.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ evidenceItemId: null }),
      }),
    );
  });

  it("a signed reading the form never loaded cannot block a save", async () => {
    // The guard reasons only about ids this save names: the rows it sends and
    // the rows it says it loaded. It never scans the job. So a signed reading
    // the form was not given - however it is stored, retired or not - is not
    // looked at, and cannot turn every save of the job into a refusal.
    const response = await save({
      moistureReadings: [],
      baseIds: { moistureReadings: [] },
    });

    expect(response.status).toBe(200);
    expect(db.readingFindMany).not.toHaveBeenCalled();
    expect(db.readingFindFirst).not.toHaveBeenCalled();
    expect(db.environmentalFindMany).not.toHaveBeenCalled();
    expect(db.environmentalFindFirst).not.toHaveBeenCalled();
  });

  it("asks only about the ids the save names", async () => {
    db.readingFindMany.mockResolvedValue([SIGNED_READING]);

    await save({
      moistureReadings: [asSent(SIGNED_READING)],
      baseIds: { moistureReadings: ["mr_signed", "mr_dropped"] },
    });

    expect(db.readingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["mr_signed"] }, inspectionId: "insp_1" },
      }),
    );
    expect(db.readingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["mr_dropped"] } }),
      }),
    );
  });

  it("still lets an unsigned reading be edited", async () => {
    // The rule is narrow on purpose: a reading typed into this form is not
    // signed, and correcting it here is the form's job.
    db.readingFindMany.mockResolvedValue([UNSIGNED_READING]);

    const response = await save({
      moistureReadings: [{ ...asSent(UNSIGNED_READING), moistureLevel: 31 }],
      baseIds: { moistureReadings: ["mr_plain"] },
    });

    expect(response.status).toBe(200);
    expect(db.tx.moistureReading.updateMany.mock.calls[0][0].data).toMatchObject({
      location: "Hall",
      moistureLevel: 31,
    });
  });

  it("refuses the whole save when one signed reading among several is changed", async () => {
    db.readingFindMany.mockResolvedValue([UNSIGNED_READING, SIGNED_READING]);

    const response = await save({
      moistureReadings: [
        { ...asSent(UNSIGNED_READING), moistureLevel: 31 },
        { ...asSent(SIGNED_READING), depth: "Subsurface" },
      ],
      baseIds: { moistureReadings: ["mr_plain", "mr_signed"] },
    });

    expect(response.status).toBe(409);
    nothingWritten();
  });
});

describe("the NIR form and a signed ambient reading", () => {
  const ambient = (over: Record<string, unknown> = {}) => ({
    id: "env_signed",
    ambientTemperature: 22.5,
    humidityLevel: 68,
    dewPoint: 16.2,
    airCirculation: true,
    weatherConditions: "Fine",
    ...over,
  });

  it("refuses a save that changes the signed humidity, and writes nothing", async () => {
    db.environmentalFindMany.mockResolvedValue([SIGNED_AMBIENT]);

    const response = await save({
      environmentalData: ambient({ humidityLevel: 72 }),
      baseIds: { moistureReadings: [], environmentalData: ["env_signed"] },
    });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("ambient reading");
    nothingWritten();
  });

  it("refuses a save that would remove the signed ambient reading", async () => {
    db.environmentalFindFirst.mockResolvedValue({ id: "env_signed" });

    const response = await save({
      baseIds: { moistureReadings: [], environmentalData: ["env_signed"] },
    });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("cannot be removed");
    nothingWritten();
  });

  it("saves dew point and weather on a signed ambient row, and leaves temperature and humidity alone", async () => {
    db.environmentalFindMany.mockResolvedValue([SIGNED_AMBIENT]);

    const response = await save({
      environmentalData: ambient({ dewPoint: 15.9, weatherConditions: "Overcast" }),
      baseIds: { moistureReadings: [], environmentalData: ["env_signed"] },
    });

    expect(response.status).toBe(200);
    const written = db.tx.environmentalData.updateMany.mock.calls[0][0].data;
    expect(written).toMatchObject({ dewPoint: 15.9, weatherConditions: "Overcast" });
    expect("ambientTemperature" in written).toBe(false);
    expect("humidityLevel" in written).toBe(false);
  });
});
