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

describe("isOwnerGated — 'human' is a gating subject, like 'founder' and 'owner'", () => {
  // Caught in review of PR #2084: the surrounding patterns accept "human"
  // ("blocked on human", "awaiting human") but the needs-authority pattern
  // listed only founder|owner, so an unlabelled issue titled "needs human
  // approval" scored not-gated and would have been dispatched.
  it("gates an unlabelled issue titled 'needs human approval'", () => {
    expect(
      isOwnerGated({ labels: [], title: "needs human approval", description: null })
    ).toBe(true);
  });

  it("reports the same reason for 'human' as for 'founder' and 'owner'", () => {
    for (const subject of ["founder", "owner", "human"]) {
      expect(
        ownerGateReason({ labels: [], title: `needs ${subject} approval`, description: null })
      ).toBe("text:needs human authority");
    }
  });

  it("gates the other authority words for a human subject", () => {
    for (const title of [
      "needs human sign-off",
      "needs human authorisation",
      "needs the human's decision",
      "need human permission",
    ]) {
      expect(isOwnerGated({ labels: [], title, description: null })).toBe(true);
    }
  });

  it("does not gate ordinary sentences that merely contain the word 'human'", () => {
    expect(
      isOwnerGated({
        labels: ["feature"],
        title: "Make the moisture chart human readable",
        description: "A human reads this report, so round the readings to one decimal.",
      })
    ).toBe(false);
  });
});

describe("isOwnerGated — issues whose own governance section says 'do not patch this'", () => {
  // Found by running the loop against the live RA board on 2026-08-29, after
  // the fixes above had shipped. Four Urgent P0s scored not-gated while each
  // one's Governance section says an agent must not be the one to fix it.
  // Three share wording the gate can read; RA-7256 does not and is not
  // claimed here.

  it("gates RA-7254 on 'Filed, not patched.'", () => {
    expect(
      isOwnerGated({
        labels: [],
        title:
          "P0: pr_release_gate run_tests uses shell=True without pipefail",
        description:
          "## Governance\nChanges release authority -> RA-7120 applies. Filed, not patched.",
      })
    ).toBe(true);
  });

  it("gates RA-7253 on 'Filed rather than patched'", () => {
    expect(
      ownerGateReason({
        labels: [],
        title: "P0: the exact-SHA receipt does not bind the ref being pushed",
        description:
          "Per RA-7120, this changes release authority and needs a human-approved " +
          "design plus an independent review that itself executes. **Filed rather " +
          "than patched** - an agent quietly rewriting the gate that authorises " +
          "its own releases is the failure mode this estate is built to prevent.",
      })
    ).not.toBeNull();
  });

  it("gates 'needs a human-approved design' — article and hyphen included", () => {
    // The pre-existing pattern required whitespace and no article, so it read
    // "needs founder approval" but not "needs a human-approved design".
    expect(
      isOwnerGated({ labels: [], title: "needs a human-approved design", description: null })
    ).toBe(true);
    expect(
      isOwnerGated({ labels: [], title: "needs an owner-approved rollout", description: null })
    ).toBe(true);
  });

  it("gates an issue that says it changes release authority", () => {
    // Release authority is what .claude/RULES.md 29-33 reserves to the owner.
    expect(
      ownerGateReason({
        labels: [],
        title: "Harden the release gate",
        description: "## Governance\nChanges release authority -> RA-7120.",
      })
    ).toBe("text:changes release authority");
  });

  it("gates the 'filed instead of patched' and 'filed, not fixed' variants", () => {
    for (const description of [
      "Filed instead of patched pending review.",
      "Filed, not fixed.",
    ]) {
      expect(isOwnerGated({ labels: [], description })).toBe(true);
    }
  });
});

describe("isOwnerGated — 'filed' and 'patched' are ordinary restoration words", () => {
  // Both new patterns were loosened once and gated these. They are the reason
  // the filed/patched pattern is pinned to the fixed idiom with adjacent words
  // only, rather than allowing anything in between.
  it("does not gate ordinary claim and repair language", () => {
    for (const description of [
      "The claim was filed on Tuesday and the roof was patched on Friday.",
      "Insurer filed the dispute; we have not patched the estimate yet.",
      "The tech filed a report rather than patching the wall himself.",
      "We filed the drywall smooth, not patched it, per S500.",
      "The claim was filed; not patched through to the insurer yet.",
    ]) {
      expect(isOwnerGated({ labels: ["billing"], description })).toBe(false);
    }
  });

  it("does not gate ordinary release or approval vocabulary", () => {
    for (const description of [
      "Release notes are generated from the changelog.",
      "This changes the release notes template.",
      "Owner approval emails are stored against the job.",
      "The human factors review is scheduled for Q3.",
    ]) {
      expect(isOwnerGated({ labels: [], description })).toBe(false);
    }
  });

  it("does not gate 'needs a human tester' — tester is not an authority word", () => {
    expect(
      isOwnerGated({
        labels: [],
        title: "Needs a human tester to confirm the tap target size",
        description: null,
      })
    ).toBe(false);
  });
});
