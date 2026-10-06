/**
 * WP-02 / walkthrough finding 2 — a client link opens the job it was sent for,
 * not "the client's newest job". Real database; runs when DATABASE_URL is set.
 *
 * Covers every reader of a portal token that picked the newest inspection.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolvePortalAccess } from "../resolve-portal-inspection";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp02l-${Date.now().toString(36)}`;
const ids = { user: "", client: "", insA: "", insB: "", repA: "", repB: "" };
const tokens = { bound: `${S}-bound`, legacy: `${S}-legacy`, orphan: `${S}-orphan` };

describe.skipIf(!HAS_DB)("portal link is bound to its job (WP-02)", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${S}-u@test.local` } });
    const c = await prisma.client.create({
      data: { name: "Test Owner", email: `${S}-c@test.local`, userId: u.id },
    });
    const mkReport = (title: string) =>
      prisma.report.create({
        data: {
          userId: u.id,
          clientId: c.id,
          title,
          clientName: "Test Owner",
          propertyAddress: title,
          hazardType: "water",
          insuranceType: "home",
        },
      });
    const repA = await mkReport("1 Alpha St");
    const repB = await mkReport("2 Beta St");
    const mkIns = (n: string, reportId: string, createdAt: Date) =>
      prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-${n}`,
          propertyAddress: n,
          propertyPostcode: "4000",
          userId: u.id,
          reportId,
          createdAt,
        },
      });
    const insA = await mkIns("A", repA.id, new Date("2026-09-01T00:00:00Z"));
    const insB = await mkIns("B", repB.id, new Date("2026-10-01T00:00:00Z"));
    Object.assign(ids, {
      user: u.id, client: c.id, insA: insA.id, insB: insB.id,
      repA: repA.id, repB: repB.id,
    });
    const exp = new Date(Date.now() + 7 * 864e5);
    await prisma.clientPortalAccount.createMany({
      data: [
        { clientId: c.id, token: tokens.bound, expiresAt: exp, inspectionId: insA.id },
        { clientId: c.id, token: tokens.legacy, expiresAt: exp },
        { clientId: c.id, token: tokens.orphan, expiresAt: exp, inspectionId: "no-such-job" },
      ],
    });
  });

  afterAll(async () => {
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.clientPortalAccount.deleteMany({ where: { clientId: ids.client } }));
    await swallow(prisma.inspection.deleteMany({ where: { userId: ids.user } }));
    await swallow(prisma.report.deleteMany({ where: { userId: ids.user } }));
    await swallow(prisma.client.deleteMany({ where: { userId: ids.user } }));
    await swallow(prisma.user.deleteMany({ where: { id: ids.user } }));
    await prisma.$disconnect();
  });

  it("a link sent for the older job opens that job, not the client's newest", async () => {
    const r = await resolvePortalAccess(tokens.bound);
    expect(r).toMatchObject({ kind: "inspection", inspectionId: ids.insA });
  });

  it("a link issued before the binding existed still opens the newest job", async () => {
    const r = await resolvePortalAccess(tokens.legacy);
    expect(r).toMatchObject({ kind: "inspection", inspectionId: ids.insB });
  });

  it("a link bound to a job that no longer exists shows 'not ready', never another job", async () => {
    const r = await resolvePortalAccess(tokens.orphan);
    expect(r.kind).toBe("unready");
  });
});
