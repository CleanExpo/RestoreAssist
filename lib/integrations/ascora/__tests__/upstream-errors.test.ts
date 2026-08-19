import { describe, expect, it } from "vitest";
import { RetryError } from "../../retry";
import {
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
