import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const applyRateLimit = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));

const issueLinkCode = vi.fn();
vi.mock("@/lib/messaging/link-codes", () => ({
  issueLinkCode: (...a: unknown[]) => issueLinkCode(...a),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, input: { code: string; status: number }) =>
    new Response(JSON.stringify({ error: { code: input.code } }), {
      status: input.status,
    }),
  fromException: () =>
    new Response(JSON.stringify({ error: { code: "INTERNAL" } }), { status: 500 }),
}));

import { POST } from "../route";

function req() {
  return new NextRequest("http://localhost/api/messaging/link-code", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TEXT_JOB_IN_ENABLED = "true";
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  issueLinkCode.mockResolvedValue({
    code: "ABCD2345",
    expiresAt: new Date("2026-09-17T00:10:00.000Z"),
  });
});

afterEach(() => {
  delete process.env.TEXT_JOB_IN_ENABLED;
});

describe("POST /api/messaging/link-code", () => {
  it("returns 404 when the flag is off", async () => {
    delete process.env.TEXT_JOB_IN_ENABLED;
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(issueLinkCode).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(issueLinkCode).not.toHaveBeenCalled();
  });

  it("rate limits by user id", async () => {
    applyRateLimit.mockResolvedValue(new Response("", { status: 429 }));
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(applyRateLimit.mock.calls[0][1]).toMatchObject({ key: "user_1" });
    expect(issueLinkCode).not.toHaveBeenCalled();
  });

  it("issues a code for the session user", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { code: "ABCD2345", expiresAt: "2026-09-17T00:10:00.000Z" },
    });
    expect(issueLinkCode).toHaveBeenCalledWith("user_1");
  });
});
