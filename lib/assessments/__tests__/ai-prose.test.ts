import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/budget-guard", () => ({
  checkWorkspaceBudget: vi.fn(),
}));

vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: vi.fn(),
}));

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function () {
    return ({
    messages: { create: messagesCreate },
  });
  }),
}));

import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { enhanceReportProse } from "../ai-prose";
import type { ReportSection } from "../types";

const mockedBudget = checkWorkspaceBudget as unknown as ReturnType<
  typeof vi.fn
>;
const mockedKey = getAnthropicApiKey as unknown as ReturnType<typeof vi.fn>;

const sampleSections: ReportSection[] = [
  {
    heading: "Situation",
    body: "Cat 2 water damage. Class 2.",
    citations: [{ standard: "IICRC S500:2021", section: "§13" }],
  },
  {
    heading: "Scope rationale",
    body: "Extraction + LGR drying + antimicrobial.",
  },
];

beforeEach(() => {
  mockedBudget.mockReset();
  mockedKey.mockReset();
  messagesCreate.mockReset();
});

describe("enhanceReportProse", () => {
  it("degrades to original when workspace budget exhausted", async () => {
    mockedBudget.mockResolvedValueOnce({
      ok: false,
      error: "Daily budget exhausted",
      budgetUsd: 50,
      spentTodayUsd: 50,
      remainingUsd: 0,
    });

    const result = await enhanceReportProse({
      domain: "WATER",
      sections: sampleSections,
      workspaceId: "ws_1",
      userId: "u_1",
    });

    expect(result.enhanced).toBe(false);
    expect(result.degradedReason).toMatch(/BUDGET_EXCEEDED/);
    expect(result.sections).toBe(sampleSections);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("degrades to original when no API key is available", async () => {
    mockedBudget.mockResolvedValueOnce({
      ok: true,
      budgetUsd: 50,
      spentTodayUsd: 0,
      remainingUsd: 50,
    });
    mockedKey.mockRejectedValueOnce(new Error("no key"));

    const result = await enhanceReportProse({
      domain: "MOULD",
      sections: sampleSections,
      workspaceId: "ws_1",
      userId: "u_1",
    });

    expect(result.enhanced).toBe(false);
    expect(result.degradedReason).toBe("NO_API_KEY");
    expect(result.sections).toBe(sampleSections);
  });

  it("rewrites every section's body when model returns valid JSON", async () => {
    mockedBudget.mockResolvedValueOnce({
      ok: true,
      budgetUsd: 50,
      spentTodayUsd: 0,
      remainingUsd: 50,
    });
    mockedKey.mockResolvedValueOnce("sk-ant-test");
    messagesCreate
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: '{"body":"Polished situation prose."}' },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: '{"body":"Polished scope rationale."}' },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    const result = await enhanceReportProse({
      domain: "WATER",
      sections: sampleSections,
      workspaceId: "ws_1",
      userId: "u_1",
    });

    expect(result.enhanced).toBe(true);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].body).toBe("Polished situation prose.");
    expect(result.sections[1].body).toBe("Polished scope rationale.");
    // Citations are preserved verbatim.
    expect(result.sections[0].citations).toEqual(sampleSections[0].citations);
    expect(result.modelUsed).toMatch(/claude-haiku/);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("falls back per-section when one parse fails but keeps the rest", async () => {
    mockedBudget.mockResolvedValueOnce({
      ok: true,
      budgetUsd: 50,
      spentTodayUsd: 0,
      remainingUsd: 50,
    });
    mockedKey.mockResolvedValueOnce("sk-ant-test");
    messagesCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "this is not valid JSON" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: '{"body":"Polished scope rationale."}' },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    const result = await enhanceReportProse({
      domain: "WATER",
      sections: sampleSections,
      workspaceId: "ws_1",
      userId: "u_1",
    });

    expect(result.enhanced).toBe(false);
    expect(result.degradedReason).toBe("PARTIAL_PARSE_FAIL");
    // First section unchanged, second rewritten.
    expect(result.sections[0]).toEqual(sampleSections[0]);
    expect(result.sections[1].body).toBe("Polished scope rationale.");
  });

  it("strips code-fenced JSON blocks from model output", async () => {
    mockedBudget.mockResolvedValueOnce({
      ok: true,
      budgetUsd: 50,
      spentTodayUsd: 0,
      remainingUsd: 50,
    });
    mockedKey.mockResolvedValueOnce("sk-ant-test");
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n{"body":"Fenced prose."}\n```',
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await enhanceReportProse({
      domain: "STORM",
      sections: [sampleSections[0]],
      workspaceId: "ws_1",
      userId: "u_1",
    });

    expect(result.enhanced).toBe(true);
    expect(result.sections[0].body).toBe("Fenced prose.");
  });

  it("skips the budget check when workspaceId is null", async () => {
    mockedKey.mockResolvedValueOnce("sk-ant-test");
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"body":"ok"}' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await enhanceReportProse({
      domain: "WATER",
      sections: [sampleSections[0]],
      workspaceId: null,
      userId: "u_1",
    });

    expect(mockedBudget).not.toHaveBeenCalled();
    expect(result.enhanced).toBe(true);
  });
});
