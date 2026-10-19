/**
 * SPM audit G7 — /api/v1/metrics/synthex-trials is a count-only outcome read
 * for Synthex. Auth: Bearer SYNTHEX_METRICS_TOKEN (fail-closed, 503 while
 * unset) or a platform-staff session. A read failure must never look like 0.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: vi.fn(),
  verifyPlatformSupportOperator: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/analytics/attributed-trials", () => ({
  countSynthexTrials: vi.fn(),
  TRIAL_COUNT_WINDOWS: { "7d": 7, "30d": 30, "90d": 90 },
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { countSynthexTrials } from "@/lib/analytics/attributed-trials";

const COUNTS = {
  source: "synthex",
  attributionKey: "utm_source=synthex OR utm_campaign=studio-*",
  window: "7d",
  from: "2026-10-12T06:00:00.000Z",
  to: "2026-10-19T06:00:00.000Z",
  signups: 3,
  first_report_saved: 1,
  active_paid: 0,
  excluded_internal: 2,
  truncated: false,
} as never;

function req(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(
    `http://localhost/api/v1/metrics/synthex-trials${query}`,
    { headers },
  );
}

describe("GET /api/v1/metrics/synthex-trials (G7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(verifyAdminFromDb).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    vi.mocked(verifyPlatformSupportOperator).mockReturnValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    vi.mocked(countSynthexTrials).mockResolvedValue(COUNTS);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 to a bearer caller while the token is unset, never counts", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "");
    const res = await GET(req({ authorization: "Bearer " }));
    expect(res.status).toBe(503);
    expect(countSynthexTrials).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token with 401", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "right-token");
    const res = await GET(req({ authorization: "Bearer wrong-token" }));
    expect(res.status).toBe(401);
    expect(countSynthexTrials).not.toHaveBeenCalled();
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("returns counts only for the right bearer token, default window 7d", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "right-token");
    const res = await GET(req({ authorization: "Bearer right-token" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(countSynthexTrials).toHaveBeenCalledWith("7d");
    const body = await res.json();
    expect(body).toEqual(COUNTS);
    expect(JSON.stringify(body)).not.toMatch(/@|userId|email/);
  });

  it("passes a valid window and rejects unknown or prototype keys", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "right-token");
    const auth = { authorization: "Bearer right-token" };
    expect((await GET(req(auth, "?window=30d"))).status).toBe(200);
    expect(countSynthexTrials).toHaveBeenLastCalledWith("30d");
    for (const bad of ["1y", "toString", "constructor"]) {
      const res = await GET(req(auth, `?window=${bad}`));
      expect(res.status).toBe(400);
    }
    expect(countSynthexTrials).toHaveBeenCalledTimes(1);
  });

  it("refuses anonymous callers with 401 and tenant admins with 403", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "right-token");
    expect((await GET(req())).status).toBe(401);

    vi.mocked(verifyAdminFromDb).mockResolvedValue({
      user: { id: "tenant-admin", role: "ADMIN" },
    } as never);
    expect((await GET(req())).status).toBe(403);
    expect(countSynthexTrials).not.toHaveBeenCalled();
  });

  it("serves a platform-staff session even while the token is unset", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "");
    const auth = { user: { id: "staff", role: "ADMIN" } } as never;
    vi.mocked(verifyAdminFromDb).mockResolvedValue(auth);
    vi.mocked(verifyPlatformSupportOperator).mockReturnValue(auth);
    const res = await GET(req());
    expect(res.status).toBe(200);
  });

  it("returns 500, not zero, when the read fails", async () => {
    vi.stubEnv("SYNTHEX_METRICS_TOKEN", "right-token");
    vi.mocked(countSynthexTrials).mockRejectedValue(new Error("db down"));
    const res = await GET(req({ authorization: "Bearer right-token" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("honours the rate limiter before any auth or read", async () => {
    vi.mocked(applyRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 }),
    );
    const res = await GET(req({ authorization: "Bearer x" }));
    expect(res.status).toBe(429);
    expect(countSynthexTrials).not.toHaveBeenCalled();
  });
});
