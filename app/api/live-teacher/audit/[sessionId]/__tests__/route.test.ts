import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const liveTeacherSessionFindUnique = vi.hoisted(() => vi.fn());
const userFindFirst = vi.hoisted(() => vi.fn());
const teacherUtteranceFindMany = vi.hoisted(() => vi.fn());
const teacherToolCallFindMany = vi.hoisted(() => vi.fn());
const standardsChunkFindMany = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));

// Only verifyAdminFromDb is faked. adminUserScope is the REAL implementation on
// purpose: the previous version of this file mocked it, so the org-less
// fallback it returns was never executed and a P0 walked straight through the
// suite. A control that stubs the function under test proves nothing.
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...actual, verifyAdminFromDb };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveTeacherSession: { findUnique: liveTeacherSessionFindUnique },
    user: { findFirst: userFindFirst },
    teacherUtterance: { findMany: teacherUtteranceFindMany },
    teacherToolCall: { findMany: teacherToolCallFindMany },
    standardsChunk: { findMany: standardsChunkFindMany },
  },
}));

import { GET } from "../route";

/**
 * A two-row stand-in for the User table. Both users genuinely exist, which is
 * the whole point: the attack is not "the row is missing", it is "the query
 * stopped constraining the row". A mock that returns null unconditionally
 * answers 404 either way and cannot tell a fixed route from a broken one.
 */
const USERS: Array<{ id: string; organizationId: string | null }> = [
  { id: "user-B", organizationId: "org-B" },
  { id: "admin-A", organizationId: null },
];

type Clause = { id?: string; organizationId?: string | null };

function rowMatches(
  row: { id: string; organizationId: string | null },
  clause: Clause,
): boolean {
  if (clause.id !== undefined && clause.id !== row.id) return false;
  if (
    clause.organizationId !== undefined &&
    clause.organizationId !== row.organizationId
  ) {
    return false;
  }
  return true;
}

function request() {
  return new NextRequest("http://localhost/api/live-teacher/audit/session-B", {
    method: "GET",
  });
}

const params = { params: Promise.resolve({ sessionId: "session-B" }) };

beforeEach(() => {
  vi.clearAllMocks();
  applyRateLimit.mockResolvedValue(null);
  getServerSession.mockResolvedValue({ user: { id: "admin-A" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin-A", role: "ADMIN", organizationId: "org-A" },
  });
  liveTeacherSessionFindUnique.mockResolvedValue({
    id: "session-B",
    userId: "user-B",
    startedAt: new Date("2026-09-01T00:00:00.000Z"),
    endedAt: null,
    totalCostAudCents: 420,
    jurisdiction: "AU",
    deviceOs: "ios",
  });
  userFindFirst.mockImplementation(
    (args: { where?: { AND?: Clause[] } & Clause }) => {
      const where = args?.where ?? {};
      const clauses: Clause[] = Array.isArray(where.AND) ? where.AND : [where];
      const row = USERS.find((candidate) =>
        clauses.every((clause) => rowMatches(candidate, clause)),
      );
      return Promise.resolve(row ? { id: row.id } : null);
    },
  );
  teacherUtteranceFindMany.mockResolvedValue([]);
  teacherToolCallFindMany.mockResolvedValue([]);
  standardsChunkFindMany.mockResolvedValue([]);
});

describe("GET /api/live-teacher/audit/[sessionId]", () => {
  function expectNoTranscriptRead() {
    // The payload is the entire on-site transcript: every utterance, the tool
    // arguments and their results, and the session cost.
    expect(teacherUtteranceFindMany).not.toHaveBeenCalled();
    expect(teacherToolCallFindMany).not.toHaveBeenCalled();
  }

  it("refuses an admin outside the session owner's organisation", async () => {
    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    expectNoTranscriptRead();
  });

  it("refuses an ORG-LESS admin instead of matching them against themselves", async () => {
    // The P0 this file previously missed. User.organizationId is nullable
    // (onDelete: SetNull) and OAuth createUser sets role ADMIN without an
    // organisation, so this account is reachable in production. adminUserScope
    // returns {id: "admin-A"} here; spreading that over `id: liveSession.userId`
    // would look up the CALLER, who always exists, and serve user-B's
    // transcript with HTTP 200.
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin-A", role: "ADMIN", organizationId: null },
    });

    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    expectNoTranscriptRead();
  });

  it("still returns the transcript to the session's own owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-B" } });

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(teacherUtteranceFindMany).toHaveBeenCalled();
    expect(verifyAdminFromDb).not.toHaveBeenCalled();
  });

  it("returns the transcript to an admin inside the same organisation", async () => {
    // The reachable case, so the refusals above are known to come from the
    // scope clause and not from the route refusing every admin.
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin-A", role: "ADMIN", organizationId: "org-B" },
    });

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(teacherUtteranceFindMany).toHaveBeenCalled();
  });
});
