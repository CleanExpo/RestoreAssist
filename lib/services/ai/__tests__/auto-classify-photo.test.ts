import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { autoClassifyPhoto } from "../auto-classify-photo";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleArgs = {
  apiKey: "sk-platform",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/inspection.jpg",
};

describe("autoClassifyPhoto", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with labels + confidence on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              damageCategory: "CAT_2",
              damageClass: "CLASS_2",
              roomType: "KITCHEN",
              moistureSource: "FLEXI_HOSE",
              affectedMaterial: ["CARPET", "UNDERLAY"],
              surfaceOrientation: "FLOOR",
              damageExtentEstimate: "PARTIAL",
              equipmentVisible: false,
              secondaryDamageIndicators: ["STAINING"],
              photoStage: "PRE_WORK",
              captureAngle: "STRAIGHT_ON",
              confidence: 0.85,
            }),
          },
        ],
      } as never,
    });

    const r = await autoClassifyPhoto(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.confidence).toBe(0.85);
      expect(r.data.labels.damageCategory).toBe("CAT_2");
      expect((r.data.labels as { confidence?: number }).confidence).toBeUndefined();
    }
  });

  it("propagates gateway KEY_MISSING reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "KEY_MISSING",
      detail: "no key",
    });
    const r = await autoClassifyPhoto(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });

  it("tolerates ```json markdown fences", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [
          {
            type: "text",
            text:
              "```json\n" +
              JSON.stringify({
                damageCategory: "CAT_1",
                damageClass: "CLASS_1",
                roomType: "BATHROOM",
                confidence: 0.9,
              }) +
              "\n```",
          },
        ],
      } as never,
    });
    const r = await autoClassifyPhoto(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.labels.damageCategory).toBe("CAT_1");
      expect(r.data.confidence).toBe(0.9);
    }
  });

  it("returns PARSE_FAILED on non-JSON output", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "Cannot classify this photo." }],
      } as never,
    });
    const r = await autoClassifyPhoto(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});
