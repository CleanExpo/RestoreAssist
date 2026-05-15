// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HowToDropdown from "../HowToDropdown";

describe("HowToDropdown", () => {
  it("renders the trigger button", () => {
    render(<HowToDropdown />);
    expect(screen.getByRole("button", { name: /how to/i })).toBeInTheDocument();
  });

  it("opens panel on click and lists 8 categories", () => {
    render(<HowToDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /how to/i }));
    // Match the exact category label text — descriptions reuse the same words
    // (e.g. "AI-drafted S500 reports, exports") so a loose /reports/i regex
    // matches multiple nodes. Exact string keeps the assertion on the label.
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText("Inspections")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Clients & Portal")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Integrations")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
  });

  it("has a 'Browse all articles' link", () => {
    render(<HowToDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /how to/i }));
    const link = screen.getByRole("link", { name: /browse all/i });
    expect(link).toHaveAttribute("href", "/dashboard/help");
  });
});
