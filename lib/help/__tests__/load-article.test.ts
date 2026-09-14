import { describe, it, expect } from "vitest";
import {
  loadArticle,
  loadAllArticles,
  loadCategoryIndex,
  resolveRelatedArticles,
} from "../load-article";

describe("loadArticle", () => {
  it("loads and parses a valid fixture", async () => {
    const article = await loadArticle("_fixtures", "test-article");
    expect(article).not.toBeNull();
    expect(article!.frontmatter.title).toBe("Test fixture article");
    expect(article!.frontmatter.category).toBe("_fixtures");
    expect(article!.body).toContain("This is the body");
  });

  it("returns null for missing slug", async () => {
    const article = await loadArticle("_fixtures", "does-not-exist");
    expect(article).toBeNull();
  });
});

describe("loadCategoryIndex", () => {
  it("returns articles for a category sorted by order", async () => {
    const articles = await loadCategoryIndex("_fixtures");
    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0].frontmatter.slug).toBe("test-article");
  });

  it("returns empty array for empty category", async () => {
    const articles = await loadCategoryIndex("compliance");
    expect(Array.isArray(articles)).toBe(true);
  });
});

describe("loadAllArticles", () => {
  it("returns articles across all categories", async () => {
    const all = await loadAllArticles();
    expect(Array.isArray(all)).toBe(true);
    const slugs = all.map((a) => a.frontmatter.slug);
    expect(slugs).toContain("test-article");
  });
});

describe("resolveRelatedArticles", () => {
  it("resolves slugs from other categories", async () => {
    const related = await resolveRelatedArticles(["photo-cocoa", "first-inspection"]);
    expect(related.map((a) => a.frontmatter.slug)).toEqual([
      "photo-cocoa",
      "first-inspection",
    ]);
    expect(related[0].frontmatter.category).toBe("inspections");
    expect(related[1].frontmatter.category).toBe("getting-started");
  });
});

describe("RA-7550 help honesty", () => {
  it("published bodies do not send anonymous readers to /dashboard/help", async () => {
    const articles = await loadAllArticles();
    for (const article of articles) {
      if (article.frontmatter.category === "_fixtures") continue;
      expect(
        article.body,
        `${article.frontmatter.slug} still links to /dashboard/help`,
      ).not.toMatch(/\]\(\/dashboard\/help/);
    }
  });

  it("first-ai-report does not demand photos or IN_PROGRESS for Basic", async () => {
    const article = await loadArticle("reports", "first-ai-report");
    expect(article).not.toBeNull();
    expect(article!.body).not.toMatch(/inspection in `IN_PROGRESS`/i);
    expect(article!.body).not.toMatch(/at least 4 photos/i);
    expect(article!.body).not.toMatch(/stays disabled until/i);
    expect(article!.body).toMatch(/optional for Basic/i);
    expect(article!.body).toMatch(/AI draft/i);
    expect(article!.body).toMatch(/issued/i);
    expect(article!.body).toMatch(/Quick Fill/i);
  });

  it("first-inspection does not demand four photos before generate", async () => {
    const article = await loadArticle("getting-started", "first-inspection");
    expect(article).not.toBeNull();
    expect(article!.body).not.toMatch(/≥4 photos/i);
    expect(article!.body).not.toMatch(/stays disabled until/i);
    expect(article!.body).toMatch(/optional for a \*\*Basic\*\*/i);
    expect(article!.body).toMatch(/\/help\/reports\/first-ai-report/);
  });
});
