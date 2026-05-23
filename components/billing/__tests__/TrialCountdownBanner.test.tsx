// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import TrialCountdownBanner from "../TrialCountdownBanner";

vi.mock("@/lib/billing/use-trial-status", () => ({ default: vi.fn() }));
import useTrialStatus from "@/lib/billing/use-trial-status";

describe("TrialCountdownBanner", () => {
  it("renders nothing when showCountdownBanner=false", () => {
    vi.mocked(useTrialStatus).mockReturnValue({
      data: { showCountdownBanner: false, daysRemaining: 10 } as any,
      isLoading: false,
    } as any);
    const { container } = render(<TrialCountdownBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders countdown when showCountdownBanner=true", () => {
    vi.mocked(useTrialStatus).mockReturnValue({
      data: { showCountdownBanner: true, daysRemaining: 2 } as any,
      isLoading: false,
    } as any);
    render(<TrialCountdownBanner />);
    expect(screen.getByText(/2 days left/i)).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    vi.mocked(useTrialStatus).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = render(<TrialCountdownBanner />);
    expect(container.firstChild).toBeNull();
  });
});
