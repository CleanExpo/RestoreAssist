/**
 * RA-1132h: Unit tests for Live Teacher API routes.
 * Mocks getServerSession, applyRateLimit, and @/lib/prisma.
 * Does not require a DB connection or API keys.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock next-auth
// ---------------------------------------------------------------------------
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Mock rate limiter — returns null (not rate-limited) by default
// ---------------------------------------------------------------------------
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Mock admin-auth
// ---------------------------------------------------------------------------
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: vi.fn().mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN", organizationId: null },
  }),
}));

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const mockSessionCreate = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockSessionFindMany = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockUtteranceCreate = vi.fn();
const mockUtteranceCount = vi.fn();
const mockUtteranceFindMany = vi.fn();
const mockToolCallFindMany = vi.fn();
const mockToolCallCreate = vi.fn();
const mockInspectionFindFirst = vi.fn();
// buildTeacherContext (RA-6731 follow-up) reads inspection.findUnique; default
// to null → safe-default context so existing turn tests are unaffected.
const mockInspectionFindUnique = vi.fn().mockResolvedValue(null);
// buildTeacherContext also counts baseline (dry-standard) moisture readings.
const mockMoistureReadingCount = vi.fn().mockResolvedValue(0);
const mockUserFindUnique = vi.fn().mockResolvedValue({
  subscriptionStatus: "ACTIVE",
  lifetimeAccess: false,
});

// ---------------------------------------------------------------------------
// Mock the Live Teacher cloud client (RA-6731) — keeps tests offline/key-free
// ---------------------------------------------------------------------------
const mockInvokeClaudeCloud = vi.fn();
vi.mock("@/lib/live-teacher/claude-cloud", () => ({
  invokeClaudeCloud: (...args: unknown[]) => mockInvokeClaudeCloud(...args),
}));

// RA-6963 (BYOK) — the turn route resolves the workspace key after the
// subscription gate. Default to a resolved key (survives vi.clearAllMocks, like
// mockUserFindUnique) so streaming tests stay offline/key-free.
const mockResolveWorkspaceAiKey = vi.fn().mockResolvedValue({
  workspaceId: "ws-1",
  apiKey: "sk-ant-test",
});
class MockNoWorkspaceKeyError extends Error {}
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) =>
    mockResolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: MockNoWorkspaceKeyError,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    inspection: {
      findFirst: (...args: unknown[]) => mockInspectionFindFirst(...args),
      findUnique: (...args: unknown[]) => mockInspectionFindUnique(...args),
    },
    liveTeacherSession: {
      create: (...args: unknown[]) => mockSessionCreate(...args),
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
    },
    teacherUtterance: {
      create: (...args: unknown[]) => mockUtteranceCreate(...args),
      count: (...args: unknown[]) => mockUtteranceCount(...args),
      findMany: (...args: unknown[]) => mockUtteranceFindMany(...args),
    },
    teacherToolCall: {
      findMany: (...args: unknown[]) => mockToolCallFindMany(...args),
      create: (...args: unknown[]) => mockToolCallCreate(...args),
    },
    moistureReading: {
      count: (...args: unknown[]) => mockMoistureReadingCount(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
import { getServerSession } from "next-auth";

const mockGetServerSession = vi.mocked(getServerSession);

function makeRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/live-teacher/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("1. returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { POST } = await import("../session/route");
    const req = makeRequest(
      "POST",
      "http://localhost/api/live-teacher/session",
      {
        inspectionId: "insp-1",
        jurisdiction: "AU",
        deviceOs: "web",
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.message).toBe("Unauthorized");
  });

  it("2. creates session row and returns sessionId on success", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockInspectionFindFirst.mockResolvedValue({ id: "insp-1" });
    mockSessionCreate.mockResolvedValue({ id: "sess-abc-123" });

    const { POST } = await import("../session/route");
    const req = makeRequest(
      "POST",
      "http://localhost/api/live-teacher/session",
      {
        inspectionId: "insp-1",
        jurisdiction: "AU",
        deviceOs: "web",
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.sessionId).toBe("sess-abc-123");
    expect(mockSessionCreate).toHaveBeenCalledOnce();
  });
});

describe("POST /api/live-teacher/turn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("3. returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "What is the drying category?",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.message).toBe("Unauthorized");
  });

  it("returns 402 with the NoWorkspaceKeyError shape when the workspace has no key", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockResolveWorkspaceAiKey.mockRejectedValueOnce(
      new MockNoWorkspaceKeyError("ANTHROPIC"),
    );

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "What is the drying category?",
    });

    const res = await POST(req);
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error.code).toBe("PAYMENT_REQUIRED");
    // The customer workload must never reach the cloud client on no key.
    expect(mockInvokeClaudeCloud).not.toHaveBeenCalled();
  });

  it("4. persists user + assistant utterance and streams SSE", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      inspectionId: "insp-1",
      jurisdiction: "AU",
    });
    mockUtteranceCount.mockResolvedValue(0);
    mockUtteranceFindMany.mockResolvedValue([]);
    mockUtteranceCreate
      .mockResolvedValueOnce({ id: "utt-user-1" }) // user turn
      .mockResolvedValueOnce({ id: "utt-asst-1" }); // assistant turn
    mockInvokeClaudeCloud.mockResolvedValue({
      content: "Category 2 water. [S500:2021 §10.4.1]",
      clauseRefs: ["[S500:2021 §10.4.1]"],
      confidence: 86,
      toolCalls: [],
      inputTokens: 10,
      outputTokens: 8,
      costAudCents: 1,
    });

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "What is the drying category?",
    });

    const res = await POST(req);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.status).toBe(200);

    // Consume stream and verify both utterances were persisted
    const text = await res.text();
    expect(text).toContain('"type":"token"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain("utt-asst-1");
    // Verify create was called twice: once for user, once for assistant
    expect(mockUtteranceCreate).toHaveBeenCalledTimes(2);
  });

  it("persists a TeacherToolCall and streams a tool_call event when the model uses a tool (RA-1132f)", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      inspectionId: "insp-1",
      jurisdiction: "AU",
    });
    mockUtteranceCount.mockResolvedValue(0);
    mockUtteranceFindMany.mockResolvedValue([]);
    mockUtteranceCreate
      .mockResolvedValueOnce({ id: "utt-user-1" })
      .mockResolvedValueOnce({ id: "utt-asst-1" });
    mockToolCallCreate.mockResolvedValue({ id: "tc-1" });
    mockInvokeClaudeCloud.mockResolvedValue({
      content: "Logged 45% MC in the bathroom. [S500:2021 §10.5]",
      clauseRefs: ["[S500:2021 §10.5]"],
      confidence: 88,
      toolCalls: [
        {
          name: "take_reading",
          args: { inspectionId: "insp-1", location: "Bathroom" },
          id: "tu_1",
          result: { id: "mr_1", value: 45 },
          durationMs: 12,
        },
      ],
      inputTokens: 30,
      outputTokens: 20,
      costAudCents: 3,
    });

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "Bathroom drywall reads 45 percent",
    });
    const res = await POST(req);
    const text = await res.text();

    // A TeacherToolCall row is persisted, linked to the assistant utterance.
    expect(mockToolCallCreate).toHaveBeenCalledTimes(1);
    const toolData = mockToolCallCreate.mock.calls[0][0].data;
    expect(toolData.toolName).toBe("take_reading");
    expect(toolData.utteranceId).toBe("utt-asst-1");
    expect(toolData.result).toEqual({ id: "mr_1", value: 45 });

    // A tool_call SSE event is streamed, before the token event.
    expect(text).toContain('"type":"tool_call"');
    expect(text).toContain("take_reading");
    expect(text.indexOf('"type":"tool_call"')).toBeLessThan(
      text.indexOf('"type":"token"'),
    );
    expect(text).toContain('"type":"done"');
  });

  it("emits tool_proposal + a proposed audit row (no write) for a confirm-required tool (RA-1132f-3)", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      inspectionId: "insp-1",
      jurisdiction: "AU",
    });
    mockUtteranceCount.mockResolvedValue(0);
    mockUtteranceFindMany.mockResolvedValue([]);
    mockUtteranceCreate
      .mockResolvedValueOnce({ id: "utt-user-1" })
      .mockResolvedValueOnce({ id: "utt-asst-1" });
    mockToolCallCreate.mockResolvedValue({ id: "tc-prop-1" });
    mockInvokeClaudeCloud.mockResolvedValue({
      content: "I've flagged an asbestos hazard for your confirmation.",
      clauseRefs: [],
      confidence: 80,
      toolCalls: [
        {
          name: "flag_whs_hazard",
          args: { inspectionId: "insp-1", hazardType: "asbestos", severity: "HIGH" },
          id: "tu_1",
          proposed: true,
        },
      ],
      inputTokens: 10,
      outputTokens: 8,
      costAudCents: 1,
    });

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "There's asbestos here",
    });
    const res = await POST(req);
    const text = await res.text();

    expect(text).toContain('"type":"tool_proposal"');
    expect(text).toContain("flag_whs_hazard");
    expect(text).not.toContain('"type":"tool_call"');
    // The audit row is marked proposed; no compliance write happened.
    const toolData = mockToolCallCreate.mock.calls[0][0].data;
    expect(toolData.toolName).toBe("flag_whs_hazard");
    expect(toolData.result).toEqual({ proposed: true });
  });

  it("5. streams the real cloud client output — no canned stub string", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockSessionFindFirst.mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      inspectionId: "insp-1",
      jurisdiction: "NZ",
    });
    mockUtteranceCount.mockResolvedValue(2);
    // Prior conversation history is passed to the client (not the current turn).
    // Returned newest-first; the route reverses to chronological order.
    mockUtteranceFindMany.mockResolvedValue([
      { role: "assistant", content: "Kia ora", clauseRefs: [] },
      { role: "user", content: "Hi", clauseRefs: [] },
    ]);
    mockUtteranceCreate
      .mockResolvedValueOnce({ id: "utt-user-2" })
      .mockResolvedValueOnce({ id: "utt-asst-2" });
    mockInvokeClaudeCloud.mockResolvedValue({
      content: "Use NZBS E2 guidance here. [NZBS E2 §3.1]",
      clauseRefs: ["[NZBS E2 §3.1]"],
      confidence: 92,
      toolCalls: [],
      inputTokens: 20,
      outputTokens: 12,
      costAudCents: 2,
    });

    const { POST } = await import("../turn/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/turn", {
      sessionId: "sess-1",
      utterance: "What standard applies?",
    });

    const res = await POST(req);
    const text = await res.text();

    // Real model content is streamed; the RA-1132g placeholder is gone.
    expect(text).toContain("NZBS E2 guidance");
    expect(text).not.toContain("cloud client lands in RA-1132g");

    // Client was called with assembled context (jurisdiction from session) and
    // prior history (2 turns), and the current utterance.
    expect(mockInvokeClaudeCloud).toHaveBeenCalledTimes(1);
    const callArg = mockInvokeClaudeCloud.mock.calls[0][0];
    expect(callArg.context.jurisdiction).toBe("NZ");
    expect(callArg.context.inspectionId).toBe("insp-1");
    expect(callArg.history).toHaveLength(2);
    expect(callArg.userUtterance).toBe("What standard applies?");

    // Confidence (0–100 from client) is normalised to 0..1 before persisting.
    const assistantCreate = mockUtteranceCreate.mock.calls.find(
      ([arg]) => arg?.data?.role === "assistant",
    );
    expect(assistantCreate?.[0].data.confidence).toBeCloseTo(0.92, 5);
  });
});

describe("GET /api/live-teacher/audit/[sessionId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("5. returns 403 when requester is not the session owner", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "other-user", role: "USER", email: "other@example.com" },
    } as any);
    // Session belongs to a different user
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-1",
      userId: "owner-user",
      startedAt: new Date(),
      endedAt: null,
      totalCostAudCents: 0,
      jurisdiction: "AU",
      deviceOs: "web",
    });

    // verifyAdminFromDb returns a forbidden response for non-admin
    const { verifyAdminFromDb } = await import("@/lib/admin-auth");
    vi.mocked(verifyAdminFromDb).mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });

    const { GET } = await import("../audit/[sessionId]/route");
    const req = makeRequest(
      "GET",
      "http://localhost/api/live-teacher/audit/sess-1",
    );

    const res = await GET(req, {
      params: Promise.resolve({ sessionId: "sess-1" }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toBe("Forbidden");
  });
});
