import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T7 — progress bootstrap (Marcus, manager). Locks the auth gate, the
// 201 happy path, and the idempotent 409 ALREADY_EXISTS / 404 NOT_FOUND mapping.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/progress/permissions", () => ({
  resolveProgressRole: vi.fn().mockReturnValue("CONTRACTOR"),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _userId: string,
    cb: (raw: string) => Promise<unknown>,
  ) => cb(await request.text()),
}));

const init = vi.fn();
vi.mock("@/lib/progress/service", () => ({ init: (...a: unknown[]) => init(...a) }));

import { POST } from "../init/route";

function postReq(body: unknown = {}): NextRequest {
  return new NextRequest("http://localhost/api/progress/r_1/init", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ reportId: "r_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  init.mockReset();
});

describe("POST /api/progress/[reportId]/init", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("bootstraps ClaimProgress and returns 201", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", role: "MANAGER" } });
    init.mockResolvedValueOnce({ ok: true, data: { id: "cp_1" } });

    const res = await POST(postReq({ inspectionId: "i_1" }), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toEqual({ id: "cp_1" });
    expect(init.mock.calls[0][0]).toMatchObject({
      reportId: "r_1",
      actorUserId: "u_1",
      inspectionId: "i_1",
    });
  });

  it("returns 409 when progress already exists (idempotent re-init)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", role: "MANAGER" } });
    init.mockResolvedValueOnce({ ok: false, code: "ALREADY_EXISTS", message: "exists" });

    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 404 when the report is not found", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", role: "MANAGER" } });
    init.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "no report" });

    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(404);
  });
});
