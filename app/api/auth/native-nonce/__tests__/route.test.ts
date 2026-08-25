import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { nativeAuthNonce: { create: (...args: unknown[]) => create(...args) } },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST } from "../route";

beforeEach(() => { create.mockReset(); create.mockResolvedValue({ id: "n1" }); });

describe("POST /api/auth/native-nonce", () => {
  it.each(["apple", "google"])("issues and stores a hashed %s nonce", async (provider) => {
    const response = await POST(new NextRequest("https://restoreassist.app/api/auth/native-nonce", {
      method: "POST", body: JSON.stringify({ provider }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      provider, nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: expect.any(Date),
    }) });
    expect(create.mock.calls[0][0].data).not.toHaveProperty("nonce");
  });

  it("rejects decoy providers without creating a challenge", async () => {
    const response = await POST(new NextRequest("https://restoreassist.app/api/auth/native-nonce", {
      method: "POST", body: JSON.stringify({ provider: "github" }),
    }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
