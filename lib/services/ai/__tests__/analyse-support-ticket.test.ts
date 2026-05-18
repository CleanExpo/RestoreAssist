import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { analyseSupportTicket } from "../analyse-support-ticket";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleArgs = {
  apiKey: "sk-platform",
  ticket: {
    subject: "Cannot upgrade my plan",
    body: "I'm trying to upgrade to the Pro plan but the checkout times out at the Stripe step.",
  },
};

describe("analyseSupportTicket", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with category + priority + draft on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              category: "billing",
              priority: "high",
              responseDraft:
                "Hi — thanks for getting in touch about the checkout issue. We'll investigate and respond within 24 hours.",
            }),
          },
        ],
      } as never,
    });

    const r = await analyseSupportTicket(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.category).toBe("billing");
      expect(r.data.priority).toBe("high");
      expect(r.data.responseDraft).toContain("24 hours");
    }
  });

  it("clamps invalid category/priority to safe defaults", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              category: "weather",
              priority: "screaming",
              responseDraft: "Some draft.",
            }),
          },
        ],
      } as never,
    });
    const r = await analyseSupportTicket(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.category).toBe("general");
      expect(r.data.priority).toBe("normal");
    }
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await analyseSupportTicket(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("returns PARSE_FAILED on non-JSON output", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "I cannot analyse this ticket." }],
      } as never,
    });
    const r = await analyseSupportTicket(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});
