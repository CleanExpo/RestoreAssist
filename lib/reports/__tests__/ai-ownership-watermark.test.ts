import { describe, expect, it } from "vitest";
import { AI_OWNERSHIP_WATERMARK } from "@/lib/reports/ai-ownership";
import { drawAiOwnershipWatermark } from "@/lib/reports/ai-ownership-watermark";

describe("drawAiOwnershipWatermark", () => {
  it("exposes the shared watermark copy constant", () => {
    expect(AI_OWNERSHIP_WATERMARK).toMatch(/AI-ASSISTED DRAFT/i);
  });

  it("is a callable drawer (smoke)", () => {
    expect(typeof drawAiOwnershipWatermark).toBe("function");
  });
});
