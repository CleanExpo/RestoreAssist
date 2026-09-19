import { describe, expect, it } from "vitest";
import {
  AI_OWNERSHIP_PROMPT_INSTRUCTION,
  AI_OWNERSHIP_BANNER_BODY,
  AI_OWNERSHIP_ACK_LABEL,
  AI_OWNERSHIP_PRE_GENERATE_TITLE,
  AI_OWNERSHIP_PRE_GENERATE_BODY,
} from "@/lib/reports/ai-ownership";

describe("ai-ownership copy", () => {
  it("states AI is assistant only and holder owns liability", () => {
    expect(AI_OWNERSHIP_PROMPT_INSTRUCTION).toMatch(/AI-ASSISTED DRAFT/i);
    expect(AI_OWNERSHIP_PROMPT_INSTRUCTION).toMatch(/application holder/i);
    expect(AI_OWNERSHIP_BANNER_BODY).toMatch(/not liable/i);
    expect(AI_OWNERSHIP_ACK_LABEL).toMatch(/my words/i);
  });

  it("teaches AI draft is not a signed or issued report before generate", () => {
    // Assert the whole negative claim, not word presence: "AI draft is a
    // signed or issued report" contains every word and means the opposite.
    expect(AI_OWNERSHIP_PRE_GENERATE_TITLE).toBe(
      "AI draft is not a signed or issued report",
    );
    expect(AI_OWNERSHIP_PRE_GENERATE_BODY).toMatch(/produces an AI draft only/i);
    expect(AI_OWNERSHIP_PRE_GENERATE_BODY).toMatch(
      /confirm ownership before the report is signed or issued/i,
    );
    expect(AI_OWNERSHIP_PRE_GENERATE_BODY).toMatch(/confirm ownership/i);
  });
});
