import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { assertAutomationV1Auth } from "../v1-auth";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUnique(...args) },
  },
}));

function req(auth?: string): NextRequest {
  return {
    headers: {
      get: (name: string) => (name === "authorization" ? auth ?? null : null),
    },
  } as unknown as NextRequest;
}

describe("assertAutomationV1Auth", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...env };
    delete process.env.ZAPIER_API_KEY;
    delete process.env.ZAPIER_ACT_AS_USER_ID;
  });

  afterEach(() => {
    process.env = env;
  });

  it("rejects wrong bearer when service key is configured", async () => {
    process.env.ZAPIER_API_KEY = "secret";
    const auth = await assertAutomationV1Auth(
      req("Bearer wrong"),
      null,
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.status).toBe(401);
      expect(auth.reason).toContain("Invalid");
    }
  });

  it("accepts manager session without service key", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      organizationId: "org1",
      role: "MANAGER",
    });
    const auth = await assertAutomationV1Auth(
      req(),
      { user: { id: "u1" } } as never,
    );
    expect(auth).toEqual({
      ok: true,
      userId: "u1",
      organizationId: "org1",
    });
  });
});