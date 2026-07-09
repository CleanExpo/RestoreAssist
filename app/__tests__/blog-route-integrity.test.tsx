// @vitest-environment jsdom
//
// Blog route-integrity + no-dead-links guard.
//
// Guarantees that every article card on the /blog listing resolves to a real,
// published route — so shipping (or unpublishing) an article can never leave a
// dead link on the funnel.
//
// It combines three existing repo patterns:
//   - Rendered link-walk (app/__tests__/funnel-launch-assets.test.tsx): render
//     the listing with next/link mocked to a plain <a> and read the hrefs.
//   - Filesystem existence (app/api/__tests__/checkout-gst-guard.test.ts):
//     existsSync + readFileSync(join(repoRoot, ...)) against the route file.
//   - Data source of truth (lib/blog/articles.ts): the published-slug set that
//     generateStaticParams() pre-renders and notFound() gates against.

import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getAllArticles,
  getArticleBySlug,
  getPublishedSlugs,
} from "@/lib/blog/articles";

// ── Stubs (mirror funnel-launch-assets.test.tsx) ─────────────────────────────
vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(
      (
        {
          children,
          initial: _initial,
          animate: _animate,
          whileInView: _whileInView,
          whileHover: _whileHover,
          whileTap: _whileTap,
          viewport: _viewport,
          transition: _transition,
          ...rest
        }: Record<string, unknown>,
        ref: unknown,
      ) =>
        React.createElement(tag, { ref, ...rest }, children as React.ReactNode),
    );
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// next/link → plain <a> so anchor-href assertions see real hrefs.
vi.mock("next/link", () => {
  const React = require("react");
  return {
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children as React.ReactNode),
  };
});

vi.mock("@/components/landing/Header", () => ({
  default: () => {
    const React = require("react");
    return React.createElement("header", { "data-testid": "header-stub" });
  },
}));
vi.mock("@/components/landing/Footer", () => ({
  default: () => {
    const React = require("react");
    return React.createElement("footer", { "data-testid": "footer-stub" });
  },
}));

import BlogPage from "../blog/page";

const repoRoot = join(__dirname, "..", "..");
const DYNAMIC_ROUTE_FILE = join(repoRoot, "app/blog/[slug]/page.tsx");
const ARTICLE_SHELL_FILE = join(repoRoot, "app/blog/[slug]/BlogArticle.tsx");

/** Render the listing and return every /blog/<slug> href it links to. */
function collectArticleHrefs(): string[] {
  const { container, unmount } = render(<BlogPage />);
  const hrefs = Array.from(container.querySelectorAll("a"))
    .map((a) => a.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("/blog/") && href !== "/blog");
  unmount();
  return hrefs;
}

describe("blog route integrity", () => {
  it("the dynamic article route + client shell exist on disk", () => {
    expect(existsSync(DYNAMIC_ROUTE_FILE)).toBe(true);
    expect(existsSync(ARTICLE_SHELL_FILE)).toBe(true);
  });

  it("the route wires static params + a notFound gate to the published slugs", () => {
    const source = readFileSync(DYNAMIC_ROUTE_FILE, "utf8");
    // Pre-renders one route per published slug...
    expect(source).toContain("generateStaticParams");
    expect(source).toContain("getPublishedSlugs");
    // ...and any unknown slug 404s instead of rendering a broken page.
    expect(source).toContain("notFound");
  });

  it("publishes at least four articles (task floor of 4-6)", () => {
    expect(getPublishedSlugs().length).toBeGreaterThanOrEqual(4);
  });

  it("every article link on the listing resolves to a real, published route", () => {
    const hrefs = collectArticleHrefs();
    expect(hrefs.length).toBeGreaterThan(0);
    const publishedSlugs = new Set(getPublishedSlugs());

    for (const href of hrefs) {
      const slug = href.replace(/^\/blog\//, "");
      // The single dynamic route file serves every article URL.
      expect(existsSync(DYNAMIC_ROUTE_FILE)).toBe(true);
      // The slug is one generateStaticParams() pre-renders, so notFound() never fires.
      expect(publishedSlugs.has(slug)).toBe(true);
      expect(getArticleBySlug(slug)).toBeDefined();
    }
  });

  it("every published article has exactly one card link (no orphans, no duplicates)", () => {
    const hrefs = collectArticleHrefs();
    for (const slug of getPublishedSlugs()) {
      const matches = hrefs.filter((href) => href === `/blog/${slug}`);
      expect(matches).toHaveLength(1);
    }
  });

  it("the listing renders no dead href=\"#\" links", () => {
    const { container, unmount } = render(<BlogPage />);
    const dead = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "#",
    );
    expect(dead).toHaveLength(0);
    unmount();
  });

  it("every published article carries SEO-critical metadata", () => {
    for (const article of getAllArticles().filter((a) => a.published)) {
      expect(article.slug).toMatch(/^[a-z0-9-]+$/);
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.description.length).toBeGreaterThan(0);
      expect(article.description.length).toBeLessThanOrEqual(200);
      expect(article.keywords.length).toBeGreaterThan(0);
      // Launch publication date per the task brief.
      expect(article.isoDate).toBe("2026-07-09");
    }
  });
});
