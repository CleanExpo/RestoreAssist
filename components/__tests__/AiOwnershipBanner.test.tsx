// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AiOwnershipBanner from "@/components/AiOwnershipBanner";
import { AI_OWNERSHIP_BANNER_TITLE } from "@/lib/reports/ai-ownership";

afterEach(() => cleanup());

describe("AiOwnershipBanner", () => {
  it("renders when draft is pending", () => {
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
    expect(screen.getByText(AI_OWNERSHIP_BANNER_TITLE)).toBeInTheDocument();
  });

  it("renders nothing when already acknowledged", () => {
    const { container } = render(
      <AiOwnershipBanner
        reportId="r1"
        report={{
          detailedReport: "owned",
          reportOwnershipAcknowledgedAt: new Date().toISOString(),
        }}
        onAcknowledged={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
