import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function stripeEvent(id: string, pendingWebhooks = 0): StripeEventRef {
  return { id, type: "customer.subscription.created", pendingWebhooks };
}

function inputs(overrides: Partial<Parameters<typeof reconcileD3>[0]> = {}) {
  return {
    stripeEvents: [stripeEvent("evt_1"), stripeEvent("evt_2")],
    dbRows: [{ stripeEventId: "evt_1" }, { stripeEventId: "evt_2" }],
    dbEventsWithoutStripeId: 0,
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

describe("no measurement reaches the producer from its environment", () => {
  const SOURCE = readFileSync(
    join(process.cwd(), "scripts", "ci", "producers", "d3-revenue-reconciliation.ts"),
    "utf8",
  );

  /**
   * CodeRabbit's other P1 on #2112. This producer used to read
   * `D3_FAILED_WEBHOOK_DELIVERIES` from the environment and sign whatever it
   * found there -- the `--measurements` defect two files away, reintroduced.
   * The `-1` default did fail closed, and I argued that made it safe. It did
   * not: a default that fails closed is no protection when the caller sets the
   * value to 0.
   *
   * This asserts on the source text deliberately. The hole was not a wrong
   * value, it was an INPUT existing at all, and only reading the source can
   * show that no such input has crept back.
   */
  it("reads no measurement value from process.env", () => {
    const envReads = [...new Set(SOURCE.match(/process\.env\.[A-Z_]+/g) ?? [])].sort();
    // STRIPE_SECRET_KEY is a credential, not a measurement: it decides whether
    // the producer can run, never what it reports.
    expect(envReads).toEqual(["process.env.STRIPE_SECRET_KEY"]);
  });

  it("never reads the old D3_FAILED_WEBHOOK_DELIVERIES variable", () => {
    expect(SOURCE).not.toContain("D3_FAILED_WEBHOOK_DELIVERIES ??");
  });

  it("derives the webhook count from Stripe, never from a caller", () => {
    // This field WAS `failedWebhookDeliveries`, read from
    // D3_FAILED_WEBHOOK_DELIVERIES: a caller-controlled input becoming a signed
    // measurement, which is the `--measurements` defect wearing a different
    // hat. It is now computed from each event's own `pending_webhooks`, so
    // there is no argument left to supply.
    expect(SOURCE).toContain("event.pending_webhooks");
    expect(SOURCE).not.toContain("failedWebhookDeliveries");
  });
});

describe("the webhook-delivery half", () => {
  it("counts events whose webhooks have not been delivered", () => {
    const m = reconcileD3(
      inputs({
        stripeEvents: [stripeEvent("evt_1"), stripeEvent("evt_2", 2)],
        dbRows: [{ stripeEventId: "evt_1" }, { stripeEventId: "evt_2" }],
      }),
    );
    expect(m.undeliveredWebhookEvents).toBe(1);
  });

  it("reports zero when every delivery has landed", () => {
    expect(reconcileD3(inputs()).undeliveredWebhookEvents).toBe(0);
  });

  it("counts an event once however many of its webhooks are outstanding", () => {
    // `pending_webhooks` is a count of endpoints, not of events. Summing it
    // would inflate the measurement on a repository with several endpoints and
    // make the criterion fail for having more subscribers.
    const m = reconcileD3(
      inputs({
        stripeEvents: [stripeEvent("evt_1", 7)],
        dbRows: [{ stripeEventId: "evt_1" }],
      }),
    );
    expect(m.undeliveredWebhookEvents).toBe(1);
  });

  it("is independent of whether the row exists", () => {
    // The two halves catch different things. A delivered webhook whose row is
    // missing is a writer failure (missingInDb); an undelivered webhook whose
    // row is absent is a delivery still in flight. Conflating them would let
    // one mask the other.
    const m = reconcileD3(
      inputs({
        stripeEvents: [stripeEvent("evt_1", 1)],
        dbRows: [],
      }),
    );
    expect(m.undeliveredWebhookEvents).toBe(1);
    expect(m.missingInDb).toBe(1);
  });
});
