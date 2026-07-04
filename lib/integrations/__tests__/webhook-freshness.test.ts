/**
 * RA-6987 — shared webhook freshness-window shape.
 *
 * Boundary tests that pin the inclusive `[now - MAX_AGE, now + SKEW]` contract
 * at the exact horizon instants. The three route suites cover the "hours in the
 * past accepted / >5min future rejected" behaviour; these lock the millisecond
 * boundaries so a `<=`→`<` (or `>=`→`>`) drift can't slip through.
 */

import { describe, it, expect } from "vitest";
import {
  isWebhookEventFresh,
  WEBHOOK_MAX_AGE_MS,
  WEBHOOK_FUTURE_SKEW_MS,
} from "../webhook-freshness";

const NOW = 1_700_000_000_000; // fixed epoch ms — no Date.now() dependence

describe("isWebhookEventFresh — boundary contract", () => {
  it("accepts an event exactly at the past horizon (age === MAX_AGE, inclusive)", () => {
    expect(isWebhookEventFresh(NOW - WEBHOOK_MAX_AGE_MS, NOW)).toBe(true);
  });

  it("rejects an event 1ms older than the past horizon", () => {
    expect(isWebhookEventFresh(NOW - WEBHOOK_MAX_AGE_MS - 1, NOW)).toBe(false);
  });

  it("accepts an event exactly at the future skew edge (age === -SKEW, inclusive)", () => {
    expect(isWebhookEventFresh(NOW + WEBHOOK_FUTURE_SKEW_MS, NOW)).toBe(true);
  });

  it("rejects an event 1ms beyond the future skew edge", () => {
    expect(isWebhookEventFresh(NOW + WEBHOOK_FUTURE_SKEW_MS + 1, NOW)).toBe(
      false,
    );
  });

  it("accepts an event at the exact present instant", () => {
    expect(isWebhookEventFresh(NOW, NOW)).toBe(true);
  });

  it("rejects an unparseable (NaN) timestamp", () => {
    expect(isWebhookEventFresh(Number.NaN, NOW)).toBe(false);
  });

  it("keeps the two horizons distinct (skew is not a second multi-hour window)", () => {
    // An event 10 minutes in the future is inside the old symmetric ±24h
    // window but outside the +5min skew — must be rejected under the new shape.
    expect(isWebhookEventFresh(NOW + 10 * 60 * 1000, NOW)).toBe(false);
  });
});
