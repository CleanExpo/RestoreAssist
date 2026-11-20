import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const analyseImageWithBYOK = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));
vi.mock("@/lib/ai/byok-vision-client", () => ({
  analyseImageWithBYOK: (...args: unknown[]) => analyseImageWithBYOK(...args),
  VisionProviderUnsupportedError: class VisionProviderUnsupportedError extends Error {
    constructor(provider: string) {
      super(
        `Photo analysis is not available for ${provider}. Add an Anthropic, OpenAI, Gemini, or Meta key in Settings → AI Providers.`,
      );
      this.name = "VisionProviderUnsupportedError";
    }
  },
}));

import { POST } from "../route";
import { VisionProviderUnsupportedError } from "@/lib/ai/byok-vision-client";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  analyseImageWithBYOK.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
});

function postRequest() {
  return new NextRequest("http://localhost/api/ai/vision", {
    method: "POST",
    body: JSON.stringify({
      imageBase64: "base64-image",
      mimeType: "image/jpeg",
    }),
  });
}

describe("POST /api/ai/vision", () => {
  it("does not expose BYOK provider configuration details", async () => {
    analyseImageWithBYOK.mockRejectedValueOnce(
      new Error("API key sk-secret was rejected by provider"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ error: "Vision provider is not configured" });
  });

  it("returns 422, not 500, when the connected provider cannot analyse photos", async () => {
    analyseImageWithBYOK.mockRejectedValueOnce(
      new VisionProviderUnsupportedError("openrouter"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error?.code).toBe("FEATURE_UNAVAILABLE");
    expect(body.error?.message).toMatch(/photo analysis is not available/i);
    expect(JSON.stringify(body)).not.toMatch(/sk-or-|LLM_/);
  });

  it("does not 500 when the old Unsupported provider: meta error is thrown", async () => {
    analyseImageWithBYOK.mockRejectedValueOnce(
      new Error("Unsupported provider: meta"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).not.toBe(500);
    expect(response.status).toBe(422);
    expect(body.error?.message).toMatch(/photo analysis is not available/i);
  });
});
