/**
 * J-09 / D-006 — technician seat counting against real Postgres.
 *
 * Founder ruling (26/09/2026): the $99 plan includes 0 technician seats. A
 * seat is taken by a technician member (role USER) or a live technician
 * invite; purchased seats come from the owner's READY workspace entitlement.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertTechnicianSeatAvailable,
  TechnicianSeatLimitReached,
  technicianSeatUsage,
} from "../technician-seats";

describe.skipIf(!process.env.DATABASE_URL)("technician seat enforcement (J-09)", () => {
  const tag = `j09-${Date.now()}`;
  let ownerId = "";
  let orgId = "";
  let workspaceId = "";
  let liveInviteId = "";

  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${tag}-owner@example.com`, role: "ADMIN" } });
    ownerId = owner.id;
    const org = await prisma.organization.create({ data: { name: `${tag} Co`, ownerId } });
    orgId = org.id;
    await prisma.user.update({ where: { id: ownerId }, data: { organizationId: orgId } });
    const ws = await prisma.workspace.create({
      data: { name: `${tag} WS`, slug: tag, ownerId, status: "READY" },
    });
    workspaceId = ws.id;

    // Taken: one technician, one live technician invite.
    await prisma.user.create({ data: { email: `${tag}-tech@example.com`, role: "USER", organizationId: orgId } });
    const live = await prisma.userInvite.create({
      data: {
        token: `${tag}-live`.padEnd(48, "0"),
        email: `${tag}-invitee@example.com`,
        role: "USER",
        organizationId: orgId,
        createdById: ownerId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    liveInviteId = live.id;
    // Not taken: a manager, an expired technician invite, a used technician invite.
    await prisma.user.create({ data: { email: `${tag}-mgr@example.com`, role: "MANAGER", organizationId: orgId } });
    await prisma.userInvite.create({
      data: {
        token: `${tag}-expired`.padEnd(48, "0"),
        email: `${tag}-old@example.com`,
        role: "USER",
        organizationId: orgId,
        createdById: ownerId,
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });
    await prisma.userInvite.create({
      data: {
        token: `${tag}-used`.padEnd(48, "0"),
        email: `${tag}-done@example.com`,
        role: "USER",
        organizationId: orgId,
        createdById: ownerId,
        expiresAt: new Date(Date.now() + 86_400_000),
        usedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.userInvite.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: tag }, NOT: { id: ownerId } } }).catch(() => {});
    await prisma.user.update({ where: { id: ownerId }, data: { organizationId: null } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  });

  it("with no seat pack, 0 seats are included and a technician is refused", async () => {
    expect(await technicianSeatUsage(prisma, orgId)).toEqual({ purchased: 0, used: 2 });
    await expect(assertTechnicianSeatAvailable(prisma, orgId)).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("an inactive seat pack counts as 0 seats", async () => {
    await prisma.featureEntitlement.create({
      data: { workspaceId, sku: "TECHNICIAN_SEATS", active: false, seats: 10 },
    });
    expect((await technicianSeatUsage(prisma, orgId)).purchased).toBe(0);
  });

  it("counts technicians and live technician invites against the purchased seats", async () => {
    await prisma.featureEntitlement.update({
      where: { workspaceId_sku: { workspaceId, sku: "TECHNICIAN_SEATS" } },
      data: { active: true, seats: 2 },
    });
    // 2 used of 2: full.
    expect(await technicianSeatUsage(prisma, orgId)).toEqual({ purchased: 2, used: 2 });
    await expect(assertTechnicianSeatAvailable(prisma, orgId)).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
    // Accepting the live invite converts its seat rather than taking a new one.
    await expect(
      assertTechnicianSeatAvailable(prisma, orgId, { excludeInviteId: liveInviteId }),
    ).resolves.toBeUndefined();

    await prisma.featureEntitlement.update({
      where: { workspaceId_sku: { workspaceId, sku: "TECHNICIAN_SEATS" } },
      data: { seats: 3 },
    });
    await expect(assertTechnicianSeatAvailable(prisma, orgId)).resolves.toBeUndefined();
  });

  it("two technician writes racing for the last seat: exactly one commits", async () => {
    // 3 purchased, 2 used (from the test above): one seat left.
    expect(await technicianSeatUsage(prisma, orgId)).toEqual({ purchased: 3, used: 2 });
    const takeSeat = (suffix: string) =>
      prisma.$transaction(async (tx) => {
        await assertTechnicianSeatAvailable(tx, orgId);
        // Widen the window between the check and the write.
        await new Promise((r) => setTimeout(r, 150));
        await tx.user.create({
          data: { email: `${tag}-race-${suffix}@example.com`, role: "USER", organizationId: orgId },
        });
      });

    const results = await Promise.allSettled([takeSeat("a"), takeSeat("b")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TechnicianSeatLimitReached);
    expect(await technicianSeatUsage(prisma, orgId)).toEqual({ purchased: 3, used: 3 });
  });
});
