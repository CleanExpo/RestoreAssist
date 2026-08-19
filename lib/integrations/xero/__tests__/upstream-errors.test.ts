import { describe, expect, it } from "vitest";
import {
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
