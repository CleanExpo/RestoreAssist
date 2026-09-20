/**
 * RA-7582 — Real-database proof that a second person in the same business can
 * see the business's inspections.
 *
 * This is the control for the defect, and it is written to FAIL on the commit
 * that introduced it. Before the fix, `app/api/inspections/route.ts` builds
 * `where = { userId: session.user.id }`, so:
 *
 *   - an invited technician lists inspections and receives an empty array,
 *     which is what makes a trial team of two conclude the product is broken;
 *   - the owner never sees the inspection that technician created.
 *
 * Unlike `route.list-create.test.ts`, prisma is NOT mocked here. That test
 * asserts the SHAPE of the where clause, which cannot distinguish a filter
 * that is correct from one that merely looks correct. This one seeds real rows
 * and asserts the rows the HTTP handler actually returns.
 *
 * Runs only when DATABASE_URL is set (CI Quality Checks against a migrated
 * database). Skipped locally without one, in line with
 * `lib/auth/__tests__/ownership-writes.integration.test.ts`.
 *
 * The negative arms matter as much as the positive ones. Widening reach from
 * one user to a whole organisation is precisely the change that leaks another
 * tenant's data if it is done carelessly, so organisation B and the org-less
 * solo operator are asserted on every run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { GET } from "../route";
import { GET as detailGET } from "../[id]/route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7582-${Date.now().toString(36)}`;

const ids = {
  ownerA: "",
  techA: "",
  ownerB: "",
  solo: "",
  orgA: "",
  orgB: "",
  inspOwnerA: "",
  inspTechA: "",
  inspOwnerB: "",
  inspSolo: "",
};

/** Call GET /api/inspections as a given user and return the inspection ids. */
async function listAs(userId: string): Promise<string[]> {
  getServerSession.mockResolvedValueOnce({ user: { id: userId } });
  const res = await GET(
    new NextRequest("http://localhost/api/inspections?limit=100"),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as { inspections: Array<{ id: string }> };
  return json.inspections.map((i) => i.id);
}

describe.skipIf(!HAS_DB)(
  "GET /api/inspections reaches the whole organisation (RA-7582)",
  () => {
    beforeAll(async () => {
      // Organisation A: an owner and an invited technician. The technician is
      // role USER because that is what the invite flow assigns
      // (app/api/invites/[token]/route.ts:43) -- seeding them as ADMIN would
      // make this test pass for a reason the product never produces.
      const ownerA = await prisma.user.create({
        data: { email: `${S}-ownerA@test.local`, role: "ADMIN" },
      });
      const ownerB = await prisma.user.create({
        data: { email: `${S}-ownerB@test.local`, role: "ADMIN" },
      });
      ids.ownerA = ownerA.id;
      ids.ownerB = ownerB.id;

      const orgA = await prisma.organization.create({
        data: { name: `${S}-orgA`, ownerId: ownerA.id },
      });
      const orgB = await prisma.organization.create({
        data: { name: `${S}-orgB`, ownerId: ownerB.id },
      });
      ids.orgA = orgA.id;
      ids.orgB = orgB.id;

      await prisma.user.update({
        where: { id: ownerA.id },
        data: { organizationId: orgA.id },
      });
      await prisma.user.update({
        where: { id: ownerB.id },
        data: { organizationId: orgB.id },
      });

      const techA = await prisma.user.create({
        data: {
          email: `${S}-techA@test.local`,
          role: "USER",
          organizationId: orgA.id,
        },
      });
      ids.techA = techA.id;

      // A solo operator with NO organisation. Two org-less accounts must never
      // match each other; without this row a null-organisation bug would look
      // identical to a pass.
      const solo = await prisma.user.create({
        data: { email: `${S}-solo@test.local`, role: "ADMIN" },
      });
      ids.solo = solo.id;

      const insp = (userId: string, tag: string) =>
        prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-${tag}`,
            propertyAddress: `${tag} St`,
            propertyPostcode: "4000",
            userId,
          },
        });

      ids.inspOwnerA = (await insp(ownerA.id, "ownerA")).id;
      ids.inspTechA = (await insp(techA.id, "techA")).id;
      ids.inspOwnerB = (await insp(ownerB.id, "ownerB")).id;
      ids.inspSolo = (await insp(solo.id, "solo")).id;
    });

    afterAll(async () => {
      await prisma.inspection.deleteMany({
        where: { inspectionNumber: { startsWith: S } },
      });
      await prisma.user.updateMany({
        where: { email: { startsWith: S } },
        data: { organizationId: null },
      });
      await prisma.organization.deleteMany({ where: { name: { startsWith: S } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
    });

    it("shows an invited technician the work their organisation owns", async () => {
      // The headline defect. Before the fix this returns only the technician's
      // own inspection, so a real technician's first screen is empty.
      const seen = await listAs(ids.techA);
      expect(seen).toContain(ids.inspOwnerA);
    });

    it("shows the owner the work their technician created", async () => {
      const seen = await listAs(ids.ownerA);
      expect(seen).toContain(ids.inspTechA);
    });

    it("does not show organisation A's work to organisation B", async () => {
      const seen = await listAs(ids.ownerB);
      expect(seen).not.toContain(ids.inspOwnerA);
      expect(seen).not.toContain(ids.inspTechA);
      expect(seen).toContain(ids.inspOwnerB);
    });

    it("does not show an organisation's work to an org-less solo operator", async () => {
      const seen = await listAs(ids.solo);
      expect(seen).not.toContain(ids.inspOwnerA);
      expect(seen).not.toContain(ids.inspOwnerB);
      expect(seen).toContain(ids.inspSolo);
    });

    it("lets the technician OPEN the job they can now see", async () => {
      // Without this, RA-7582 is only half fixed: the job appears in the list
      // and 404s when clicked, which is a worse experience than an empty list.
      getServerSession.mockResolvedValueOnce({ user: { id: ids.techA } });
      const res = await detailGET(
        new NextRequest(
          `http://localhost/api/inspections/${ids.inspOwnerA}`,
        ),
        { params: Promise.resolve({ id: ids.inspOwnerA }) },
      );
      expect(res.status).toBe(200);
    });

    it("still refuses to open another organisation's job", async () => {
      getServerSession.mockResolvedValueOnce({ user: { id: ids.ownerB } });
      const res = await detailGET(
        new NextRequest(
          `http://localhost/api/inspections/${ids.inspOwnerA}`,
        ),
        { params: Promise.resolve({ id: ids.inspOwnerA }) },
      );
      expect(res.status).toBe(404);
    });

    it("keeps tenancy when a search filter is applied", async () => {
      // The search filter assigns `where.OR` directly. A tenancy filter shaped
      // as an OR would be silently overwritten here and this endpoint would
      // return every tenant's matching rows. Searching on the shared postcode
      // is what makes that failure visible.
      getServerSession.mockResolvedValueOnce({ user: { id: ids.ownerB } });
      const res = await GET(
        new NextRequest(
          "http://localhost/api/inspections?limit=100&search=4000",
        ),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        inspections: Array<{ id: string }>;
      };
      const seen = json.inspections.map((i) => i.id);
      expect(seen).not.toContain(ids.inspOwnerA);
      expect(seen).not.toContain(ids.inspTechA);
      expect(seen).not.toContain(ids.inspSolo);
    });
  },
);
