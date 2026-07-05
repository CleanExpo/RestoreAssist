import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { grandfatherExistingOrgs } from "../grandfather-existing-orgs";
import { prisma } from "@/lib/prisma";

describe.skipIf(!process.env.DATABASE_URL)("grandfatherExistingOrgs", () => {
  beforeEach(async () => {
    // FK-safe order: the DB-gated tests share one CI database, so clear every
    // table that references User (via Workspace.ownerId → User, and the
    // Workspace-scoped rows other suites leave behind) before deleting users,
    // else user.deleteMany() trips Workspace_ownerId_fkey.
    await prisma.featureEntitlement.deleteMany({});
    await prisma.invoicePayment.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("marks all orgs with null setupCompletedAt as completed", async () => {
    const u = await prisma.user.create({
      data: { email: `g${Date.now()}@test.com` },
    });
    await prisma.organization.create({ data: { name: "A", ownerId: u.id } });
    await prisma.organization.create({ data: { name: "B", ownerId: u.id } });

    const result = await grandfatherExistingOrgs();
    expect(result.marked).toBe(2);

    const orgs = await prisma.organization.findMany({
      select: { setupCompletedAt: true, setupMode: true },
    });
    expect(orgs.every((o) => o.setupCompletedAt !== null)).toBe(true);
    expect(orgs.every((o) => o.setupMode === "MANUAL")).toBe(true);
  });

  it("skips orgs that already have setupCompletedAt set", async () => {
    const u = await prisma.user.create({
      data: { email: `h${Date.now()}@test.com` },
    });
    const past = new Date("2025-01-01");
    await prisma.organization.create({
      data: { name: "Existing", ownerId: u.id, setupCompletedAt: past },
    });

    const result = await grandfatherExistingOrgs();
    expect(result.marked).toBe(0);

    const org = await prisma.organization.findFirstOrThrow();
    expect(org.setupCompletedAt?.getTime()).toBe(past.getTime());
  });

  it("is idempotent — second run is a no-op", async () => {
    const u = await prisma.user.create({
      data: { email: `i${Date.now()}@test.com` },
    });
    await prisma.organization.create({ data: { name: "X", ownerId: u.id } });
    await grandfatherExistingOrgs();
    const second = await grandfatherExistingOrgs();
    expect(second.marked).toBe(0);
  });
});
