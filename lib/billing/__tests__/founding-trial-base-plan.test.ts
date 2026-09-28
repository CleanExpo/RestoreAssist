/**
 * RA-7721 — Founding Trial base plan (founder ruling 28/09/2026): the $99/month
 * base plan is free for 60 days from the grant, then $99/month.
 *
 * The base plan rides the existing trial machinery: the organisation owner's
 * User row holds subscriptionStatus TRIAL and trialEndsAt; members inherit it
 * through getEffectiveSubscription. A firm locked out on day 16 is EXPIRED
 * with creditsRemaining 0, so the grant must restore both the window and the
 * report credits, or the firm stays locked.
 *
 * The user double below evaluates the `where` the grant sends (equality, null,
 * in, lt, OR, AND), so a guard dropped from the query is visible: a row that
 * changes between the grant's read and its write is only protected by that
 * query.
 */
import { describe, expect, it, vi } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  FOUNDING_TRIAL_BASE_PLAN_DAYS,
  grantFoundingTrialBasePlan,
  revertFoundingTrialBasePlan,
} from "../founding-trial-grant";

type UserRow = {
  id: string;
  subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELED" | "EXPIRED" | "PAST_DUE" | null;
  trialEndsAt: Date | null;
  creditsRemaining: number | null;
  subscriptionId: string | null;
  lifetimeAccess: boolean | null;
};

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (k === "AND") return (cond as Where[]).every((w) => matches(row, w));
    const v = row[k];
    if (cond === null) return v === null;
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    if (typeof cond === "object") {
      const c = cond as { in?: unknown[]; lt?: Date };
      if (c.in) return c.in.includes(v);
      if (c.lt) return v instanceof Date && v.getTime() < c.lt.getTime();
      throw new Error(`unsupported condition on ${k}: ${JSON.stringify(cond)}`);
    }
    return v === cond;
  });
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T00:00:00.000Z");
const SIXTY = new Date(NOW.getTime() + 60 * DAY);
const FLOOR = PRICING_CONFIG.free.trialReportCredits;

function makeUserDb(
  owner: Partial<UserRow>,
  opts: { beforeWrite?: (u: UserRow) => void } = {},
) {
  const user: UserRow = {
    id: "owner_1",
    subscriptionStatus: "EXPIRED",
    trialEndsAt: new Date(NOW.getTime() - 13 * DAY), // locked out on day 16
    creditsRemaining: 0,
    subscriptionId: null,
    lifetimeAccess: false,
    ...owner,
  };
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === user.id ? { ...user } : null,
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Where; data: Partial<UserRow> }) => {
          opts.beforeWrite?.(user);
          if (!matches(user as never, where)) return { count: 0 };
          Object.assign(user, data);
          return { count: 1 };
        },
      ),
    },
  };
  return { db, user };
}

describe("grantFoundingTrialBasePlan (founder ruling 28/09: base plan free 60 days)", () => {
  it("is 60 days", () => {
    expect(FOUNDING_TRIAL_BASE_PLAN_DAYS).toBe(60);
  });

  it("a firm locked out on day 16 gets TRIAL until exactly 60 days from the grant, with report credits restored", async () => {
    const { db, user } = makeUserDb({});
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: true,
      now: NOW,
    });
    expect(res).toMatchObject({ outcome: "extended", applied: true });
    expect(res.trialEndsAt?.toISOString()).toBe(SIXTY.toISOString());
    expect(user.subscriptionStatus).toBe("TRIAL");
    expect(user.trialEndsAt?.toISOString()).toBe(SIXTY.toISOString());
    // Without credits canCreateReport still refuses a TRIAL owner.
    expect(user.creditsRemaining).toBe(FLOOR);
  });

  it("never lowers a higher credit balance", async () => {
    const { db, user } = makeUserDb({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
      creditsRemaining: FLOOR + 7,
    });
    await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(user.creditsRemaining).toBe(FLOOR + 7);
    expect(user.trialEndsAt?.toISOString()).toBe(SIXTY.toISOString());
  });

  it("does not shorten a trial that already runs past 60 days", async () => {
    const longer = new Date(NOW.getTime() + 90 * DAY);
    const { db, user } = makeUserDb({
      subscriptionStatus: "TRIAL",
      trialEndsAt: longer,
      creditsRemaining: 3,
    });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: true,
      now: NOW,
    });
    expect(res.outcome).toBe("kept_longer");
    expect(user.trialEndsAt?.toISOString()).toBe(longer.toISOString());
    expect(user.creditsRemaining).toBe(3);
  });

  it("does not shorten a trial lengthened between the grant's read and its write", async () => {
    const longer = new Date(NOW.getTime() + 90 * DAY);
    const { db, user } = makeUserDb(
      { subscriptionStatus: "TRIAL", trialEndsAt: new Date(NOW.getTime() + 2 * DAY) },
      { beforeWrite: (u) => (u.trialEndsAt = longer) },
    );
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: true,
      now: NOW,
    });
    expect(res.outcome).toBe("skipped_changed");
    expect(user.trialEndsAt?.toISOString()).toBe(longer.toISOString());
  });

  it("refuses a firm paying for the base plan through Stripe, and writes nothing", async () => {
    const { db, user } = makeUserDb({
      subscriptionStatus: "ACTIVE",
      subscriptionId: "sub_base",
      trialEndsAt: null,
      creditsRemaining: 12,
    });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: true,
      now: NOW,
    });
    expect(res.outcome).toBe("skipped_paying");
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(user).toMatchObject({ subscriptionStatus: "ACTIVE", trialEndsAt: null, creditsRemaining: 12 });
  });

  it("refuses a past-due Stripe payer too (any Stripe base subscription)", async () => {
    const { db, user } = makeUserDb({ subscriptionStatus: "PAST_DUE", subscriptionId: "sub_base" });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(res.outcome).toBe("skipped_paying");
    expect(user.subscriptionStatus).toBe("PAST_DUE");
  });

  it("does not overwrite a Stripe subscription that lands between the grant's read and its write", async () => {
    const { db, user } = makeUserDb(
      {},
      {
        beforeWrite: (u) => {
          u.subscriptionStatus = "ACTIVE";
          u.subscriptionId = "sub_racing";
        },
      },
    );
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: true,
      now: NOW,
    });
    expect(res.outcome).toBe("skipped_changed");
    expect(user.subscriptionStatus).toBe("ACTIVE");
    expect(user.trialEndsAt?.getTime()).toBeLessThan(NOW.getTime());
  });

  it("refuses a trial that Stripe bills at conversion (a card-on-file trial subscription)", async () => {
    const { db, user } = makeUserDb({
      subscriptionStatus: "TRIAL",
      subscriptionId: "sub_trial_card",
      trialEndsAt: new Date(NOW.getTime() + 3 * DAY),
    });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(res.outcome).toBe("skipped_paying");
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(user.trialEndsAt?.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("does not overwrite a card-on-file trial subscription that lands between read and write", async () => {
    const { db, user } = makeUserDb(
      { subscriptionStatus: "TRIAL", trialEndsAt: new Date(NOW.getTime() + 3 * DAY) },
      { beforeWrite: (u) => (u.subscriptionId = "sub_trial_racing") },
    );
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(res.outcome).toBe("skipped_changed");
    expect(user.trialEndsAt?.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("does not overwrite a credit balance that changed between the grant's read and its write", async () => {
    const { db, user } = makeUserDb(
      { subscriptionStatus: "TRIAL", trialEndsAt: new Date(NOW.getTime() + 2 * DAY), creditsRemaining: 10 },
      { beforeWrite: (u) => (u.creditsRemaining = FLOOR + 50) },
    );
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(res.outcome).toBe("skipped_changed");
    expect(user.creditsRemaining).toBe(FLOOR + 50);
  });

  it("revert does not hand back credits spent after the grant", async () => {
    const { db, user } = makeUserDb({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
      creditsRemaining: FLOOR + 50,
    });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    user.creditsRemaining = FLOOR + 49; // one report created meanwhile
    await revertFoundingTrialBasePlan(db as never, res);
    expect(user.trialEndsAt?.getTime()).toBe(NOW.getTime() + 5 * DAY);
    expect(user.creditsRemaining).toBe(FLOOR + 49);
  });

  it("leaves lifetime access alone", async () => {
    const { db } = makeUserDb({ lifetimeAccess: true, subscriptionStatus: "ACTIVE" });
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    expect(res.outcome).toBe("skipped_lifetime");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("dry run writes nothing but reports the end date it would set", async () => {
    const { db, user } = makeUserDb({});
    const before = { ...user };
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", {
      apply: false,
      now: NOW,
    });
    expect(res).toMatchObject({ outcome: "extended", applied: false });
    expect(res.trialEndsAt?.toISOString()).toBe(SIXTY.toISOString());
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(user).toEqual(before);
  });

  it("revert puts the owner back exactly as before", async () => {
    const { db, user } = makeUserDb({});
    const before = { ...user };
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    await revertFoundingTrialBasePlan(db as never, res);
    expect(user).toEqual(before);
  });

  it("revert leaves alone an owner who started paying after the grant", async () => {
    const { db, user } = makeUserDb({});
    const res = await grantFoundingTrialBasePlan(db as never, "owner_1", { apply: true, now: NOW });
    Object.assign(user, { subscriptionStatus: "ACTIVE", subscriptionId: "sub_new" });
    await revertFoundingTrialBasePlan(db as never, res);
    expect(user).toMatchObject({ subscriptionStatus: "ACTIVE", subscriptionId: "sub_new" });
    expect(user.trialEndsAt?.toISOString()).toBe(SIXTY.toISOString());
  });
});
