/**
 * WP-04 / audit 2026-10-06 Critical 2 — removing a team member.
 *
 * Real-database test (runs only when DATABASE_URL is set, like
 * ownership-writes.integration.test.ts). Before the fix, removal nulled the
 * member's organisationId, which (a) hid every job they made for the business
 * from the owner, because the organisation clause matches on the creator's
 * CURRENT organisation, and (b) left the ex-employee full access through the
 * unconditional `{ userId }` clause.
 *
 * The rule under test, matching getResourceTenant (lib/organization-credits):
 * a record made INSIDE the membership interval [last invite accepted, leave)
 * belongs to the business. A record made before joining or after leaving is
 * the person's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionReadable,
  assertInspectionTenancy,
  resolveInspectionReach,
} from "@/lib/auth/assert-tenancy";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp04-${Date.now().toString(36)}`;

const day = (n: number) => new Date(Date.UTC(2026, 8, n)); // September 2026
const JOINED = day(10);
const LEFT = day(20);

const ids = {
  owner: "",
  colleague: "",
  tech: "",
  ghost: "",
  org: "",
  inspGhostBefore: "",
  inspGhostAfter: "",
  inspBeforeJoin: "",
  inspInside: "",
  inspAfterLeave: "",
};

const session = (id: string) => ({ user: { id } });

describe.skipIf(!HAS_DB)("removed team member tenancy (WP-04)", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    const org = await prisma.organization.create({
      data: { name: `${S}-org`, ownerId: owner.id },
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { organizationId: org.id },
    });
    const colleague = await prisma.user.create({
      data: { email: `${S}-colleague@test.local`, organizationId: org.id },
    });
    const tech = await prisma.user.create({
      data: { email: `${S}-tech@test.local`, organizationId: org.id },
    });
    // Removed with NO surviving invite (erased with an owner's account, or the
    // history is too long to trust): the join date cannot be proven.
    const ghost = await prisma.user.create({
      data: { email: `${S}-ghost@test.local` },
    });
    ids.ghost = ghost.id;
    Object.assign(ids, {
      owner: owner.id,
      colleague: colleague.id,
      tech: tech.id,
      org: org.id,
    });

    await prisma.userInvite.create({
      data: {
        token: `${S}-tok`,
        email: `${S}-tech@test.local`,
        role: "USER",
        organizationId: org.id,
        createdById: owner.id,
        expiresAt: day(30),
        usedAt: JOINED,
        acceptedUserId: tech.id,
        acceptanceProvider: "credentials",
        createdAt: day(9),
      },
    });

    const make = (suffix: string, createdAt: Date) =>
      prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-${suffix}`,
          propertyAddress: "1 St",
          propertyPostcode: "4000",
          userId: tech.id,
          createdAt,
        },
      });
    ids.inspBeforeJoin = (await make("pre", day(5))).id;
    ids.inspInside = (await make("in", day(15))).id;
    ids.inspAfterLeave = (await make("post", day(25))).id;

    const makeFor = (userId: string, suffix: string, createdAt: Date) =>
      prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-${suffix}`,
          propertyAddress: "1 St",
          propertyPostcode: "4000",
          userId,
          createdAt,
        },
      });
    ids.inspGhostBefore = (await makeFor(ghost.id, "gb", day(15))).id;
    ids.inspGhostAfter = (await makeFor(ghost.id, "ga", day(25))).id;
    await prisma.user.update({
      where: { id: ghost.id },
      data: { organizationLeftAt: LEFT, organizationLeftId: org.id },
    });

    // Exactly what app/api/team/members/[id]/route.ts writes on removal.
    await prisma.user.update({
      where: { id: tech.id },
      data: {
        organizationId: null,
        managedById: null,
        organizationLeftAt: LEFT,
        organizationLeftId: org.id,
      },
    });
  });

  afterAll(async () => {
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(
      prisma.inspection.deleteMany({
        where: { inspectionNumber: { startsWith: S } },
      }),
    );
    await swallow(prisma.userInvite.deleteMany({ where: { token: `${S}-tok` } }));
    await swallow(
      prisma.user.updateMany({
        where: { id: { in: [ids.owner, ids.colleague, ids.tech, ids.ghost] } },
        data: { organizationId: null },
      }),
    );
    await swallow(prisma.organization.deleteMany({ where: { id: ids.org } }));
    await swallow(
      prisma.user.deleteMany({
        where: { id: { in: [ids.owner, ids.colleague, ids.tech, ids.ghost] } },
      }),
    );
    await prisma.$disconnect();
  });

  it("the owner can still open a job the removed member made while a member", async () => {
    const r = await assertInspectionTenancy(session(ids.owner), ids.inspInside);
    expect(r.ok).toBe(true);
  });

  it("a colleague can still read it", async () => {
    const r = await assertInspectionReadable(
      session(ids.colleague),
      ids.inspInside,
    );
    expect(r.ok).toBe(true);
  });

  it("the owner's job list still contains it, and not the member's own work", async () => {
    const reach = await resolveInspectionReach(session(ids.owner));
    if (!reach.ok) throw new Error("reach refused");
    const rows = await prisma.inspection.findMany({
      where: { ...reach.data, inspectionNumber: { startsWith: S } },
      select: { id: true },
      take: 50,
    });
    const found = rows.map((r) => r.id);
    expect(found).toContain(ids.inspInside);
    expect(found).not.toContain(ids.inspBeforeJoin);
    expect(found).not.toContain(ids.inspAfterLeave);
  });

  it("the removed member can no longer open the business's job", async () => {
    const r = await assertInspectionTenancy(session(ids.tech), ids.inspInside);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });

  it("the removed member cannot read it or list it either", async () => {
    const read = await assertInspectionReadable(
      session(ids.tech),
      ids.inspInside,
    );
    expect(read.ok).toBe(false);
    const reach = await resolveInspectionReach(session(ids.tech));
    if (!reach.ok) throw new Error("reach refused");
    const rows = await prisma.inspection.findMany({
      where: { ...reach.data, inspectionNumber: { startsWith: S } },
      select: { id: true },
      take: 50,
    });
    expect(rows.map((r) => r.id)).not.toContain(ids.inspInside);
  });

  it("the removed member keeps their own work from before joining and after leaving", async () => {
    for (const id of [ids.inspBeforeJoin, ids.inspAfterLeave]) {
      const r = await assertInspectionTenancy(session(ids.tech), id);
      expect(r.ok).toBe(true);
    }
  });

  it("the former employer cannot open the member's personal work", async () => {
    for (const id of [ids.inspBeforeJoin, ids.inspAfterLeave]) {
      const r = await assertInspectionTenancy(session(ids.owner), id);
      expect(r.ok).toBe(false);
    }
  });

  it("an unproven join date fails closed: the ex-employee loses pre-leave work, keeps later work", async () => {
    const before = await assertInspectionTenancy(
      session(ids.ghost),
      ids.inspGhostBefore,
    );
    expect(before.ok).toBe(false);
    const after = await assertInspectionTenancy(
      session(ids.ghost),
      ids.inspGhostAfter,
    );
    expect(after.ok).toBe(true);
    // And the owner does not gain it by guesswork either.
    const owner = await assertInspectionTenancy(
      session(ids.owner),
      ids.inspGhostBefore,
    );
    expect(owner.ok).toBe(false);
  });
});
