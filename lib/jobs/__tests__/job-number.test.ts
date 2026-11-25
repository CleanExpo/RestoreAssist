/**
 * RA-8495 — per-organisation job number. The derivation cases run everywhere;
 * the allocation cases need a real Postgres (DATABASE_URL, as in CI and
 * `npm run test:db`), because the guarantee under test is the database's row
 * lock, which a mocked client cannot show.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  allocateJobNumber,
  deriveJobNumberPrefix,
  formatJobNumber,
  normaliseJobNumberPrefix,
  previewJobNumber,
} from "@/lib/jobs/job-number";

describe("deriveJobNumberPrefix", () => {
  it.each([
    ["DRC (NSW) Pty Ltd", "DRC"],
    ["Coastal Water Restorations", "CWR"],
    ["The Dry Team Pty Ltd", "DT"],
    ["ABC Restorations", "ABC"],
    ["Pty Ltd", "JOB"],
    ["", "JOB"],
    [null, "JOB"],
    ["Zed", "JOB"],
  ])("%s -> %s", (name, expected) => {
    expect(deriveJobNumberPrefix(name)).toBe(expected);
  });

  it("formats with four digits and grows past 9999", () => {
    expect(formatJobNumber("DRC", 1)).toBe("DRC-0001");
    expect(formatJobNumber("DRC", 12345)).toBe("DRC-12345");
  });

  it("normalises an admin prefix and refuses bad ones", () => {
    expect(normaliseJobNumberPrefix(" drc ")).toBe("DRC");
    expect(normaliseJobNumberPrefix("D")).toBeNull();
    expect(normaliseJobNumberPrefix("DRC-NSW")).toBeNull();
    expect(normaliseJobNumberPrefix(42)).toBeNull();
  });
});

const S = `ra8495-${Date.now().toString(36)}`;
const created = { users: [] as string[], orgs: [] as string[] };

async function makeOrg(name: string) {
  const owner = await prisma.user.create({
    data: {
      email: `${S}-${created.users.length}@test.local`,
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
    },
  });
  created.users.push(owner.id);
  const org = await prisma.organization.create({
    data: { name, ownerId: owner.id },
  });
  created.orgs.push(org.id);
  return org.id;
}

function allocateAlone(organizationId: string) {
  return prisma.$transaction((tx) => allocateJobNumber(tx, organizationId));
}

describe.skipIf(!process.env.DATABASE_URL)(
  "allocateJobNumber on Postgres (RA-8495)",
  () => {
    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.organization.deleteMany({ where: { id: { in: created.orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    });

    it("two saves at once never get the same number (5 in parallel from a fresh organisation)", async () => {
      const orgId = await makeOrg("Parallel Restorations");
      const N = 5;
      const results = await Promise.all(
        Array.from({ length: N }, () => allocateAlone(orgId)),
      );
      const values = results.map((r) => r.value).sort((a, b) => a - b);
      expect(values).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(results.map((r) => r.jobNumber)).size).toBe(N);
      const seq = await prisma.organizationJobSequence.findUnique({
        where: { organizationId: orgId },
      });
      expect(seq?.lastValue).toBe(N);
    });

    it("freezes the derived prefix on first allocation", async () => {
      const orgId = await makeOrg("DRC (NSW) Pty Ltd");
      const first = await allocateAlone(orgId);
      expect(first.jobNumber).toBe("DRC-0001");
      await prisma.organization.update({
        where: { id: orgId },
        data: { name: "Renamed Business Pty Ltd" },
      });
      const second = await allocateAlone(orgId);
      expect(second.jobNumber).toBe("DRC-0002");
    });

    it("a save that rolls back releases its number", async () => {
      const orgId = await makeOrg("Rollback Restorations");
      expect((await allocateAlone(orgId)).value).toBe(1);
      await expect(
        prisma.$transaction(async (tx) => {
          await allocateJobNumber(tx, orgId);
          throw new Error("job create failed");
        }),
      ).rejects.toThrow("job create failed");
      expect((await allocateAlone(orgId)).value).toBe(2);
    });

    it("the database refuses a duplicate job number in one organisation", async () => {
      const orgId = await makeOrg("Duplicate Restorations");
      const row = (n: number) => ({
        inspectionNumber: `${S}-dup-${n}`,
        propertyAddress: "1 Test Street",
        propertyPostcode: "2000",
        userId: created.users[created.users.length - 1],
        jobNumber: "DUP-0001",
        jobNumberOrganizationId: orgId,
      });
      await prisma.inspection.create({ data: row(1) });
      await expect(prisma.inspection.create({ data: row(2) })).rejects.toMatchObject({
        code: "P2002",
      });
      await prisma.inspection.deleteMany({ where: { jobNumberOrganizationId: orgId } });
    });

    it("an other organisation has its own counter and never moves this one", async () => {
      const orgA = await makeOrg("Alpha Restorations");
      const orgB = await makeOrg("Bravo Restorations");
      expect((await allocateAlone(orgA)).value).toBe(1);
      expect((await allocateAlone(orgA)).value).toBe(2);
      const b = await allocateAlone(orgB);
      expect(b.value).toBe(1);
      expect(b.jobNumber).toBe("BR-0001");
      expect((await allocateAlone(orgA)).value).toBe(3);
      const preview = await previewJobNumber(prisma, orgB);
      expect(preview).toEqual({ prefix: "BR", derived: false, nextJobNumber: "BR-0002" });
    });

    it("previews without allocating", async () => {
      const orgId = await makeOrg("Preview Restorations");
      const preview = await previewJobNumber(prisma, orgId);
      expect(preview).toEqual({ prefix: "PR", derived: true, nextJobNumber: "PR-0001" });
      const seq = await prisma.organizationJobSequence.findUnique({
        where: { organizationId: orgId },
      });
      expect(seq).toBeNull();
    });

    it("rejects an organisation that does not exist without leaving a counter row", async () => {
      await expect(allocateAlone(`${S}-missing`)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
      const seq = await prisma.organizationJobSequence.findUnique({
        where: { organizationId: `${S}-missing` },
      });
      expect(seq).toBeNull();
    });
  },
);
