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
const currentPilotReservation = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const claimPilotGeneration = vi.hoisted(() => vi.fn());
const finalizePilotGeneration = vi.hoisted(() => vi.fn());
const markPilotGenerationUnresolved = vi.hoisted(() => vi.fn());
const withPilotWorkspaceProviderAuthority = vi.hoisted(() => vi.fn((_u: string, _w: string, operation: () => unknown) => operation()));

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
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  currentPilotReservation: (...a: unknown[]) => currentPilotReservation(...a),
  requirePilotWorkspace: (...a: unknown[]) => requirePilotWorkspace(...a),
  claimPilotGeneration: (...a: unknown[]) => claimPilotGeneration(...a),
  finalizePilotGeneration: (...a: unknown[]) => finalizePilotGeneration(...a),
  markPilotGenerationUnresolved: (...a: unknown[]) => markPilotGenerationUnresolved(...a),
  withPilotWorkspaceProviderAuthority: (...a: [string, string, () => unknown]) => withPilotWorkspaceProviderAuthority(...a),
  PilotContractError: class PilotContractError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/ai/task-policy", () => ({ requireAiTaskPolicy: () => ({ maxEstimatedCostUsd: 0.05 }) }));

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
  assertInspectionTenancy.mockResolvedValue({ ok: true, data: { id: "i1", userId: "user-1", workspaceId: "ws1" } });
  getWorkspaceForUser.mockResolvedValue({ id: "ws1" });
  requirePilotWorkspace.mockResolvedValue({ id: "ws1", aiDailyBudgetUsd: 5, pilotSandboxEnabled: true });
  currentPilotReservation.mockResolvedValue({ id: "reservation-1" });
  claimPilotGeneration.mockResolvedValue({ kind: "claim", receiptId: "generation-receipt-1", authorisedMaxCostUsd: 0.05 });
  generateAssessment.mockResolvedValue({
    ok: true,
    persistedId: "gen1",
    result: { report: {}, meta: { costEstimateUsd: 0.01 } },
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

  it("uses the inspection workspace, not the user's default workspace, for pilot reservation binding", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws-default" });
    assertInspectionTenancy.mockResolvedValue({
      ok: true,
      data: { id: "i1", userId: "user-1", workspaceId: "ws-inspection" },
    });
    requirePilotWorkspace.mockResolvedValue({ id: "ws-inspection", aiDailyBudgetUsd: 5, pilotSandboxEnabled: true });
    currentPilotReservation.mockResolvedValue({ id: "reservation-inspection" });

    const res = await POST(
      new NextRequest("http://localhost/api/inspections/i1/assessments/MOULD/generate", {
        method: "POST",
        body: JSON.stringify({ enhanceWithAi: true }),
        headers: { "content-type": "application/json", "x-pilot-tester-run-id": "run-abcdef", "idempotency-key": "generation-key-123" },
      }),
      { params },
    );

    expect(res.status).toBe(200);
    expect(requirePilotWorkspace).toHaveBeenCalledWith("user-1", "ws-inspection");
    expect(currentPilotReservation).toHaveBeenCalledWith("ws-inspection", "run-abcdef");
    expect(getWorkspaceForUser).not.toHaveBeenCalled();
    expect(generateAssessment).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-inspection",
      pilotBudgetReservationId: "reservation-inspection",
    }));
  });

  it("rejects pilot binding when the inspection workspace is not a pilot sandbox", async () => {
    const PilotContractError = (await import("@/lib/pilot-tester/budget-contract")).PilotContractError;
    assertInspectionTenancy.mockResolvedValue({
      ok: true,
      data: { id: "i1", userId: "user-1", workspaceId: "ws-production" },
    });
    requirePilotWorkspace.mockRejectedValue(new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "not pilot"));

    const res = await POST(
      new NextRequest("http://localhost/api/inspections/i1/assessments/MOULD/generate", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", "x-pilot-tester-run-id": "run-abcdef", "idempotency-key": "generation-key-123" },
      }),
      { params },
    );

    expect(res.status).toBe(412);
    expect(currentPilotReservation).not.toHaveBeenCalled();
    expect(generateAssessment).not.toHaveBeenCalled();
  });
});
