import { describe, expect, it } from "vitest";
import { RetryError } from "../../retry";
import {
  isXeroNetworkError,
  isXeroHighVolumeFilterError,
  isXeroTimeoutError,
  mapXeroUpstreamError,
} from "../upstream-errors";

describe("mapXeroUpstreamError", () => {
  it("maps TimeoutError to 504 with an actionable message", () => {
    const err = new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError",
    );
    const mapped = mapXeroUpstreamError(err);
    expect(mapped?.kind).toBe("timeout");
    expect(mapped?.status).toBe(504);
    expect(mapped?.message).toMatch(/timed out/i);
    expect(mapped?.message).toMatch(/re-connect/i);
  });

  it("detects TimeoutError by name on wrapped messages", () => {
    const inner = new Error("Xero request timed out on /Invoices after 15000ms");
    inner.name = "TimeoutError";
    (inner as { status?: number }).status = 504;
    expect(isXeroTimeoutError(inner)).toBe(true);
    expect(mapXeroUpstreamError(inner)?.status).toBe(504);
  });

  it("maps missing CLIENT_SECRET to 400 with config guidance", () => {
    const mapped = mapXeroUpstreamError(
      new Error("XERO_CLIENT_SECRET is not configured"),
    );
    expect(mapped?.kind).toBe("config");
    expect(mapped?.status).toBe(400);
    expect(mapped?.message).toMatch(/XERO_CLIENT_SECRET/);
  });

  it("maps token refresh / 401 failures to 502 reconnect guidance", () => {
    const mapped = mapXeroUpstreamError(
      new Error('Token refresh failed: {"error":"invalid_grant"}'),
    );
    expect(mapped?.kind).toBe("auth");
    expect(mapped?.status).toBe(502);
    expect(mapped?.message).toMatch(/Re-connect/i);
  });

  it("maps missing tenant to 400", () => {
    const mapped = mapXeroUpstreamError(new Error("No Xero tenant connected"));
    expect(mapped?.status).toBe(400);
    expect(mapped?.message).toMatch(/organisation/i);
  });

  it("maps high-volume where-filter rejection (9191919) clearly", () => {
    const err = new Error(
      'API request failed: 400 {"Type":"HighVolumeFilterUnavailableApiException","Message":"Due to the high number of contacts being processed, this filter cannot be used","ErrorNumber":9191919}',
    );
    (err as { status?: number }).status = 400;
    expect(isXeroHighVolumeFilterError(err)).toBe(true);
    const mapped = mapXeroUpstreamError(err);
    expect(mapped?.kind).toBe("http");
    expect(mapped?.status).toBe(502);
    expect(mapped?.message).toMatch(/9191919|high volume/i);
    expect(mapped?.message).toMatch(/retry Sync/i);
  });

  it("returns null for unrelated errors so fromException stays in charge", () => {
    expect(mapXeroUpstreamError(new Error("Prisma P2025 boom"))).toBeNull();
  });
});

describe("isXeroNetworkError", () => {
  // These were the ONLY callers of the invalid `as { code: string }` cast and
  // had no test at all, so the type fix would otherwise have been unprovable.
  it.each([
    "ECONNREFUSED",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
  ])("detects a %s errno carried on the error object", (code) => {
    // Deliberately a message the text fallback does NOT match, so this can
    // only pass via the errno branch the cast fix rewrote.
    const err = new Error("upstream unavailable");
    (err as { code?: string }).code = code;

    expect(isXeroNetworkError(err)).toBe(true);
  });

  // Documents behaviour; deliberately NOT claimed as a control for the string
  // narrowing. A mutation sweep showed that dropping `typeof rawCode ===
  // "string"` leaves this green, because a numeric errno fails every strict
  // `===` anyway - the narrowing is type-level, and its instrument is `tsc`.
  it("ignores a non-string code rather than coercing it", () => {
    const err = new Error("upstream unavailable");
    (err as { code?: unknown }).code = 111;

    expect(isXeroNetworkError(err)).toBe(false);
  });

  it("still falls back to the message text when no errno is present", () => {
    expect(isXeroNetworkError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for a non-Error value", () => {
    expect(isXeroNetworkError("ECONNREFUSED")).toBe(false);
  });

  // The fix reads `code` ONCE. The previous form read it twice - inside the
  // `typeof` guard and again in the true branch - so an accessor-backed `code`
  // could return a different value the second time and defeat the check it had
  // just passed. An independent reviewer raised the single-read as a behaviour
  // change, and it is: it is the improvement, a time-of-check/time-of-use hole
  // closed. Pinned here so it stays deliberate rather than incidental.
  it("reads code exactly once, so a changing accessor cannot defeat the check", () => {
    let reads = 0;
    const err = new Error("upstream unavailable");
    Object.defineProperty(err, "code", {
      get() {
        reads += 1;
        return reads === 1 ? "ECONNREFUSED" : "SOMETHING_ELSE";
      },
    });

    expect(isXeroNetworkError(err)).toBe(true);
    expect(reads).toBe(1);
  });

  // Deliberate asymmetry, pinned rather than assumed: unlike Ascora's, this
  // module's `unwrapError` does NOT look through a RetryError. If that ever
  // changes it should be a decision, not a silent drift between two files that
  // otherwise mirror each other.
  it("does not look through a RetryError (unlike the Ascora module)", () => {
    const inner = new Error("upstream unavailable");
    (inner as { code?: string }).code = "ECONNRESET";

    expect(isXeroNetworkError(new RetryError("gave up", 3, inner))).toBe(false);
  });
});
