import { describe, expect, it } from "vitest";

import {
  D1_IOS_GUARD,
  D1_LIFECYCLE,
  D1_NOT_PURCHASE_INITIATING,
  detectsAppleIap,
  discoverBillingRoutes,
  fetchAllD1Events,
  summariseD1,
  type StripeLifecycleEvent,
} from "../producers/d1-billing-flows";

/**
 * D1 producer controls.
 *
 * Two failures this suite exists to keep shut. One purchase must not be able to
 * count as a renewal it never was, and a new billing route must not be able to
 * appear without anyone deciding whether iOS may reach it.
 */

function ev(type: string, billingReason: string | null = null): StripeLifecycleEvent {
  return { type, billingReason };
}

/** A complete lifecycle: bought, renewed on a test clock, cancelled. */
function fullLifecycle(): StripeLifecycleEvent[] {
  return [
    ev("customer.subscription.created"),
    ev("invoice.payment_succeeded", "subscription_create"),
    ev("invoice.payment_succeeded", "subscription_cycle"),
    ev("customer.subscription.deleted"),
  ];
}

const GUARDED = [{ path: "app/api/create-checkout-session/route.ts", guarded: true }];

function summarise(over: Partial<Parameters<typeof summariseD1>[0]> = {}) {
  return summariseD1({
    events: fullLifecycle(),
    routes: GUARDED,
    liveMode: false,
    ...over,
  });
}

describe("the lifecycle must actually have happened", () => {
  it("reports all three stages observed", () => {
    const m = summarise();
    expect(m.purchaseCount).toBe(1);
    expect(m.renewalCount).toBe(1);
    expect(m.cancellationCount).toBe(1);
    expect(m.missingStages).toBe("");
  });

  it("does not let a first invoice count as a renewal", () => {
    /**
     * The trap. The FIRST invoice on a new subscription is
     * `billing_reason: "subscription_create"`, so counting
     * `invoice.payment_succeeded` outright would let one purchase satisfy both
     * "purchase" and "renewal" -- an event standing as evidence for something
     * it never showed. The evidence file's walk uses a Stripe test clock
     * precisely because a real renewal is otherwise a month away.
     */
    const m = summarise({
      events: [
        ev("customer.subscription.created"),
        ev("invoice.payment_succeeded", "subscription_create"),
        ev("customer.subscription.deleted"),
      ],
    });
    expect(m.purchaseCount).toBe(1);
    expect(m.renewalCount).toBe(0);
    expect(m.missingStages).toBe("renewal");
  });

  it.each([
    ["purchase", "customer.subscription.created"],
    ["cancellation", "customer.subscription.deleted"],
  ])("names %s when its event never appeared", (stage, type) => {
    const m = summarise({ events: fullLifecycle().filter((e) => e.type !== type) });
    expect(m.missingStages).toContain(stage);
  });

  it("names every stage when nothing was observed at all", () => {
    // Fail closed: an empty window is not a passing walk.
    expect(summarise({ events: [] }).missingStages).toBe(
      "purchase,renewal,cancellation",
    );
  });

  it("reads live mode from the key rather than from a declaration", () => {
    expect(summarise({ liveMode: true }).mode).toBe("live");
    expect(summarise().mode).toBe("test");
  });
});

describe("the iOS block on purchase routes", () => {
  it("counts a guarded route as guarded and classifies nothing", () => {
    const m = summarise();
    expect(m.billingRoutesScanned).toBe(1);
    expect(m.guardedRoutes).toBe(1);
    expect(m.unclassifiedBillingRoutes).toBe("");
  });

  it("names a new billing route that is neither guarded nor classified", () => {
    /**
     * The regression this half exists for: someone adds a checkout route and
     * forgets `rejectIfIOSCapacitor()`. Nothing notices until App Review does,
     * which is how RA-1842 started -- build 1.0(3) rejected on guideline 3.1.1.
     */
    const m = summarise({
      routes: [...GUARDED, { path: "app/api/new-thing/checkout/route.ts", guarded: false }],
    });
    expect(m.unclassifiedBillingRoutes).toBe("app/api/new-thing/checkout/route.ts");
  });

  it("accepts an unguarded route only when it is declared with a reason", () => {
    const m = summarise({
      routes: [...GUARDED, { path: "app/api/subscription/route.ts", guarded: false }],
    });
    expect(m.unclassifiedBillingRoutes).toBe("");
    expect(D1_NOT_PURCHASE_INITIATING["app/api/subscription/route.ts"]).toMatch(/\w/);
  });

  it("gives every classification a non-empty reason", () => {
    // A blank reason is an exclusion nobody argued for. A3 declares its
    // excluded projects for the same reason: a producer free to exclude
    // anything can always report success.
    for (const [route, reason] of Object.entries(D1_NOT_PURCHASE_INITIATING)) {
      expect(reason.length, `${route} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("discovers the real tree's Stripe routes, and none is unclassified", async () => {
    /**
     * Runs against the actual repository rather than a fixture. A fixture would
     * drift with the classification map and both could be wrong together --
     * which is exactly how the health-check validator survived its own PR.
     */
    const routes = await discoverBillingRoutes();
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.some((r) => r.guarded)).toBe(true);

    const m = summariseD1({ events: fullLifecycle(), routes, liveMode: false });
    expect(m.unclassifiedBillingRoutes).toBe("");
    expect(m.guardedRoutes).toBeGreaterThan(0);
    // Every classified path must still exist, or the map is carrying entries
    // for routes that were deleted and would hide a re-added one.
    const discovered = new Set(routes.map((r) => r.path));
    for (const path of Object.keys(D1_NOT_PURCHASE_INITIATING)) {
      expect(discovered.has(path), `${path} is classified but not discovered`).toBe(true);
    }
  });

  it("names the guard the routes are actually checked for", () => {
    expect(D1_IOS_GUARD).toBe("rejectIfIOSCapacitor");
  });
});

describe("the Apple IAP scope-out", () => {
  it("is measured from the tree, not asserted", () => {
    // If StoreKit or an IAP library ever lands, "not applicable" stops being a
    // fact and D1 must be re-scoped rather than quietly measuring Stripe alone.
    expect(detectsAppleIap('{"dependencies":{"next":"16"}}')).toBe(false);
    expect(detectsAppleIap('{"dependencies":{"react-native-iap":"12"}}')).toBe(true);
    expect(detectsAppleIap('{"dependencies":{"@revenuecat/purchases-js":"1"}}')).toBe(true);
  });

  it("reports this repository as shipping no IAP", () => {
    expect(summarise().appleIapShipped).toBe(false);
  });
});

describe("pagination", () => {
  it("walks every page", async () => {
    const pages = [
      { data: [ev("customer.subscription.created")], has_more: true, lastId: "evt_1" },
      { data: [ev("customer.subscription.deleted")], has_more: false, lastId: "evt_2" },
    ];
    let i = 0;
    const all = await fetchAllD1Events(async () => pages[i++]);
    expect(all).toHaveLength(2);
  });

  it("refuses a truncated window rather than reporting a short lifecycle", async () => {
    // An under-count here fails the criterion rather than passing it, but a
    // silent truncation would still be a measurement nobody could trust.
    await expect(
      fetchAllD1Events(async () => ({ data: [], has_more: true, lastId: null })),
    ).rejects.toThrow(/truncated/);
  });

  it("stops rather than looping forever", async () => {
    await expect(
      fetchAllD1Events(
        async () => ({ data: [ev("x")], has_more: true, lastId: "evt" }),
        3,
      ),
    ).rejects.toThrow(/Stopped after 3 pages/);
  });
});

describe("the criterion's stage list", () => {
  it("is the three the criterion names", () => {
    expect([...D1_LIFECYCLE]).toEqual(["purchase", "renewal", "cancellation"]);
  });
});
