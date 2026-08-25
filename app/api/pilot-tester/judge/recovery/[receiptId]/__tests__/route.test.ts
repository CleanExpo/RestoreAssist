import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const resolveUnresolvedPilotJudge = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  PilotContractError: class PilotContractError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
  },
}));
vi.mock("@/lib/pilot-tester/judge", () => ({
  resolveUnresolvedPilotJudge,
  PilotJudgeError: class PilotJudgeError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
  },
}));

import { POST } from "../route";
import { PilotContractError } from "@/lib/pilot-tester/budget-contract";

function request(body: Record<string, unknown>, origin: string | null = "http://localhost") {
  const headers: Record<string, string> = { host: "localhost", "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot-tester/judge/recovery/receipt-1", {
    method: "POST", headers,
    body: JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ receiptId: "receipt-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot" });
  resolveUnresolvedPilotJudge.mockResolvedValue({ receiptId: "receipt-1", status: "FAILED", resolutionOutcome: "CHARGED" });
});

describe("POST pilot judge recovery", () => {
  it("uses current DB-backed workspace authorization rather than a stale JWT role", async () => {
    getServerSession.mockResolvedValue({ user: { id: "member-1", role: "USER" } });
    const response = await POST(request({
      workspaceId: "ws-pilot", outcome: "CHARGED", costUsd: 0.012,
      evidenceReference: "provider-ledger:event-123",
    }), context);
    expect(response.status).toBe(200);
    expect(requirePilotWorkspace).toHaveBeenCalledWith("member-1", "ws-pilot");
  });

  it.each([[null], ["http://evil.test"]])("rejects missing or hostile Origin before auth", async (origin) => {
    const response = await POST(request({}, origin), context);
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("maps current workspace permission denial to a non-enumerating 404", async () => {
    requirePilotWorkspace.mockRejectedValue(new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "denied"));
    const response = await POST(request({ workspaceId: "other", outcome: "CHARGED", costUsd: 1, evidenceReference: "provider-event-123" }), context);
    expect(response.status).toBe(404);
    expect(resolveUnresolvedPilotJudge).not.toHaveBeenCalled();
  });

  it("refuses a claimed no-charge release", async () => {
    resolveUnresolvedPilotJudge.mockRejectedValueOnce(new (await import("@/lib/pilot-tester/judge")).PilotJudgeError(400, "Invalid unresolved judge resolution evidence"));
    const response = await POST(request({
      workspaceId: "ws-pilot", outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0,
      evidenceReference: "provider-ledger:no-event-456",
    }), context);
    expect(response.status).toBe(400);
  });

  it("preserves a conflicting retry as 409", async () => {
    resolveUnresolvedPilotJudge.mockRejectedValueOnce(new (await import("@/lib/pilot-tester/judge")).PilotJudgeError(409, "Conflicting retry"));
    const response = await POST(request({
      workspaceId: "ws-pilot", outcome: "CHARGED", costUsd: 0.02,
      evidenceReference: "provider-ledger:different",
    }), context);
    expect(response.status).toBe(409);
  });

  it("binds an explicit charged resolution to admin, workspace, receipt and evidence", async () => {
    const response = await POST(request({
      workspaceId: "ws-pilot", outcome: "CHARGED", costUsd: 0.012,
      evidenceReference: "provider-ledger:event-123",
    }), context);
    expect(response.status).toBe(200);
    expect(resolveUnresolvedPilotJudge).toHaveBeenCalledWith({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CHARGED", costUsd: 0.012,
      evidenceReference: "provider-ledger:event-123", actorUserId: "admin-1",
    });
  });
});
