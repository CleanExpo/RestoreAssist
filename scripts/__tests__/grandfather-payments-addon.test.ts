import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { grandfatherPaymentsAddon } from "../grandfather-payments-addon";
import { prisma } from "@/lib/prisma";

describe.skipIf(!process.env.DATABASE_URL)("grandfatherPaymentsAddon", () => {
  beforeEach(async () => {
    await prisma.featureEntitlement.deleteMany({});
    await prisma.invoicePayment.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    // Don't leave Workspace/User rows in the shared CI database — a later
    // DB-gated suite's user.deleteMany() would trip Workspace_ownerId_fkey.
    await prisma.featureEntitlement.deleteMany({});
    await prisma.invoicePayment.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  it("entitles a workspace whose owner already recorded a manual payment", async () => {
    const u = await prisma.user.create({
      data: { email: `pay-g${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `pay-g-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    await prisma.invoicePayment.create({
      data: { amount: 5000, paymentMethod: "BANK_TRANSFER", userId: u.id },
    });

    const result = await grandfatherPaymentsAddon();
    expect(result.grandfathered).toBe(1);
    expect(result.skipped).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUniqueOrThrow({
      where: { workspaceId_sku: { workspaceId: ws.id, sku: "PAYMENTS" } },
    });
    expect(entitlement.active).toBe(true);
  });

  it("does not entitle a workspace whose only payments are webhook-created", async () => {
    const u = await prisma.user.create({
      data: { email: `pay-h${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `pay-h-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    await prisma.invoicePayment.create({
      data: {
        amount: 5000,
        paymentMethod: "EXTERNAL",
        userId: u.id,
        externalProvider: "XERO",
        externalPaymentId: "xero-pay-1",
      },
    });

    const result = await grandfatherPaymentsAddon();
    expect(result.grandfathered).toBe(0);

    const entitlement = await prisma.featureEntitlement.findUnique({
      where: { workspaceId_sku: { workspaceId: ws.id, sku: "PAYMENTS" } },
    });
    expect(entitlement).toBeNull();
  });

  it("skips a payer with no workspace", async () => {
    const u = await prisma.user.create({
      data: { email: `pay-i${Date.now()}@test.com` },
    });
    await prisma.invoicePayment.create({
      data: { amount: 5000, paymentMethod: "CASH", userId: u.id },
    });

    const result = await grandfatherPaymentsAddon();
    expect(result.grandfathered).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("is idempotent — second run does not duplicate or flip an existing entitlement", async () => {
    const u = await prisma.user.create({
      data: { email: `pay-j${Date.now()}@test.com` },
    });
    const ws = await prisma.workspace.create({
      data: { name: "WS", slug: `pay-j-${Date.now()}`, ownerId: u.id, status: "READY" },
    });
    await prisma.invoicePayment.create({
      data: { amount: 5000, paymentMethod: "CHEQUE", userId: u.id },
    });

    await grandfatherPaymentsAddon();
    const second = await grandfatherPaymentsAddon();
    expect(second.grandfathered).toBe(1);

    const count = await prisma.featureEntitlement.count({
      where: { workspaceId: ws.id, sku: "PAYMENTS" },
    });
    expect(count).toBe(1);
  });
});
