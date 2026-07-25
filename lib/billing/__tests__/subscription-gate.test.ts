/**
 * RA-6940 — requireActiveSubscription mirrors the report-generation routes'
 * inline gate: TRIAL / ACTIVE / LIFETIME proceed, everything else (including
 * unknown users) gets a 402 with upgradeRequired.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import {
  ALLOWED_SUBSCRIPTION_STATUSES,
  requireActiveSubscription,
} from "../subscription-gate";

beforeEach(() => {
  userFindUnique.mockReset();
});

describe("requireActiveSubscription", () => {
  // "LIFETIME" was asserted here but is not a SubscriptionStatus enum member —
  // the mock fabricated a row the database cannot produce, so the assertion
  // proved nothing. Lifetime is covered by its own describe block below.
  for (const status of ["TRIAL", "ACTIVE"]) {
    it(`allows ${status}`, async () => {
      userFindUnique.mockResolvedValueOnce({
        subscriptionStatus: status,
        lifetimeAccess: false,
      });
      await expect(requireActiveSubscription("u1")).resolves.toBeNull();
    });
  }

  for (const status of ["CANCELED", "PAST_DUE", "EXPIRED", null]) {
    it(`blocks ${status ?? "null"} with 402`, async () => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });
      const res = await requireActiveSubscription("u1");
      expect(res?.status).toBe(402);
      expect(await res?.json()).toEqual({
        error: "Active subscription required",
        upgradeRequired: true,
      });
    });
  }

  it("blocks unknown users with 402", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const res = await requireActiveSubscription("ghost");
    expect(res?.status).toBe(402);
  });
});

/**
 * Lifetime access is a separate Boolean column, NOT a SubscriptionStatus member
 * (the enum is TRIAL | ACTIVE | CANCELED | EXPIRED | PAST_DUE). A customer who
 * bought lifetime normally carries lifetimeAccess=true with a CANCELED/null
 * status — and was being refused on all ten routes that use this gate.
 *
 * This is the same bug class that already caused an Apple App Review rejection
 * (see the comment in components/TrialBanner.tsx): checking subscriptionStatus
 * and ignoring lifetimeAccess.
 */
describe("requireActiveSubscription — lifetime access", () => {
  for (const status of ["CANCELED", "EXPIRED", "PAST_DUE", null]) {
    it(`allows lifetimeAccess=true even when status is ${status ?? "null"}`, async () => {
      userFindUnique.mockResolvedValueOnce({
        subscriptionStatus: status,
        lifetimeAccess: true,
      });
      await expect(requireActiveSubscription("u1")).resolves.toBeNull();
    });
  }

  it("still blocks a non-lifetime user with a dead status", async () => {
    userFindUnique.mockResolvedValueOnce({
      subscriptionStatus: "CANCELED",
      lifetimeAccess: false,
    });
    const res = await requireActiveSubscription("u1");
    expect(res?.status).toBe(402);
    // Clients (e.g. the Inspection Sidekick) branch on this exact shape.
    expect(await res?.json()).toEqual({
      error: "Active subscription required",
      upgradeRequired: true,
    });
  });

  it("reads lifetimeAccess from the database — not just subscriptionStatus", async () => {
    userFindUnique.mockResolvedValueOnce({
      subscriptionStatus: "ACTIVE",
      lifetimeAccess: false,
    });
    await requireActiveSubscription("u1");
    const select = userFindUnique.mock.calls[0][0].select;
    expect(select).toMatchObject({ subscriptionStatus: true, lifetimeAccess: true });
  });

  it("allowlists only values the SubscriptionStatus enum can actually produce", async () => {
    // Guards the defect class: "LIFETIME" sat in the allowlist for months but is
    // not an enum member, so it could never match a real row.
    const schema = readFileSync(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );
    const enumBody = /enum SubscriptionStatus \{([^}]*)\}/u.exec(schema)?.[1] ?? "";
    const members = enumBody
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const allowed of ALLOWED_SUBSCRIPTION_STATUSES) {
      expect(members).toContain(allowed);
    }
  });
});
