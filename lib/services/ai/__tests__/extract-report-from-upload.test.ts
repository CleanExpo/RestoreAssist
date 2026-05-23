import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

// Prompt-cache helper is harmless but imported by the service; stub it so the
// test doesn't need to evaluate the real cache-block builder.
vi.mock("@/lib/anthropic/features/prompt-cache", () => ({
  createCachedSystemPrompt: (text: string) => ({
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }),
  extractCacheMetrics: () => ({ inputTokens: 100, outputTokens: 50 }),
  logCacheMetrics: () => undefined,
}));

import { extractReportFromUpload } from "../extract-report-from-upload";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const SAMPLE_PDF_BASE64 = Buffer.from("%PDF-1.4 sample").toString("base64");

describe("extractReportFromUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with parsed JSON data on success", async () => {
    const sampleData = {
      clientName: "Jane Doe",
      propertyAddress: "12 Smith St, Sydney NSW 2000",
      waterCategory: "Category 2",
      waterClass: 2,
      scopeAreas: [{ name: "Kitchen", length: 4.5, width: 3.5, height: 2.7 }],
    };
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [{ type: "text", text: JSON.stringify(sampleData) }],
      } as never,
    });

    const r = await extractReportFromUpload({
      apiKey: "sk-test",
      input: { base64Data: SAMPLE_PDF_BASE64 },
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.parsedData.clientName).toBe("Jane Doe");
      expect((r.data.parsedData.scopeAreas as Array<unknown>).length).toBe(1);
    }
  });

  it("tolerates markdown fences and trailing-comma JSON quirks", async () => {
    const messyText =
      "```json\n" +
      '{ "clientName": "John Smith", "waterClass": 3, "items": [1, 2, 3,], }\n' +
      "```";
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [{ type: "text", text: messyText }],
      } as never,
    });

    const r = await extractReportFromUpload({
      apiKey: "sk-test",
      input: { base64Data: SAMPLE_PDF_BASE64 },
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.parsedData.clientName).toBe("John Smith");
      expect(r.data.parsedData.waterClass).toBe(3);
    }
  });

  it("returns PARSE_FAILED when model output contains no JSON object", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [
          {
            type: "text",
            text: "I cannot extract data from this PDF.",
          },
        ],
      } as never,
    });

    const r = await extractReportFromUpload({
      apiKey: "sk-test",
      input: { base64Data: SAMPLE_PDF_BASE64 },
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

    const r = await extractReportFromUpload({
      apiKey: "sk-test",
      input: { base64Data: SAMPLE_PDF_BASE64 },
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
  });
});
