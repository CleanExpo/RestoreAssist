/**
 * RA-7721 — a Founding Trial business holds every add-on free. Checkout must
 * refuse to sell one, so nothing included is ever billed. Mocks mirror
 * technician-seats-checkout.test.ts and use the REAL registry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: vi.fn(() => ({ ok: true, key: "click-key-1" })),
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _scope: string,
      handler: (raw: string) => Promise<Response>,
    ) => handler(await req.text()),
  ),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  prices: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    featureEntitlement: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/addons/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/addons/checkout — Founding Trial add-ons are not sold (RA-7721)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_base_1",
    } as never);
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws_9",
      name: "Fixture Restoration",
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/x",
    });
  });

  it.each(["TECHNICIAN_SEATS", "BOOKKEEPING", "VOICE"])(
    "refuses %s with 409 and creates no Stripe checkout or subscription change",
    async (addonKey) => {
      vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
        active: true,
        stripeSubscriptionId: null,
        stripePriceId: "complimentary:founding-trial",
      } as never);
      const res = await POST(makeRequest({ addonKey, quantity: 1 }));
      expect(res.status).toBe(409);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    },
  );

  it("still sells an add-on the business does not hold free", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest({ addonKey: "BOOKKEEPING" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  // Codex r7 P1-DRAIN-UNBOUNDED-INFLIGHT: a request that passed the check
  // before a grant committed must not hand out a payable session after it.
  describe("a grant that commits while the request is creating the session", () => {
    const complimentary = {
      active: true,
      stripeSubscriptionId: null,
      stripePriceId: "complimentary:founding-trial",
    };
    beforeEach(() => {
      // Not free until the Stripe session exists; free from then on.
      vi.mocked(prisma.featureEntitlement.findUnique).mockImplementation(
        (async () =>
          stripeMock.checkout.sessions.create.mock.calls.length
            ? complimentary
            : null) as never,
      );
    });

    it.each(["TECHNICIAN_SEATS", "BOOKKEEPING"])(
      "%s: withholds the payment link, answers 409 and expires the session",
      async (addonKey) => {
        stripeMock.checkout.sessions.expire.mockResolvedValue({});
        const res = await POST(makeRequest({ addonKey, quantity: 1 }));
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(409);
        expect(JSON.stringify(await res.json())).not.toContain("checkout.stripe.com");
        expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith("cs_1");
      },
    );

    // Codex r7's schedule, run against the real grant: the request's seat
    // lookup stalls past the grant's whole run. Only a session whose link the
    // route handed out can be paid.
    it.each([299_000, 301_000])(
      "with the grant running, a request stalled %i ms never leaves a free add-on also billed",
      async (stall) => {
        vi.useFakeTimers();
        try {
          const { runFoundingTrialGrant } = await import("@/lib/billing/founding-trial-grant");
          const rows = new Map<string, Record<string, unknown>>();
          const sessions: Array<Record<string, unknown>> = [];
          const subs: Array<Record<string, unknown>> = [];
          let reached!: () => void;
          const stalled = new Promise<void>((r) => (reached = r));
          let calls = 0;
          vi.mocked(prisma.featureEntitlement.findUnique).mockImplementation((async (
            args: { where: { workspaceId_sku: { sku: string } } },
          ) => {
            calls += 1;
            if (calls === 2) {
              reached();
              await new Promise((r) => setTimeout(r, stall));
              return null; // read taken before the grant committed
            }
            return rows.get(args.where.workspaceId_sku.sku) ?? null;
          }) as never);
          stripeMock.checkout.sessions.create.mockImplementation(async () => {
            const s = { id: "cs_late", status: "open", customer: "cus_1", url: "https://checkout.stripe.com/late",
              metadata: { type: "addon_subscription", sku: "TECHNICIAN_SEATS", workspaceId: "ws_9" } };
            sessions.push(s);
            return s;
          });
          stripeMock.checkout.sessions.expire.mockImplementation(async (id: string) => {
            for (const s of sessions) if (s.id === id) s.status = "expired";
            return {};
          });
          const match = (row: Record<string, unknown>, where: Record<string, unknown>) =>
            Object.entries(where).every(([k, v]) => row[k] === v);
          const db: Record<string, unknown> = {
            organization: { findUnique: async () => ({ ownerId: "u1" }) },
            workspace: { findFirst: async () => ({ id: "ws_9" }) },
            featureEntitlement: {
              findMany: async () => [...rows.values()],
              updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
                let count = 0;
                for (const r of rows.values()) if (match(r, where)) { Object.assign(r, data); count++; }
                return { count };
              },
              createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
                const d = data[0];
                if (rows.has(d.sku as string)) return { count: 0 };
                rows.set(d.sku as string, { stripeSubscriptionId: null, ...d });
                return { count: 1 };
              },
              deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
                let count = 0;
                for (const [k, r] of rows) if (match(r, where)) { rows.delete(k); count++; }
                return { count };
              },
            },
          };
          db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
          const iter = <T,>(items: () => T[]) => ({ async *[Symbol.asyncIterator]() { yield* items(); } });
          const stripe = {
            checkout: { sessions: { list: () => iter(() => sessions.filter((s) => s.status === "open")) } },
            subscriptions: { list: () => iter(() => subs) },
          };

          const pendingCheckout = POST(makeRequest({ addonKey: "TECHNICIAN_SEATS", quantity: 1 }));
          await stalled;
          const pendingGrant = runFoundingTrialGrant({ db: db as never, stripe: stripe as never, organizationId: "org_1", apply: true });
          await vi.advanceTimersByTimeAsync(stall + 1_000);
          const grant = await pendingGrant;
          const res = await pendingCheckout;
          const body = await res.json();
          // The buyer pays only if the route handed them the link.
          if (body.url) {
            subs.push({ id: "sub_late", status: "active", customer: "cus_1",
              metadata: { type: "technician_seats_addon", sku: "TECHNICIAN_SEATS", workspaceId: "ws_9" } });
          }
          const free = rows.get("TECHNICIAN_SEATS")?.stripePriceId === "complimentary:founding-trial";
          expect(free && subs.length > 0).toBe(false);
          expect(grant.status === "granted" ? res.status : 409).toBe(409);
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it("still withholds the link when Stripe will not expire the session", async () => {
      stripeMock.checkout.sessions.expire.mockRejectedValue(new Error("stripe down"));
      const res = await POST(makeRequest({ addonKey: "VOICE" }));
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toContain("checkout.stripe.com");
    });
  });
});
