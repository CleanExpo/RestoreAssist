import { describe, expect, it } from "vitest";
import { isOwnerGated, ownerGateReason, OWNER_GATED_LABEL_NAME } from "@/lib/linear-loop/owner-gated";

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

describe("isOwnerGated — signals observed on real RA issues", () => {
  // RA-7132, Urgent, no labels. Title: "[BLOCKER — needs founder auth] Move
  // skills-library to GitLab Free". Description names two steps "an agent
  // must not take". The gate scored this false, so the loop would have
  // picked up an issue that tells agents to stop.
  it("gates RA-7132 on its title alone", () => {
    expect(
      isOwnerGated({
        labels: [],
        title: "[BLOCKER — needs founder auth] Move skills-library to GitLab Free",
        description: null,
      })
    ).toBe(true);
  });

  it("gates RA-7132 on its description alone", () => {
    expect(
      isOwnerGated({
        labels: [],
        description:
          "## BLOCKED ON FOUNDER — two steps an agent must not take\n" +
          "1. Create / sign in to the GitLab account. Agents do not create accounts.",
      })
    ).toBe(true);
  });

  // RA-5689, High, no labels, assigned to a human. Ends "## Decision
  // requested (Rana)" with three questions for the owner.
  it("gates RA-5689's explicit decision request", () => {
    expect(
      isOwnerGated({
        labels: [],
        description:
          "## Decision requested (Rana)\n(a) Pick ADR-001 option (recommend C).",
      })
    ).toBe(true);
  });

  it("reports which signal gated the issue", () => {
    expect(ownerGateReason({ labels: ["owner-gated"], description: null })).toBe(
      "label:owner-gated"
    );
    expect(
      ownerGateReason({ labels: [], title: "needs founder auth", description: null })
    ).toBe("text:needs human authority");
    expect(ownerGateReason({ labels: [], description: "Fix the button colour." })).toBeNull();
  });
});

describe("isOwnerGated — must not over-block ordinary restoration work", () => {
  // This product is about property damage; "owner", "approval" and "gated"
  // are everyday vocabulary in its issues.
  it("does not gate an issue merely mentioning a property owner", () => {
    expect(
      isOwnerGated({
        labels: ["billing"],
        title: "Report shows wrong owner name",
        description: "The property owner requested a gated-community access note in the report.",
      })
    ).toBe(false);
  });

  it("does not gate ordinary approval-flow feature work", () => {
    expect(
      isOwnerGated({
        labels: ["feature"],
        title: "Add an approval step to the scope builder",
        description: "The assessor sends the scope to the insurer, who approves or rejects it.",
      })
    ).toBe(false);
  });

  it("does not gate an issue about agents that states no prohibition", () => {
    expect(
      isOwnerGated({
        labels: [],
        title: "Agents should retry Linear reads once on timeout",
        description: "The loop agent currently gives up after a single failed list_issues call.",
      })
    ).toBe(false);
  });

  it("still returns false when title is present but says nothing gating", () => {
    expect(
      isOwnerGated({ labels: ["bug"], title: "Fix the login button", description: null })
    ).toBe(false);
  });
});
