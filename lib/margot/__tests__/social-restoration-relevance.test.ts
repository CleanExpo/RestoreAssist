import { describe, expect, it } from "vitest";
import {
  assessSocialRestorationRelevance,
  isSocialCommentDraftRequest,
  resolveSocialCommentChatGate,
  shouldEngageSocialPost,
} from "../social-restoration-relevance";

const MUST_IGNORE = [
  "Just finished a classic car restoration on this 1967 Mustang",
  "Any tips for restoring a rusted Toyota Hilux body?",
  "Best teeth restoration clinic in Brisbane for veneers",
  "Dental smile restoration before and after photos",
  "Auto body restoration tips for rust repair",
  "Art restoration of a 19th century oil painting",
  "Furniture restoration and refinishing workshop this weekend",
  "Hair restoration transplant results after 6 months",
  "Wetland habitat restoration project planting day",
  "4K film restoration of a silent movie classic",
  "Watch restoration for a vintage Rolex",
  "How to restore Windows from a backup image",
  "Data restore after ransomware — what tools do you use?",
  "Barn find hot rod garage build restoration",
  "Just love restoration as a hobby word with no context",
];

const MAY_ENGAGE = [
  "Water damage restoration after a burst pipe in a rental",
  "Looking for a mould remediation contractor in Brisbane",
  "Fire damage restoration claim — moisture mapping tips?",
  "IICRC S500 drying goals on a category 2 loss",
  "Storm damage restoration crew hiring techs on the Gold Coast",
  "How do you document structural drying for the insurer?",
  "Contents restoration pack-out workflow for a flood claim",
  "Make-safe after sewage backup — what is your process?",
  "Property restoration company switching from paper moisture logs",
  "Disaster restoration and insurance adjuster coordination tips",
];

describe("assessSocialRestorationRelevance", () => {
  it("ignores all wrong-industry restoration posts (0 false engages)", () => {
    for (const text of MUST_IGNORE) {
      const result = assessSocialRestorationRelevance({ text });
      expect(result.relevant, text).toBe(false);
      expect(["ignore", "unsure"]).toContain(result.decision);
    }
  });

  it("engages clear property restoration posts", () => {
    let engageCount = 0;
    for (const text of MAY_ENGAGE) {
      const result = assessSocialRestorationRelevance({ text });
      if (result.relevant) engageCount += 1;
      else {
        expect(result, text).toMatchObject({ relevant: true });
      }
    }
    expect(engageCount).toBe(MAY_ENGAGE.length);
  });

  it("does not engage on bare restoration alone", () => {
    const result = assessSocialRestorationRelevance({
      text: "Thoughts on restoration?",
    });
    expect(result.relevant).toBe(false);
    expect(result.decision).toBe("ignore");
  });

  it("fails closed on mixed car + water signals", () => {
    const result = assessSocialRestorationRelevance({
      text: "Car restoration after water damage flood in the garage",
    });
    expect(result.relevant).toBe(false);
    expect(result.decision).toBe("unsure");
  });

  it("shouldEngageSocialPost mirrors relevant flag", () => {
    expect(
      shouldEngageSocialPost({
        text: "Water damage restoration contractor hiring",
      }),
    ).toBe(true);
    expect(
      shouldEngageSocialPost({ text: "Classic car restoration for sale" }),
    ).toBe(false);
  });

  it("ignores wrong-industry hashtags even with vague text", () => {
    const result = assessSocialRestorationRelevance({
      text: "Check this out",
      hashtags: ["CarRestoration", "Mustang"],
    });
    expect(result.relevant).toBe(false);
    expect(result.negativeHits.length).toBeGreaterThan(0);
  });

  it("ignores motorcycle restoration", () => {
    const result = assessSocialRestorationRelevance({
      text: "Motorcycle restoration weekend project",
    });
    expect(result.relevant).toBe(false);
  });
});

describe("resolveSocialCommentChatGate", () => {
  it("does not gate ordinary product / tip questions", () => {
    const gate = resolveSocialCommentChatGate(
      "Any tips for restoring a rusted Toyota Hilux body?",
    );
    expect(gate.applyGate).toBe(false);
    expect(gate.refuseReply).toBeNull();
    expect(isSocialCommentDraftRequest("What is RestoreAssist?")).toBe(false);
  });

  it("refuses social drafts on car / teeth posts and explains our restoration", () => {
    const car = resolveSocialCommentChatGate(
      "Draft a LinkedIn comment on this post: Finished a classic car restoration on this Mustang",
    );
    expect(car.applyGate).toBe(true);
    expect(car.canDraft).toBe(false);
    expect(car.refuseReply).toMatch(/will not draft/i);
    expect(car.refuseReply).toMatch(/property and insurance/i);
    expect(car.refuseReply).not.toMatch(/[—–]/);

    const teeth = resolveSocialCommentChatGate(
      "Write a Facebook reply to: Best teeth restoration clinic for veneers in Brisbane",
    );
    expect(teeth.canDraft).toBe(false);
    expect(teeth.refuseReply).toMatch(/teeth|dental|property/i);
  });

  it("allows social drafts on clear property posts", () => {
    const gate = resolveSocialCommentChatGate(
      "Draft a short comment on: Water damage restoration after a burst pipe — moisture mapping tips?",
    );
    expect(gate.applyGate).toBe(true);
    expect(gate.canDraft).toBe(true);
    expect(gate.refuseReply).toBeNull();
  });
});
