/**
 * RA-7053 — audit route extension: assistant utterances gain citationVerdicts.
 * Owner-OR-admin gate is unchanged (exercised via the owner path here).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: vi.fn(),
}));

const mockSessionFindUnique = vi.fn();
const mockUtteranceFindMany = vi.fn();
const mockToolCallFindMany = vi.fn();
const mockChunkFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveTeacherSession: {
      findUnique: (...a: unknown[]) => mockSessionFindUnique(...a),
    },
    teacherUtterance: {
      findMany: (...a: unknown[]) => mockUtteranceFindMany(...a),
    },
    teacherToolCall: {
      findMany: (...a: unknown[]) => mockToolCallFindMany(...a),
    },
    standardsChunk: {
      findMany: (...a: unknown[]) => mockChunkFindMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

function req(): NextRequest {
  return new NextRequest("http://localhost/api/live-teacher/audit/sess-1");
}

describe("GET /api/live-teacher/audit/[sessionId] — citation verdicts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attaches citationVerdicts and flags a fabricated clause as no_such_clause", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "owner-1", email: "o@e.com" },
    } as never);
    mockSessionFindUnique.mockResolvedValue({
      id: "sess-1",
      userId: "owner-1", // requester is the owner
      startedAt: new Date(),
      endedAt: null,
      totalCostAudCents: 5,
      jurisdiction: "AU",
      deviceOs: "web",
    });
    mockUtteranceFindMany.mockResolvedValue([
      { turnIndex: 0, role: "user", content: "?", clauseRefs: [], confidence: null, userOverride: false, createdAt: new Date() },
      {
        turnIndex: 1,
        role: "assistant",
        content: "See [S500:2021 §10.3.2] and [S500:2021 §99.99].",
        clauseRefs: ["[S500:2021 §10.3.2]", "[S500:2021 §99.99]"],
        confidence: 0.9,
        userOverride: false,
        createdAt: new Date(),
      },
    ]);
    mockToolCallFindMany.mockResolvedValue([]);
    mockChunkFindMany.mockResolvedValue([
      { standard: "IICRC_S500", edition: "2021", clause: "10.3.2" },
    ]);

    const { GET } = await import("../audit/[sessionId]/route");
    const res = await GET(req(), {
      params: Promise.resolve({ sessionId: "sess-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const utterances = json.data.utterances;

    // Non-assistant utterance → empty verdicts array.
    expect(utterances[0].citationVerdicts).toEqual([]);

    // Assistant utterance → one valid, one fabricated.
    expect(utterances[1].citationVerdicts).toEqual([
      { ref: "[S500:2021 §10.3.2]", verdict: "valid" },
      { ref: "[S500:2021 §99.99]", verdict: "invalid_no_such_clause" },
    ]);

    // Exactly one corpus lookup for the whole session.
    expect(mockChunkFindMany).toHaveBeenCalledTimes(1);
  });
});
