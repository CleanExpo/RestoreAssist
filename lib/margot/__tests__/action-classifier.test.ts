import { describe, it, expect } from "vitest";
import {
  classifyMargotAction,
  requiresHumanConfirmation,
} from "../action-classifier";

describe("classifyMargotAction", () => {
  it("prohibits closure and pricing mutations", () => {
    expect(classifyMargotAction("close_claim")).toBe("prohibited");
    expect(classifyMargotAction("approve_estimate_pricing")).toBe("prohibited");
  });

  it("requires confirmation for draft actions", () => {
    expect(requiresHumanConfirmation(classifyMargotAction("draft_field_guidance"))).toBe(
      true,
    );
    expect(requiresHumanConfirmation(classifyMargotAction("read_claim_context"))).toBe(
      false,
    );
  });
});
