import { describe, expect, it } from "vitest";

import {
  D3_EVENT_TYPES,
  D3_WINDOW_DAYS,
  d3Window,
  fetchAllStripeEvents,
  reconcileD3,
  type StripeEventPage,
  type StripeEventRef,
} from "../producers/d3-revenue-reconciliation";

/**
 * Controls for the D3 producer.
 *
 * The criterion's evidence file names the trap this suite exists to keep shut:
 * "0 events on both sides reconciles, but it does NOT prove the pipeline
 * works; it only proves nothing happened." So the tests that matter are the
 * ones that make the reconciliation FAIL -- an event with no row, a truncated
 * page, a duplicate id. A reconciler only ever observed agreeing has not been
 * shown to detect a disagreement.
 */

function stripeEvent(id: string): StripeEventRef {
  return { id, type: "customer.subscription.created" };
}

function inputs(overrides: Partial<Parameters<typeof reconcileD3>[0]> = {}) {
  return {
    stripeEvents: [stripeEvent("evt_1"), stripeEvent("evt_2")],
    dbRows: [{ stripeEventId: "evt_1" }, { stripeEventId: "evt_2" }],
    dbEventsWithoutStripeId: 0,
    failedWebhookDeliveries: 0,
    liveMode: true,
    windowEndsAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("reconcileD3", () => {
  it("reconciles when every Stripe event has its row", () => {
    const m = reconcileD3(inputs());
    expect(m.stripeEventCount).toBe(2);
    expect(m.matchedInDb).toBe(2);
    expect(m.missingInDb).toBe(0);
    expect(m.missingIds).toBe("");
  });

  it("detects an event the webhook never wrote", () => {
    const m = reconcileD3(
      inputs({ dbRows: [{ stripeEventId: "evt_1" }] }),
    );
    expect(m.missingInDb).toBe(1);
    expect(m.matchedInDb).toBe(1);
    expect(m.missingIds).toBe("evt_2");
  });

  it("catches EQUAL totals made of different events", () => {
    // The failure that count-matching cannot see, and the reason this compares
    // sets. Two Stripe events, two rows -- but one row is for an event outside
    // this set, so a real delivery failure hides behind a tidy 2 = 2.
    const m = reconcileD3(
      inputs({
        dbRows: [{ stripeEventId: "evt_1" }, { stripeEventId: "evt_999" }],
      }),
    );
    expect(m.stripeEventCount).toBe(2);
    expect(m.missingInDb).toBe(1);
    expect(m.matchedInDb).toBe(1);
    expect(m.missingIds).toBe("evt_2");
  });

  it("counts duplicate stripe ids, the @unique positive control", () => {
    const m = reconcileD3(
      inputs({
        dbRows: [
          { stripeEventId: "evt_1" },
          { stripeEventId: "evt_1" },
          { stripeEventId: "evt_2" },
        ],
      }),
    );
    expect(m.duplicateStripeIds).toBe(1);
  });

  it("ignores null stripe ids when matching, and does not count them as duplicates", () => {
    const m = reconcileD3(
      inputs({
        dbRows: [
          { stripeEventId: null },
          { stripeEventId: null },
          { stripeEventId: "evt_1" },
          { stripeEventId: "evt_2" },
        ],
      }),
    );
    expect(m.duplicateStripeIds).toBe(0);
    expect(m.missingInDb).toBe(0);
  });

  it("reports an empty window honestly rather than as a match", () => {
    // The producer does not throw; it reports zero and the VERIFIER rejects
    // it, so the refusal is visible in the receipt rather than as a missing
    // file.
    const m = reconcileD3(inputs({ stripeEvents: [], dbRows: [] }));
    expect(m.stripeEventCount).toBe(0);
    expect(m.missingInDb).toBe(0);
  });

  it("reads live mode from the key rather than accepting a declaration", () => {
    expect(reconcileD3(inputs({ liveMode: false })).mode).toBe("test");
    expect(reconcileD3(inputs({ liveMode: true })).mode).toBe("live");
  });

  it("bounds the missing-id list so a receipt stays a measurement", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      stripeEvent(`evt_${String(i).padStart(3, "0")}`),
    );
    const m = reconcileD3(inputs({ stripeEvents: many, dbRows: [] }));
    expect(m.missingInDb).toBe(40);
    expect(m.missingIds.split(",")).toHaveLength(20);
  });

  it("declares the scope the verifier pins", () => {
    const m = reconcileD3(inputs());
    expect(m.windowDays).toBe(7);
    expect(m.eventTypesScanned).toBe([...D3_EVENT_TYPES].join(","));
    expect(m.source).toBe("stripe+prisma");
  });
});

describe("d3Window", () => {
  it("is exactly seven days wide and ends now", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const { gte, lte } = d3Window(now);
    expect(lte - gte).toBe(D3_WINDOW_DAYS * 86_400);
    expect(lte).toBe(Math.floor(now.getTime() / 1000));
  });
});

describe("fetchAllStripeEvents — a truncated list hides a shortfall", () => {
  function page(data: StripeEventRef[], has_more = false): StripeEventPage {
    return { data, has_more };
  }

  it("walks every page and threads starting_after", async () => {
    const pages = [
      page([stripeEvent("evt_1")], true),
      page([stripeEvent("evt_2")], true),
      page([stripeEvent("evt_3")]),
    ];
    const seen: Array<string | null> = [];
    const events = await fetchAllStripeEvents(async (startingAfter) => {
      seen.push(startingAfter);
      return pages[seen.length - 1];
    });
    expect(events.map((e) => e.id)).toEqual(["evt_1", "evt_2", "evt_3"]);
    // Threaded from the LAST id of each page, which is how Stripe paginates.
    expect(seen).toEqual([null, "evt_1", "evt_2"]);
  });

  it("refuses when Stripe promises more but returns an empty page", async () => {
    await expect(
      fetchAllStripeEvents(async () => page([], true)),
    ).rejects.toThrow(/truncated/);
  });

  it("refuses when the pages never end", async () => {
    await expect(
      fetchAllStripeEvents(async () => page([stripeEvent("evt_1")], true), 3),
    ).rejects.toThrow(/Stopped after 3 pages/);
  });

  it("stops after a single complete page", async () => {
    let calls = 0;
    await fetchAllStripeEvents(async () => {
      calls++;
      return page([stripeEvent("evt_1")]);
    });
    expect(calls).toBe(1);
  });
});
