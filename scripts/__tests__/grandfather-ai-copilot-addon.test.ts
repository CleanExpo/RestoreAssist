import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { grandfatherAiCopilotAddon } from "../grandfather-ai-copilot-addon";
import { prisma } from "@/lib/prisma";

/**
 * DB-backed, mirroring scripts/__tests__/grandfather-client-comms-addon.test.ts.
 * Skips without DATABASE_URL, so a bare `vitest run` reports it as skipped
 * rather than passing — see .claude/TESTING.md.
 */
describe.skipIf(!process.env.DATABASE_URL)("grandfatherAiCopilotAddon", () => {
  async function reset() {
    await prisma.featureEntitlement.deleteMany({});
    await prisma.teacherUtterance.deleteMany({});
    await prisma.liveTeacherSession.deleteMany({});
    await prisma.inspection.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
  }

  beforeEach(reset);

  afterAll(async () => {
    // Don't leave Workspace/User rows in the shared CI database — a later
    // DB-gated suite's user.deleteMany() would trip Workspace_ownerId_fkey.
    await reset();
    await prisma.$disconnect();
  });

  async function seedUserWithSession(tag: string, withUserUtterance: boolean) {
    const user = await prisma.user.create({
      data: { email: `ai-${tag}-${Date.now()}@test.com` },
    });
    const workspace = await prisma.workspace.create({
      data: {
        name: "WS",
        slug: `ai-${tag}-${Date.now()}`,
        ownerId: user.id,
        status: "READY",
      },
    });
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber: `AI-${tag}-${Date.now()}`,
        propertyAddress: "1 St",
        propertyPostcode: "4000",
        userId: user.id,
      },
    });
    const session = await prisma.liveTeacherSession.create({
      data: {
        inspectionId: inspection.id,
        userId: user.id,
        jurisdiction: "AU",
        deviceOs: "web",
      },
    });
    if (withUserUtterance) {
      await prisma.teacherUtterance.create({
        data: {
          sessionId: session.id,
          turnIndex: 0,
          role: "user",
          content: "How many air movers for this room?",
        },
      });
    }
    return { user, workspace };
  }

  it("entitles a workspace whose technician actually asked the co-pilot something", async () => {
    const { workspace } = await seedUserWithSession("used", true);

    const result = await grandfatherAiCopilotAddon();
    expect(result.grandfathered).toBe(1);
    expect(result.skipped).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUniqueOrThrow({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: "AI_COPILOT" },
      },
    });
    expect(entitlement.active).toBe(true);
    // Flat add-on: never per-seat, whatever the technician headcount.
    expect(entitlement.seats).toBeNull();
  });

  // THE TEST THAT MAKES THE BAR REAL. A LiveTeacherSession row is created when
  // the panel is opened, so keying the backfill on sessions alone would
  // grandfather every workspace that ever glanced at the co-pilot. If this one
  // is removed, the backfill silently becomes "entitle everybody" and no other
  // assertion here would notice.
  it("does NOT entitle a session that was opened and never asked anything", async () => {
    const { workspace } = await seedUserWithSession("opened", false);

    const result = await grandfatherAiCopilotAddon();
    expect(result.grandfathered).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUnique({
      where: {
        workspaceId_sku: { workspaceId: workspace.id, sku: "AI_COPILOT" },
      },
    });
    expect(entitlement).toBeNull();
  });

  it("counts a user with no workspace as skipped, not grandfathered", async () => {
    const user = await prisma.user.create({
      data: { email: `ai-nows-${Date.now()}@test.com` },
    });
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber: `AI-NOWS-${Date.now()}`,
        propertyAddress: "1 St",
        propertyPostcode: "4000",
        userId: user.id,
      },
    });
    const session = await prisma.liveTeacherSession.create({
      data: {
        inspectionId: inspection.id,
        userId: user.id,
        jurisdiction: "NZ",
        deviceOs: "ios",
      },
    });
    await prisma.teacherUtterance.create({
      data: {
        sessionId: session.id,
        turnIndex: 0,
        role: "user",
        content: "What class is this loss?",
      },
    });

    const result = await grandfatherAiCopilotAddon();
    expect(result.grandfathered).toBe(0);
    expect(result.skipped).toBe(1);
  });

  // It runs in a deploy window, so a re-run after a partial failure must not
  // double-count or flip anything off.
  it("is idempotent across repeat runs", async () => {
    await seedUserWithSession("idem", true);

    const first = await grandfatherAiCopilotAddon();
    const second = await grandfatherAiCopilotAddon();

    expect(first.grandfathered).toBe(1);
    expect(second.grandfathered).toBe(1);
    expect(await prisma.featureEntitlement.count()).toBe(1);
  });
});
