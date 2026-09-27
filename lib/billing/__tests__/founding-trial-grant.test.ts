import { describe, expect, it, beforeEach, vi } from "vitest";
import { AddonSku } from "@prisma/client";
import {
  FOUNDING_TRIAL_SEATS,
  FoundingTrialGrantError,
  grantFoundingTrial,
} from "../founding-trial-grant";

const orgFindUnique = vi.fn();
const workspaceFindFirst = vi.fn();
const entitlementFindMany = vi.fn();
const entitlementUpsert = vi.fn();

const db = {
  organization: { findUnique: orgFindUnique },
  workspace: { findFirst: workspaceFindFirst },
  featureEntitlement: {
    findMany: entitlementFindMany,
    upsert: entitlementUpsert,
  },
} as never;

const ALL = Object.values(AddonSku);

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue({ ownerId: "owner_1" });
  workspaceFindFirst.mockResolvedValue({ id: "ws_1" });
  entitlementFindMany.mockResolvedValue([]);
  entitlementUpsert.mockResolvedValue({});
});

describe("grantFoundingTrial (RA-7721, founder ruling 27/09)", () => {
  it("switches on every add-on, uncharged, on the owner's oldest READY workspace", async () => {
    const res = await grantFoundingTrial(db, "org_1", { apply: true });

    expect(workspaceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner_1", status: "READY" },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(res).toMatchObject({ workspaceId: "ws_1", applied: true });
    expect([...res.granted].sort()).toEqual([...ALL].sort());
    expect(entitlementUpsert).toHaveBeenCalledTimes(ALL.length);

    for (const [arg] of entitlementUpsert.mock.calls) {
      expect(arg.create.active).toBe(true);
      expect(arg.update.active).toBe(true);
      // Uncharged: nothing links the row to a Stripe subscription or price.
      expect(arg.create).not.toHaveProperty("stripeSubscriptionId");
      expect(arg.create).not.toHaveProperty("stripePriceId");
      expect(arg.update).not.toHaveProperty("stripeSubscriptionId");
    }
  });

  it("gives technician seats an effectively unlimited count; flat add-ons carry none", async () => {
    await grantFoundingTrial(db, "org_1", { apply: true });
    const bySku = new Map(
      entitlementUpsert.mock.calls.map(([a]) => [a.create.sku, a]),
    );
    expect(bySku.get(AddonSku.TECHNICIAN_SEATS).create.seats).toBe(
      FOUNDING_TRIAL_SEATS,
    );
    expect(bySku.get(AddonSku.VOICE).create.seats).toBeUndefined();
  });

  it("dry run writes nothing but reports what it would grant", async () => {
    const res = await grantFoundingTrial(db, "org_1", { apply: false });
    expect(entitlementUpsert).not.toHaveBeenCalled();
    expect(res.applied).toBe(false);
    expect(res.granted.length).toBe(ALL.length);
  });

  it("leaves a row already backed by a Stripe subscription untouched", async () => {
    entitlementFindMany.mockResolvedValueOnce([
      { sku: AddonSku.VOICE, stripeSubscriptionId: "sub_paid" },
      { sku: AddonSku.PAYMENTS, stripeSubscriptionId: null },
    ]);
    const res = await grantFoundingTrial(db, "org_1", { apply: true });
    expect(res.skippedPaid).toEqual([AddonSku.VOICE]);
    const written = entitlementUpsert.mock.calls.map(([a]) => a.create.sku);
    expect(written).not.toContain(AddonSku.VOICE);
    expect(written).toContain(AddonSku.PAYMENTS);
  });

  it("refuses an unknown organisation or one with no READY workspace", async () => {
    orgFindUnique.mockResolvedValueOnce(null);
    await expect(
      grantFoundingTrial(db, "nope", { apply: true }),
    ).rejects.toBeInstanceOf(FoundingTrialGrantError);

    workspaceFindFirst.mockResolvedValueOnce(null);
    await expect(
      grantFoundingTrial(db, "org_1", { apply: true }),
    ).rejects.toBeInstanceOf(FoundingTrialGrantError);
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });
});

describe("a granted Founding Trial business can take on technicians", () => {
  it("the real seat counter sees the granted seats as purchased", async () => {
    const { technicianSeatUsage } = await import("../technician-seats");
    await grantFoundingTrial(db, "org_1", { apply: true });
    const seatRow = entitlementUpsert.mock.calls
      .map(([a]) => a)
      .find((a) => a.create.sku === AddonSku.TECHNICIAN_SEATS);

    const seatDb = {
      organization: { findUnique: async () => ({ ownerId: "owner_1" }) },
      workspace: { findFirst: async () => ({ id: "ws_1" }) },
      featureEntitlement: {
        findUnique: async () => ({
          active: seatRow.create.active,
          seats: seatRow.create.seats,
        }),
      },
      user: { count: async () => 5 },
      userInvite: { count: async () => 2 },
    } as never;

    const usage = await technicianSeatUsage(seatDb, "org_1");
    expect(usage.purchased).toBe(FOUNDING_TRIAL_SEATS);
    expect(usage.purchased).toBeGreaterThan(usage.used);
  });
});
