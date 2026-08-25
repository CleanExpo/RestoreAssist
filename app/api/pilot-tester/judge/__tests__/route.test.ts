import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const judgePilotAssessment = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  PilotContractError: class PilotContractError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) { super(message); }
  },
}));
vi.mock("@/lib/pilot-tester/judge", () => ({
  judgePilotAssessment,
  PilotJudgeError: class PilotJudgeError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
  },
}));

import { POST } from "../route";
import { PilotContractError } from "@/lib/pilot-tester/budget-contract";
import { PilotJudgeError } from "@/lib/pilot-tester/judge";

const body = {
  workspaceId: "ws-pilot",
  inspectionId: "inspection-1",
  assessmentGenerationId: "generation-1",
  assessmentSha256: "a".repeat(64),
};

function request(origin: string | null = "http://localhost", idempotencyKey: string | null = "judge-key-123") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot-tester/judge", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "pilot-user" } });
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot", aiDailyBudgetUsd: 5 });
  judgePilotAssessment.mockResolvedValue({
    professionalism: 8,
    specificity: 8,
    consistency: 8,
    actionability: 8,
    composite: 80,
    rationale: "Good",
    modelUsed: "judge-model",
    costUsd: 0.001,
    latencyMs: 10,
  });
});

describe("POST /api/pilot-tester/judge", () => {
  it("rejects missing Origin before auth or tenant work", async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(judgePilotAssessment).not.toHaveBeenCalled();
  });

  it("rejects hostile Origin before auth or tenant work", async () => {
    const response = await POST(request("http://evil.test"));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(judgePilotAssessment).not.toHaveBeenCalled();
  });

  it("requires Idempotency-Key after auth and before tenant/provider work", async () => {
    const response = await POST(request("http://localhost", null));
    expect(response.status).toBe(400);
    expect(getServerSession).toHaveBeenCalled();
    expect(requirePilotWorkspace).not.toHaveBeenCalled();
    expect(judgePilotAssessment).not.toHaveBeenCalled();
  });

  it("maps tenant contract failures without falling through to a generic 500", async () => {
    requirePilotWorkspace.mockRejectedValue(
      new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found"),
    );
    const response = await POST(request("http://localhost"));
    expect(response.status).toBe(404);
    expect(judgePilotAssessment).not.toHaveBeenCalled();
  });

  it("maps judge validation errors as 400 VALIDATION", async () => {
    judgePilotAssessment.mockRejectedValue(new PilotJudgeError(400, "Invalid Idempotency-Key"));
    const response = await POST(request("http://localhost"));
    expect(response.status).toBe(400);
  });

  it("accepts valid Origin and preserves auth, tenant, and receipt binding", async () => {
    const response = await POST(request("http://localhost"));
    expect(response.status).toBe(200);
    expect(getServerSession).toHaveBeenCalled();
    expect(requirePilotWorkspace).toHaveBeenCalledWith("pilot-user", "ws-pilot");
    expect(judgePilotAssessment).toHaveBeenCalledWith({
      actorUserId: "pilot-user",
      ...body,
      idempotencyKey: "judge-key-123",
    });
  });
});
