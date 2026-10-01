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

  it("renders the ended-trial subscribe banner when hasTrialExpired=true", () => {
    vi.mocked(useTrialStatus).mockReturnValue({
      data: {
        showCountdownBanner: false,
        hasTrialExpired: true,
        lifetimeAccess: false,
        daysRemaining: 0,
      } as any,
      isLoading: false,
    } as any);
    render(<TrialCountdownBanner />);
    expect(
      screen.getByText(/your trial has ended/i),
    ).toBeInTheDocument();
    const link = screen.getByTestId("trial-expired-subscribe");
    expect(link).toHaveAttribute(
      "href",
      "/billing/upgrade?reason=trial-expired",
    );
    expect(link).toHaveTextContent(/subscribe to continue/i);
  });

  it("does not show the ended-trial banner for lifetime access", () => {
    vi.mocked(useTrialStatus).mockReturnValue({
      data: {
        showCountdownBanner: false,
        hasTrialExpired: true,
        lifetimeAccess: true,
        daysRemaining: 0,
      } as any,
      isLoading: false,
    } as any);
    const { container } = render(<TrialCountdownBanner />);
    expect(container.firstChild).toBeNull();
  });
});

it("does not ask a persisted lifetime account to upgrade even with stale trial countdown fields", () => {
  vi.mocked(useTrialStatus).mockReturnValue({
    data: { lifetimeAccess: true, showCountdownBanner: true, daysRemaining: 1 } as any,
    isLoading: false,
  } as any);
  const { container } = render(<TrialCountdownBanner />);
  expect(container.firstChild).toBeNull();
});

it("does not carry another account's dismissal into this account", async () => {
  sessionStorage.setItem("dismissedTrialBanner:account-a", "1");
  const trial = { showCountdownBanner: true, daysRemaining: 2, lifetimeAccess: false };
  vi.mocked(useTrialStatus).mockReturnValue({ accountId: "account-a", data: trial, isLoading: false } as any);
  const { container, rerender } = render(<TrialCountdownBanner />);
  expect(container.firstChild).toBeNull();
  vi.mocked(useTrialStatus).mockReturnValue({ accountId: "account-b", data: trial, isLoading: false } as any);
  rerender(<TrialCountdownBanner />);
  expect(container.textContent).toContain("Upgrade now");
  sessionStorage.clear();
});
