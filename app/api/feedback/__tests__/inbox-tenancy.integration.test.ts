/**
 * WP-01 / walkthrough finding 1 — the feedback inbox stayed inside the business.
 *
 * Every sign-up is given role ADMIN, and the inbox opened for any ADMIN and
 * listed every customer's feedback with names and emails. Real-database test:
 * only the session is faked; the route and Prisma are real. Runs when
 * DATABASE_URL is set.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp01-${Date.now().toString(36)}`;
const ids = { adminA: "", memberA: "", adminB: "", soloAdmin: "", orgA: "", orgB: "" };

async function inbox(userId: string, inboxMode = true) {
  getServerSession.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
  const res = await GET(
    new NextRequest(`http://localhost/api/feedback${inboxMode ? "?inbox=1" : ""}`),
  );
  const body = await res.json();
  const items = (body.feedback ?? []) as {
    whatHappened: string | null;
    user?: { email?: string };
  }[];
  return {
    status: res.status,
    texts: items
      .map((f) => f.whatHappened)
      .filter((t): t is string => !!t?.startsWith(S)),
    items,
  };
}

describe.skipIf(!HAS_DB)("feedback inbox tenancy (WP-01)", () => {
  beforeAll(async () => {
    const mk = (n: string, role: "ADMIN" | "USER", organizationId?: string) =>
      prisma.user.create({
        data: { email: `${S}-${n}@test.local`, name: n, role, organizationId },
      });
    const adminA = await mk("adminA", "ADMIN");
    const adminB = await mk("adminB", "ADMIN");
    const orgA = await prisma.organization.create({
      data: { name: `${S}-A`, ownerId: adminA.id },
    });
    const orgB = await prisma.organization.create({
      data: { name: `${S}-B`, ownerId: adminB.id },
    });
    await prisma.user.update({ where: { id: adminA.id }, data: { organizationId: orgA.id } });
    await prisma.user.update({ where: { id: adminB.id }, data: { organizationId: orgB.id } });
    const memberA = await mk("memberA", "USER", orgA.id);
    const soloAdmin = await mk("soloAdmin", "ADMIN");
    Object.assign(ids, {
      adminA: adminA.id, adminB: adminB.id, memberA: memberA.id,
      soloAdmin: soloAdmin.id, orgA: orgA.id, orgB: orgB.id,
    });
    for (const [uid, label] of [
      [adminA.id, "A-owner"], [memberA.id, "A-member"],
      [adminB.id, "B-owner"], [soloAdmin.id, "solo"],
    ] as const) {
      await prisma.feedback.create({
        data: { userId: uid, rating: 4, whatHappened: `${S} ${label}` },
      });
    }
  });

  beforeEach(() => {
    delete process.env.PLATFORM_SUPPORT_USER_IDS;
  });

  afterAll(async () => {
    const all = [ids.adminA, ids.memberA, ids.adminB, ids.soloAdmin];
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.feedback.deleteMany({ where: { userId: { in: all } } }));
    await swallow(prisma.user.updateMany({ where: { id: { in: all } }, data: { organizationId: null } }));
    await swallow(prisma.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } }));
    await swallow(prisma.user.deleteMany({ where: { id: { in: all } } }));
    await prisma.$disconnect();
  });

  it("business A's owner sees A's feedback (owner and member) and none of B's", async () => {
    const r = await inbox(ids.adminA);
    expect(r.status).toBe(200);
    expect(r.texts.sort()).toEqual([`${S} A-member`, `${S} A-owner`]);
  });

  it("business B's owner sees only B's, with no name or email from A", async () => {
    const r = await inbox(ids.adminB);
    expect(r.texts).toEqual([`${S} B-owner`]);
    const emails = r.items.map((i) => i.user?.email ?? "");
    expect(emails.some((e) => e.includes("adminA") || e.includes("memberA"))).toBe(false);
  });

  it("an owner with no organisation sees only their own", async () => {
    const r = await inbox(ids.soloAdmin);
    expect(r.texts).toEqual([`${S} solo`]);
  });

  it("an allowlisted platform operator still sees every business", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = ids.adminA;
    const r = await inbox(ids.adminA);
    expect(r.texts.sort()).toEqual(
      [`${S} A-member`, `${S} A-owner`, `${S} B-owner`, `${S} solo`].sort(),
    );
  });

  it("an allowlist entry does not help someone who is not ADMIN in the database", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = ids.memberA;
    const r = await inbox(ids.memberA);
    expect(r.texts).toEqual([`${S} A-member`]);
  });
});
