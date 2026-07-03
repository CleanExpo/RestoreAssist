/**
 * RA-6937 — /api/v1/connections/status is the launch-day readiness manifest.
 * It enumerates infra posture, so it must not be anonymously readable.
 *
 * Auth model under test:
 *  - Bearer CONNECTIONS_STATUS_TOKEN (timing-safe, fail-closed when unset)
 *  - OR an ADMIN session re-validated against the DB (verifyAdminFromDb)
 *  - anonymous callers get a bare 401 with no infra detail
 *  - ?probe=1 switches to the live-probe builder
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/connections/status", () => ({
  buildRestoreAssistConnectionStatus: vi.fn(),
  buildRestoreAssistConnectionStatusWithProbes: vi.fn(),
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  buildRestoreAssistConnectionStatus,
  buildRestoreAssistConnectionStatusWithProbes,
} from "@/lib/connections/status";

const ENV_STATUS = {
  source: "restoreassist:connection-status",
  connections: [{ id: "database", method: "env-presence" }],
} as never;

const PROBE_STATUS = {
  source: "restoreassist:connection-status",
  connections: [{ id: "database", method: "live-probe" }],
} as never;

function makeRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(`http://localhost/api/v1/connections/status${query}`, {
    headers,
  });
}

describe("GET /api/v1/connections/status (RA-6937)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(verifyAdminFromDb).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    vi.mocked(buildRestoreAssistConnectionStatus).mockReturnValue(ENV_STATUS);
    vi.mocked(buildRestoreAssistConnectionStatusWithProbes).mockResolvedValue(
      PROBE_STATUS,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a bare 401 for anonymous callers, with no infra detail", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(buildRestoreAssistConnectionStatus).not.toHaveBeenCalled();
    expect(buildRestoreAssistConnectionStatusWithProbes).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");

    const res = await GET(
      makeRequest({ authorization: "Bearer wrong-token-00" }),
    );
    expect(res.status).toBe(401);
  });

  it("fails closed when CONNECTIONS_STATUS_TOKEN is unset (RA-6679 pattern)", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "");

    const res = await GET(makeRequest({ authorization: "Bearer " }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with the env-presence manifest for a valid bearer token", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");

    const res = await GET(
      makeRequest({ authorization: "Bearer expected-token" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source).toBe("restoreassist:connection-status");
    expect(body.connections[0].method).toBe("env-presence");
    expect(buildRestoreAssistConnectionStatus).toHaveBeenCalledTimes(1);
    expect(buildRestoreAssistConnectionStatusWithProbes).not.toHaveBeenCalled();
    // The token path must not need a session at all (machine-to-machine).
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("returns 200 for a DB-verified admin session without a token", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);
    vi.mocked(verifyAdminFromDb).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", organizationId: null },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(verifyAdminFromDb).toHaveBeenCalledTimes(1);
  });

  it("uses the live-probe builder when ?probe=1 is passed", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");

    const res = await GET(
      makeRequest({ authorization: "Bearer expected-token" }, "?probe=1"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.connections[0].method).toBe("live-probe");
    expect(buildRestoreAssistConnectionStatusWithProbes).toHaveBeenCalledTimes(1);
    expect(buildRestoreAssistConnectionStatus).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter trips, before any auth work", async () => {
    vi.stubEnv("CONNECTIONS_STATUS_TOKEN", "expected-token");
    vi.mocked(applyRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const res = await GET(
      makeRequest({ authorization: "Bearer expected-token" }),
    );
    expect(res.status).toBe(429);
    expect(buildRestoreAssistConnectionStatus).not.toHaveBeenCalled();
    expect(getServerSession).not.toHaveBeenCalled();
  });
});
