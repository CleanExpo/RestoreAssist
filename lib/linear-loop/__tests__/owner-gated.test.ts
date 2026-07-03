import { describe, expect, it } from "vitest";
import { isOwnerGated, OWNER_GATED_LABEL_NAME } from "@/lib/linear-loop/owner-gated";

describe("isOwnerGated", () => {
  it("returns true when the owner-gated label is present, regardless of description", () => {
    const result = isOwnerGated({
      labels: ["bug", "owner-gated"],
      description: "Fix the login button colour.",
    });
    expect(result).toBe(true);
  });

  it("returns true when the description matches the regex, even without the label", () => {
    const result = isOwnerGated({
      labels: ["infra"],
      description: "This requires an owner-gated production migration before it can ship.",
    });
    expect(result).toBe(true);
  });

  it("matches description variants: owner action gated, owner-action-gated, ownergated", () => {
    expect(
      isOwnerGated({ labels: [], description: "Blocked: owner action gated pending approval." })
    ).toBe(true);
    expect(
      isOwnerGated({ labels: [], description: "owner-action-gated: needs Phill to rotate the key." })
    ).toBe(true);
    expect(
      isOwnerGated({ labels: [], description: "This is ownergated, do not touch." })
    ).toBe(true);
  });

  it("is case-insensitive on the description match", () => {
    const result = isOwnerGated({
      labels: [],
      description: "OWNER-GATED: requires sign-off.",
    });
    expect(result).toBe(true);
  });

  it("returns false when neither the label nor the description pattern is present", () => {
    const result = isOwnerGated({
      labels: ["bug", "frontend"],
      description: "Fix the login button colour on mobile.",
    });
    expect(result).toBe(false);
  });

  it("returns false when description is null and the label is absent", () => {
    const result = isOwnerGated({ labels: ["feature"], description: null });
    expect(result).toBe(false);
  });

  it("does not false-positive on unrelated use of the word 'owner' or 'gated'", () => {
    const result = isOwnerGated({
      labels: ["billing"],
      description: "The property owner requested a gated-community access note in the report.",
    });
    expect(result).toBe(false);
  });

  it("exports the label name constant used by the label match", () => {
    expect(OWNER_GATED_LABEL_NAME).toBe("owner-gated");
  });
});
