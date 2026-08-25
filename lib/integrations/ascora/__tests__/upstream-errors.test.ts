import { describe, expect, it } from "vitest";
import { RetryError } from "../../retry";
import {
  isAscoraNetworkError,
  isAscoraTimeoutError,
  isAscoraTlsError,
  mapAscoraUpstreamError,
} from "../upstream-errors";

describe("mapAscoraUpstreamError", () => {
  it("maps TimeoutError to 504 with an actionable message", () => {
    const err = new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError",
    );
    const mapped = mapAscoraUpstreamError(err);
    expect(mapped?.kind).toBe("timeout");
    expect(mapped?.status).toBe(504);
    expect(mapped?.message).toMatch(/timed out/i);
    expect(mapped?.message).toMatch(/ASCORA_API_KEY/);
  });

  it("unwraps RetryError.lastError for timeout classification", () => {
    const inner = new Error("Ascora request timed out on /jobs (page 1) after 45000ms");
    inner.name = "TimeoutError";
    (inner as { status?: number }).status = 504;
    const wrapped = new RetryError("Operation failed after 3 retries", 4, inner);
    expect(isAscoraTimeoutError(wrapped)).toBe(true);
    const mapped = mapAscoraUpstreamError(wrapped);
    expect(mapped?.status).toBe(504);
  });

  it("maps TLS certificate failures to 502 without suggesting TLS bypass", () => {
    const err = new Error(
      "unable to verify the first certificate: unable to get local issuer certificate",
    );
    expect(isAscoraTlsError(err)).toBe(true);
    const mapped = mapAscoraUpstreamError(err);
    expect(mapped?.kind).toBe("tls");
    expect(mapped?.status).toBe(502);
    expect(mapped?.message).toMatch(/will not disable TLS/i);
  });

  it("maps Ascora 401 API-key rejection to 502 with reconnect guidance", () => {
    const err = new Error("Ascora API 401 on /jobs (page 1): bad key") as Error & {
      status: number;
    };
    err.status = 401;
    const mapped = mapAscoraUpstreamError(err);
    expect(mapped?.status).toBe(502);
    expect(mapped?.message).toMatch(/API key/i);
  });

  it("returns null for unrelated errors so fromException stays in charge", () => {
    expect(mapAscoraUpstreamError(new Error("Prisma P2025 boom"))).toBeNull();
  });
});

describe("isAscoraNetworkError", () => {
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

    expect(isAscoraNetworkError(err)).toBe(true);
  });

  // Documents behaviour; deliberately NOT claimed as a control for the string
  // narrowing. A mutation sweep showed that dropping `typeof rawCode ===
  // "string"` leaves this green, because a numeric errno fails every strict
  // `===` anyway - the narrowing is type-level, and its instrument is `tsc`.
  it("ignores a non-string code rather than coercing it", () => {
    const err = new Error("upstream unavailable");
    (err as { code?: unknown }).code = 111;

    expect(isAscoraNetworkError(err)).toBe(false);
  });

  it("still falls back to the message text when no errno is present", () => {
    expect(isAscoraNetworkError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for a non-Error value", () => {
    expect(isAscoraNetworkError("ECONNREFUSED")).toBe(false);
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

    expect(isAscoraNetworkError(err)).toBe(true);
    expect(reads).toBe(1);
  });

  it("looks through a RetryError to its lastError", () => {
    const inner = new Error("upstream unavailable");
    (inner as { code?: string }).code = "ECONNRESET";

    expect(isAscoraNetworkError(new RetryError("gave up", 3, inner))).toBe(true);
  });
});
