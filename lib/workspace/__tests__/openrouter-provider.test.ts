import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const decrypt = vi.fn();
const encrypt = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    providerConnection: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));
vi.mock("../../credential-vault", () => ({
  encrypt: (...a: unknown[]) => encrypt(...a),
  decrypt: (...a: unknown[]) => decrypt(...a),
}));

import {
  getProviderCredentials,
  validateProviderKey,
  OPERATING_PROVIDERS,
} from "../provider-connections";

beforeEach(() => {
  findUnique.mockReset();
  updateMany.mockReset();
  decrypt.mockReset();
  encrypt.mockReset();
  vi.unstubAllGlobals();
});

describe("OpenRouter provider support", () => {
  it("counts OPENROUTER as an operating provider (onboarding + setup gate agree)", () => {
    expect(OPERATING_PROVIDERS).toContain("OPENROUTER");
    expect(OPERATING_PROVIDERS).toContain("ANTHROPIC");
    expect(OPERATING_PROVIDERS).toContain("OPENAI");
    // Non-operating providers must stay out of the list.
    expect(OPERATING_PROVIDERS).not.toContain("GOOGLE");
    expect(OPERATING_PROVIDERS).not.toContain("GEMMA");
    expect(OPERATING_PROVIDERS).not.toContain("ELEVENLABS");
  });

  it("getProviderCredentials returns the stored model slug for OpenRouter", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(
      JSON.stringify({
        apiKey: "sk-or-v1-key",
        model: "qwen/qwen-2.5-72b-instruct",
      }),
    );

    const creds = await getProviderCredentials("ws_1", "OPENROUTER");
    expect(creds).toEqual({
      apiKey: "sk-or-v1-key",
      model: "qwen/qwen-2.5-72b-instruct",
      voiceId: undefined,
    });
  });

  it("validates an OpenRouter key against the auth/key endpoint (200 = valid)", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: "sk-or-v1-key" }));
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await validateProviderKey("ws_1", "OPENROUTER");

    expect(result.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/auth/key",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-v1-key",
        }),
      }),
    );
    // Validation status is persisted.
    expect(updateMany).toHaveBeenCalled();
  });

  it("marks an OpenRouter key invalid on 401", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: "sk-or-bad" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));

    const result = await validateProviderKey("ws_1", "OPENROUTER");

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/invalid openrouter/i);
  });
});
