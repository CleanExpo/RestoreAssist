import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const reservePilotBudget = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  reservePilotBudget,
  PilotContractError: class PilotContractError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) { super(message); }
  },
}));

import { POST } from "../route";
import { PilotContractError } from "@/lib/pilot-tester/budget-contract";

function request(
  body: object,
  key: string | null = "key-12345678",
  origin: string | null = "http://localhost",
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost",
  };
  if (key) headers["idempotency-key"] = key;
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot-tester/budget/reservations", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "pilot-user" } });
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot", aiDailyBudgetUsd: 5 });
  reservePilotBudget.mockResolvedValue({
    reservationId: "reservation-1", workspaceId: "ws-pilot", ceilingUsd: 5,
    spentTodayUsd: 0, reservedUsd: 5, expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});

describe("POST /api/pilot-tester/budget/reservations", () => {
  const body = { workspaceId: "ws-pilot", runId: "run-123456", companyKey: "beyond-clean", jobKey: "water-loss", ceilingUsd: 5 };

  it("rejects missing Origin before auth or reservation work", async () => {
    const response = await POST(request(body, "key-12345678", null));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reservePilotBudget).not.toHaveBeenCalled();
  });

  it("rejects hostile Origin before auth or reservation work", async () => {
    const response = await POST(request(body, "key-12345678", "http://evil.test"));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reservePilotBudget).not.toHaveBeenCalled();
  });

  it("requires authentication before looking up or reserving budget", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(request(body))).status).toBe(401);
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reservePilotBudget).not.toHaveBeenCalled();
  });

  it("requires a valid Idempotency-Key before tenant or reservation work", async () => {
    let response = await POST(request(body, null));
    expect(response.status).toBe(400);
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reservePilotBudget).not.toHaveBeenCalled();

    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "pilot-user" } });
    response = await POST(request(body, "bad key"));
    expect(response.status).toBe(400);
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(reservePilotBudget).not.toHaveBeenCalled();
  });

  it("fails closed when the requested workspace is not the caller's pilot sandbox", async () => {
    requirePilotWorkspace.mockRejectedValue(
      new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found"),
    );
    expect((await POST(request({ ...body, workspaceId: "real-customer" }))).status).toBe(404);
    expect(reservePilotBudget).not.toHaveBeenCalled();
  });

  it("passes the server-observed idempotency key and authenticated workspace to the ledger", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(requirePilotWorkspace).toHaveBeenCalledWith("pilot-user", "ws-pilot");
    expect(reservePilotBudget).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-pilot", idempotencyKey: "key-12345678",
    }));
  });
});
