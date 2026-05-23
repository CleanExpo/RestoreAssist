import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { extractMeterReading } from "../extract-reading";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleArgs = {
  apiKey: "sk-platform",
  image: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
  mediaType: "image/jpeg" as const,
};

describe("extractMeterReading", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with parsed reading on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              brand: "delmhorst",
              model: "BD-2100",
              readingValue: 18.5,
              readingUnit: "%",
              scale: "Wood",
              displayText: "18.5%",
              confidence: "high",
              notes: null,
            }),
          },
        ],
      } as never,
    });

    const r = await extractMeterReading(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.brand).toBe("delmhorst");
      expect(r.data.readingValue).toBe(18.5);
      expect(r.data.confidence).toBe("high");
    }
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await extractMeterReading(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("returns PARSE_FAILED when text block isn't valid JSON", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "I cannot read the meter." }],
      } as never,
    });
    const r = await extractMeterReading(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });

  it("returns NO_READING_DETECTED when parsed JSON has null readingValue and low confidence", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_4",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              brand: "unknown",
              model: null,
              readingValue: null,
              readingUnit: "unknown",
              scale: null,
              displayText: "",
              confidence: "low",
              notes: "Display is too blurry to read",
            }),
          },
        ],
      } as never,
    });
    const r = await extractMeterReading(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("NO_READING_DETECTED");
    }
  });
});
