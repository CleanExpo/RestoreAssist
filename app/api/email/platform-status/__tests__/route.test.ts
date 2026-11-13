import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/email/resolve-platform-config", () => ({
  isEmailServiceConfigured: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";

describe("GET /api/email/platform-status", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns configured from isEmailServiceConfigured", async () => {
    vi.mocked(isEmailServiceConfigured).mockReturnValue(true);
    const res = await GET(new NextRequest("http://localhost/api/email/platform-status"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { configured: true },
    });
  });

  it("returns 401 when unsigned in", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/email/platform-status"));
    expect(res.status).toBe(401);
  });
});
