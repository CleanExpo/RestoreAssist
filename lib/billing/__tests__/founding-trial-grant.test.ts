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
