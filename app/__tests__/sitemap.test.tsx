import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const contractorFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { contractorProfile: { findMany: contractorFindMany } },
}));

vi.mock("@/lib/blog/articles", () => ({
  getAllArticles: () => [
    { slug: "published-one", isoDate: "2026-07-09", published: true },
    { slug: "secret-draft", isoDate: "2026-07-10", published: false },
  ],
}));

vi.mock("@/lib/resources", () => ({
  getAllResources: async () => [
    { slug: "a-resource", uploadDate: "2026-06-01T00:00:00+10:00" },
  ],
}));

vi.mock("@/lib/help/load-article", () => ({
  loadAllArticles: async () => [
    {
      frontmatter: {
        slug: "an-article",
        category: "getting-started",
        updatedAt: "2026-05-01",
      },
    },
  ],
}));

const BASE = "https://restoreassist.app";

async function runSitemap() {
  const mod = await import("../sitemap");
  return mod.default();
}

beforeEach(() => {
  vi.resetModules();
  contractorFindMany.mockReset();
  contractorFindMany.mockResolvedValue([
    { slug: "acme-restoration", updatedAt: new Date("2026-08-01") },
  ]);
});

describe("sitemap", () => {
  it("lists the legal and support pages that declare index:true", async () => {
    // These set robots index:true explicitly yet were missing from the sitemap.
    const urls = (await runSitemap()).map((e) => e.url);
    for (const path of ["/privacy", "/terms", "/support"]) {
      expect(urls).toContain(`${BASE}${path}`);
    }
  });

  it("covers each dynamic content source", async () => {
    const urls = (await runSitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/blog/published-one`);
    expect(urls).toContain(`${BASE}/resources/a-resource`);
    expect(urls).toContain(`${BASE}/help/getting-started/an-article`);
    expect(urls).toContain(`${BASE}/contractors/acme-restoration`);
  });

  it("omits unpublished blog drafts, which have no route", async () => {
    const urls = (await runSitemap()).map((e) => e.url);
    expect(urls).not.toContain(`${BASE}/blog/secret-draft`);
  });

  it("asks the database only for publicly visible profiles, and bounds the query", async () => {
    await runSitemap();
    const [args] = contractorFindMany.mock.calls[0];
    expect(args.where).toEqual({ isPubliclyVisible: true });
    expect(args.take).toBeGreaterThan(0);
  });

  it("degrades to a partial sitemap when a source fails", async () => {
    // A database outage must not take the whole sitemap down: the static and
    // filesystem-backed URLs are still worth serving.
    contractorFindMany.mockRejectedValue(new Error("database is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const urls = (await runSitemap()).map((e) => e.url);
    expect(urls).toContain(`${BASE}/pricing`);
    expect(urls).toContain(`${BASE}/blog/published-one`);
    expect(urls.some((u) => u.startsWith(`${BASE}/contractors/`))).toBe(false);
  });

  it("never lists a route that declares noindex", async () => {
    // The general invariant. /login was listed here at priority 0.5 while
    // app/login/layout.tsx declared robots:{index:false} — the sitemap asked
    // Google to index a page the page itself refused. Rather than pinning
    // /login by name, scan the route tree so any future noindex route is
    // caught too.
    const appDir = join(process.cwd(), "app");
    const noindexRoutes: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const full = join(dir, entry.name);
        if (entry.name === "__tests__" || entry.name === "node_modules")
          continue;
        for (const base of ["layout.tsx", "page.tsx"]) {
          const file = join(full, base);
          if (!existsSync(file)) continue;
          const source = readFileSync(file, "utf8");
          if (/index:\s*false/.test(source)) {
            noindexRoutes.push(
              "/" + relative(appDir, full).split(sep).join("/"),
            );
            break;
          }
        }
        walk(full);
      }
    };
    walk(appDir);

    // Guard against a broken scanner passing vacuously.
    expect(noindexRoutes).toContain("/login");

    const urls = (await runSitemap()).map((e) => e.url);
    for (const route of noindexRoutes) {
      const offenders = urls.filter(
        (u) => u === `${BASE}${route}` || u.startsWith(`${BASE}${route}/`),
      );
      expect(
        offenders,
        `${route} declares noindex but is in the sitemap`,
      ).toEqual([]);
    }
  });
});
