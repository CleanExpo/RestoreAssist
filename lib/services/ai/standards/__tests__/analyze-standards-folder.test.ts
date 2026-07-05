import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { analyzeStandardsFolder } from "../analyze-standards-folder";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const query = {
  reportType: "water" as const,
  waterCategory: "2" as const,
};

const files = [
  { id: "f1", name: "IICRC-S500-2021.pdf", mimeType: "application/pdf" },
  { id: "f2", name: "AS-NZS-3000-Electrical.pdf", mimeType: "application/pdf" },
  { id: "f3", name: "Random-unrelated.pdf", mimeType: "application/pdf" },
];

const folderItems = { files: files as never[], folders: [] };

describe("analyzeStandardsFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with JSON-matched files on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              relevantFileNames: ["IICRC-S500", "AS-NZS-3000"],
              reasoning: "Water cat 2 needs S500 + AU electrical",
              standardTypes: ["S500", "AS/NZS 3000"],
            }),
          },
        ],
        usage: { input_tokens: 500, output_tokens: 100 },
      } as never,
    });

    const r = await analyzeStandardsFolder({
      apiKey: "sk",
      folderItems,
      query,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.relevantFiles.map((f) => f.id).sort()).toEqual([
        "f1",
        "f2",
      ]);
      expect(r.data.reasoning).toContain("S500");
    }
  });

  it("falls back to mentioned-files heuristic when JSON parse fails (preserves legacy text-scan)", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        content: [
          {
            type: "text",
            // No JSON, just mentions filename prefix
            text: "I recommend reviewing iicrc-s500-2021 because it covers water cat 2.",
          },
        ],
        usage: { input_tokens: 500, output_tokens: 100 },
      } as never,
    });

    const r = await analyzeStandardsFolder({
      apiKey: "sk",
      folderItems,
      query,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.relevantFiles.map((f) => f.id)).toContain("f1");
    }
  });

  it("falls back to first-10 files when gateway fails (preserves legacy try/catch)", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await analyzeStandardsFolder({
      apiKey: "sk",
      folderItems,
      query,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Legacy behavior: when AI fails, fall back to first 10 files unchanged
      // so the composer can still score + dedupe them.
      expect(r.data.relevantFiles.length).toBeGreaterThan(0);
      expect(r.data.relevantFiles.length).toBeLessThanOrEqual(10);
      expect(r.data.reasoning.toLowerCase()).toContain("default");
    }
  });

  it("caps fileList sent to model at 100 files", async () => {
    const bigFolderFiles = Array.from({ length: 250 }, (_, i) => ({
      id: `b${i}`,
      name: `bigfile-${i}.pdf`,
      mimeType: "application/pdf",
    }));

    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        content: [
          {
            type: "text",
            text: JSON.stringify({ relevantFileNames: [], reasoning: "" }),
          },
        ],
        usage: { input_tokens: 500, output_tokens: 100 },
      } as never,
    });

    await analyzeStandardsFolder({
      apiKey: "sk",
      folderItems: { files: bigFolderFiles as never[], folders: [] },
      query,
    });

    const callArg = vi.mocked(callAnthropic).mock.calls[0][0];
    const userMsg = callArg.request.messages[0].content as string;
    // The 100th file should appear, the 101st should not.
    expect(userMsg).toContain('"id": "b99"');
    expect(userMsg).not.toContain('"id": "b100"');
  });
});
