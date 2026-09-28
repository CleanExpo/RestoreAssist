import { describe, expect, it, beforeEach, vi } from "vitest";
import { AddonSku } from "@prisma/client";
import {
  COMPLIMENTARY_PRICE_ID,
  FOUNDING_TRIAL_SEATS,
  FoundingTrialGrantError,
  grantFoundingTrial,
  isComplimentaryEntitlement,
} from "../founding-trial-grant";

type Row = {
  workspaceId: string;
  sku: AddonSku;
  active: boolean;
  seats: number | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
};

/** In-memory FeatureEntitlement store keyed on (workspaceId, sku). */
function makeDb(opts: { beforeWrite?: (rows: Map<string, Row>) => void } = {}) {
  const rows = new Map<string, Row>();
  const key = (w: string, s: string) => `${w}:${s}`;
  // Organisations by id. org_2 holds the same ABN but has no ABR lookup of
  // its own, so an unscoped ABR read would let it borrow org_1's.
  const orgs = new Map<string, { ownerId: string; abn: string | null }>([
    ["org_1", { ownerId: "owner_1", abn: "51824753556" }],
    ["org_2", { ownerId: "owner_1", abn: "51824753556" }],
  ]);
  const org = vi.fn(async ({ where }: { where: { id: string } }) => {
    const o = orgs.get(where.id);
    return o ? { ...o } : null;
  });
  const ws = vi.fn(async () => ({ id: "ws_1" }));
  const db = {
    organization: { findUnique: org },
    workspace: { findFirst: ws },
    featureEntitlement: {
      findMany: vi.fn(async ({ where }: { where: { workspaceId: string } }) =>
        [...rows.values()].filter((r) => r.workspaceId === where.workspaceId),
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Row & object; data: Partial<Row> }) => {
          opts.beforeWrite?.(rows);
          const r = rows.get(key(where.workspaceId, where.sku));
          if (!r || r.stripeSubscriptionId !== where.stripeSubscriptionId) {
            return { count: 0 };
          }
          Object.assign(r, data);
          return { count: 1 };
        },
      ),
      createMany: vi.fn(
        async ({ data }: { data: Row[]; skipDuplicates: boolean }) => {
          const d = data[0];
          if (rows.has(key(d.workspaceId, d.sku))) return { count: 0 };
          rows.set(key(d.workspaceId, d.sku), {
            stripeSubscriptionId: null,
            ...d,
          });
          return { count: 1 };
        },
      ),
    },
  };
  return { db, rows, org, orgs, ws, get: (sku: AddonSku) => rows.get(key("ws_1", sku)) };
}

const ALL = Object.values(AddonSku);

describe("grantFoundingTrial (RA-7721, founder ruling 27/09)", () => {
  let h: ReturnType<typeof makeDb>;
  beforeEach(() => {
    h = makeDb();
  });

  it("switches on every add-on, marked free, on the owner's oldest READY workspace", async () => {
    const res = await grantFoundingTrial(h.db as never, "org_1", { apply: true });

    expect(h.ws).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner_1", status: "READY" },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(res).toMatchObject({ workspaceId: "ws_1", applied: true, skippedPaid: [] });
    expect([...res.granted].sort()).toEqual([...ALL].sort());
    for (const sku of ALL) {
      const row = h.get(sku)!;
      expect(row.active).toBe(true);
      expect(row.stripeSubscriptionId).toBeNull();
      expect(isComplimentaryEntitlement(row)).toBe(true);
    }
  });

  it("gives technician seats an effectively unlimited count; flat add-ons carry none", async () => {
    await grantFoundingTrial(h.db as never, "org_1", { apply: true });
    expect(h.get(AddonSku.TECHNICIAN_SEATS)!.seats).toBe(FOUNDING_TRIAL_SEATS);
    expect(h.get(AddonSku.VOICE)!.seats).toBeNull();
  });

  it("turns an existing unpaid, inactive row into a free grant", async () => {
    h.rows.set("ws_1:VOICE", {
      workspaceId: "ws_1",
      sku: AddonSku.VOICE,
      active: false,
      seats: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
    });
    await grantFoundingTrial(h.db as never, "org_1", { apply: true });
    expect(h.get(AddonSku.VOICE)).toMatchObject({
      active: true,
      stripePriceId: COMPLIMENTARY_PRICE_ID,
    });
  });

  it("dry run writes nothing but reports what it would grant", async () => {
    const res = await grantFoundingTrial(h.db as never, "org_1", { apply: false });
    expect(h.db.featureEntitlement.updateMany).not.toHaveBeenCalled();
    expect(h.db.featureEntitlement.createMany).not.toHaveBeenCalled();
    expect(h.rows.size).toBe(0);
    expect(res.applied).toBe(false);
    expect(res.granted.length).toBe(ALL.length);
  });

  it("leaves every row backed by a Stripe subscription untouched, active or not", async () => {
    h.rows.set("ws_1:VOICE", {
      workspaceId: "ws_1",
      sku: AddonSku.VOICE,
      active: true,
      seats: null,
      stripeSubscriptionId: "sub_paid",
      stripePriceId: "price_voice",
    });
    h.rows.set("ws_1:TECHNICIAN_SEATS", {
      workspaceId: "ws_1",
      sku: AddonSku.TECHNICIAN_SEATS,
      active: false,
      seats: 2,
      stripeSubscriptionId: "sub_seats",
      stripePriceId: "price_seats",
    });
    const res = await grantFoundingTrial(h.db as never, "org_1", { apply: true });
    expect([...res.skippedPaid].sort()).toEqual(
      [AddonSku.TECHNICIAN_SEATS, AddonSku.VOICE].sort(),
    );
    expect(h.get(AddonSku.VOICE)).toMatchObject({ stripeSubscriptionId: "sub_paid", stripePriceId: "price_voice" });
    expect(h.get(AddonSku.TECHNICIAN_SEATS)).toMatchObject({ active: false, seats: 2, stripeSubscriptionId: "sub_seats" });
  });

  it("a paid row written by Stripe mid-grant is skipped, not overwritten", async () => {
    const racing = makeDb({
      beforeWrite: (rows) => {
        if (!rows.has("ws_1:TECHNICIAN_SEATS")) {
          rows.set("ws_1:TECHNICIAN_SEATS", {
            workspaceId: "ws_1",
            sku: AddonSku.TECHNICIAN_SEATS,
            active: true,
            seats: 2,
            stripeSubscriptionId: "sub_new",
            stripePriceId: "price_seats",
          });
        }
      },
    });
    const res = await grantFoundingTrial(racing.db as never, "org_1", { apply: true });
    expect(res.skippedPaid).toContain(AddonSku.TECHNICIAN_SEATS);
    expect(res.granted).not.toContain(AddonSku.TECHNICIAN_SEATS);
    expect(racing.get(AddonSku.TECHNICIAN_SEATS)).toMatchObject({
      seats: 2,
      stripeSubscriptionId: "sub_new",
      stripePriceId: "price_seats",
    });
  });

  it("refuses an unknown organisation or one with no READY workspace", async () => {
    h.org.mockResolvedValueOnce(null as never);
    await expect(
      grantFoundingTrial(h.db as never, "nope", { apply: true }),
    ).rejects.toBeInstanceOf(FoundingTrialGrantError);

    h.ws.mockResolvedValueOnce(null as never);
    await expect(
      grantFoundingTrial(h.db as never, "org_1", { apply: true }),
    ).rejects.toBeInstanceOf(FoundingTrialGrantError);
    expect(h.rows.size).toBe(0);
  });
});

describe("a granted Founding Trial business can take on technicians", () => {
  it("the real seat counter sees the granted seats as purchased", async () => {
    const { technicianSeatUsage } = await import("../technician-seats");
    const h = makeDb();
    await grantFoundingTrial(h.db as never, "org_1", { apply: true });
    const seatRow = h.get(AddonSku.TECHNICIAN_SEATS)!;

    const seatDb = {
      organization: { findUnique: async () => ({ ownerId: "owner_1" }) },
      workspace: { findFirst: async () => ({ id: "ws_1" }) },
      featureEntitlement: {
        findUnique: async () => ({ active: seatRow.active, seats: seatRow.seats }),
      },
      user: { count: async () => 5 },
      userInvite: { count: async () => 2 },
    } as never;

    const usage = await technicianSeatUsage(seatDb, "org_1");
    expect(usage.purchased).toBe(FOUNDING_TRIAL_SEATS);
    expect(usage.purchased).toBeGreaterThan(usage.used);
  });
});

type Session = { id: string; customer: string; status: string; metadata?: Record<string, string> };
type Sub = { id: string; customer: string; status: string; metadata?: Record<string, string> };

/** Stripe read double: account-wide lists of whatever the arrays hold at the call. */
function makeStripe(sessions: Session[], subs: Sub[]) {
  const iter = <T,>(items: T[]) => ({
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  });
  const sessionsList = vi.fn((p: { status: string }) =>
    iter(sessions.filter((s) => s.status === p.status)),
  );
  const subsList = vi.fn((_p: { limit: number }) => iter(subs));
  return {
    stripe: {
      checkout: { sessions: { list: sessionsList } },
      subscriptions: { list: subsList },
    },
    sessionsList,
    subsList,
  };
}

const seatCheckout = (
  id: string,
  customer: string,
  status = "open",
  workspaceId = "ws_1",
): Session => ({
  id,
  customer,
  status,
  metadata: { type: "addon_subscription", sku: "TECHNICIAN_SEATS", workspaceId },
});
const seatSub = (
  id: string,
  customer: string,
  status = "active",
  workspaceId = "ws_1",
): Sub => ({
  id,
  customer,
  status,
  metadata: { type: "technician_seats_addon", sku: "TECHNICIAN_SEATS", workspaceId },
});

type Member = { customer: string | null; status: string };

/**
 * makeDb plus what runFoundingTrialGrant needs: members, a transaction,
 * deletes. The members double honours a status filter in the query, so a
 * filter that drops former members is visible to the tests.
 */
function makeRunDb(members: Array<string | null | Member> = []) {
  const base = makeDb();
  const abrJob: { current: unknown } = { current: VERIFIED_ABR_JOB };
  const owner: Owner = {
    id: "owner_1",
    subscriptionStatus: "EXPIRED",
    trialEndsAt: new Date("2026-09-15T00:00:00.000Z"),
    creditsRemaining: 0,
    subscriptionId: null,
    lifetimeAccess: false,
  };
  const roster: Member[] = members.map((m) =>
    m && typeof m === "object" ? m : { customer: m, status: "ACTIVE" },
  );
  const db = {
    ...base.db,
    workspace: {
      findFirst: base.ws,
      findUnique: vi.fn(
        async (args: { select: { members: { where?: { status?: string } } } }) => {
          const status = args.select.members.where?.status;
          return {
            owner: { stripeCustomerId: "cus_owner" },
            members: roster
              .filter((m) => !status || m.status === status)
              .map((m) => ({ user: { stripeCustomerId: m.customer } })),
          };
        },
      ),
    },
    featureEntitlement: {
      ...base.db.featureEntitlement,
      deleteMany: vi.fn(async ({ where }: { where: Row & object }) => {
        const k = `${where.workspaceId}:${where.sku}`;
        const r = base.rows.get(k);
        if (
          !r ||
          r.stripePriceId !== where.stripePriceId ||
          r.stripeSubscriptionId !== null
        ) {
          return { count: 0 };
        }
        base.rows.delete(k);
        return { count: 1 };
      }),
    },
    // Founder input 28/09: the grant needs the firm's ABN confirmed by ABR
    // during the signup walkthrough (HydrationJob kind ABR, READY).
    hydrationJob: {
      findUnique: vi.fn(
        async ({ where }: { where: { organizationId_kind?: { organizationId?: string; kind?: string } } }) => {
          const k = where?.organizationId_kind;
          if (!k?.organizationId || !k?.kind) {
            throw new Error("hydrationJob read must be scoped by organizationId_kind");
          }
          return k.organizationId === "org_1" && k.kind === "ABR" ? abrJob.current : null;
        },
      ),
    },
    // Row locks taken inside the write transaction (SELECT ... FOR UPDATE).
    $queryRaw: vi.fn(async (_sql: unknown) => [{}]),
    // RA-7721 (28/09): the owner's base-plan trial, written with the grant.
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === owner.id ? { ...owner } : null,
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<Owner> }) => {
          // Only the id is honoured here; the base-plan guards are proven in
          // founding-trial-base-plan.test.ts against a where-evaluating double.
          if (where.id !== owner.id) return { count: 0 };
          Object.assign(owner, data);
          return { count: 1 };
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db)),
  };
  return { ...base, db, roster, owner, abrJob };
}

const VERIFIED_ABR_JOB = {
  status: "READY",
  payload: {
    abn: "51824753556",
    status: "ACTIVE",
    legalName: "WATERLINE RESTORATIONS PTY LTD",
    tradingNames: ["Waterline Restorations"],
  },
};

type Owner = {
  id: string;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  creditsRemaining: number | null;
  subscriptionId: string | null;
  lifetimeAccess: boolean | null;
};

async function run(
  db: unknown,
  stripe: unknown,
  opts: { duringSettle?: () => void } = {},
) {
  const { runFoundingTrialGrant } = await import("../founding-trial-grant");
  return runFoundingTrialGrant({
    db: db as never,
    stripe: stripe as never,
    organizationId: "org_1",
    apply: true,
    sleep: async () => opts.duringSettle?.(),
  });
}

describe("runFoundingTrialGrant — never free while the business is also paying (codex r3)", () => {
  it("control: an owner's open add-on checkout refuses before anything is written", async () => {
    const { db, rows } = makeRunDb();
    const { stripe } = makeStripe([seatCheckout("cs_owner", "cus_owner")], []);
    const out = await run(db, stripe);
    expect(out).toMatchObject({
      status: "refused",
      conflicts: [{ kind: "open_checkout", id: "cs_owner" }],
    });
    expect(rows.size).toBe(0);
    expect(db.featureEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it("P1-PREFLIGHT-NOT-A-DRAIN: a checkout completed before the check, webhook not landed, refuses", async () => {
    const { db, rows } = makeRunDb();
    const { stripe } = makeStripe(
      [seatCheckout("cs_done", "cus_owner", "complete")],
      [seatSub("sub_unrecorded", "cus_owner")],
    );
    const out = await run(db, stripe);
    expect(out).toMatchObject({
      status: "refused",
      conflicts: [{ kind: "live_subscription", id: "sub_unrecorded" }],
    });
    expect(rows.size).toBe(0);
  });

  it("P1-PREFLIGHT-MISSES-MEMBER-CUSTOMERS: an active member's open checkout refuses", async () => {
    const { db, rows } = makeRunDb(["cus_member", null]);
    const { stripe } = makeStripe([seatCheckout("cs_member", "cus_member")], []);
    const out = await run(db, stripe);
    expect(out).toMatchObject({
      status: "refused",
      conflicts: [{ kind: "open_checkout", id: "cs_member", customer: "cus_member" }],
    });
    expect(rows.size).toBe(0);
  });

  it("P1-PREFLIGHT-NOT-A-DRAIN: a checkout opened after the check is caught after the wait, and the grant is put back as it was", async () => {
    const { db, rows, get } = makeRunDb();
    rows.set("ws_1:VOICE", {
      workspaceId: "ws_1",
      sku: AddonSku.VOICE,
      active: false,
      seats: null,
      stripeSubscriptionId: null,
      stripePriceId: "price_old",
    });
    const sessions: Session[] = [];
    const { stripe } = makeStripe(sessions, []);
    const out = await run(db, stripe, {
      duringSettle: () => {
        // The grant has committed: every add-on is held free, so checkout now 409s.
        expect(get(AddonSku.TECHNICIAN_SEATS)?.stripePriceId).toBe(COMPLIMENTARY_PRICE_ID);
        sessions.push(seatCheckout("cs_racing", "cus_owner"));
      },
    });
    expect(out).toMatchObject({ status: "reverted", conflicts: [{ id: "cs_racing" }] });
    expect([...rows.keys()]).toEqual(["ws_1:VOICE"]);
    expect(get(AddonSku.VOICE)).toMatchObject({
      active: false,
      seats: null,
      stripePriceId: "price_old",
    });
  });

  it("the revert leaves alone a row Stripe linked during the wait", async () => {
    const { db, get } = makeRunDb();
    const sessions: Session[] = [];
    const { stripe } = makeStripe(sessions, []);
    await run(db, stripe, {
      duringSettle: () => {
        Object.assign(get(AddonSku.VOICE)!, {
          stripeSubscriptionId: "sub_voice",
          stripePriceId: "price_voice",
        });
        sessions.push(seatCheckout("cs_racing", "cus_owner"));
      },
    });
    expect(get(AddonSku.VOICE)).toMatchObject({ stripeSubscriptionId: "sub_voice", active: true });
    expect(get(AddonSku.TECHNICIAN_SEATS)).toBeUndefined();
  });

  it("with nothing in flight the grant stands; Stripe is listed account-wide before and after", async () => {
    const { db, get } = makeRunDb();
    const { stripe, sessionsList, subsList } = makeStripe([], []);
    const out = await run(db, stripe);
    expect(out.status).toBe("granted");
    expect(get(AddonSku.TECHNICIAN_SEATS)?.seats).toBe(FOUNDING_TRIAL_SEATS);
    expect(sessionsList.mock.calls).toEqual([
      [{ status: "open", limit: 100 }],
      [{ status: "open", limit: 100 }],
    ]);
    expect(subsList.mock.calls).toEqual([[{ limit: 100 }], [{ limit: 100 }]]);
  });

  it("dry run writes nothing and does not wait", async () => {
    const { db, rows } = makeRunDb();
    const { stripe } = makeStripe([], []);
    const sleep = vi.fn(async () => {});
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const out = await runFoundingTrialGrant({
      db: db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: false,
      sleep,
    });
    expect(out.status).toBe("dry_run");
    expect(rows.size).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("P1-DRAIN-DROPS-HISTORICAL-PAYERS: a REMOVED member's unrecorded subscription refuses", async () => {
    const { db, rows } = makeRunDb([{ customer: "cus_former", status: "REMOVED" }]);
    const { stripe } = makeStripe([], [seatSub("sub_former", "cus_former")]);
    const out = await run(db, stripe);
    expect(out).toMatchObject({
      status: "refused",
      conflicts: [{ kind: "live_subscription", id: "sub_former", customer: "cus_former" }],
    });
    expect(rows.size).toBe(0);
  });

  it("P1-DRAIN-DROPS-HISTORICAL-PAYERS: a member whose row vanishes during the wait is still checked", async () => {
    const { db, rows, roster } = makeRunDb(["cus_member"]);
    const subs: Sub[] = [];
    const { stripe } = makeStripe([], subs);
    const out = await run(db, stripe, {
      duringSettle: () => {
        roster.length = 0;
        subs.push(seatSub("sub_member", "cus_member"));
      },
    });
    expect(out).toMatchObject({ status: "reverted", conflicts: [{ id: "sub_member" }] });
    expect(rows.size).toBe(0);
  });

  it("P1-DRAIN-WORKSPACE-DRIFT: if the owner's workspace changes after the check, nothing is written", async () => {
    const { db, rows, ws } = makeRunDb();
    ws.mockResolvedValueOnce({ id: "ws_1" }).mockResolvedValue({ id: "ws_2" });
    const { stripe } = makeStripe([], [seatSub("sub_ws2", "cus_owner", "active", "ws_2")]);
    await expect(run(db, stripe)).rejects.toThrow(/changed from ws_1 to ws_2/);
    expect(rows.size).toBe(0);
  });

  it("P1-DRAIN-MISSES-DELETED-PAYER-CHECKOUTS: a deleted user's open checkout refuses", async () => {
    const { db, rows } = makeRunDb();
    const { stripe } = makeStripe([seatCheckout("cs_deleted", "cus_deleted_user")], []);
    const out = await run(db, stripe);
    expect(out).toMatchObject({
      status: "refused",
      conflicts: [{ kind: "open_checkout", id: "cs_deleted", customer: "cus_deleted_user" }],
    });
    expect(rows.size).toBe(0);
  });

  it("P1-DRAIN-MISSES-DELETED-PAYER-CHECKOUTS: a deleted user's checkout completing during the wait is reverted", async () => {
    const { db, rows } = makeRunDb();
    const subs: Sub[] = [];
    const { stripe } = makeStripe([], subs);
    const out = await run(db, stripe, {
      duringSettle: () => {
        subs.push(seatSub("sub_deleted", "cus_deleted_user"));
      },
    });
    expect(out).toMatchObject({ status: "reverted", conflicts: [{ id: "sub_deleted" }] });
    expect(rows.size).toBe(0);
  });
});

describe("addonBillingConflicts — what counts as billing in flight", () => {
  it("ignores other workspaces, non-add-on billing, finished subscriptions and ones already recorded", async () => {
    const { addonBillingConflicts } = await import("../founding-trial-grant");
    const { stripe } = makeStripe(
      [
        seatCheckout("cs_other_ws", "cus_owner", "open", "ws_other"),
        { id: "cs_base", customer: "cus_owner", status: "open", metadata: { type: "subscription" } },
        { id: "cs_no_ws", customer: "cus_owner", status: "open", metadata: { type: "addon_subscription" } },
      ],
      [
        seatSub("sub_other_ws", "cus_owner", "active", "ws_other"),
        seatSub("sub_cancelled", "cus_owner", "canceled"),
        seatSub("sub_recorded", "cus_owner"),
        seatSub("sub_unpaid", "cus_owner", "past_due"),
        {
          id: "sub_base",
          customer: "cus_owner",
          status: "active",
          metadata: { workspaceId: "ws_1", type: "subscription" },
        },
      ],
    );
    const found = await addonBillingConflicts(
      stripe as never,
      "ws_1",
      new Set(["sub_recorded"]),
    );
    expect(found.map((c) => c.id)).toEqual(["sub_unpaid"]);
  });
});

describe("runFoundingTrialGrant — the base plan travels with the grant (founder ruling 28/09)", () => {
  const LOCKED_OUT = "2026-09-15T00:00:00.000Z";

  it("a granted business's owner is back on TRIAL for 60 days", async () => {
    const { db, owner } = makeRunDb();
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const now = new Date("2026-09-28T00:00:00.000Z");
    const out = await runFoundingTrialGrant({
      db: db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: true,
      now,
      sleep: async () => {},
    });
    expect(out).toMatchObject({ status: "granted", basePlan: { outcome: "extended" } });
    expect(owner.subscriptionStatus).toBe("TRIAL");
    expect(owner.trialEndsAt?.toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });

  it("refused: the owner's base plan is not touched either", async () => {
    const { db, owner } = makeRunDb();
    const { stripe } = makeStripe([seatCheckout("cs_owner", "cus_owner")], []);
    const out = await run(db, stripe);
    expect(out.status).toBe("refused");
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(owner.trialEndsAt?.toISOString()).toBe(LOCKED_OUT);
  });

  it("reverted: the owner's base plan is put back with the add-ons", async () => {
    const { db, owner } = makeRunDb();
    const sessions: Session[] = [];
    const { stripe } = makeStripe(sessions, []);
    const out = await run(db, stripe, {
      duringSettle: () => {
        expect(owner.subscriptionStatus).toBe("TRIAL");
        sessions.push(seatCheckout("cs_racing", "cus_owner"));
      },
    });
    expect(out.status).toBe("reverted");
    expect(owner).toMatchObject({ subscriptionStatus: "EXPIRED", creditsRemaining: 0 });
    expect(owner.trialEndsAt?.toISOString()).toBe(LOCKED_OUT);
  });

  it("dry run reports the base plan and writes nothing", async () => {
    const { db, owner } = makeRunDb();
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const out = await runFoundingTrialGrant({
      db: db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: false,
      now: new Date("2026-09-28T00:00:00.000Z"),
    });
    expect(out).toMatchObject({ status: "dry_run", basePlan: { outcome: "extended", applied: false } });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(owner.subscriptionStatus).toBe("EXPIRED");
  });
});

describe("runFoundingTrialGrant — only for a business whose ABN ABR confirmed (founder input 28/09)", () => {
  async function refusedFor(mutate: (h: ReturnType<typeof makeRunDb>) => void) {
    const h = makeRunDb();
    mutate(h);
    const { stripe, sessionsList } = makeStripe([], []);
    const out = await run(h.db, stripe);
    expect(out.status).toBe("unverified_abn");
    expect(h.rows.size).toBe(0);
    expect(h.db.featureEntitlement.updateMany).not.toHaveBeenCalled();
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
    expect(sessionsList).not.toHaveBeenCalled();
    return out;
  }

  it("refuses a business with no ABN on record", async () => {
    await refusedFor((h) => (h.orgs.get("org_1")!.abn = null));
  });

  it("refuses when ABR never confirmed the ABN (no ABR lookup on record)", async () => {
    await refusedFor((h) => (h.abrJob.current = null));
  });

  it("refuses when the ABR lookup did not succeed", async () => {
    // A re-run lookup that errors keeps the previous success's payload: the
    // hydrate upsert never clears it, so only the status says it failed.
    await refusedFor((h) => (h.abrJob.current = { ...VERIFIED_ABR_JOB, status: "ERROR" }));
  });

  it("refuses while an ABR lookup is still running over an old result", async () => {
    await refusedFor((h) => (h.abrJob.current = { ...VERIFIED_ABR_JOB, status: "RUNNING" }));
  });

  it("refuses when the ABN on the business no longer matches the one ABR confirmed", async () => {
    await refusedFor((h) => (h.orgs.get("org_1")!.abn = "33102417032"));
  });

  it("refuses an ABN that ABR reports as cancelled", async () => {
    await refusedFor(
      (h) =>
        (h.abrJob.current = {
          ...VERIFIED_ABR_JOB,
          payload: { ...VERIFIED_ABR_JOB.payload, status: "CANCELLED" },
        }),
    );
  });

  it("a verified business: the dry run names the ABR entity for the operator to confirm", async () => {
    const { db } = makeRunDb();
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const out = await runFoundingTrialGrant({
      db: db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: false,
    });
    expect(out).toMatchObject({
      status: "dry_run",
      entity: {
        abn: "51824753556",
        legalName: "WATERLINE RESTORATIONS PTY LTD",
        tradingNames: ["Waterline Restorations"],
      },
    });
  });
});

describe("runFoundingTrialGrant — the ABR identity holds through the write (review r1)", () => {
  const sqlText = (call: unknown[]) => {
    const q = call[0] as { strings?: readonly string[]; sql?: string };
    return (q.sql ?? q.strings?.join("?") ?? String(q)).replace(/\s+/g, " ");
  };

  it("another business's ABR lookup never satisfies this one (scoped read)", async () => {
    const h = makeRunDb();
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const out = await runFoundingTrialGrant({
      db: h.db as never,
      stripe: stripe as never,
      organizationId: "org_2",
      apply: true,
      sleep: async () => {},
    });
    expect(out.status).toBe("unverified_abn");
    expect(h.rows.size).toBe(0);
  });

  it("P1-ABR-IDENTITY-RACE: ABN replaced and ABR lookup failed during the Stripe check — nothing is written", async () => {
    const h = makeRunDb();
    const { stripe, sessionsList } = makeStripe([], []);
    const list = sessionsList.getMockImplementation()!;
    sessionsList.mockImplementationOnce((p: { status: string }) => {
      h.orgs.get("org_1")!.abn = "33102417032";
      h.abrJob.current = { ...VERIFIED_ABR_JOB, status: "ERROR" };
      return list(p);
    });
    const out = await run(h.db, stripe);
    expect(out.status).toBe("unverified_abn");
    expect(h.rows.size).toBe(0);
    expect(h.db.featureEntitlement.updateMany).not.toHaveBeenCalled();
    expect(h.db.featureEntitlement.createMany).not.toHaveBeenCalled();
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
    expect(h.owner.subscriptionStatus).toBe("EXPIRED");
  });

  it("P1-ABR-IDENTITY-RACE: ABN alone replaced during the Stripe check — nothing is written", async () => {
    const h = makeRunDb();
    const { stripe, subsList } = makeStripe([], []);
    const list = subsList.getMockImplementation()!;
    subsList.mockImplementationOnce((p: { limit: number }) => {
      h.orgs.get("org_1")!.abn = "33102417032";
      return list(p);
    });
    const out = await run(h.db, stripe);
    expect(out.status).toBe("unverified_abn");
    expect(h.rows.size).toBe(0);
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
  });

  it("P1-ABR-IDENTITY-RACE: re-verified as a DIFFERENT business during the Stripe check — nothing is written", async () => {
    // The new ABN is itself ABR-confirmed, so only comparing it with the ABN
    // the operator was shown catches the swap.
    const h = makeRunDb();
    const { stripe, sessionsList } = makeStripe([], []);
    const list = sessionsList.getMockImplementation()!;
    sessionsList.mockImplementationOnce((p: { status: string }) => {
      h.orgs.get("org_1")!.abn = "33102417032";
      h.abrJob.current = {
        status: "READY",
        payload: { abn: "33102417032", status: "ACTIVE", legalName: "OTHER PTY LTD", tradingNames: [] },
      };
      return list(p);
    });
    const out = await run(h.db, stripe);
    expect(out.status).toBe("identity_changed");
    expect(h.rows.size).toBe(0);
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
  });

  it("locks the organisation and its ABR lookup inside the transaction before any grant write", async () => {
    const h = makeRunDb();
    const { stripe } = makeStripe([], []);
    const out = await run(h.db, stripe);
    expect(out.status).toBe("granted");
    const locks = h.db.$queryRaw.mock.calls.map(sqlText);
    expect(locks.some((q) => /FROM "Organization" WHERE "id" = \? FOR UPDATE/.test(q))).toBe(true);
    expect(
      locks.some((q) => /FROM "HydrationJob" WHERE "organizationId" = \? AND "kind" = 'ABR' FOR UPDATE/.test(q)),
    ).toBe(true);
    const lastLock = Math.max(...h.db.$queryRaw.mock.invocationCallOrder);
    const firstWrite = Math.min(
      ...h.db.featureEntitlement.updateMany.mock.invocationCallOrder,
      ...h.db.user.updateMany.mock.invocationCallOrder,
    );
    expect(lastLock).toBeLessThan(firstWrite);
    // The identity is re-read after the locks, inside the transaction.
    const orgReadsAfterLock = h.org.mock.invocationCallOrder.filter((n) => n > lastLock);
    const jobReadsAfterLock = h.db.hydrationJob.findUnique.mock.invocationCallOrder.filter(
      (n: number) => n > lastLock,
    );
    expect(orgReadsAfterLock.length).toBeGreaterThan(0);
    expect(jobReadsAfterLock.length).toBeGreaterThan(0);
  });
});

describe("runFoundingTrialGrant — Apply is bound to the business the operator previewed (review r3)", () => {
  async function preview(h: ReturnType<typeof makeRunDb>) {
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    const out = await runFoundingTrialGrant({
      db: h.db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: false,
    });
    if (out.status !== "dry_run") throw new Error(`preview was ${out.status}`);
    return { organizationId: "org_1", abn: out.entity.abn, legalName: out.entity.legalName };
  }
  async function apply(h: ReturnType<typeof makeRunDb>, confirmed: { organizationId: string; abn: string; legalName: string }) {
    const { stripe } = makeStripe([], []);
    const { runFoundingTrialGrant } = await import("../founding-trial-grant");
    return runFoundingTrialGrant({
      db: h.db as never,
      stripe: stripe as never,
      organizationId: "org_1",
      apply: true,
      confirmed,
      sleep: async () => {},
    });
  }

  it("P1-PREVIEW-IDENTITY-NOT-BOUND: the business is re-verified as another between Preview and Apply — Apply refuses and writes nothing", async () => {
    const h = makeRunDb();
    const confirmed = await preview(h);
    expect(confirmed).toEqual({ organizationId: "org_1", abn: "51824753556", legalName: "WATERLINE RESTORATIONS PTY LTD" });
    // setup/hydrate runs again: new ABN, READY, ACTIVE — a fully verified other business.
    h.orgs.get("org_1")!.abn = "33102417032";
    h.abrJob.current = {
      status: "READY",
      payload: { abn: "33102417032", status: "ACTIVE", legalName: "OTHER PTY LTD", tradingNames: [] },
    };
    const out = await apply(h, confirmed);
    expect(out.status).toBe("identity_changed");
    expect(h.rows.size).toBe(0);
    expect(h.db.featureEntitlement.updateMany).not.toHaveBeenCalled();
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
    expect(h.owner).toMatchObject({ subscriptionStatus: "EXPIRED", creditsRemaining: 0 });
  });

  it("refuses when the ABR business name changed since Preview, ABN unchanged", async () => {
    const h = makeRunDb();
    const confirmed = await preview(h);
    h.abrJob.current = {
      ...VERIFIED_ABR_JOB,
      payload: { ...VERIFIED_ABR_JOB.payload, legalName: "RENAMED PTY LTD" },
    };
    const out = await apply(h, confirmed);
    expect(out.status).toBe("identity_changed");
    expect(h.rows.size).toBe(0);
  });

  it("refuses when the ABN changed since Preview but the ABR business name is the same", async () => {
    const h = makeRunDb();
    const confirmed = await preview(h);
    h.orgs.get("org_1")!.abn = "33102417032";
    h.abrJob.current = {
      status: "READY",
      payload: { ...VERIFIED_ABR_JOB.payload, abn: "33102417032" },
    };
    const out = await apply(h, confirmed);
    expect(out.status).toBe("identity_changed");
    expect(h.rows.size).toBe(0);
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a confirmation made for a different organisation", async () => {
    const h = makeRunDb();
    const confirmed = await preview(h);
    const out = await apply(h, { ...confirmed, organizationId: "org_2" });
    expect(out.status).toBe("identity_changed");
    expect(h.rows.size).toBe(0);
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
  });

  it("positive control: an unchanged business is granted on its preview", async () => {
    const h = makeRunDb();
    const confirmed = await preview(h);
    const out = await apply(h, confirmed);
    expect(out.status).toBe("granted");
    expect(h.rows.size).toBeGreaterThan(0);
  });
});
