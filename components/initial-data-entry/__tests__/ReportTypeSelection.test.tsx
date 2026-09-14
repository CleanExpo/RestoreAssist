// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReportTypeSelection } from "@/components/initial-data-entry/ReportTypeSelection";
import { AI_OWNERSHIP_PRE_GENERATE_TITLE } from "@/lib/reports/ai-ownership";
import { BASIC_REPORT_INPUTS_NOTE } from "@/lib/reports/basic-report-inputs";

afterEach(() => cleanup());

describe("ReportTypeSelection honesty", () => {
  it("teaches AI draft ≠ issued and that Basic does not demand photos", () => {
    render(
      <ReportTypeSelection isTrial loading={false} onChoose={vi.fn()} />,
    );
    expect(screen.getByText(AI_OWNERSHIP_PRE_GENERATE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(BASIC_REPORT_INPUTS_NOTE)).toBeInTheDocument();
    expect(
      screen.getByText(/Photos are optional for Basic/i),
    ).toBeInTheDocument();
  });
});
