/**
 * RA-7893 — an invited technician or manager has subscriptionStatus null by
 * design (invite acceptance clears it; members share the business owner's
 * plan). The gate must read the owner's plan, not the caller's own row.
 *
 * The real organization-credits resolver runs against a keyed prisma fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  role: "ADMIN" | "MANAGER" | "USER";
  organizationId: string | null;
  subscriptionStatus: string | null;
  lifetimeAccess: boolean;
};

const db = vi.hoisted(() => ({
  users: {} as Record<string, Row>,
  orgs: {} as Record<string, { ownerId: string }>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          creditsRemaining: null,
          subscriptionPlan: null,
          monthlyReportsUsed: 0,
          monthlyResetDate: null,
          trialEndsAt: null,
          addonReports: 0,
          organization: u.organizationId
            ? { ownerId: db.orgs[u.organizationId]?.ownerId ?? null }
            : null,
        };
      },
    },
  },
}));

import {
  hasActiveSubscription,
  requireActiveSubscription,
} from "../subscription-gate";

function seed(ownerStatus: string | null) {
  db.orgs = { "org-a": { ownerId: "owner-a" } };
  db.users = {
    "owner-a": {
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org-a",
      subscriptionStatus: ownerStatus,
      lifetimeAccess: false,
    },
    "tech-a": {
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      subscriptionStatus: null,
      lifetimeAccess: false,
    },
    "manager-a": {
      id: "manager-a",
      role: "MANAGER",
      organizationId: "org-a",
      subscriptionStatus: null,
      lifetimeAccess: false,
    },
    removed: {
      id: "removed",
      role: "USER",
      organizationId: null,
      subscriptionStatus: null,
      lifetimeAccess: false,
    },
  };
}

beforeEach(() => seed("TRIAL"));

describe("requireActiveSubscription — invited members (RA-7893)", () => {
  for (const status of ["TRIAL", "ACTIVE"]) {
    it(`allows an invited technician when the owner is ${status}`, async () => {
      seed(status);
      await expect(requireActiveSubscription("tech-a")).resolves.toBeNull();
      await expect(hasActiveSubscription("tech-a")).resolves.toBe(true);
    });
  }

  it("allows an invited manager of a trialing owner", async () => {
    await expect(requireActiveSubscription("manager-a")).resolves.toBeNull();
  });

  for (const status of ["EXPIRED", "CANCELED", "PAST_DUE", null]) {
    it(`refuses the technician when the owner is ${status ?? "null"}`, async () => {
      seed(status);
      const res = await requireActiveSubscription("tech-a");
      expect(res?.status).toBe(402);
      expect(await res?.json()).toEqual({
        error: "Active subscription required",
        upgradeRequired: true,
      });
      await expect(hasActiveSubscription("tech-a")).resolves.toBe(false);
    });
  }

  it("refuses a user removed from the organisation", async () => {
    const res = await requireActiveSubscription("removed");
    expect(res?.status).toBe(402);
    await expect(hasActiveSubscription("removed")).resolves.toBe(false);
  });

  it("allows a technician whose owner has lifetime access", async () => {
    seed("CANCELED");
    db.users["owner-a"].lifetimeAccess = true;
    await expect(requireActiveSubscription("tech-a")).resolves.toBeNull();
  });
});
