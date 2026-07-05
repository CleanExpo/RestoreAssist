import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { grandfatherClientCommsAddon } from "../grandfather-client-comms-addon";
import { prisma } from "@/lib/prisma";

describe.skipIf(!process.env.DATABASE_URL)("grandfatherClientCommsAddon", () => {
  beforeEach(async () => {
    await prisma.featureEntitlement.deleteMany({});
    await prisma.clientCommsLog.deleteMany({});
    await prisma.inspection.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    // Don't leave Workspace/User rows in the shared CI database — a later
    // DB-gated suite's user.deleteMany() would trip Workspace_ownerId_fkey.
    await prisma.featureEntitlement.deleteMany({});
    await prisma.clientCommsLog.deleteMany({});
    await prisma.inspection.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  it("entitles a workspace whose owner already had a Pulse email SENT", async () => {
    const u = await prisma.user.create({
      data: { email: `cc-g${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `cc-g-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `CC-G-${Date.now()}`,
        propertyAddress: "1 St",
        propertyPostcode: "4000",
        userId: u.id,
      },
    });
    await prisma.clientCommsLog.create({
      data: {
        inspectionId: insp.id,
        channel: "EMAIL",
        eventType: "STEP_TRANSITION",
        recipient: "home@owner.test",
        status: "SENT",
        idempotencyKey: `cc-g-${insp.id}`,
      },
    });

    const result = await grandfatherClientCommsAddon();
    expect(result.grandfathered).toBe(1);
    expect(result.skipped).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUniqueOrThrow({
      where: { workspaceId_sku: { workspaceId: ws.id, sku: "CLIENT_COMMS" } },
    });
    expect(entitlement.active).toBe(true);
  });

  it("does not entitle a workspace whose comms log only has SUPPRESSED rows", async () => {
    const u = await prisma.user.create({
      data: { email: `cc-h${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `cc-h-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `CC-H-${Date.now()}`,
        propertyAddress: "2 St",
        propertyPostcode: "4000",
        userId: u.id,
      },
    });
    await prisma.clientCommsLog.create({
      data: {
        inspectionId: insp.id,
        channel: "EMAIL",
        eventType: "STEP_TRANSITION",
        recipient: "",
        status: "SUPPRESSED",
        suppressionReason: "NO_RECIPIENT",
        idempotencyKey: `cc-h-${insp.id}`,
      },
    });

    const result = await grandfatherClientCommsAddon();
    expect(result.grandfathered).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUnique({
      where: { workspaceId_sku: { workspaceId: ws.id, sku: "CLIENT_COMMS" } },
    });
    expect(entitlement).toBeNull();
  });

  it("skips a sender with no workspace", async () => {
    const u = await prisma.user.create({
      data: { email: `cc-i${Date.now()}@test.com` },
    });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `CC-I-${Date.now()}`,
        propertyAddress: "3 St",
        propertyPostcode: "4000",
        userId: u.id,
      },
    });
    await prisma.clientCommsLog.create({
      data: {
        inspectionId: insp.id,
        channel: "EMAIL",
        eventType: "STEP_TRANSITION",
        recipient: "home@owner.test",
        status: "SENT",
        idempotencyKey: `cc-i-${insp.id}`,
      },
    });

    const result = await grandfatherClientCommsAddon();
    expect(result.grandfathered).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("is idempotent — second run does not duplicate or flip an existing entitlement", async () => {
    const u = await prisma.user.create({
      data: { email: `cc-j${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `cc-j-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    const insp = await prisma.inspection.create({
      data: {
        inspectionNumber: `CC-J-${Date.now()}`,
        propertyAddress: "4 St",
        propertyPostcode: "4000",
        userId: u.id,
      },
    });
    await prisma.clientCommsLog.create({
      data: {
        inspectionId: insp.id,
        channel: "EMAIL",
        eventType: "STEP_TRANSITION",
        recipient: "home@owner.test",
        status: "SENT",
        idempotencyKey: `cc-j-${insp.id}`,
      },
    });

    await grandfatherClientCommsAddon();
    const second = await grandfatherClientCommsAddon();
    expect(second.grandfathered).toBe(1);

    const count = await prisma.featureEntitlement.count({
      where: { workspaceId: ws.id, sku: "CLIENT_COMMS" },
    });
    expect(count).toBe(1);
  });
});
