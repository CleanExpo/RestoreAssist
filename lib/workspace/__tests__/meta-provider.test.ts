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

  function mockConnection() {
    findUnique.mockResolvedValue({
      status: "ACTIVE",
      encryptedCredentials: "blob",
    });
    decrypt.mockReturnValue(JSON.stringify({ apiKey: SYNTHETIC_KEY }));
  }

  function catalogResponse(
    status: number,
    body: unknown,
    extras: { text?: string; ok?: boolean } = {},
  ) {
    const ok = extras.ok ?? (status >= 200 && status < 300);
    return {
      status,
      ok,
      json: async () => body,
      text: async () => extras.text ?? JSON.stringify(body),
    };
  }

  it("validates a Meta key against the models list (200 = valid) and does not echo the key", async () => {
    mockConnection();
    const fetchMock = vi.fn().mockResolvedValue(
      catalogResponse(200, { data: [{ id: "muse-spark-1.3" }] }),
    );
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

  it("marks a Meta key invalid when the catalog omits the chat model used for generation", async () => {
    mockConnection();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        catalogResponse(200, { data: [{ id: "llama-3.3-70b-instruct" }] }),
      ),
    );

    const result = await validateProviderKey("ws_1", "META");

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/muse-spark-1\.3/i);
    expect(result.errorMessage).not.toContain(SYNTHETIC_KEY);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastError: expect.not.stringContaining(SYNTHETIC_KEY),
        }),
      }),
    );
  });

  it("marks a Meta key invalid on 401 without returning the key", async () => {
    mockConnection();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }));

    const result = await validateProviderKey("ws_1", "META");

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/invalid meta/i);
    expect(result.errorMessage).not.toContain(SYNTHETIC_KEY);
  });

  it.each([400, 404, 429])(
    "does not treat Meta HTTP %s as a valid key",
    async (status) => {
      mockConnection();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ status, ok: false }),
      );

      const result = await validateProviderKey("ws_1", "META");

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toMatch(new RegExp(String(status)));
      expect(result.errorMessage).not.toContain(SYNTHETIC_KEY);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    },
  );

  it("does not copy a Meta 5xx body that echoes the key into the saved error", async () => {
    mockConnection();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        catalogResponse(503, { error: SYNTHETIC_KEY }, { text: SYNTHETIC_KEY }),
      ),
    );

    const result = await validateProviderKey("ws_1", "META");

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/503/);
    expect(result.errorMessage).not.toContain(SYNTHETIC_KEY);
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_KEY);
    const persisted = updateMany.mock.calls[0]?.[0]?.data?.lastError as
      | string
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted).not.toContain(SYNTHETIC_KEY);
  });
});
