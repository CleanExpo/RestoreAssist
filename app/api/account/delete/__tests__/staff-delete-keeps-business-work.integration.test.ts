/**
 * WP-04 / walkthrough finding 4 — a staff member deleting their own account
 * must not take the business's jobs and clients with them.
 *
 * Inspection.user and Client.user cascade on delete. Real database; runs when
 * DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp04d-${Date.now().toString(36)}`;
const day = (n: number) => new Date(Date.UTC(2026, 8, n));
const ids = {
  owner: "", tech: "", exInside: "", exOutside: "", org: "",
  techJob: "", exInsideJob: "", exOutsideJobBefore: "", exOutsideJobAfter: "",
};

async function deleteAs(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  const res = await POST(
    new NextRequest("http://localhost/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        "idempotency-key": `${S}-${Math.random().toString(36).slice(2)}`,
      },
    }),
  );
  return res.status;
}

describe.skipIf(!HAS_DB)("staff self-delete keeps the business's work (WP-04)", () => {
  beforeAll(async () => {
    const mk = (n: string, organizationId?: string) =>
      prisma.user.create({
        data: { email: `${S}-${n}@test.local`, role: n === "owner" ? "ADMIN" : "USER", organizationId },
      });
    const owner = await mk("owner");
    const org = await prisma.organization.create({ data: { name: `${S}-o`, ownerId: owner.id } });
    await prisma.user.update({ where: { id: owner.id }, data: { organizationId: org.id } });
    const tech = await mk("tech", org.id);
    const exInside = await mk("exinside");
    const exOutside = await mk("exoutside");
    const invite = (u: { id: string; email: string }, token: string) =>
      prisma.userInvite.create({
        data: {
          token: `${S}-${token}`, email: u.email, role: "USER", organizationId: org.id,
          createdById: owner.id, expiresAt: day(30), usedAt: day(10),
          acceptedUserId: u.id, acceptanceProvider: "credentials", createdAt: day(9),
        },
      });
    await invite(tech, "t");
    await invite(exInside, "i");
    await invite(exOutside, "o");
    // The two ex-members left the organisation on day 20.
    for (const u of [exInside, exOutside]) {
      await prisma.user.update({
        where: { id: u.id },
        data: { organizationLeftAt: day(20), organizationLeftId: org.id },
      });
    }
    const job = async (userId: string, n: string, createdAt: Date) =>
      (await prisma.inspection.create({
        data: { inspectionNumber: `${S}-${n}`, propertyAddress: n, propertyPostcode: "4000", userId, createdAt },
      })).id;
    Object.assign(ids, {
      owner: owner.id, tech: tech.id, exInside: exInside.id, exOutside: exOutside.id, org: org.id,
      techJob: await job(tech.id, "tech", day(15)),
      exInsideJob: await job(exInside.id, "exin", day(15)),
      exOutsideJobBefore: await job(exOutside.id, "exob", day(5)),
      exOutsideJobAfter: await job(exOutside.id, "exoa", day(25)),
    });
  });

  afterAll(async () => {
    const all = [ids.owner, ids.tech, ids.exInside, ids.exOutside];
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } }));
    await swallow(prisma.userInvite.deleteMany({ where: { token: { startsWith: S } } }));
    await swallow(prisma.idempotencyRecord.deleteMany({ where: { scope: { in: all } } }));
    await swallow(prisma.user.updateMany({ where: { id: { in: all } }, data: { organizationId: null } }));
    await swallow(prisma.organization.deleteMany({ where: { id: ids.org } }));
    await swallow(prisma.user.deleteMany({ where: { id: { in: all } } }));
    await prisma.$disconnect();
  });

  const exists = async (id: string) =>
    (await prisma.inspection.count({ where: { id } })) === 1;

  it("a current technician is refused and the business keeps their job", async () => {
    expect(await deleteAs(ids.tech)).toBe(409);
    expect(await exists(ids.techJob)).toBe(true);
    expect(await prisma.user.count({ where: { id: ids.tech } })).toBe(1);
  });

  it("a removed member holding work from their time in the business is refused too", async () => {
    expect(await deleteAs(ids.exInside)).toBe(409);
    expect(await exists(ids.exInsideJob)).toBe(true);
  });

  it("a removed member with only their own earlier and later work can delete their account", async () => {
    expect(await deleteAs(ids.exOutside)).toBe(200);
    expect(await prisma.user.count({ where: { id: ids.exOutside } })).toBe(0);
  });
});
