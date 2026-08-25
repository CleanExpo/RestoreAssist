import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const reconcilePilotBudget = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { pilotBudgetReservation: { findUnique } },
}));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  reconcilePilotBudget,
  PilotContractError: class PilotContractError extends Error {},
}));

import { POST } from "../route";

function request(origin: string | null = "http://localhost") {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot-tester/budget/reservations/reservation-1/reconcile", {
    method: "POST",
    headers,
    body: "{}",
  });
}

const params = Promise.resolve({ reservationId: "reservation-1" });

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "pilot-user" } });
  findUnique.mockResolvedValue({ workspaceId: "ws-pilot" });
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot", aiDailyBudgetUsd: 5 });
  reconcilePilotBudget.mockResolvedValue({
    reservationId: "reservation-1",
    workspaceId: "ws-pilot",
    generationCostUsd: 0,
    judgeCostUsd: 0,
    adjusterCostUsd: 0,
    failedAttemptCostUsd: 0,
    totalActualCostUsd: 0,
    reconciledSpentUsd: 0,
    reconciledAt: new Date().toISOString(),
  });
});

describe("POST /api/pilot-tester/budget/reservations/[reservationId]/reconcile", () => {
  it("rejects missing Origin before auth or tenant work", async () => {
    const response = await POST(request(null), { params });
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reconcilePilotBudget).not.toHaveBeenCalled();
  });

  it("rejects hostile Origin before auth or tenant work", async () => {
    const response = await POST(request("http://evil.test"), { params });
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reconcilePilotBudget).not.toHaveBeenCalled();
  });

  it("accepts valid Origin and preserves auth, tenant, and reservation-derived workspace checks", async () => {
    const response = await POST(request("http://localhost"), { params });
    expect(response.status).toBe(200);
    expect(getServerSession).toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      select: { workspaceId: true },
    });
    expect(requirePilotWorkspace).toHaveBeenCalledWith("pilot-user", "ws-pilot");
    expect(reconcilePilotBudget).toHaveBeenCalledWith("reservation-1", "ws-pilot", "pilot-user");
  });
});
