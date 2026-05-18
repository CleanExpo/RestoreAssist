import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { generateReportSynopsis } from "../report-synopsis";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleFacts = {
  waterCategory: "2",
  waterClass: "3",
  hazardType: null,
  affectedArea: 42,
  estimatedDryingTime: 72,
  totalCost: 8500,
  propertyAddress: "12 Main St, Brisbane",
};

describe("generateReportSynopsis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with cleaned synopsis on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: '  "Water Category 2 inspection in Brisbane: 42m² affected, 72-hour drying, AUD $8,500 total."  ',
          },
        ],
      } as never,
    });

    const r = await generateReportSynopsis({
      apiKey: "sk-resolved",
      facts: sampleFacts,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // surrounding quotes stripped, whitespace trimmed
      expect(r.data.startsWith('"')).toBe(false);
      expect(r.data.endsWith('"')).toBe(false);
      expect(r.data).toContain("Brisbane");
    }
  });

  it("slices synopsis to 280 chars", async () => {
    const long = "x".repeat(500);
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: { id: "msg_2", content: [{ type: "text", text: long }] } as never,
    });

    const r = await generateReportSynopsis({
      apiKey: "sk-resolved",
      facts: sampleFacts,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.length).toBe(280);
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await generateReportSynopsis({
      apiKey: "sk-resolved",
      facts: sampleFacts,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("returns EMPTY_OUTPUT when model returns no text content", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: { id: "msg_3", content: [] } as never,
    });

    const r = await generateReportSynopsis({
      apiKey: "sk-resolved",
      facts: sampleFacts,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EMPTY_OUTPUT");
  });
});
