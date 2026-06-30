import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T5 — claim state-machine transition (Marcus advances a claim; Priya's
// junior-technician ring-fence must be honoured). Locks auth, key validation,
// optimistic-lock 409, the junior flag plumb-through, and forbidden mapping.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _userId: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
}));

const transition = vi.fn();
vi.mock("@/lib/progress/service", () => ({
  TRANSITION_KEYS: ["submit_report"],
  transition: (...a: unknown[]) => transition(...a),
}));
const resolveProgressRole = vi.fn();
vi.mock("@/lib/progress/permissions", () => ({
  resolveProgressRole: (...a: unknown[]) => resolveProgressRole(...a),
}));

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));

import { POST } from "../transition/route";

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/progress/r_1/transition", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ reportId: "r_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  transition.mockReset();
  resolveProgressRole.mockReset();
  userFindUnique.mockReset();
  resolveProgressRole.mockReturnValue("TECHNICIAN_JUNIOR");
  userFindUnique.mockResolvedValue({ isJuniorTechnician: true });
  getServerSession.mockResolvedValue({ user: { id: "u_1", role: "USER" } });
});

describe("POST /api/progress/[reportId]/transition", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(postReq({ key: "submit_report" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for an unknown transition key", async () => {
    const res = await POST(postReq({ key: "teleport" }), ctx);
    expect(res.status).toBe(400);
  });

  it("advances the claim and plumbs the junior-technician flag through", async () => {
    transition.mockResolvedValueOnce({ ok: true, data: { state: "REPORT_SUBMITTED" } });
    const res = await POST(postReq({ key: "submit_report" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ state: "REPORT_SUBMITTED" });
    // The ring-fence only works if the per-user flag reaches role resolution.
    expect(resolveProgressRole).toHaveBeenCalledWith(
      expect.objectContaining({ isJuniorTechnician: true }),
    );
    expect(transition.mock.calls[0][0]).toMatchObject({
      reportId: "r_1",
      actorUserId: "u_1",
    });
  });

  it("returns 409 on an optimistic-lock (stale version) conflict", async () => {
    transition.mockResolvedValueOnce({ ok: false, code: "STALE_VERSION", message: "stale" });
    const res = await POST(
      postReq({ key: "submit_report", expectedVersion: 1 }),
      ctx,
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when the junior-technician guard forbids the transition", async () => {
    transition.mockResolvedValueOnce({ ok: false, code: "FORBIDDEN", message: "not allowed" });
    const res = await POST(postReq({ key: "submit_report" }), ctx);
    expect(res.status).toBe(403);
  });
});
