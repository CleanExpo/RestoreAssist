import { describe, expect, it, vi, beforeEach } from "vitest";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { draftSupportTicketReply } from "../draft-support-ticket";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleTicket = {
  category: "billing",
  priority: "high",
  subject: "Cannot upgrade",
  body: "I'm trying to upgrade my plan but the checkout times out.",
};

describe("draftSupportTicketReply", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with draft text on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [{ type: "text", text: "Hi — we'll fix the checkout issue within 24 hours.\nThanks." }],
      } as never,
    });
    const r = await draftSupportTicketReply({
      apiKey: "sk-platform",
      ticket: sampleTicket,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toContain("24 hours");
  });

  it("passes the apiKey override through to the gateway", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [{ type: "text", text: "draft" }],
      } as never,
    });
    await draftSupportTicketReply({
      apiKey: "sk-platform-xyz",
      ticket: sampleTicket,
    });
    expect(vi.mocked(callAnthropic)).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-platform-xyz", userId: "system" }),
    );
  });

  it("uses the support draft policy without changing the Anthropic request", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_policy",
        content: [{ type: "text", text: "draft" }],
      } as never,
    });

    const policy = requireAiTaskPolicy("support_response_draft");

    await draftSupportTicketReply({
      apiKey: "sk-platform",
      ticket: sampleTicket,
    });

    expect(policy).toEqual(
      expect.objectContaining({
        taskClass: "support_response_draft",
        allowedProviderFamilies: ["anthropic-platform"],
        maxOutputTokens: 1024,
        maxEstimatedCostUsd: 0.02,
        requiresUsageLogging: true,
        allowsFallback: false,
      }),
    );
    expect(vi.mocked(callAnthropic)).toHaveBeenCalledWith({
      userId: "system",
      apiKey: "sk-platform",
      request: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: expect.stringContaining("Respond with only the response text"),
        messages: [
          {
            role: "user",
            content: "Category: billing\nPriority: high\nSubject: Cannot upgrade\n\nI'm trying to upgrade my plan but the checkout times out.",
          },
        ],
      },
    });
  });

  it("fails closed for unknown task policies", () => {
    expect(() => requireAiTaskPolicy("unknown")).toThrow(
      "Missing AI task policy for unknown",
    );
  });

  it("propagates gateway RATE_LIMITED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "from gateway",
      retryAfterMs: 30000,
    });
    const r = await draftSupportTicketReply({
      apiKey: "sk-platform",
      ticket: sampleTicket,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("returns EMPTY_OUTPUT when model returns no text", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [],
      } as never,
    });
    const r = await draftSupportTicketReply({
      apiKey: "sk-platform",
      ticket: sampleTicket,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EMPTY_OUTPUT");
  });
});
