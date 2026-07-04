/**
 * RA-6987 — shared replay/freshness-window shape for provider webhook
 * routes (MYOB, Xero, DR-NRPG).
 *
 * The RA-6985 review found the three routes had converged on the same 24h
 * horizon but not the same SHAPE:
 *   - MYOB/Xero rejected only `now - eventTime > MAX_AGE_MS` — one-sided,
 *     so a future-dated timestamp was accepted unbounded.
 *   - DR-NRPG used a symmetric `Math.abs(now - eventTime) > MAX_AGE_MS`
 *     window, so a future-dated event was accepted up to +24h ahead —
 *     writing a future `lastEventAt` that then deduped every genuine
 *     older event as a stale replay until wall-clock caught up.
 *
 * One shape for all three: reject events older than MAX_AGE_MS (the
 * provider retry horizon) AND reject events more than FUTURE_SKEW_MS
 * ahead (a small clock-skew allowance, not a second multi-hour window).
 *
 * An event is fresh iff -FUTURE_SKEW_MS <= (now - eventTimeMs) <= MAX_AGE_MS.
 */

export const WEBHOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — provider retry horizon
export const WEBHOOK_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5min — clock-skew allowance only

/**
 * @param eventTimeMs epoch ms parsed from the provider-supplied event timestamp
 * @param nowMs epoch ms to compare against (defaults to `Date.now()`; pass
 *   explicitly to keep a single `now` across a loop of events in one request)
 */
export function isWebhookEventFresh(
  eventTimeMs: number,
  nowMs: number = Date.now(),
): boolean {
  const age = nowMs - eventTimeMs;
  return age <= WEBHOOK_MAX_AGE_MS && age >= -WEBHOOK_FUTURE_SKEW_MS;
}
