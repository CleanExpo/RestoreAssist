// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HelpArticleCard from "../HelpArticleCard";

describe("HelpArticleCard", () => {
  it("renders title, category, read time", () => {
    render(
      <HelpArticleCard
        title="Your first inspection"
        category="getting-started"
        slug="first-inspection"
        aiSummary="A walkthrough of the first inspection."
        readTimeMin={5}
        updatedAt="2026-05-15"
      />,
    );
    expect(screen.getByText("Your first inspection")).toBeInTheDocument();
    expect(screen.getByText(/getting started/i)).toBeInTheDocument();
    expect(screen.getByText(/5 min/i)).toBeInTheDocument();
  });

  it("links to the article detail page", () => {
    render(
      <HelpArticleCard
        title="X"
        category="inspections"
        slug="photo-cocoa"
        aiSummary="Y"
        readTimeMin={3}
        updatedAt="2026-05-15"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard/help/inspections/photo-cocoa");
  });
});
