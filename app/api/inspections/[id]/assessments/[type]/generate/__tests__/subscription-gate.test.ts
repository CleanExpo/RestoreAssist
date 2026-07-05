/**
 * RA rule 5 — subscription gate on the assessment-generation route.
 *
 * POST /api/inspections/[id]/assessments/[type]/generate delegates to
 * generateAssessment(), which can spend real money on Anthropic (the
 * enhanceWithAi prose pass and the AI-based MOULD / BIOHAZARD / FIRE_SMOKE
 * plug-ins). CANCELED / PAST_DUE / EXPIRED users must be blocked at 402
 * before any of that work runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const validateCsrf = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const requireActiveSubscription = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const generateAssessment = vi.hoisted(() => vi.fn());
const getWorkspaceForUser = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({
  validateCsrf: (...a: unknown[]) => validateCsrf(...a),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: (...a: unknown[]) =>
    requireActiveSubscription(...a),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/assessments/generate", () => ({
  generateAssessment: (...a: unknown[]) => generateAssessment(...a),
}));
vi.mock("@/lib/assessments/registry", () => ({
  isRegisteredDomain: (s: string) => s === "MOULD",
  listDomainKeys: () => ["WATER", "MOULD"],
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => getWorkspaceForUser(...a),
}));

import { POST } from "../route";

function makeReq(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i1/assessments/MOULD/generate", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

const params = Promise.resolve({ id: "i1", type: "MOULD" });

const paymentRequired = () =>
  NextResponse.json(
    { error: "Active subscription required", upgradeRequired: true },
    { status: 402 },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  validateCsrf.mockReturnValue(null);
  applyRateLimit.mockResolvedValue(null);
  requireActiveSubscription.mockResolvedValue(null);
  assertInspectionTenancy.mockResolvedValue({ ok: true });
  getWorkspaceForUser.mockResolvedValue({ id: "ws1" });
  generateAssessment.mockResolvedValue({
    ok: true,
    persistedId: "gen1",
    result: { report: {} },
  });
});

describe("RA rule 5 — subscription gate on assessment generation", () => {
  it("returns 402 and never invokes generateAssessment without an active subscription", async () => {
    requireActiveSubscription.mockResolvedValue(paymentRequired());
    const res = await POST(makeReq({ enhanceWithAi: true }), { params });
    expect(res.status).toBe(402);
    expect((await res.json()).upgradeRequired).toBe(true);
    expect(generateAssessment).not.toHaveBeenCalled();
  });

  it("gates the user id before any AI-bound work", async () => {
    await POST(makeReq({ enhanceWithAi: true }), { params });
    expect(requireActiveSubscription).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 and never gates or generates without a session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
    expect(requireActiveSubscription).not.toHaveBeenCalled();
    expect(generateAssessment).not.toHaveBeenCalled();
  });

  it("still generates for an entitled user", async () => {
    const res = await POST(makeReq({ enhanceWithAi: true }), { params });
    expect(res.status).toBe(200);
    expect(generateAssessment).toHaveBeenCalledTimes(1);
  });
});
