/**
 * A cancellation event and a paid fulfilment can run at once. The rule that a
 * dead subscription cannot end a live one therefore has to sit in the write
 * itself: a read before the write passes for both and the last write wins.
 */
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  active: boolean;
  seats: number | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
};

const db = vi.hoisted(() => ({
  row: null as Row | null,
  // A paid fulfilment landing between any read and the write.
  beforeWrite: null as (() => void) | null,
  featureEntitlement: {
    findUnique: vi.fn(async () => db.row),
    upsert: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));

import { applyRecurringAddonSubscription } from "../fulfill-recurring-addon";
import { TRIAL_SEAT_PRICE_ID } from "../technician-seats";

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError("unique", {
    code: "P2002",
    clientVersion: "test",
  });

const paidRow: Row = {
  active: true,
  seats: 2,
  stripeSubscriptionId: "sub_new",
  stripePriceId: "price_seat",
};

/** Evaluates the two conditions the write must carry against the current row. */
function matches(row: Row, subscriptionId: string) {
  const free = row.stripePriceId === null ||
    ![TRIAL_SEAT_PRICE_ID, "complimentary:founding-trial"].includes(row.stripePriceId);
  const ownable =
    !row.active ||
    row.stripeSubscriptionId === null ||
    row.stripeSubscriptionId === subscriptionId;
  return free && ownable;
}

const cancelled = (id: string) =>
  ({
    id,
    status: "canceled",
    metadata: { type: "technician_seats_addon", workspaceId: "ws" },
    items: { data: [{ price: { id: "price_seat" }, quantity: 1 }] },
  }) as unknown as Stripe.Subscription;

describe("a cancellation event for a seat subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.row = null;
    db.beforeWrite = null;
    const blindWrite = async ({ update, create }: { update: Partial<Row>; create: Row }) => {
      db.beforeWrite?.();
      db.row = db.row ? { ...db.row, ...update } : create;
    };
    db.featureEntitlement.upsert.mockImplementation(blindWrite);
    db.featureEntitlement.updateMany.mockImplementation(
      async ({ data }: { data: Partial<Row> }) => {
        db.beforeWrite?.();
        if (!db.row || !matches(db.row, "sub_old")) return { count: 0 };
        db.row = { ...db.row, ...data };
        return { count: 1 };
      },
    );
    db.featureEntitlement.create.mockImplementation(
      async ({ data }: { data: Row }) => {
        db.beforeWrite?.();
        if (db.row) throw conflict();
        db.row = data;
      },
    );
  });

  it("cannot end a paid seat that lands between its read and its write", async () => {
    db.row = null;
    db.beforeWrite = () => {
      db.row = paidRow;
      db.beforeWrite = null;
    };
    await applyRecurringAddonSubscription(cancelled("sub_old"));
    expect(db.row).toEqual(paidRow);
  });

  it("still records its cancellation when its own subscription's paid row lands first", async () => {
    let calls = 0;
    db.featureEntitlement.create.mockImplementation(async () => {
      calls += 1;
      db.row = { ...paidRow, stripeSubscriptionId: "sub_old" };
      throw conflict();
    });
    await applyRecurringAddonSubscription(cancelled("sub_old"));
    expect(calls).toBe(1);
    expect(db.row?.active).toBe(false);
  });

  it("carries both conditions in the write", async () => {
    db.row = paidRow;
    await applyRecurringAddonSubscription(cancelled("sub_old"));
    expect(db.featureEntitlement.upsert).not.toHaveBeenCalled();
    const where = db.featureEntitlement.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      workspaceId: "ws",
      sku: "TECHNICIAN_SEATS",
      AND: [
        {
          OR: [
            { stripePriceId: null },
            {
              stripePriceId: {
                notIn: [TRIAL_SEAT_PRICE_ID, "complimentary:founding-trial"],
              },
            },
          ],
        },
        {
          OR: [
            { active: false },
            { stripeSubscriptionId: null },
            { stripeSubscriptionId: "sub_old" },
          ],
        },
      ],
    });
    expect(db.row).toEqual(paidRow);
  });

  it("still records its own cancellation", async () => {
    db.row = { ...paidRow, stripeSubscriptionId: "sub_old" };
    await applyRecurringAddonSubscription(cancelled("sub_old"));
    expect(db.row?.active).toBe(false);
  });

  it("creates an inactive row when there is none", async () => {
    await applyRecurringAddonSubscription(cancelled("sub_old"));
    expect(db.row).toMatchObject({ active: false, stripeSubscriptionId: "sub_old" });
  });
});
