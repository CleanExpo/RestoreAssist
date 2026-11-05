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
  validateProviderKey,
  OPERATING_PROVIDERS,
} from "../provider-connections";

const SYNTHETIC_KEY = "LLM_1607358788850350_synthetic";

beforeEach(() => {
  findUnique.mockReset();
  updateMany.mockReset();
  decrypt.mockReset();
  encrypt.mockReset();
  vi.unstubAllGlobals();
});

describe("Meta provider support", () => {
  it("counts META as an operating provider and leaves voice and platform inference out", () => {
    expect(OPERATING_PROVIDERS).toContain("META");
    expect(OPERATING_PROVIDERS).toContain("ANTHROPIC");
    expect(OPERATING_PROVIDERS).toContain("OPENAI");
    expect(OPERATING_PROVIDERS).toContain("GOOGLE");
    expect(OPERATING_PROVIDERS).toContain("OPENROUTER");
    expect(OPERATING_PROVIDERS).not.toContain("GEMMA");
    expect(OPERATING_PROVIDERS).not.toContain("ELEVENLABS");
  });

  it("validates a Meta key against the models list (200 = valid) and does not echo the key", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: SYNTHETIC_KEY }));
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await validateProviderKey("ws_1", "META");

    expect(result.valid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_KEY);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.meta.ai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${SYNTHETIC_KEY}`,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalled();
  });

  it("marks a Meta key invalid on 401 without returning the key", async () => {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: SYNTHETIC_KEY }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));

    const result = await validateProviderKey("ws_1", "META");

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/invalid meta/i);
    expect(result.errorMessage).not.toContain(SYNTHETIC_KEY);
  });
});
