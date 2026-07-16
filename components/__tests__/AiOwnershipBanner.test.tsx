// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AiOwnershipBanner from "@/components/AiOwnershipBanner";
import {
  AI_OWNERSHIP_STEPPER_HEADING,
  AI_OWNERSHIP_EXPORT_READY,
} from "@/lib/reports/ai-ownership";

afterEach(() => cleanup());

describe("AiOwnershipBanner", () => {
  it("renders ownership stepper when draft is pending", () => {
    render(
      <AiOwnershipBanner
        reportId="r1"
        report={{
          detailedReport: "draft",
          reportOwnershipAcknowledgedAt: null,
          aiDraftHumanEditedAt: null,
        }}
        onAcknowledged={vi.fn()}
      />,
    );
    expect(screen.getByText(AI_OWNERSHIP_STEPPER_HEADING)).toBeInTheDocument();
    expect(screen.getByText("AI draft")).toBeInTheDocument();
    expect(screen.getByText("Rewrite & save")).toBeInTheDocument();
    expect(screen.getByText("Confirm ownership")).toBeInTheDocument();
  });

  it("renders holder-owned success state when already acknowledged", () => {
    render(
      <AiOwnershipBanner
        reportId="r1"
        report={{
          detailedReport: "owned",
          reportOwnershipAcknowledgedAt: new Date().toISOString(),
        }}
        onAcknowledged={vi.fn()}
      />,
    );
    expect(screen.getByText(AI_OWNERSHIP_EXPORT_READY)).toBeInTheDocument();
    expect(
      screen.getByText("Holder-owned — ready to issue"),
    ).toBeInTheDocument();
  });

  it("renders nothing when there is no report body", () => {
    const { container } = render(
      <AiOwnershipBanner
        reportId="r1"
        report={{ detailedReport: null }}
        onAcknowledged={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
