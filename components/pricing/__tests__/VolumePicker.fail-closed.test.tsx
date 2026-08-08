// @vitest-environment jsdom
/**
 * The COMPONENT-SIDE half of the fail-closed guard.
 *
 * `lib/pricing/__tests__/unit-rate-fail-closed.test.ts` proves the maths module
 * drops a malformed add-on. It could not catch what this file catches, because
 * the picker used to rebuild the ladder itself:
 *
 *     const PACK_SIZES = Object.values(PRICING_CONFIG.addons)
 *       .map((addon) => addon.reportLimit as number)   // <- the cast
 *       .sort((a, b) => a - b);
 *
 * With one non-report add-on in `PRICING_CONFIG.addons` that produced a
 * buyer-facing sentence reading "fixed blocks of 8, 25, 60 and undefined
 * reports", and a rate-card row reading "undefined reports for $11.00 — —",
 * on a page whose entire job is telling somebody what they will pay. The
 * module filter was intact the whole time; the component walked around it.
 *
 * The catalogue below is deliberately MIXED (three good packs, one malformed
 * $11/month add-on of the shape the seven in `lib/billing/addon-registry.ts`
 * have), because a mixed catalogue is the one that renders. An all-malformed
 * catalogue buys nothing and never reaches the copy under test.
 *
 * Own file: `unit-rate.ts` reads the config once at import time, so the mock
 * must be hoisted above the component import.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/pricing", () => ({
  PRICING_CONFIG: {
    pricing: {
      monthly: {
        name: "Monthly Plan",
        displayName: "Monthly",
        amount: 99,
        currency: "AUD",
        interval: "month",
        reportLimit: 50,
        signupBonus: 10,
        features: [],
      },
    },
    addons: {
      pack8: { displayName: "8 Reports Pack", amount: 20, reportLimit: 8 },
      pack25: { displayName: "25 Reports Pack", amount: 50, reportLimit: 25 },
      pack60: { displayName: "60 Reports Pack", amount: 100, reportLimit: 60 },
      // Not in the real catalogue. Present so a green here proves the mock is
      // what the component read, rather than the component quietly rendering
      // the real config and agreeing by accident.
      pack200: { displayName: "200 Reports Pack", amount: 300, reportLimit: 200 },
      // The hole. A recurring add-on with no reportLimit at all.
      voice: { displayName: "ElevenLabs Voice", amount: 11 },
    },
  },
}));

const { VolumePicker } = await import("../VolumePicker");

describe("the picker's pack ladder is filtered, not rebuilt", () => {
  it("reads the mocked catalogue — positive control for this whole file", () => {
    render(<VolumePicker initialReports={152} />);
    // A well-formed pack that exists ONLY in the mock. If this is missing the
    // assertions below are testing the real config and prove nothing.
    expect(screen.getByText(/200 Reports Pack/)).toBeInTheDocument();
  });

  it("never renders a malformed add-on into buyer-facing copy", () => {
    const { container } = render(<VolumePicker initialReports={152} />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("undefined");
    expect(text).not.toContain("ElevenLabs Voice");
    expect(text).not.toContain("$11.00");
    expect(text).not.toContain("$11");
  });

  it("lists only the sellable block sizes in the overshoot sentence", () => {
    const { container } = render(<VolumePicker initialReports={152} />);
    expect(container.textContent).toContain(
      "Packs come in fixed blocks of 8, 25, 60 and 200 reports",
    );
  });

  it("shows one rate-card rung per sellable block, and no more", () => {
    render(<VolumePicker initialReports={152} />);
    const ladder = screen.getByText("Why the rate moves").nextElementSibling;
    expect(ladder).not.toBeNull();
    // The plan plus the four well-formed packs. Five, not six.
    expect(ladder!.querySelectorAll("li")).toHaveLength(5);
    expect(ladder!.textContent).not.toContain("undefined");
    expect(ladder!.textContent).toContain("bought once");
  });
});
