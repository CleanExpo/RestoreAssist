import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the Gemini request and stub Supabase Storage so a full success path
// runs without the network.
const { generateContent, upload } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock("../supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      getBucket: async () => ({ data: { name: "margot-generations" } }),
      from: () => ({
        upload,
        getPublicUrl: (name: string) => ({
          data: { publicUrl: `https://example.supabase.co/${name}` },
        }),
      }),
    },
  }),
}));

import { generateAndStoreImage } from "../margot-image-gen";

describe("generateAndStoreImage — Gemini image model", () => {
  beforeEach(() => {
    generateContent.mockReset();
    upload.mockReset();
    generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: Buffer.from("png-bytes").toString("base64"),
                  mimeType: "image/png",
                },
              },
            ],
          },
        },
      ],
    });
    upload.mockResolvedValue({ error: null });
    process.env.GEMINI_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  it("[retired-models] requests gemini-3.1-flash-image, not the shut-down preview", async () => {
    const result = await generateAndStoreImage({ prompt: "a house" });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe(
      "gemini-3.1-flash-image",
    );
    expect(result).toMatchObject({ model: "gemini-3.1-flash-image" });
  });

  it("[retired-models] reports the published per-image price for each size", async () => {
    const costs: Record<string, unknown> = {};
    for (const image_size of ["1K", "2K", "4K"] as const) {
      const result = await generateAndStoreImage({
        prompt: "a house",
        image_size,
      });
      costs[image_size] = (result as { cost_usd_approx?: number })
        .cost_usd_approx;
    }

    expect(costs).toEqual({ "1K": 0.067, "2K": 0.101, "4K": 0.151 });
  });
});
