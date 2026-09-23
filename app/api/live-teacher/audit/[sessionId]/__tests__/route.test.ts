import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const adminUserScope = vi.hoisted(() => vi.fn());
const liveTeacherSessionFindUnique = vi.hoisted(() => vi.fn());
const userFindFirst = vi.hoisted(() => vi.fn());
const teacherUtteranceFindMany = vi.hoisted(() => vi.fn());
const teacherToolCallFindMany = vi.hoisted(() => vi.fn());
const standardsChunkFindMany = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb, adminUserScope }));
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

function request() {
  return new NextRequest(
    "http://localhost/api/live-teacher/audit/session-B",
    { method: "GET" },
  );
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
  adminUserScope.mockReturnValue({ organizationId: "org-A" });
  // The session belongs to user-B, so the caller is never the owner and the
  // admin branch is the one under test.
  liveTeacherSessionFindUnique.mockResolvedValue({
    id: "session-B",
    userId: "user-B",
    startedAt: new Date("2026-09-01T00:00:00.000Z"),
    endedAt: null,
    totalCostAudCents: 420,
    jurisdiction: "AU",
    deviceOs: "ios",
  });
  // Scope-sensitive, for the same reason as revoke-sessions: user-B exists and
  // only an unscoped lookup reaches them. A flat null would answer 404 whether
  // or not the organisation clause is present, and the mutant would stay green.
  userFindFirst.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve(
      args?.where?.organizationId ? null : { id: args?.where?.id },
    ),
  );
  teacherUtteranceFindMany.mockResolvedValue([]);
  teacherToolCallFindMany.mockResolvedValue([]);
  standardsChunkFindMany.mockResolvedValue([]);
});

describe("GET /api/live-teacher/audit/[sessionId]", () => {
  it("refuses an admin outside the session owner's organisation", async () => {
    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    // The payload is the whole on-site transcript: every utterance, the tool
    // arguments and their results, and the session cost.
    expect(teacherUtteranceFindMany).not.toHaveBeenCalled();
    expect(teacherToolCallFindMany).not.toHaveBeenCalled();
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "user-B",
          organizationId: "org-A",
        }),
      }),
    );
  });

  it("still returns the transcript to the session's own owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: "user-B" } });

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(teacherUtteranceFindMany).toHaveBeenCalled();
    // The owner path must not consult the admin gate at all.
    expect(verifyAdminFromDb).not.toHaveBeenCalled();
  });

  it("returns the transcript to an admin inside the same organisation", async () => {
    // The reachable case, so the 404 above is known to come from the scope
    // clause rather than the route refusing every admin.
    adminUserScope.mockReturnValue({});

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect(teacherUtteranceFindMany).toHaveBeenCalled();
  });
});
