import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood).
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

vi.mock("@/lib/anthropic/features/prompt-cache", () => ({
  createCachedSystemPrompt: (text: string) => ({
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }),
}));

import {
  generateEnhancedReport,
  type GenerateEnhancedInput,
} from "../generate-enhanced-report";
import { callAnthropicWithFallback } from "../anthropic-gateway";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const INPUT: GenerateEnhancedInput = {
  technicianNotes:
    "Kitchen flooded from burst pipe. Carpet wet, plasterboard damaged.",
  dateOfAttendance: "2026-05-15",
  clientContacted: "Spoke with owner; arranged access.",
  clientName: "Jane Doe",
  propertyAddress: "12 Smith St, Sydney NSW 2000",
  clientEmail: "jane@example.com",
  clientPhone: "0400 000 000",
  technicianName: "Alex Smith",
  photos: [],
  conversationHistory: [],
  standardsContext: "",
};

describe("generateEnhancedReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with enhancedReport when model returns text", async () => {
    const reportText =
      "# Professional Inspection Report\n\nDetailed report text referencing ANSI/IICRC S500:2021.";
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(reportText) as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enhancedReport).toBe(reportText);
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("returns ok with stringified content when first block is not text type", async () => {
    // Defensive: if the SDK returns a non-text block first, the service must
    // still produce a non-empty enhancedReport (matches legacy route behaviour).
    const nonTextBlock = { type: "tool_use", name: "fake", input: { x: 1 } };
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_xxx",
        content: [nonTextBlock],
      } as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enhancedReport).toContain("tool_use");
    }
  });

  it("returns API_ERROR when model returns empty content (legacy 500 path)", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_xxx",
        content: [{ type: "text", text: "" }],
      } as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });
});
