import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { importSketchFromImage } from "../import-sketch-from-image";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleArgs = {
  apiKey: "sk-platform",
  base64Image: "iVBORw0KGgo",
  mediaType: "image/jpeg" as const,
};

describe("importSketchFromImage", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with parsed rooms + usage on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        usage: { input_tokens: 1500, output_tokens: 200 },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              rooms: [
                {
                  label: "Living Room",
                  vertices: [
                    { x: 0.1, y: 0.1 },
                    { x: 0.5, y: 0.1 },
                    { x: 0.5, y: 0.5 },
                    { x: 0.1, y: 0.5 },
                  ],
                },
              ],
            }),
          },
        ],
      } as never,
    });

    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rooms).toHaveLength(1);
      expect(r.data.rooms[0].label).toBe("Living Room");
      expect(r.data.usage).toEqual({ inputTokens: 1500, outputTokens: 200 });
    }
  });

  it("propagates gateway MODEL_OVERLOADED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "MODEL_OVERLOADED",
      detail: "529",
      retryAfterMs: 10000,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.retryAfterMs).toBe(10000);
    }
  });

  it("tolerates markdown fences around JSON", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "text",
            text:
              "```json\n" +
              JSON.stringify({
                rooms: [
                  {
                    label: "Kitchen",
                    vertices: [
                      { x: 0.0, y: 0.0 },
                      { x: 0.3, y: 0.0 },
                      { x: 0.3, y: 0.3 },
                    ],
                  },
                ],
              }) +
              "\n```",
          },
        ],
      } as never,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rooms[0].label).toBe("Kitchen");
  });

  it("returns PARSE_FAILED on non-JSON output", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{ type: "text", text: "I cannot extract rooms from this." }],
      } as never,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});
