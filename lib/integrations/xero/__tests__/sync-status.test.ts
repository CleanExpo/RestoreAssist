/**
 * sync-status.test.ts — RA-1112
 *
 * Locks the Xero sync-status state machine. Verifies:
 *   - State transitions (queued → syncing → synced/failed/dead_letter)
 *   - Exponential backoff (60s × 2^n, cap 1h)
 *   - Dead-letter after 8 attempts
 *   - Error sanitisation (rule #7 — never raw error.message)
 *   - Manual-retry guardrails
 */
import { describe, it, expect } from "vitest";
import {
  nextRetryAt,
  sanitizeError,
  applyAttemptStart,
  applyAttemptSuccess,
  applyAttemptFailure,
  applyManualRetry,
  MAX_ATTEMPTS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
} from "../sync-status";

const NOW = new Date("2026-04-20T12:00:00Z");

describe("nextRetryAt — exponential backoff", () => {
  it("returns null once MAX_ATTEMPTS reached", () => {
    expect(nextRetryAt(MAX_ATTEMPTS, NOW)).toBeNull();
    expect(nextRetryAt(MAX_ATTEMPTS + 5, NOW)).toBeNull();
  });

  it("first retry is 60s after now", () => {
    const t = nextRetryAt(1, NOW)!;
    expect(t.getTime() - NOW.getTime()).toBe(BASE_BACKOFF_MS);
  });

  it("second retry is 120s (60 × 2)", () => {
    const t = nextRetryAt(2, NOW)!;
    expect(t.getTime() - NOW.getTime()).toBe(BASE_BACKOFF_MS * 2);
  });

  it("fifth retry is 960s (60 × 2^4)", () => {
    const t = nextRetryAt(5, NOW)!;
    expect(t.getTime() - NOW.getTime()).toBe(BASE_BACKOFF_MS * 16);
  });

  it("caps at 1 hour regardless of exponent", () => {
    const t = nextRetryAt(7, NOW)!;
    expect(t.getTime() - NOW.getTime()).toBe(MAX_BACKOFF_MS);
    // Attempt 6 raw is 60 × 32 = 1920s, still below the 3600s cap.
    const t6 = nextRetryAt(6, NOW)!;
    expect(t6.getTime() - NOW.getTime()).toBe(BASE_BACKOFF_MS * 32);
  });
});

describe("sanitizeError — rule #7, never raw error.message to client", () => {
  it("maps 401 to connection-expired", () => {
    expect(sanitizeError(new Error("401 Unauthorized from Xero"))).toMatch(
      /Xero connection expired/,
    );
  });
  it("maps 429 / rate limit to friendly retry message", () => {
    expect(sanitizeError(new Error("429 Too Many Requests"))).toMatch(
      /rate-limited/,
    );
    expect(sanitizeError(new Error("rate limit exceeded"))).toMatch(
      /rate-limited/,
    );
  });
  it("maps network errors", () => {
    expect(sanitizeError(new Error("ETIMEDOUT"))).toMatch(/Network error/);
    expect(sanitizeError(new Error("ECONNRESET on socket"))).toMatch(
      /Network error/,
    );
  });
  it("maps 5xx to service-error", () => {
    expect(sanitizeError(new Error("500 Internal Server Error"))).toMatch(
      /service error/,
    );
  });
  it("maps 4xx (non-401/403/429) to review-data", () => {
    expect(sanitizeError(new Error("400 Bad Request"))).toMatch(/review/);
  });
  it("falls back to generic on unknown errors", () => {
    expect(sanitizeError(new Error("some internal stack frame"))).toMatch(
      /Sync failed/,
    );
    expect(sanitizeError(null)).toMatch(/Unknown/);
    expect(sanitizeError(undefined)).toMatch(/Unknown/);
  });
  it("never leaks internal paths or tokens", () => {
    const raw =
      "Error at /home/app/lib/integrations/xero/nir-sync.ts:142 token=secret_abc123";
    const clean = sanitizeError(new Error(raw));
    expect(clean).not.toContain("/home/app");
    expect(clean).not.toContain("secret_abc123");
    expect(clean).not.toContain("nir-sync.ts");
  });
});

describe("applyAttemptStart", () => {
  it("moves to syncing and clears lastError", () => {
    const patch = applyAttemptStart(
      { attemptCount: 2, xeroEntityId: "x-123" },
      NOW,
    );
    expect(patch.state).toBe("syncing");
    expect(patch.lastError).toBeNull();
    expect(patch.nextRetryAt).toBeNull();
    expect(patch.lastAttemptAt).toEqual(NOW);
    // Preserves xeroEntityId so an already-synced row keeps its id during re-sync.
    expect(patch.xeroEntityId).toBe("x-123");
  });
});

describe("applyAttemptSuccess", () => {
  it("moves to synced, increments attemptCount, stores xeroEntityId", () => {
    const patch = applyAttemptSuccess({ attemptCount: 2 }, "xero_inv_99", NOW);
    expect(patch.state).toBe("synced");
    expect(patch.attemptCount).toBe(3);
    expect(patch.xeroEntityId).toBe("xero_inv_99");
    expect(patch.lastError).toBeNull();
    expect(patch.nextRetryAt).toBeNull();
  });
});

describe("applyAttemptFailure — transient vs dead-letter", () => {
  it("first failure → queued with 60s backoff", () => {
    const patch = applyAttemptFailure(
      { attemptCount: 0 },
      new Error("500 Internal Server Error"),
      NOW,
    );
    expect(patch.state).toBe("queued");
    expect(patch.attemptCount).toBe(1);
    expect(patch.lastError).toMatch(/service error/);
    expect(patch.nextRetryAt!.getTime() - NOW.getTime()).toBe(BASE_BACKOFF_MS);
  });

  it("7th failure → queued, still retries (capped at 1h)", () => {
    const patch = applyAttemptFailure(
      { attemptCount: 6 },
      new Error("500"),
      NOW,
    );
    expect(patch.state).toBe("queued");
    expect(patch.attemptCount).toBe(7);
    expect(patch.nextRetryAt).not.toBeNull();
  });

  it("8th failure → dead_letter, nextRetryAt cleared", () => {
    const patch = applyAttemptFailure(
      { attemptCount: 7 },
      new Error("500"),
      NOW,
    );
    expect(patch.state).toBe("dead_letter");
    expect(patch.attemptCount).toBe(8);
    expect(patch.nextRetryAt).toBeNull();
    expect(patch.lastError).toBeTruthy();
  });

  it("always sanitises the error message (rule #7)", () => {
    const patch = applyAttemptFailure(
      { attemptCount: 0 },
      new Error("token=secret_abc_123 exposed in upstream response"),
      NOW,
    );
    expect(patch.lastError).not.toContain("secret_abc_123");
  });
});

describe("applyManualRetry — guardrails", () => {
  it("allows retry from failed", () => {
    const res = applyManualRetry({ state: "failed", attemptCount: 3 }, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.state).toBe("queued");
      expect(res.patch.nextRetryAt).toEqual(NOW);
      expect(res.patch.attemptCount).toBe(0);
      expect(res.patch.lastError).toBeNull();
    }
  });

  it("allows retry from dead_letter and resets the attempt budget", () => {
    const res = applyManualRetry(
      { state: "dead_letter", attemptCount: 8 },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.attemptCount).toBe(0);
    }
  });

  it("rejects retry from synced / syncing / queued", () => {
    for (const state of ["synced", "syncing", "queued"] as const) {
      const res = applyManualRetry({ state, attemptCount: 1 }, NOW);
      expect(res.ok).toBe(false);
    }
  });
});
