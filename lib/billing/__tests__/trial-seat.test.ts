import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRIAL_SEAT_PRICE_ID,
  TechnicianSeatLimitReached,
  assertTechnicianSeatAvailable,
  isTrialSeatLocked,
  seatsNeededToBuy,
  technicianSeatUsage,
} from "../technician-seats";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T00:00:00Z").getTime();
const daysAgo = (days: number) => new Date(NOW - days * DAY);

type Row = {
  active: boolean;
  seats: number | null;
  stripePriceId: string | null;
} | null;

function fakeDb(state: {
  owner: { subscriptionStatus: string; trialEndsAt: Date | null; createdAt: Date };
  row?: Row;
  members?: number;
  invites?: number;
  workspace?: boolean;
}) {
  const db = {
    state,
    $queryRaw: vi.fn(async () => []),
    organization: { findUnique: vi.fn(async () => ({ ownerId: "owner" })) },
    workspace: {
      findFirst: vi.fn(async () => (state.workspace === false ? null : { id: "ws" })),
    },
    user: {
      findUnique: vi.fn(async () => state.owner),
      count: vi.fn(async () => state.members ?? 0),
    },
    userInvite: { count: vi.fn(async () => state.invites ?? 0) },
    featureEntitlement: {
      findUnique: vi.fn(async () => state.row ?? null),
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        state.row = state.row ?? create;
        return state.row;
      }),
    },
  };
  return db as typeof db & never;
}

const onTrial = (signedUpDaysAgo: number) => ({
  subscriptionStatus: "TRIAL",
  // PRICING_CONFIG.free.trialDays: the trial and the free seat end together.
  trialEndsAt: new Date(daysAgo(signedUpDaysAgo).getTime() + 15 * DAY),
  createdAt: daysAgo(signedUpDaysAgo),
});
const marker: Row = { active: false, seats: 0, stripePriceId: TRIAL_SEAT_PRICE_ID };
const paid = (seats: number): Row => ({ active: true, seats, stripePriceId: "price_x" });

describe("the 15-day free trial seat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("gives a trial business one free seat and stamps it when taken", async () => {
    const db = fakeDb({ owner: onTrial(1) });
    await assertTechnicianSeatAvailable(db, "org");
    expect(db.featureEntitlement.upsert).toHaveBeenCalledTimes(1);
    const arg = db.featureEntitlement.upsert.mock.calls[0][0] as { create: Row };
    expect(arg.create).toMatchObject({ active: false, stripePriceId: TRIAL_SEAT_PRICE_ID });
  });

  it("gives only one: a second technician is refused", async () => {
    const db = fakeDb({ owner: onTrial(1), row: marker, members: 1 });
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("takes the organisation lock before counting, so concurrent invites cannot both fit", async () => {
    const db = fakeDb({ owner: onTrial(1) });
    await assertTechnicianSeatAvailable(db, "org");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.user.count.mock.invocationCallOrder[0],
    );
  });

  it("swapping a technician does not restart the 15 days", async () => {
    const db = fakeDb({ owner: onTrial(15), row: marker, members: 0 });
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("day 14 still works and is not locked", async () => {
    const db = fakeDb({ owner: onTrial(14), row: marker, members: 1 });
    expect((await technicianSeatUsage(db, "org")).free).toBe(1);
    expect(await isTrialSeatLocked(db, "org")).toBe(false);
  });

  it("day 15 locks the technician and offers no free seat", async () => {
    const db = fakeDb({ owner: onTrial(15), row: marker, members: 1 });
    expect((await technicianSeatUsage(db, "org")).free).toBe(0);
    expect(await isTrialSeatLocked(db, "org")).toBe(true);
  });

  it("paying unlocks: the paid row replaces the marker", async () => {
    const db = fakeDb({ owner: onTrial(16), row: paid(1), members: 1 });
    expect(await isTrialSeatLocked(db, "org")).toBe(false);
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("an expired trial gets no free seat, even swept late", async () => {
    const sweptLate = { ...onTrial(5), trialEndsAt: daysAgo(1) };
    const db = fakeDb({ owner: sweptLate });
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
    const expired = fakeDb({
      owner: { subscriptionStatus: "EXPIRED", trialEndsAt: daysAgo(1), createdAt: daysAgo(5) },
    });
    expect((await technicianSeatUsage(expired, "org")).free).toBe(0);
  });

  it("a paid plan includes no free seat", async () => {
    const db = fakeDb({
      owner: { subscriptionStatus: "ACTIVE", trialEndsAt: null, createdAt: daysAgo(1) },
    });
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("a business that took the seat, then bought the plan, keeps it to day 15", async () => {
    const owner = { subscriptionStatus: "ACTIVE", trialEndsAt: null, createdAt: daysAgo(5) };
    const db = fakeDb({ owner, row: marker, members: 1 });
    expect((await technicianSeatUsage(db, "org")).free).toBe(1);
    expect(await isTrialSeatLocked(db, "org")).toBe(false);
  });

  it("never locks a live business whose technicians predate this rule", async () => {
    const legacy = fakeDb({
      owner: { subscriptionStatus: "ACTIVE", trialEndsAt: null, createdAt: daysAgo(400) },
      members: 3,
    });
    expect(await isTrialSeatLocked(legacy, "org")).toBe(false);
  });

  it("no workspace means no free seat, not a crash", async () => {
    const db = fakeDb({ owner: onTrial(1), workspace: false });
    await expect(assertTechnicianSeatAvailable(db, "org")).rejects.toBeInstanceOf(
      TechnicianSeatLimitReached,
    );
  });

  it("a first purchase covers everyone the free seat was covering, plus the new one", async () => {
    const during = fakeDb({ owner: onTrial(5), row: marker, members: 1 });
    expect(await seatsNeededToBuy(during, "org", 1)).toBe(2);
    const afterLock = fakeDb({ owner: onTrial(16), row: marker, members: 1 });
    expect(await seatsNeededToBuy(afterLock, "org", 1)).toBe(1);
    const noMarker = fakeDb({ owner: onTrial(5), members: 0 });
    expect(await seatsNeededToBuy(noMarker, "org", 1)).toBe(1);
  });
});
