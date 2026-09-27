/**
 * RA-7721 — a Founding Trial grant is free and stays free. A Stripe
 * subscription event (a checkout opened before the grant, a quantity change,
 * a cancellation) must never overwrite or deactivate a complimentary
 * entitlement, while two events racing on a PAID row must still be applied.
 *
 * Uses the REAL registry and a small store that behaves like Prisma's upsert
 * with a non-unique filter: an existing row the filter rejects falls through
 * to create and fails on the unique key (P2002).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";

type Row = Record<string, unknown> & { stripePriceId: string | null };
const store = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  failNextCreate: false,
}));

vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/prisma", () => {
  const key = (w: { workspaceId: string; sku: string }) => `${w.workspaceId}:${w.sku}`;
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
  return {
    prisma: {
      featureEntitlement: {
        upsert: vi.fn(async ({ where, create, update }) => {
          const k = key(where.workspaceId_sku);
          const row = store.rows.get(k) as Row | undefined;
          // Evaluate the filter the code actually sent, with SQL null rules:
          // NOT (col = x) is not true when col is null.
          type Cond = { stripePriceId?: string | null; NOT?: { stripePriceId: string } };
          const holds = (c: Cond, r: Row) =>
            c.NOT
              ? r.stripePriceId !== null && r.stripePriceId !== c.NOT.stripePriceId
              : r.stripePriceId === c.stripePriceId;
          const matches =
            row && (!where.OR || (where.OR as Cond[]).some((c) => holds(c, row)));
          if (row && matches && !store.failNextCreate) {
            Object.assign(row, update);
            return row;
          }
          if (row || store.failNextCreate) {
            store.failNextCreate = false;
            throw conflict();
          }
          store.rows.set(k, { ...create });
          return create;
        }),
        findUnique: vi.fn(async ({ where }) => {
          return store.rows.get(key(where.workspaceId_sku)) ?? null;
        }),
      },
    },
  };
});

import { handleRecurringAddonSubscription } from "../route";

function seatSubscription(
  status: Stripe.Subscription.Status,
  quantity = 1,
): Stripe.Subscription {
  return {
    id: "sub_new",
    status,
    metadata: { type: "technician_seats_addon", workspaceId: "ws_9", userId: "u_9" },
    items: { data: [{ price: { id: "price_seats_1" }, quantity }] },
  } as unknown as Stripe.Subscription;
}

const GRANT = {
  workspaceId: "ws_9",
  sku: "TECHNICIAN_SEATS",
  active: true,
  seats: 999,
  stripeSubscriptionId: null,
  stripePriceId: "complimentary:founding-trial",
};

beforeEach(() => {
  store.rows.clear();
  store.failNextCreate = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Stripe events never replace a Founding Trial grant (RA-7721)", () => {
  it.each([
    ["a checkout opened before the grant completes", "active" as const],
    ["the subscription is cancelled", "canceled" as const],
    ["payment fails", "past_due" as const],
  ])("keeps 999 free seats when %s", async (_label, status) => {
    store.rows.set("ws_9:TECHNICIAN_SEATS", { ...GRANT });
    const handled = await handleRecurringAddonSubscription(
      seatSubscription(status, 1),
    );
    expect(handled).toBe(true);
    expect(store.rows.get("ws_9:TECHNICIAN_SEATS")).toEqual(GRANT);
  });

  it("still applies an event to a paid row", async () => {
    store.rows.set("ws_9:TECHNICIAN_SEATS", {
      ...GRANT,
      seats: 2,
      stripeSubscriptionId: "sub_new",
      stripePriceId: "price_seats_1",
    });
    await handleRecurringAddonSubscription(seatSubscription("active", 5));
    expect(store.rows.get("ws_9:TECHNICIAN_SEATS")).toMatchObject({
      seats: 5,
      stripeSubscriptionId: "sub_new",
    });
  });

  it("retries, rather than drops, an event that races another on a paid row", async () => {
    store.rows.set("ws_9:TECHNICIAN_SEATS", {
      ...GRANT,
      active: false,
      seats: 3,
      stripeSubscriptionId: "sub_new",
      stripePriceId: "price_seats_1",
    });
    store.failNextCreate = true; // the first write loses a race
    await handleRecurringAddonSubscription(seatSubscription("active", 3));
    expect(store.rows.get("ws_9:TECHNICIAN_SEATS")).toMatchObject({
      active: true,
      seats: 3,
    });
  });
});
