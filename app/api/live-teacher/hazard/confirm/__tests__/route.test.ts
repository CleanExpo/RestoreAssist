/**
 * RA-1132f-3 — POST /api/live-teacher/hazard/confirm.
 * Writes a WHSIncident from a server-stored proposal only after the tech
 * confirms. Mocks auth, rate-limiter, prisma, and dispatchTool — no DB/keys.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

const findUnique = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    teacherToolCall: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const dispatchTool = vi.fn();
vi.mock("@/lib/live-teacher/tools", () => ({
  dispatchTool: (...a: unknown[]) => dispatchTool(...a),
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function req(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/live-teacher/hazard/confirm", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validProposal = {
  id: "tc-1",
  toolName: "flag_whs_hazard",
  args: { inspectionId: "insp-1", hazardType: "asbestos", severity: "HIGH" },
  result: { proposed: true },
  session: { userId: "user-1", inspectionId: "insp-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user-1" } } as never);
  findUnique.mockResolvedValue(validProposal);
  updateMany.mockResolvedValue({ count: 1 });
  update.mockResolvedValue({});
  dispatchTool.mockResolvedValue({ id: "whs-1" });
});

async function post(b?: unknown) {
  const { POST } = await import("../route");
  return POST(req(b));
}

describe("POST /api/live-teacher/hazard/confirm", () => {
  it("401 without a session", async () => {
    mockSession.mockResolvedValueOnce(null as never);
    expect((await post({ toolCallId: "tc-1" })).status).toBe(401);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it("400 when toolCallId is missing", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("404 when the proposal belongs to another user", async () => {
    findUnique.mockResolvedValueOnce({
      ...validProposal,
      session: { userId: "someone-else", inspectionId: "insp-1" },
    });
    expect((await post({ toolCallId: "tc-1" })).status).toBe(404);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it("400 when the row is not a hazard proposal", async () => {
    findUnique.mockResolvedValueOnce({
      ...validProposal,
      toolName: "take_reading",
    });
    expect((await post({ toolCallId: "tc-1" })).status).toBe(400);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it("409 when the proposal is already confirmed", async () => {
    findUnique.mockResolvedValueOnce({
      ...validProposal,
      result: { proposed: false, confirmed: true, incidentId: "whs-0" },
    });
    expect((await post({ toolCallId: "tc-1" })).status).toBe(409);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it("409 when the atomic claim loses the race", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await post({ toolCallId: "tc-1" })).status).toBe(409);
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it("writes the incident from stored args (source=user_reported, real id) and confirms the row", async () => {
    const res = await post({ toolCallId: "tc-1" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.incidentId).toBe("whs-1");

    // dispatched with the server's stored args, forced source + injected id.
    const [name, args, ctx] = dispatchTool.mock.calls[0];
    expect(name).toBe("flag_whs_hazard");
    expect(args).toMatchObject({
      hazardType: "asbestos",
      severity: "HIGH",
      inspectionId: "insp-1",
      source: "user_reported",
    });
    expect(ctx).toEqual({ userId: "user-1" });

    // the row is marked confirmed with the incident id.
    const finalUpdate = update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.result).toEqual({
      proposed: false,
      confirmed: true,
      incidentId: "whs-1",
    });
  });

  it("reverts the claim and surfaces an error when the write fails", async () => {
    dispatchTool.mockRejectedValueOnce(new Error("tenancy check failed"));
    const res = await post({ toolCallId: "tc-1" });
    expect(res.status).toBeGreaterThanOrEqual(500);
    // claim reverted so the tech can retry.
    const revert = update.mock.calls.find(
      ([arg]) => (arg as { data?: { result?: { proposed?: boolean } } }).data?.result?.proposed === true,
    );
    expect(revert).toBeTruthy();
  });
});
