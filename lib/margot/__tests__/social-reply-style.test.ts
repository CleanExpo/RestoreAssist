import { describe, expect, it } from "vitest";
import {
  checkSocialReplyStyle,
  prepareSocialReply,
  sanitizeSocialReply,
} from "../social-reply-style";

describe("sanitizeSocialReply", () => {
  it("expands contractions and removes apostrophes", () => {
    const out = sanitizeSocialReply("Don't skip moisture maps — they're critical");
    expect(out).not.toMatch(/['\u2018\u2019]/);
    expect(out).not.toContain("—");
    expect(out).not.toContain("–");
    expect(out.toLowerCase()).toContain("do not");
    expect(out.toLowerCase()).toContain("they are");
  });

  it("strips em and en dashes", () => {
    const out = sanitizeSocialReply("Nice tip – short and clear — thanks");
    expect(out).not.toContain("—");
    expect(out).not.toContain("–");
  });
});

describe("checkSocialReplyStyle / prepareSocialReply", () => {
  it("flags AI buzzwords and apostrophes", () => {
    const check = checkSocialReplyStyle(
      "We're excited to leverage this and streamline your workflow",
    );
    expect(check.ok).toBe(false);
    expect(check.issues.length).toBeGreaterThan(0);
  });

  it("prepares a clean human reply", () => {
    const prepared = prepareSocialReply(
      "Water damage jobs get messy fast. How are you capturing readings on site?",
    );
    expect(prepared.canPost).toBe(true);
    expect(prepared.text).not.toMatch(/['\u2018\u2019\u2013\u2014]/);
  });
});
