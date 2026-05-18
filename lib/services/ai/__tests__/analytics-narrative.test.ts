import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { generateAnalyticsNarrative } from "../analytics-narrative";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleInput = {
  period: "month" as const,
  deltas: {
    period: "month",
    reports: { current: 12, previous: 8, changePct: 50 },
    revenue: { current: 24000, previous: 16000, changePct: 50 },
    topHazardMovers: [{ key: "Water", current: 8, previous: 4, delta: 4 }],
    topClientMovers: [
      { key: "Acme", current: 12000, previous: 6000, delta: 6000 },
    ],
    topSuburbMovers: [{ key: "4000", current: 5, previous: 2, delta: 3 }],
    topInsurerMovers: [{ key: "AAMI", current: 4, previous: 2, delta: 2 }],
  },
};

describe("generateAnalyticsNarrative", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with extracted narrative on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: "Reports lifted 50% to 12 jobs, driven mainly by water-damage callouts in 4000.",
          },
        ],
      } as never,
    });

    const r = await generateAnalyticsNarrative({
      apiKey: "sk-ant-test",
      input: sampleInput,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.narrative).toContain("Reports lifted 50%");
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
            text: "```json\nReports steady at 8 jobs with revenue flat.\n```",
          },
        ],
      } as never,
    });
    const r = await generateAnalyticsNarrative({
      apiKey: "sk-ant-test",
      input: sampleInput,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.narrative).toBe("Reports steady at 8 jobs with revenue flat.");
      expect(r.data.narrative).not.toContain("```");
    }
  });

  it("returns PARSE_FAILED when the response has no text block", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [],
      } as never,
    });
    const r = await generateAnalyticsNarrative({
      apiKey: "sk-ant-test",
      input: sampleInput,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await generateAnalyticsNarrative({
      apiKey: "sk-ant-test",
      input: sampleInput,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });
});
