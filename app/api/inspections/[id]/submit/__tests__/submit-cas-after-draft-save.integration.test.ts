/**
 * Submit's status CAS pins the `updatedAt` it validated. That only works if a
 * draft save's parent write bumps `updatedAt` in Postgres. draft-snapshot
 * writes the parent with `updateMany`, so this asserts the real column moves
 * under that exact call and the pinned CAS then matches nothing.
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `subcas-${Date.now().toString(36)}`;

describe.skipIf(!HAS_DB)("submit CAS after a concurrent draft save", () => {
  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  it("does not submit the row a draft save changed after submit read it", async () => {
    const owner = await prisma.user.create({ data: { email: `${S}-owner@test.local` } });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `${S}-1`,
        propertyAddress: "1 Race St",
        propertyPostcode: "4068",
        userId: owner.id,
        status: "DRAFT",
      },
    });
    // Submit reads and validates this row.
    const read = await prisma.inspection.findUnique({ where: { id: insp.id } });
    await new Promise((resolve) => setTimeout(resolve, 5));

    // A draft save commits first, with the same call draft-snapshot makes.
    const saved = await prisma.inspection.updateMany({
      where: { id: insp.id, status: "DRAFT" },
      data: { lossDescription: "changed by a concurrent save" },
    });
    expect(saved.count).toBe(1);
    const after = await prisma.inspection.findUnique({ where: { id: insp.id } });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(read!.updatedAt.getTime());

    // Submit's CAS, pinned to what it validated, now matches nothing.
    const submitted = await prisma.inspection.updateMany({
      where: { id: insp.id, status: "DRAFT", updatedAt: read!.updatedAt },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    expect(submitted.count).toBe(0);
    const final = await prisma.inspection.findUnique({ where: { id: insp.id } });
    expect(final!.status).toBe("DRAFT");
  });
});
