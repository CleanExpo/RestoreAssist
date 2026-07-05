import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { extractStandardsSections } from "../extract-standards-sections";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const query = {
  reportType: "water" as const,
  waterCategory: "2" as const,
  materials: ["carpet", "plasterboard"],
  affectedAreas: ["Kitchen"],
  keywords: ["dehumidification"],
};

describe("extractStandardsSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with parsed numbered sections on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text:
              "1. Section A — this is the first critical section about water cat 2 protocol that runs longer than fifty chars.\n" +
              "2. Section B — second mandatory section with detailed IICRC S500 reference and procedural steps to follow strictly.\n" +
              "3. Section C — third section discussing PPE and OH&S containment requirements per AS/NZS guidelines properly.",
          },
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
        },
      } as never,
    });

    const r = await extractStandardsSections({
      apiKey: "sk-resolved",
      documentText: "Standards document text...",
      fileName: "IICRC-S500-2021.pdf",
      query,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sections.length).toBeGreaterThan(0);
      expect(r.data.sections.length).toBeLessThanOrEqual(5);
      expect(r.data.sections[0]).toContain("Section A");
    }
  });

  it("returns ok with single-element fallback when split yields no long sections", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [
          { type: "text", text: "Bare unstructured response without numbered list format." },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      } as never,
    });

    const r = await extractStandardsSections({
      apiKey: "sk-resolved",
      documentText: "doc",
      fileName: "file.pdf",
      query,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sections.length).toBe(1);
      expect(r.data.sections[0]).toContain("Bare unstructured response");
    }
  });

  it("returns ok with graceful fallback sections when gateway fails (preserves legacy try/catch behavior)", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await extractStandardsSections({
      apiKey: "sk-resolved",
      documentText: "doc",
      fileName: "file.pdf",
      query,
    });
    // Legacy behavior: catch-block returns a single fallback sentence so the
    // composer keeps building a context even when one document's AI extraction
    // fails. We preserve that here as ok() with sections containing the fallback.
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sections.length).toBe(1);
      expect(r.data.sections[0]).toContain("water");
    }
  });

  it("truncates very long document text before sending", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [{ type: "text", text: "1. " + "x".repeat(200) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      } as never,
    });

    const huge = "a".repeat(160_000);
    await extractStandardsSections({
      apiKey: "sk-resolved",
      documentText: huge,
      fileName: "huge.pdf",
      query,
    });

    const callArg = vi.mocked(callAnthropic).mock.calls[0][0];
    const userMsg = (callArg.request.messages[0].content as string);
    expect(userMsg).toContain("[Document truncated...]");
    expect(userMsg.length).toBeLessThan(huge.length);
  });
});
