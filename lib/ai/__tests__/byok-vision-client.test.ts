import { beforeEach, describe, expect, it, vi } from "vitest";

const getLatestAIIntegration = vi.fn();

vi.mock("@/lib/ai-provider", () => ({
  getLatestAIIntegration: (...a: unknown[]) => getLatestAIIntegration(...a),
}));

const { createMock, ctorMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  ctorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat: { completions: { create: typeof createMock } };
    constructor(opts: unknown) {
      ctorMock(opts);
      this.chat = { completions: { create: createMock } };
    }
  },
}));

import {
  analyseImageWithBYOK,
  VisionProviderUnsupportedError,
} from "../byok-vision-client";
import {
  META_API_BASE_URL,
  META_DEFAULT_CHAT_MODEL,
} from "@/lib/workspace/provider-connections";

const SYNTHETIC_KEY = "LLM_1607358788850350_synthetic";

const visionRequest = {
  imageBase64: "dGVzdA==",
  mimeType: "image/jpeg" as const,
  userId: "user_1",
};

const s500Json = JSON.stringify({
  damageCategory: "Category 1",
  damageClass: "Class 1",
  affectedArea: "living room",
  moistureIndicators: ["staining"],
  suggestedEvidenceClass: "DAMAGE_CLOSE_UP",
  safetyHazards: [],
  structuralConcerns: [],
  materials: ["drywall"],
  photoQualityScore: 80,
  s500ComplianceNotes: "S500:2021 §7.1",
  rawDescription: "wet drywall",
  confidence: 0.9,
});

beforeEach(() => {
  getLatestAIIntegration.mockReset();
  createMock.mockReset();
  ctorMock.mockReset();
});

describe("analyseImageWithBYOK — Meta", () => {
  it("sends the image to Meta Model API chat completions", async () => {
    getLatestAIIntegration.mockResolvedValue({
      id: "meta-1",
      name: "Meta Llama",
      apiKey: SYNTHETIC_KEY,
      provider: "meta",
    });
    createMock.mockResolvedValue({
      choices: [{ message: { content: s500Json } }],
    });

    const result = await analyseImageWithBYOK(visionRequest);

    expect(result.provider).toBe("meta");
    expect(result.model).toBe(META_DEFAULT_CHAT_MODEL);
    expect(result.affectedArea).toBe("living room");
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: SYNTHETIC_KEY,
        baseURL: META_API_BASE_URL,
      }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: META_DEFAULT_CHAT_MODEL,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "image_url",
                image_url: expect.objectContaining({
                  url: "data:image/jpeg;base64,dGVzdA==",
                }),
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("does not put the Meta key in thrown errors when vision fails", async () => {
    getLatestAIIntegration.mockResolvedValue({
      id: "meta-1",
      name: "Meta Llama",
      apiKey: SYNTHETIC_KEY,
      provider: "meta",
    });
    const sdkError = Object.assign(
      new Error(`401 Incorrect API key provided: ${SYNTHETIC_KEY}`),
      { status: 401 },
    );
    createMock.mockRejectedValue(sdkError);

    await expect(analyseImageWithBYOK(visionRequest)).rejects.toThrow(
      /Meta vision request failed \(401\)/,
    );

    try {
      await analyseImageWithBYOK(visionRequest);
      throw new Error("expected analyseImageWithBYOK to reject");
    } catch (err) {
      expect(err).not.toBe(sdkError);
      expect(err instanceof Error ? err.cause : undefined).toBeUndefined();
      const payload = JSON.stringify({
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      expect(payload).not.toContain(SYNTHETIC_KEY);
      expect(payload).not.toMatch(/LLM_/);
    }
  });
});

describe("analyseImageWithBYOK — providers without vision", () => {
  it("throws a typed error for OpenRouter instead of Unsupported provider", async () => {
    getLatestAIIntegration.mockResolvedValue({
      id: "or-1",
      name: "OpenRouter",
      apiKey: "sk-or-v1-synthetic",
      provider: "openrouter",
    });

    await expect(analyseImageWithBYOK(visionRequest)).rejects.toBeInstanceOf(
      VisionProviderUnsupportedError,
    );
    await expect(analyseImageWithBYOK(visionRequest)).rejects.not.toThrow(
      /Unsupported provider/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
