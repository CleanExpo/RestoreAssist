// @vitest-environment jsdom
/**
 * Runtime pin for public pricing CTAs (RA-7549 / RA-7541 class).
 *
 * A pack "Add to Plan" must not render even if the source-grep tests are
 * skipped. The component only accepts a kind; labels come from the pin.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicPricingCta } from "@/components/pricing/PublicPricingCta";
import {
  PINNED_PUBLIC_MONTHLY_CTA,
  PINNED_PUBLIC_PACK_NOTE,
  PINNED_PUBLIC_TRIAL_CTA,
  PUBLIC_TRIAL_PATH,
  pinPublicPricingCta,
} from "@/lib/signup-pricing-honesty";

describe("PublicPricingCta runtime pin", () => {
  it("trial and monthly are links to /signup with pinned AUD copy", () => {
    const { unmount } = render(<PublicPricingCta kind="trial" />);
    const trial = screen.getByTestId("public-pricing-cta-trial");
    expect(trial).toHaveAttribute("href", PUBLIC_TRIAL_PATH);
    expect(trial).toHaveTextContent(PINNED_PUBLIC_TRIAL_CTA.label);
    unmount();

    render(<PublicPricingCta kind="monthly" />);
    const monthly = screen.getByTestId("public-pricing-cta-monthly");
    expect(monthly).toHaveAttribute("href", PUBLIC_TRIAL_PATH);
    expect(monthly).toHaveTextContent(PINNED_PUBLIC_MONTHLY_CTA.label);
    expect(monthly).toHaveTextContent(/AUD/);
  });

  it("pack is a note, not a purchase link", () => {
    render(<PublicPricingCta kind="pack" />);
    expect(screen.getByTestId("public-pricing-pack-note")).toHaveTextContent(
      PINNED_PUBLIC_PACK_NOTE.label,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add to Plan/i)).not.toBeInTheDocument();
  });

  it("yearly / unknown kinds throw at render (cannot ship)", () => {
    expect(() => render(<PublicPricingCta kind="yearly" />)).toThrow(
      /RA-7549 public pricing CTA fail-closed/,
    );
    expect(() => render(<PublicPricingCta kind="unknown" />)).toThrow(
      /RA-7549 public pricing CTA fail-closed/,
    );
  });
});

describe("pinPublicPricingCta", () => {
  it("throws on pack + null href + Add to Plan", () => {
    expect(() =>
      pinPublicPricingCta({
        kind: "pack",
        href: null,
        label: "Add to Plan",
      }),
    ).toThrow(/purchase CTA/i);
  });

  it("throws on USD presentment", () => {
    expect(() =>
      pinPublicPricingCta({
        kind: "monthly",
        href: PUBLIC_TRIAL_PATH,
        label: "Subscribe — $73.85 USD",
      }),
    ).toThrow(/USD/i);
  });
});
