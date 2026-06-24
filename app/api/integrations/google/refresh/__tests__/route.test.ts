import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const accountFindFirst = vi.fn();
const accountUpdate = vi.fn();
const fetchMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: (...args: unknown[]) => accountFindFirst(...args),
      update: (...args: unknown[]) => accountUpdate(...args),
    },
  },
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  accountFindFirst.mockReset();
  accountUpdate.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  accountFindFirst.mockResolvedValue({
    id: "account_1",
    refresh_token: "refresh-token",
    expires_at: 0,
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/integrations/google/refresh", {
    method: "POST",
  });
}

describe("POST /api/integrations/google/refresh", () => {
  it("does not expose token refresh fetch exception details", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED internal.example"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("does not expose upstream token response bodies", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("provider body with token details", { status: 503 }),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, reason: "upstream-503" });
  });

  it("preserves invalid_grant handling without leaking provider detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("invalid_grant: refresh token revoked", { status: 400 }),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({ ok: false, reason: "invalid_grant" });
    expect(accountUpdate).toHaveBeenCalledWith({
      // RA-6800: write is now ownership-scoped to the session user (TOCTOU fix).
      where: { id: "account_1", userId: "user_1" },
      data: { refresh_token: null, access_token: null, expires_at: null },
    });
  });
});
