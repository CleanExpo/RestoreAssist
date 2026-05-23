/**
 * SP-3 T4 — Tests for getTrialStatus derived flags (showCountdownBanner, showHardWall).
 *
 * Requires a live DB connection (uses real Prisma). Vitest is configured with
 * maxWorkers=1 so concurrent test files don't race on shared state.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTrialStatus } from "@/lib/trial-handling";

type Status = "TRIAL" | "ACTIVE" | "CANCELED" | "PAST_DUE" | null;

async function seedUser(daysFromNow: number, status: Status) {
  const trialEndsAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return prisma.user.create({
    data: {
      email: `sp3-t4-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: "hash",
      subscriptionStatus: status,
      trialEndsAt,
    },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("getTrialStatus derived flags", () => {
  it("showCountdownBanner=true when daysRemaining = 3 (TRIAL)", async () => {
    const user = await seedUser(3, "TRIAL");
    const status = await getTrialStatus(user.id);
    expect(status).not.toBeNull();
    expect(status!.daysRemaining).toBeLessThanOrEqual(3);
    expect(status!.showCountdownBanner).toBe(true);
    expect(status!.showHardWall).toBe(false);
  });

  it("showCountdownBanner=false when daysRemaining = 10 (TRIAL)", async () => {
    const user = await seedUser(10, "TRIAL");
    const status = await getTrialStatus(user.id);
    expect(status).not.toBeNull();
    expect(status!.showCountdownBanner).toBe(false);
    expect(status!.showHardWall).toBe(false);
  });

  it("showHardWall=true when trial expired and not ACTIVE", async () => {
    const user = await seedUser(-1, "TRIAL");
    const status = await getTrialStatus(user.id);
    expect(status).not.toBeNull();
    expect(status!.hasTrialExpired).toBe(true);
    expect(status!.showHardWall).toBe(true);
    expect(status!.showCountdownBanner).toBe(false);
  });

  it("showHardWall=false when expired BUT subscriptionStatus=ACTIVE", async () => {
    const user = await seedUser(-1, "ACTIVE");
    const status = await getTrialStatus(user.id);
    expect(status).not.toBeNull();
    expect(status!.showHardWall).toBe(false);
  });

  it("LIFETIME bypasses hard wall", async () => {
    const user = await prisma.user.create({
      data: {
        email: `sp3-t4-lifetime-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        password: "hash",
        subscriptionStatus: null,
        trialEndsAt: new Date(Date.now() - 1000),
        lifetimeAccess: true,
      },
    });
    const status = await getTrialStatus(user.id);
    expect(status).not.toBeNull();
    expect(status!.showHardWall).toBe(false);
  });
});
