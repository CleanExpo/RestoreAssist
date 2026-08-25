import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const resolveUnresolvedPilotAdjuster = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  PilotContractError: class PilotContractError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
  },
}));
vi.mock("@/lib/ai/adjuster-agent", () => ({ resolveUnresolvedPilotAdjuster }));

import { POST } from "../route";
import { PilotContractError } from "@/lib/pilot-tester/budget-contract";

function request(body: Record<string, unknown>, origin: string | null = "http://localhost") {
  const headers: Record<string, string> = { host: "localhost", "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot-tester/adjuster/recovery/receipt-1", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ receiptId: "receipt-1" }) };
const charged = {
  workspaceId: "ws-pilot", outcome: "CHARGED", costUsd: 0.012,
  evidenceReference: "provider-ledger:event-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "owner-1", role: "USER" } });
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot" });
  resolveUnresolvedPilotAdjuster.mockResolvedValue({ receiptId: "receipt-1", status: "FAILED", resolutionOutcome: "CHARGED" });
});

describe("POST pilot adjuster recovery", () => {
  it.each([[null], ["http://evil.test"]])("rejects missing or hostile Origin before auth", async (origin) => {
    expect((await POST(request({}, origin), context)).status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST(request(charged), context)).status).toBe(401);
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
  });

  it("uses current DB-backed workspace authorization, not the JWT role", async () => {
    expect((await POST(request(charged), context)).status).toBe(200);
    expect(requirePilotWorkspace).toHaveBeenCalledWith("owner-1", "ws-pilot");
    expect(resolveUnresolvedPilotAdjuster).toHaveBeenCalledWith({
      ...charged, receiptId: "receipt-1", actorUserId: "owner-1",
    });
  });

  it("maps workspace denial to non-enumerating 404", async () => {
    requirePilotWorkspace.mockRejectedValue(new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "denied"));
    expect((await POST(request(charged), context)).status).toBe(404);
    expect(resolveUnresolvedPilotAdjuster).not.toHaveBeenCalled();
  });

  it("refuses automatic no-charge release", async () => {
    resolveUnresolvedPilotAdjuster.mockRejectedValue(new Error("Invalid unresolved adjuster resolution evidence"));
    expect((await POST(request({ ...charged, outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0 }), context)).status).toBe(400);
  });

  it("preserves conflicting retry as 409", async () => {
    resolveUnresolvedPilotAdjuster.mockRejectedValue(new Error("Conflicting retry of resolved pilot adjuster outcome"));
    expect((await POST(request({ ...charged, costUsd: 0.02 }), context)).status).toBe(409);
  });
});
