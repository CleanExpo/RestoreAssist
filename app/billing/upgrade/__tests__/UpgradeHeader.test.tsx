// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import UpgradeHeader from "../UpgradeHeader";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

afterEach(() => {
  cleanup();
});

describe("UpgradeHeader", () => {
  it("renders trial-expired copy", () => {
    render(<UpgradeHeader reason="trial-expired" />);
    expect(screen.getByText(/trial has ended/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /continue with restoreassist/i }),
    ).toBeInTheDocument();
  });

  it("renders credits copy", () => {
    const { container } = render(<UpgradeHeader reason="credits" />);
    expect(
      within(container).getByText(/you're out of credits/i),
    ).toBeInTheDocument();
  });

  it("renders feature copy with feature name", () => {
    const { container } = render(
      <UpgradeHeader reason="feature" feature="advanced-damage" />,
    );
    expect(
      within(container).getByText(/monthly plan to use advanced-damage/i),
    ).toBeInTheDocument();
  });

  it("renders voluntary copy when no reason", () => {
    render(<UpgradeHeader reason={null} />);
    expect(
      screen.getByRole("heading", { name: /choose a plan/i }),
    ).toBeInTheDocument();
  });

  it("renders brand chrome", () => {
    const { container } = render(<UpgradeHeader reason="trial-expired" />);
    expect(within(container).getByText("RestoreAssist")).toBeInTheDocument();
    expect(
      within(container).getByRole("link", { name: /switch account/i }),
    ).toHaveAttribute("href", "/login");
  });
});
