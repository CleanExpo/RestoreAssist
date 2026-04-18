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
  verifyAdminFromDb: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", organizationId: null } }),
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
const mockInspectionFindFirst = vi.fn();
const mockUserFindUnique = vi.fn().mockResolvedValue({
  subscriptionStatus: "ACTIVE",
  lifetimeAccess: false,
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    inspection: {
      findFirst: (...args: unknown[]) => mockInspectionFindFirst(...args),
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
    const req = makeRequest("POST", "http://localhost/api/live-teacher/session", {
      inspectionId: "insp-1",
      jurisdiction: "AU",
      deviceOs: "web",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("2. creates session row and returns sessionId on success", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockInspectionFindFirst.mockResolvedValue({ id: "insp-1" });
    mockSessionCreate.mockResolvedValue({ id: "sess-abc-123" });

    const { POST } = await import("../session/route");
    const req = makeRequest("POST", "http://localhost/api/live-teacher/session", {
      inspectionId: "insp-1",
      jurisdiction: "AU",
      deviceOs: "web",
    });

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
    expect(json.error).toBe("Unauthorized");
  });

  it("4. persists user + assistant utterance and streams SSE", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    } as any);
    mockSessionFindFirst.mockResolvedValue({ id: "sess-1", userId: "user-1" });
    mockUtteranceCount.mockResolvedValue(0);
    mockUtteranceCreate
      .mockResolvedValueOnce({ id: "utt-user-1" })   // user turn
      .mockResolvedValueOnce({ id: "utt-asst-1" });  // assistant turn

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
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { GET } = await import("../audit/[sessionId]/route");
    const req = makeRequest("GET", "http://localhost/api/live-teacher/audit/sess-1");

    const res = await GET(req, { params: Promise.resolve({ sessionId: "sess-1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });
});
