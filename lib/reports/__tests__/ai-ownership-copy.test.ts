import { describe, expect, it } from "vitest";
import {
  AI_OWNERSHIP_PROMPT_INSTRUCTION,
  AI_OWNERSHIP_BANNER_BODY,
  AI_OWNERSHIP_ACK_LABEL,
} from "@/lib/reports/ai-ownership";

describe("ai-ownership copy", () => {
  it("states AI is assistant only and holder owns liability", () => {
    expect(AI_OWNERSHIP_PROMPT_INSTRUCTION).toMatch(/AI-ASSISTED DRAFT/i);
    expect(AI_OWNERSHIP_PROMPT_INSTRUCTION).toMatch(/application holder/i);
    expect(AI_OWNERSHIP_BANNER_BODY).toMatch(/not liable/i);
    expect(AI_OWNERSHIP_ACK_LABEL).toMatch(/my words/i);
  });
});
