import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the substrate helper directly — this service composes tryClaudeModels
// (multi-model fallback) rather than the single-model anthropic-gateway.
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: vi.fn(),
}));

// Prompt-cache helper is harmless but imported by the service; stub it so the
// test doesn't need to evaluate the real cache-block builder.
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
import { tryClaudeModels } from "@/lib/anthropic-models";

function mockTextResponse(text: string) {
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
    vi.mocked(tryClaudeModels).mockReset();
  });

  it("returns ok with enhancedReport when model returns text", async () => {
    const reportText =
      "# Professional Inspection Report\n\nDetailed report text referencing AS-IICRC S500:2025.";
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(reportText),
    );

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enhancedReport).toBe(reportText);
    }
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
  });

  it("returns ok with stringified content when first block is not text type", async () => {
    // Defensive: if the SDK returns a non-text block first, the service must
    // still produce a non-empty enhancedReport (matches legacy route behaviour).
    const nonTextBlock = { type: "tool_use", name: "fake", input: { x: 1 } };
    vi.mocked(tryClaudeModels).mockResolvedValueOnce({
      id: "msg_xxx",
      content: [nonTextBlock],
    } as never);

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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce({
      id: "msg_xxx",
      content: [{ type: "text", text: "" }],
    } as never);

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
    }
  });

  it("maps 429 from tryClaudeModels to RATE_LIMITED", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce({
      status: 429,
      message: "rate limit",
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
