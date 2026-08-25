/**
 * Database-backed contract for the active-invite serializable transaction.
 * Run through `npm run test:db -- <this file>`; a plain unit run skips it.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error(
    "RELEASE_DB_PROFILE requires DATABASE_URL; invite concurrency may not skip",
  );
}

const getServerSession = vi.fn();
const sendInviteEmail = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmail(...args),
}));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: async (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/app-url", () => ({
  getAppUrl: () => "https://restoreassist.app",
}));

import { POST } from "../route";

describe.skipIf(!process.env.DATABASE_URL)(
  "POST /api/team/invites concurrent active-invite contract",
  () => {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const adminEmail = `invite-admin-${runId}@test.local`;
    const inviteeEmail = `invite-concurrent-${runId}@test.local`;
    let userId = "";
    let organizationId = "";

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: adminEmail,
          name: "Invite concurrency admin",
          role: "ADMIN",
        },
      });
      userId = user.id;
      const organization = await prisma.organization.create({
        data: { name: `Invite concurrency ${runId}`, ownerId: user.id },
      });
      organizationId = organization.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: organization.id },
      });
      getServerSession.mockResolvedValue({
        user: { id: user.id, email: user.email, role: "ADMIN" },
      });
      sendInviteEmail.mockResolvedValue({
        data: { id: "provider_receipt_1" },
        error: null,
      });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.userInvite.deleteMany({ where: { organizationId } });
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => {});
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }
    });

    it("commits exactly one active invite when two requests race", async () => {
      let requestNumber = 0;
      const makeRequest = () => {
        requestNumber += 1;
        return new NextRequest("https://restoreassist.app/api/team/invites", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://restoreassist.app",
            "idempotency-key": `invite-race-${runId}-${requestNumber}`,
          },
          body: JSON.stringify({ email: inviteeEmail, role: "USER" }),
        });
      };

      const responses = await Promise.all([
        POST(makeRequest()),
        POST(makeRequest()),
      ]);
      const statuses = responses.map((response) => response.status).sort();

      expect(statuses).toEqual([200, 409]);
      expect(
        await prisma.userInvite.count({
          where: {
            organizationId,
            email: inviteeEmail,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ).toBe(1);
      expect(sendInviteEmail).toHaveBeenCalledTimes(1);
    });

    it("permits only one active invite identity across different organizations", async () => {
      const secondAdmin = await prisma.user.create({
        data: {
          email: `invite-admin-2-${runId}@test.local`,
          name: "Second invite admin",
          role: "ADMIN",
        },
      });
      const secondOrg = await prisma.organization.create({
        data: { name: `Second invite org ${runId}`, ownerId: secondAdmin.id },
      });
      await prisma.user.update({
        where: { id: secondAdmin.id },
        data: { organizationId: secondOrg.id },
      });
      const crossOrgEmail = `invite-cross-org-${runId}@test.local`;
      const request = (key: string) =>
        new NextRequest("https://restoreassist.app/api/team/invites", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://restoreassist.app",
            "idempotency-key": key,
          },
          body: JSON.stringify({ email: crossOrgEmail, role: "USER" }),
        });

      try {
        getServerSession.mockResolvedValue({
          user: { id: userId, email: adminEmail, role: "ADMIN" },
        });
        const first = await POST(request(`cross-org-1-${runId}`));
        getServerSession.mockResolvedValue({
          user: {
            id: secondAdmin.id,
            email: secondAdmin.email,
            role: "ADMIN",
          },
        });
        const second = await POST(request(`cross-org-2-${runId}`));

        expect([first.status, second.status]).toEqual([200, 409]);
        expect(
          await prisma.userInvite.count({
            where: {
              email: crossOrgEmail,
              usedAt: null,
              expiresAt: { gt: new Date() },
            },
          }),
        ).toBe(1);
      } finally {
        await prisma.userInvite.deleteMany({
          where: { organizationId: secondOrg.id },
        });
        await prisma.organization.delete({ where: { id: secondOrg.id } });
        await prisma.user.delete({ where: { id: secondAdmin.id } });
      }
    });
  },
);
