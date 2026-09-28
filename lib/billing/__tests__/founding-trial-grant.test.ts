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
  const org = vi.fn(async () => ({ ownerId: "owner_1" }));
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
  return { db, rows, org, ws, get: (sku: AddonSku) => rows.get(key("ws_1", sku)) };
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
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db)),
  };
  return { ...base, db, roster };
}

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
