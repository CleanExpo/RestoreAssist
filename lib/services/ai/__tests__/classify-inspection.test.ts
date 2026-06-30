import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { classifyInspection } from "../classify-inspection";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const samplePayload = {
  inspectionNumber: "INS-001",
  propertyPostcode: "4000",
  moistureReadings: [{ id: "m1", value: 30 }],
  affectedAreas: [{ id: "a1", roomName: "Kitchen" }],
};

describe("classifyInspection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with parsed classification on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              waterCategory: "CATEGORY_2",
              waterClass: "CLASS_3",
              confidence: 82,
              reasoning: "S500:2021 §10.6.1 — visible mould growth",
            }),
          },
        ],
      } as never,
    });

    const r = await classifyInspection({
      userId: "user-1",
      payload: samplePayload,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.waterCategory).toBe("CATEGORY_2");
      expect(r.data.confidence).toBe(82);
    }
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await classifyInspection({
      userId: "user-1",
      payload: samplePayload,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("tolerates model output wrapped in ```json fences", async () => {
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
                waterCategory: "CATEGORY_1",
                waterClass: "CLASS_1",
                confidence: 95,
                reasoning: "Clean water source",
              }) +
              "\n```",
          },
        ],
      } as never,
    });
    const r = await classifyInspection({
      userId: "user-1",
      payload: samplePayload,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.waterCategory).toBe("CATEGORY_1");
  });

  it("returns PARSE_FAILED when text block isn't valid JSON", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "I cannot classify this." }],
      } as never,
    });
    const r = await classifyInspection({
      userId: "user-1",
      payload: samplePayload,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});
