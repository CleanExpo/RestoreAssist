import { describe, it, expect } from "vitest";
import {
  loadArticle,
  loadAllArticles,
  loadCategoryIndex,
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
