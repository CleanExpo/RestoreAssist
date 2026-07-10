import { describe, it, expect } from "vitest";
import {
  inspectionSubmittedEmail,
  scopeReadyEmail,
  invoiceGeneratedEmail,
  dryingGoalAchievedEmail,
  reportReadyEmail,
  reengagementEmail,
} from "@/lib/email-templates";
import { BRAND } from "@/lib/brand";

const SAMPLE = {
  inspectionNumber: "NIR-2026-03-0042",
  address: "14 Harbour View Terrace, Manly NSW 2095",
  technicianName: "Jordan Blake",
};

/** Every template routes through the same shell — assert the shared shell once per template. */
const ALL = [
  inspectionSubmittedEmail({ ...SAMPLE }),
  scopeReadyEmail({ ...SAMPLE, scopeItemCount: 5 }),
  invoiceGeneratedEmail({
    invoiceNumber: "RA-1",
    address: SAMPLE.address,
    totalIncGST: 100,
    dueDate: "1 Jan 2026",
  }),
  dryingGoalAchievedEmail({ ...SAMPLE, completionDate: "1 Jan 2026" }),
  reportReadyEmail({ ...SAMPLE }),
  reengagementEmail({ recipientName: "Ryan", ctaUrl: "https://x/y" }),
];

describe("shared branded shell (layout + brandFooter)", () => {
  it.each(ALL.map((html, i) => [i, html]))(
    "template %i carries the on-brand navy header and the professional footer",
    (_i, html) => {
      // On-brand palette (CLAUDE.md rule 14), not the old slate/blue.
      expect(html).toContain("#1C2E47"); // navy
      expect(html).toContain("#8A6B4E"); // warm
      expect(html).not.toContain("#0f172a"); // old slate header
      expect(html).not.toContain("#3b82f6"); // old blue accent

      // Professional footer identity, sourced from BRAND.
      expect(html).toContain(BRAND.company.legal);
      expect(html).toContain(BRAND.tagline);
      expect(html).toContain(BRAND.company.supportEmail);
      expect(html).toContain("Designed in Australia");
      expect(html).toContain(`&copy; ${new Date().getFullYear()}`);

      // Structurally complete HTML, no unresolved interpolation.
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("[object Object]");
    },
  );

  it("omits the ABN/address line when neither is configured (no empty 'ABN:' label)", () => {
    // BRAND.company.abn/address default to "" in dev — footer must not print a bare label.
    const html = reportReadyEmail({ ...SAMPLE });
    if (!BRAND.company.abn && !BRAND.company.address) {
      expect(html).not.toMatch(/ABN\s*&nbsp;|ABN\s*<\/p>|ABN\s*·/);
    }
  });
});

describe("reengagementEmail", () => {
  it("greets the recipient and renders a single restart CTA to the given URL", () => {
    const html = reengagementEmail({
      recipientName: "Ryan",
      ctaUrl: "https://restoreassist.app/dashboard/pricing?x=1",
    });
    expect(html).toContain("Hi Ryan,");
    expect(html).toContain("https://restoreassist.app/dashboard/pricing?x=1");
    expect(html).toContain("Restart my subscription");
    // exactly one CTA button
    expect(html.match(/Restart my subscription/g)).toHaveLength(1);
  });

  it("shows the activity note only when provided", () => {
    const withNote = reengagementEmail({
      recipientName: "Ryan",
      ctaUrl: "https://x/y",
      activityNote: "You logged a few inspections last week.",
    });
    expect(withNote).toContain("You logged a few inspections last week.");

    const withoutNote = reengagementEmail({
      recipientName: "Ryan",
      ctaUrl: "https://x/y",
    });
    expect(withoutNote).not.toContain("logged a few inspections");
  });

  it("uses a personal sign-off when senderName is given, else the brand team", () => {
    expect(
      reengagementEmail({ recipientName: "R", ctaUrl: "u", senderName: "Phill" }),
    ).toContain("Phill, RestoreAssist");
    expect(reengagementEmail({ recipientName: "R", ctaUrl: "u" })).toContain(
      "The RestoreAssist team",
    );
  });

  it("escapes HTML in caller-supplied fields (no injection via name)", () => {
    const html = reengagementEmail({
      recipientName: '<img src=x onerror=alert(1)>',
      ctaUrl: "https://x/y",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("stays on-voice — no AI-filler words (marketing-copywriter rule)", () => {
    const html = reengagementEmail({
      recipientName: "Ryan",
      ctaUrl: "https://x/y",
    }).toLowerCase();
    for (const banned of [
      "delve",
      "tapestry",
      "leverage",
      "robust",
      "seamless",
      "elevate",
    ]) {
      expect(html).not.toContain(banned);
    }
  });
});
