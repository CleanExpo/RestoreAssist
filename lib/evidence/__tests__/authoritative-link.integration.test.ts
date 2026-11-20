/**
 * RA-8388 AMENDMENT 05 - real-database proof of the evidence link and the
 * duplicate guard.
 *
 * A foreign key and a unique index are enforced by Postgres, not by Prisma.
 * A mocked Prisma client would accept the very insert the database must
 * refuse, so nothing here is mocked: it runs on a migrated Postgres and reads
 * the answer the database gives.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db -- lib/evidence`). The
 * Done recipe asserts a minimum passing count, so a silent skip is a failure
 * there, not a pass.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  deriveAuthoritativeRow,
  linkPlanToEvidence,
} from "../authoritative-rows";
import {
  SIGNED_CAPTURE_INDEX,
  isSignedCaptureDuplicate,
} from "../signed-capture-key";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error(
    "RELEASE_DB_PROFILE requires DATABASE_URL; the evidence link proof may not skip",
  );
}

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra8388link-${Date.now().toString(36)}`;
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

let ownerId = "";
let counter = 0;

async function newInspection(): Promise<string> {
  const inspection = await prisma.inspection.create({
    data: {
      inspectionNumber: `${S}-${counter++}`,
      propertyAddress: "84 Test Road",
      propertyPostcode: "2135",
      userId: ownerId,
      status: "DRAFT",
    },
  });
  return inspection.id;
}

interface EvidenceInput {
  inspectionId: string;
  evidenceClass?: "MOISTURE_READING" | "AMBIENT_ENVIRONMENTAL" | "TECHNICIAN_NOTE";
  metadataSha256?: string | null;
  capturedAt?: Date;
}

function evidenceData(input: EvidenceInput) {
  return {
    inspectionId: input.inspectionId,
    evidenceClass: input.evidenceClass ?? "MOISTURE_READING",
    title: "Moisture reading",
    capturedById: ownerId,
    capturedByName: "Test Technician",
    capturedAt: input.capturedAt ?? new Date("2026-11-16T01:00:00.000Z"),
    metadataSha256: input.metadataSha256 ?? null,
  } as const;
}

/** The same two-step write the route performs, through the same functions. */
async function signedMoistureCapture(input: EvidenceInput) {
  const capturedAt = input.capturedAt ?? new Date("2026-11-16T01:00:00.000Z");
  const derived = deriveAuthoritativeRow(
    "MOISTURE_READING",
    {
      location: "Kitchen north wall",
      surfaceType: "Plasterboard",
      moistureLevel: 18.4,
      depth: "Surface",
    },
    { inspectionId: input.inspectionId, capturedAt, notes: null },
  );
  if (!derived.ok || !derived.plan) throw new Error("fixture did not derive a row");
  const plan = derived.plan;

  return prisma.$transaction(async (tx) => {
    const evidence = await tx.evidenceItem.create({
      data: evidenceData({ ...input, capturedAt }),
    });
    const linked = linkPlanToEvidence(plan, evidence.id);
    if (linked.table !== "moistureReading") throw new Error("wrong table");
    const reading = await tx.moistureReading.create({ data: linked.data });
    return { evidence, reading };
  });
}

async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

describe.skipIf(!HAS_DB)("RA-8388 on a real database", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    ownerId = owner.id;
  });

  afterAll(async () => {
    // Whole inspections, so the cascade this suite proves is also its cleanup.
    await prisma.inspection.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  describe("evidence link", () => {
    it("stores the evidence link on the moisture reading the dual write creates", async () => {
      const inspectionId = await newInspection();
      const { evidence, reading } = await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
      });

      const stored = await prisma.moistureReading.findUnique({
        where: { id: reading.id },
      });
      expect(stored?.evidenceItemId).toBe(evidence.id);

      // The join the backfill and a rollback query both rely on.
      const viaEvidence = await prisma.evidenceItem.findUnique({
        where: { id: evidence.id },
        include: { moistureReading: true },
      });
      expect(viaEvidence?.moistureReading?.id).toBe(reading.id);
    });

    it("stores the evidence link on an ambient reading too", async () => {
      const inspectionId = await newInspection();
      const capturedAt = new Date("2026-11-16T02:00:00.000Z");
      const derived = deriveAuthoritativeRow(
        "AMBIENT_ENVIRONMENTAL",
        { location: "Lounge", ambientTemperature: 22.5, humidityLevel: 68 },
        { inspectionId, capturedAt, notes: null },
      );
      if (!derived.ok || !derived.plan) throw new Error("fixture did not derive a row");
      const evidence = await prisma.evidenceItem.create({
        data: evidenceData({
          inspectionId,
          evidenceClass: "AMBIENT_ENVIRONMENTAL",
          capturedAt,
          metadataSha256: DIGEST_A,
        }),
      });
      const linked = linkPlanToEvidence(derived.plan, evidence.id);
      if (linked.table !== "environmentalData") throw new Error("wrong table");
      const row = await prisma.environmentalData.create({ data: linked.data });

      const stored = await prisma.environmentalData.findUnique({
        where: { id: row.id },
      });
      expect(stored?.evidenceItemId).toBe(evidence.id);
    });

    it("refuses an evidence link that points at no evidence record", async () => {
      const inspectionId = await newInspection();
      const error = await thrown(() =>
        prisma.moistureReading.create({
          data: {
            inspectionId,
            location: "Hall",
            surfaceType: "Timber",
            moistureLevel: 12,
            depth: "Surface",
            evidenceItemId: "no-such-evidence-record",
          },
        }),
      );
      expect((error as { code?: string } | null)?.code).toBe("P2003");
    });

    it("refuses to delete an evidence record while its evidence link is held by a counted reading", async () => {
      const inspectionId = await newInspection();
      const { evidence, reading } = await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
      });

      const error = await thrown(() =>
        prisma.evidenceItem.delete({ where: { id: evidence.id } }),
      );
      expect(error, "the delete must be refused, not cascade").not.toBeNull();

      // Both halves are still there: nothing was deleted and nothing unlinked.
      expect(
        await prisma.evidenceItem.findUnique({ where: { id: evidence.id } }),
      ).not.toBeNull();
      const stillThere = await prisma.moistureReading.findUnique({
        where: { id: reading.id },
      });
      expect(stillThere?.evidenceItemId).toBe(evidence.id);
    });

    it("refuses a second counted reading on one evidence link", async () => {
      const inspectionId = await newInspection();
      const { evidence } = await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
      });

      const error = await thrown(() =>
        prisma.moistureReading.create({
          data: {
            inspectionId,
            location: "Kitchen north wall",
            surfaceType: "Plasterboard",
            moistureLevel: 18.4,
            depth: "Surface",
            evidenceItemId: evidence.id,
          },
        }),
      );
      expect((error as { code?: string } | null)?.code).toBe("P2002");
      // And it is NOT mistaken for the signed-capture duplicate guard.
      expect(isSignedCaptureDuplicate(error)).toBe(false);
    });

    it("still deletes a whole inspection whose readings hold an evidence link", async () => {
      // Inspection cascades to EvidenceItem AND to MoistureReading, and the
      // reading also references the evidence record with NO ACTION. If the
      // action were checked immediately this delete could fail depending on
      // which cascade ran first.
      const inspectionId = await newInspection();
      await signedMoistureCapture({ inspectionId, metadataSha256: DIGEST_A });
      await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
        capturedAt: new Date("2026-11-16T03:00:00.000Z"),
      });

      await prisma.inspection.delete({ where: { id: inspectionId } });

      expect(await prisma.evidenceItem.count({ where: { inspectionId } })).toBe(0);
      expect(await prisma.moistureReading.count({ where: { inspectionId } })).toBe(0);
    });

    it("leaves an unlinked reading free of the evidence link rules", async () => {
      // Every reading that exists today has no link. Nothing about this
      // change may restrict them.
      const inspectionId = await newInspection();
      const data = {
        inspectionId,
        location: "Hall",
        surfaceType: "Timber",
        moistureLevel: 12,
        depth: "Surface",
      };
      const first = await prisma.moistureReading.create({ data });
      const second = await prisma.moistureReading.create({ data });
      expect(first.evidenceItemId).toBeNull();
      expect(second.evidenceItemId).toBeNull();
      await prisma.moistureReading.delete({ where: { id: first.id } });
    });
  });

  describe("duplicate guard", () => {
    it("refuses the same signed capture twice and recognises the refusal", async () => {
      const inspectionId = await newInspection();
      await signedMoistureCapture({ inspectionId, metadataSha256: DIGEST_A });

      const error = await thrown(() =>
        signedMoistureCapture({ inspectionId, metadataSha256: DIGEST_A }),
      );

      expect((error as { code?: string } | null)?.code).toBe("P2002");
      // Held to the shape THIS driver produces, which is the whole reason the
      // recogniser is tested here and not against a hand-built error.
      expect(isSignedCaptureDuplicate(error)).toBe(true);

      // The transaction rolled back whole: one evidence record, one reading.
      expect(await prisma.evidenceItem.count({ where: { inspectionId } })).toBe(1);
      expect(await prisma.moistureReading.count({ where: { inspectionId } })).toBe(1);
    });

    it("keeps two readings of the same value taken at different signed moments", async () => {
      // The digest does not contain the capture time. A key without the
      // signed time would refuse the second of these, and a moisture survey
      // needs five readings, some of which will be equal.
      const inspectionId = await newInspection();
      await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
        capturedAt: new Date("2026-11-16T01:00:00.000Z"),
      });
      await signedMoistureCapture({
        inspectionId,
        metadataSha256: DIGEST_A,
        capturedAt: new Date("2026-11-16T01:00:00.001Z"),
      });

      expect(await prisma.evidenceItem.count({ where: { inspectionId } })).toBe(2);
      expect(await prisma.moistureReading.count({ where: { inspectionId } })).toBe(2);
    });

    it("keeps different content captured at the same signed moment", async () => {
      const inspectionId = await newInspection();
      await signedMoistureCapture({ inspectionId, metadataSha256: DIGEST_A });
      await signedMoistureCapture({ inspectionId, metadataSha256: DIGEST_B });
      expect(await prisma.evidenceItem.count({ where: { inspectionId } })).toBe(2);
    });

    it("never collides rows that carry no digest, which is every row that predates the index", async () => {
      const inspectionId = await newInspection();
      const capturedAt = new Date("2026-11-16T04:00:00.000Z");
      const data = evidenceData({ inspectionId, capturedAt, metadataSha256: null });
      await prisma.evidenceItem.create({ data });
      await prisma.evidenceItem.create({ data });
      await prisma.evidenceItem.create({ data });
      expect(await prisma.evidenceItem.count({ where: { inspectionId } })).toBe(3);
    });

    it("guards a class with no counted row, and scopes the key to one inspection", async () => {
      const first = await newInspection();
      const second = await newInspection();
      const note = (inspectionId: string) =>
        prisma.evidenceItem.create({
          data: evidenceData({
            inspectionId,
            evidenceClass: "TECHNICIAN_NOTE",
            metadataSha256: DIGEST_A,
          }),
        });

      await note(first);
      // Same content and time on ANOTHER job is a different capture.
      await note(second);

      const error = await thrown(() => note(first));
      expect(isSignedCaptureDuplicate(error)).toBe(true);
    });

    it("has the duplicate guard index under the name the recogniser looks for", async () => {
      const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${SIGNED_CAPTURE_INDEX}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toContain("UNIQUE");
      expect(rows[0].indexdef).toContain('"capturedAt"');
      expect(rows[0].indexdef).toContain('"metadataSha256"');
    });
  });
});
