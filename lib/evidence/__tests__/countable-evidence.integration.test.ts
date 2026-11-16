/**
 * RA-8388 - real-database proof of which evidence records count.
 *
 * The rule is a relation filter, and how a relation filter treats a record
 * with NO linked reading is decided by Postgres, not by a mocked client. A
 * filter that dropped unlinked records would zero every photo and note step.
 * So nothing here is mocked.
 *
 * Runs only when DATABASE_URL is set
 * (`npm run test:db -- lib/evidence/__tests__/countable-evidence`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  COUNTABLE_EVIDENCE_WHERE,
  countableEvidence,
} from "../countable-evidence";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error(
    "RELEASE_DB_PROFILE requires DATABASE_URL; the countable-evidence proof may not skip",
  );
}

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra8388count-${Date.now().toString(36)}`;

let ownerId = "";
let inspectionId = "";
let stepId = "";
const ids = { note: "", active: "", retired: "", ambient: "" };

async function evidence(
  evidenceClass: "MOISTURE_READING" | "AMBIENT_ENVIRONMENTAL" | "TECHNICIAN_NOTE",
  minute: number,
) {
  return prisma.evidenceItem.create({
    data: {
      inspectionId,
      workflowStepId: stepId,
      evidenceClass,
      title: evidenceClass,
      capturedById: ownerId,
      capturedByName: "Test Technician",
      capturedAt: new Date(Date.UTC(2026, 10, 16, 1, minute)),
    },
  });
}

async function moisture(evidenceItemId: string, invalidatedAt: Date | null) {
  return prisma.moistureReading.create({
    data: {
      inspectionId,
      evidenceItemId,
      location: "Kitchen north wall",
      surfaceType: "Plasterboard",
      moistureLevel: 18.4,
      depth: "Surface",
      invalidatedAt,
    },
  });
}

describe.skipIf(!HAS_DB)("RA-8388 countable evidence on a real database", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    ownerId = owner.id;
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber: `${S}-0`,
        propertyAddress: "84 Test Road",
        propertyPostcode: "2135",
        userId: ownerId,
        status: "DRAFT",
      },
    });
    inspectionId = inspection.id;
    const workflow = await prisma.inspectionWorkflow.create({
      data: {
        inspectionId,
        jobType: "water",
        steps: {
          create: {
            stepOrder: 1,
            stepKey: "moisture_mapping",
            stepTitle: "Moisture Mapping",
            requiredEvidenceClasses: '["MOISTURE_READING"]',
            minimumEvidenceCount: 5,
          },
        },
      },
      include: { steps: true },
    });
    stepId = workflow.steps[0].id;

    // Four records on the one step:
    //  - a note with no linked reading
    //  - a moisture reading that is still valid
    //  - a moisture reading that has been retired
    //  - an ambient reading (linked to EnvironmentalData, which cannot retire)
    ids.note = (await evidence("TECHNICIAN_NOTE", 0)).id;
    ids.active = (await evidence("MOISTURE_READING", 1)).id;
    ids.retired = (await evidence("MOISTURE_READING", 2)).id;
    ids.ambient = (await evidence("AMBIENT_ENVIRONMENTAL", 3)).id;
    await moisture(ids.active, null);
    await moisture(ids.retired, new Date("2026-11-16T02:00:00.000Z"));
    await prisma.environmentalData.create({
      data: {
        inspectionId,
        evidenceItemId: ids.ambient,
        ambientTemperature: 22,
        humidityLevel: 55,
      },
    });
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it("positive control: all four records exist on the step", async () => {
    const all = await prisma.evidenceItem.findMany({ where: { inspectionId } });
    expect(all.map((e) => e.id).sort()).toEqual(
      [ids.note, ids.active, ids.retired, ids.ambient].sort(),
    );
  });

  it("a list query leaves out only the record whose reading was retired", async () => {
    const counted = await prisma.evidenceItem.findMany({
      where: countableEvidence({ inspectionId }),
      select: { id: true },
    });
    expect(counted.map((e) => e.id).sort()).toEqual(
      [ids.note, ids.active, ids.ambient].sort(),
    );
  });

  it("a step count leaves out only the record whose reading was retired", async () => {
    const step = await prisma.workflowStep.findUniqueOrThrow({
      where: { id: stepId },
      select: {
        _count: {
          select: { evidenceItems: { where: COUNTABLE_EVIDENCE_WHERE } },
        },
      },
    });
    expect(step._count.evidenceItems).toBe(3);
  });

  it("an inspection-wide count leaves out only the retired record", async () => {
    const inspection = await prisma.inspection.findUniqueOrThrow({
      where: { id: inspectionId },
      select: {
        _count: {
          select: { evidenceItems: { where: COUNTABLE_EVIDENCE_WHERE } },
        },
      },
    });
    expect(inspection._count.evidenceItems).toBe(3);
  });

  it("keeps the caller's own narrowing", async () => {
    const counted = await prisma.evidenceItem.findMany({
      where: countableEvidence({
        inspectionId,
        evidenceClass: "MOISTURE_READING",
      }),
      select: { id: true },
    });
    expect(counted.map((e) => e.id)).toEqual([ids.active]);
  });
});
