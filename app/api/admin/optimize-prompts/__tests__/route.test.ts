import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const optimizePrompt = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/ai/prompt-optimizer", () => ({
  optimizePrompt: (...args: unknown[]) => optimizePrompt(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  optimizePrompt.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/admin/optimize-prompts", {
    method: "POST",
    body: JSON.stringify({ claimType: "water_damage" }),
  });
}

describe("POST /api/admin/optimize-prompts", () => {
  it("does not expose missing provider configuration details", async () => {
    optimizePrompt.mockRejectedValueOnce(
      new Error("ANTHROPIC_API_KEY is missing from process env"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Prompt optimizer is not configured" });
  });

  it("does not expose unexpected optimizer exception details", async () => {
    optimizePrompt.mockRejectedValueOnce(
      new Error("provider returned stack trace with secret abc123"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Prompt optimization failed" });
  });
});
