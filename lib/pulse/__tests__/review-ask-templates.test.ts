import { describe, expect, it } from "vitest";
import { renderReviewAskEmail } from "../templates";

// Google's review-policies prohibit incentivised/gated review requests and
// fabricated urgency. This is a neutral "we'd value your feedback" ask.
const BANNED_VOCAB = [
  "limited time",
  "hurry",
  "act now",
  "don't miss",
  "discount",
  "% off",
  "free gift",
  "reward",
  "voucher",
  "coupon",
  "gift card",
  "bonus",
  "urgent",
  "expires",
];

describe("renderReviewAskEmail", () => {
  const rendered = renderReviewAskEmail(
    "Acme Restoration",
    "NIR-2026-07-0001",
    "https://g.page/r/acme-restoration/review",
  );

  it("carries the templateKey", () => {
    expect(rendered.templateKey).toBe("pulse-review-ask");
  });

  it("contains the firm's Google review URL as the call-to-action link", () => {
    expect(rendered.html).toContain(
      'href="https://g.page/r/acme-restoration/review"',
    );
    expect(rendered.text).toContain(
      "https://g.page/r/acme-restoration/review",
    );
  });

  it("carries the firm name and job reference, and no other job/claim detail", () => {
    expect(rendered.html).toContain("Acme Restoration");
    expect(rendered.html).toContain("NIR-2026-07-0001");
    expect(rendered.text).toContain("Acme Restoration");
    expect(rendered.text).toContain("NIR-2026-07-0001");
  });

  it("contains none of the banned incentive/urgency vocabulary", () => {
    const haystacks = [rendered.subject, rendered.html, rendered.text].map(
      (s) => s.toLowerCase(),
    );
    for (const banned of BANNED_VOCAB) {
      for (const haystack of haystacks) {
        expect(haystack).not.toContain(banned);
      }
    }
  });

  it("escapes HTML in the org name and job reference", () => {
    const withHtml = renderReviewAskEmail(
      '<script>alert(1)</script>',
      '"><img src=x>',
      "https://g.page/r/acme-restoration/review",
    );
    expect(withHtml.html).not.toContain("<script>");
    expect(withHtml.html).not.toContain("<img src=x>");
  });
});
