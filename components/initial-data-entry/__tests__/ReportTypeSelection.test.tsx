// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReportTypeSelection } from "@/components/initial-data-entry/ReportTypeSelection";
import { AI_OWNERSHIP_PRE_GENERATE_TITLE } from "@/lib/reports/ai-ownership";
import { BASIC_REPORT_INPUTS_NOTE } from "@/lib/reports/basic-report-inputs";
import { findPrerequisiteClaims } from "@/lib/reports/__tests__/prerequisite-claims";

afterEach(() => cleanup());

describe("ReportTypeSelection honesty", () => {
  it("teaches AI draft ≠ issued and that Basic does not demand photos", () => {
    const { container } = render(
      <ReportTypeSelection isTrial loading={false} onChoose={vi.fn()} />,
    );
    expect(screen.getByText(AI_OWNERSHIP_PRE_GENERATE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/AI draft is not a signed or issued report/i)).toBeInTheDocument();
    expect(screen.getByText(BASIC_REPORT_INPUTS_NOTE)).toBeInTheDocument();
    // Independent literal: the constant above could be reworded to demand
    // photos and still match itself.
    expect(
      screen.getByText(
        /Photos and an in-progress inspection status are optional for Basic/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Photos are optional for Basic/i),
    ).toBeInTheDocument();
    expect(findPrerequisiteClaims(container.textContent ?? "")).toEqual([]);
  });
});
