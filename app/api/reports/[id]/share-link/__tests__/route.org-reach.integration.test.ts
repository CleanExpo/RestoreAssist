/**
 * RA-7641 / D-023 amendment — real-database proof that minting a share link
 * follows the organisation READ reach.
 *
 * A technician creates a report; the business owner (same organisation) must be
 * able to share it. A user in another organisation must still get 404.
 *
 * RA-7771: the homeowner view the link opens shows the report total, so
 * minting it follows the FINANCIAL reach, as insurer-link does. A MANAGER in the
 * business may share a technician's report; a USER colleague gets 404.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session is mocked;
 * Prisma is real. Synthetic data only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Token signing is not the subject here, and needs a secret this test must not supply.
vi.mock("@/lib/portal-token", () => ({
  generateInsurerToken: () => "signed-token",
  insurerTokenExpiresAt: () => new Date(Date.now() + 864e5).toISOString(),
}));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const S = `ra7641-share-${Date.now().toString(36)}`;
const ids = { owner: "", tech: "", manager: "", colleague: "", outsider: "", report: "" };

function shareAs(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  return POST(
    new NextRequest(`http://localhost/api/reports/${ids.report}/share-link`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: ids.report }) },
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "POST /api/reports/[id]/share-link: organisation read reach (RA-7641)",
  () => {
    beforeAll(async () => {
      const owner = await prisma.user.create({
        data: { email: `${S}-owner@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      const tech = await prisma.user.create({
        data: { email: `${S}-tech@test.local`, role: "USER", subscriptionStatus: "TRIAL" },
      });
      const outsider = await prisma.user.create({
        data: { email: `${S}-out@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      const manager = await prisma.user.create({
        data: { email: `${S}-manager@test.local`, role: "MANAGER", subscriptionStatus: "TRIAL" },
      });
      const colleague = await prisma.user.create({
        data: { email: `${S}-colleague@test.local`, role: "USER", subscriptionStatus: "TRIAL" },
      });
      ids.owner = owner.id;
      ids.tech = tech.id;
      ids.manager = manager.id;
      ids.colleague = colleague.id;
      ids.outsider = outsider.id;

      const org = await prisma.organization.create({
        data: { name: `${S} business`, ownerId: owner.id, country: "AU" },
      });
      await prisma.user.updateMany({
        where: { id: { in: [owner.id, tech.id, manager.id, colleague.id] } },
        data: { organizationId: org.id },
      });
      const otherOrg = await prisma.organization.create({
        data: { name: `${S} other`, ownerId: outsider.id, country: "AU" },
      });
      await prisma.user.update({
        where: { id: outsider.id },
        data: { organizationId: otherOrg.id },
      });

      ids.report = (
        await prisma.report.create({
          data: {
            title: "Synthetic technician report",
            clientName: "Synthetic Client",
            propertyAddress: "1 Synthetic St",
            hazardType: "Water",
            insuranceType: "Building",
            userId: tech.id,
          },
        })
      ).id;
    });

    afterAll(async () => {
      const users = [ids.owner, ids.tech, ids.manager, ids.colleague, ids.outsider].filter(Boolean);
      await prisma.report.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } });
      await prisma.organization.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    it("lets the owner share a report a technician in the same business created", async () => {
      const res = await shareAs(ids.owner);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toContain(`/reports/${ids.report}/view?token=`);
    });

    it("still returns 404 to a user in a different organisation", async () => {
      const res = await shareAs(ids.outsider);
      expect(res.status).toBe(404);
    });

    // RA-7771: the homeowner view shows totalCost, so sharing is a money read.
    it("lets a MANAGER in the business share a technician's report", async () => {
      const res = await shareAs(ids.manager);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toContain(`/reports/${ids.report}/view?token=`);
    });

    it("returns 404 to a USER colleague, who must not see the report total", async () => {
      const res = await shareAs(ids.colleague);
      expect(res.status).toBe(404);
    });
  },
);
