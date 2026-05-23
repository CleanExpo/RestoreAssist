// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import UpgradeHeader from "../UpgradeHeader";

describe("UpgradeHeader", () => {
  it("renders trial-expired copy", () => {
    render(<UpgradeHeader reason="trial-expired" />);
    expect(screen.getByText(/trial has ended/i)).toBeInTheDocument();
  });
  it("renders credits copy", () => {
    render(<UpgradeHeader reason="credits" />);
    expect(screen.getByText(/out of credits/i)).toBeInTheDocument();
  });
  it("renders feature copy with feature name", () => {
    render(<UpgradeHeader reason="feature" feature="advanced-damage" />);
    expect(screen.getByText(/advanced-damage/i)).toBeInTheDocument();
  });
  it("renders voluntary copy when no reason", () => {
    render(<UpgradeHeader reason={null} />);
    expect(screen.getByText(/choose a plan/i)).toBeInTheDocument();
  });
});
