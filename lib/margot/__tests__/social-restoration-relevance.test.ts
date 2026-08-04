import { describe, expect, it } from "vitest";
import {
  assessSocialRestorationRelevance,
  shouldEngageSocialPost,
} from "../social-restoration-relevance";

const MUST_IGNORE = [
  "Just finished a classic car restoration on this 1967 Mustang",
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
        // Fail with context
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
