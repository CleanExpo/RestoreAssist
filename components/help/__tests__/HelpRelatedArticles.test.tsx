// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HelpRelatedArticles } from "@/components/help/HelpRelatedArticles";
import type { LoadedArticle } from "@/lib/help/load-article";

afterEach(() => cleanup());

const photoCocoa = {
  frontmatter: {
    title: "Capture photos with chain-of-custody",
    slug: "photo-cocoa",
    category: "inspections",
  },
  body: "",
} as LoadedArticle;

describe("HelpRelatedArticles", () => {
  it("points public related links at /help, not /dashboard/help", () => {
    render(
      <HelpRelatedArticles
        articles={[photoCocoa]}
        basePath="/help"
        tone="public"
      />,
    );
    expect(screen.getByRole("heading", { name: /Related articles/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /chain-of-custody/i }),
    ).toHaveAttribute("href", "/help/inspections/photo-cocoa");
  });
});
