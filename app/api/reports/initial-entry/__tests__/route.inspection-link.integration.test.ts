/**
 * RA-7726 — a report created from /dashboard/reports/new?inspectionId=<id>
 * must link back to that inspection.
 *
 * Before the fix POST /api/reports/initial-entry ignored `inspectionId`, so
 * Inspection.reportId stayed null and Generate Invoice refused the job with
 * "A linked report is required before generating an invoice."
 *
 * prisma is NOT mocked: the tenancy question (may this caller write that
 * inspection?) is answered by real rows, not by the shape of a where clause.
 * Runs only when DATABASE_URL is set, like the other *.integration tests.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _userId: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({
  recordFirstReportSaved: async () => undefined,
}));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: async () => ({ allowed: true }),
  deductCreditsAndTrackUsage: async () => undefined,
}));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7726-${Date.now().toString(36)}`;

const ids = {
  ownerA: "",
  ownerB: "",
  inspA: "",
  inspB: "",
  inspLinked: "",
  existingReport: "",
  orgAdmin: "",
  tech: "",
  inspTech: "",
  org: "",
};

const BODY = {
  clientName: "Synthetic Client",
  propertyAddress: "1 Test Street, Brisbane QLD 4000",
  propertyPostcode: "4000",
  technicianFieldReport: "Attended site.",
};

async function createAs(userId: string, inspectionId: string) {
  getServerSession.mockResolvedValueOnce({ user: { id: userId } });
  return POST(
    new NextRequest("http://localhost/api/reports/initial-entry", {
      method: "POST",
      body: JSON.stringify({ ...BODY, inspectionId }),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe.skipIf(!HAS_DB)(
  "POST /api/reports/initial-entry links the inspection it came from (RA-7726)",
  () => {
    beforeAll(async () => {
      const user = (tag: string) =>
        prisma.user.create({
          data: {
            email: `${S}-${tag}@test.local`,
            role: "ADMIN",
            subscriptionStatus: "TRIAL",
          },
        });
      const ownerA = await user("ownerA");
      const ownerB = await user("ownerB");
      ids.ownerA = ownerA.id;
      ids.ownerB = ownerB.id;

      const insp = (userId: string, tag: string, reportId?: string) =>
        prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-${tag}`,
            propertyAddress: `${tag} St`,
            propertyPostcode: "4000",
            userId,
            ...(reportId ? { reportId } : {}),
          },
        });

      ids.inspA = (await insp(ownerA.id, "A")).id;
      ids.inspB = (await insp(ownerB.id, "B")).id;

      const existing = await prisma.report.create({
        data: {
          userId: ownerA.id,
          title: `${S}-existing`,
          clientName: "Synthetic Client",
          propertyAddress: "2 Test Street",
          hazardType: "WATER",
          insuranceType: "UNKNOWN",
        },
      });
      ids.existingReport = existing.id;
      ids.inspLinked = (await insp(ownerA.id, "linked", existing.id)).id;

      // A technician's inspection, and an ADMIN in the same business who can
      // write it but is not its owner.
      const orgAdmin = await user("orgAdmin");
      const tech = await prisma.user.create({
        data: {
          email: `${S}-tech@test.local`,
          role: "USER",
          subscriptionStatus: "TRIAL",
        },
      });
      ids.orgAdmin = orgAdmin.id;
      ids.tech = tech.id;
      const org = await prisma.organization.create({
        data: { name: `${S} business`, ownerId: orgAdmin.id, country: "AU" },
      });
      ids.org = org.id;
      await prisma.user.updateMany({
        where: { id: { in: [orgAdmin.id, tech.id] } },
        data: { organizationId: org.id },
      });
      ids.inspTech = (await insp(tech.id, "tech")).id;
    });

    afterAll(async () => {
      const userIds = [ids.ownerA, ids.ownerB, ids.orgAdmin, ids.tech].filter(
        Boolean,
      );
      await prisma.inspection.deleteMany({
        where: { inspectionNumber: { startsWith: S } },
      });
      await prisma.report.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.client.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { organizationId: null },
      });
      if (ids.org) {
        await prisma.organization.deleteMany({ where: { id: ids.org } });
      }
      await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
    });

    it("sets Inspection.reportId to the report it just created", async () => {
      const res = await createAs(ids.ownerA, ids.inspA);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        report: { id: string };
        inspectionLinked: boolean;
      };

      const insp = await prisma.inspection.findUnique({
        where: { id: ids.inspA },
        select: { reportId: true },
      });
      expect(insp?.reportId).toBe(json.report.id);
      expect(json.inspectionLinked).toBe(true);
    });

    it("refuses another tenant's inspection with a 404 and links nothing", async () => {
      const before = await prisma.report.count({
        where: { userId: ids.ownerA },
      });

      const res = await createAs(ids.ownerA, ids.inspB);
      expect(res.status).toBe(404);

      const insp = await prisma.inspection.findUnique({
        where: { id: ids.inspB },
        select: { reportId: true },
      });
      expect(insp?.reportId).toBeNull();
      // Refused before the report is written or a credit is spent.
      expect(await prisma.report.count({ where: { userId: ids.ownerA } })).toBe(
        before,
      );
    });

    it("answers a missing inspection exactly like another tenant's", async () => {
      const res = await createAs(ids.ownerA, `${S}-does-not-exist`);
      expect(res.status).toBe(404);
    });

    it("leaves an inspection that already has a report linked to it", async () => {
      const res = await createAs(ids.ownerA, ids.inspLinked);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { inspectionLinked: boolean };
      expect(json.inspectionLinked).toBe(false);

      const insp = await prisma.inspection.findUnique({
        where: { id: ids.inspLinked },
        select: { reportId: true },
      });
      expect(insp?.reportId).toBe(ids.existingReport);
    });

    it("does not link a colleague's report, which the owner could not invoice", async () => {
      const res = await createAs(ids.orgAdmin, ids.inspTech);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { inspectionLinked: boolean };
      expect(json.inspectionLinked).toBe(false);

      const insp = await prisma.inspection.findUnique({
        where: { id: ids.inspTech },
        select: { reportId: true },
      });
      expect(insp?.reportId).toBeNull();
    });
  },
);
