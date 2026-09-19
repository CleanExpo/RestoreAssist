// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BasicReportWithoutKeyCta } from "@/components/onboarding/BasicReportWithoutKeyCta";
import {
  BASIC_REPORT_CTA_LABEL,
  BASIC_REPORT_PATH,
  BASIC_WITHOUT_KEY_HEADLINE,
} from "@/lib/signup-pricing-honesty";

describe("BasicReportWithoutKeyCta (RA-7549)", () => {
  it("offers Create Basic report without API key and lands on the Basic path", () => {
    render(<BasicReportWithoutKeyCta />);

    expect(screen.getByText(BASIC_WITHOUT_KEY_HEADLINE)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: BASIC_REPORT_CTA_LABEL });
    expect(cta).toHaveAttribute("href", BASIC_REPORT_PATH);
    expect(cta.getAttribute("href")).not.toMatch(/ai-providers|integrations/i);
  });

  it("renders the same labelled path on the dark dashboard variant", () => {
    render(<BasicReportWithoutKeyCta variant="dark" />);

    expect(
      screen.getByRole("link", { name: BASIC_REPORT_CTA_LABEL }),
    ).toHaveAttribute("href", BASIC_REPORT_PATH);
  });
});
