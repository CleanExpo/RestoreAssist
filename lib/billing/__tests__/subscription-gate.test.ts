/**
 * RA-6940 — requireActiveSubscription mirrors the report-generation routes'
 * inline gate: TRIAL / ACTIVE / LIFETIME proceed, everything else (including
 * unknown users) gets a 402 with upgradeRequired.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import { requireActiveSubscription } from "../subscription-gate";

beforeEach(() => {
  userFindUnique.mockReset();
});

describe("requireActiveSubscription", () => {
  for (const status of ["TRIAL", "ACTIVE", "LIFETIME"]) {
    it(`allows ${status}`, async () => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });
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
