import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { getAllResources, getResourceBySlug } from "@/lib/resources";

/**
 * Regression cover for the loader path.
 *
 * `lib/resources.ts` read `content/resources`, but the articles live at
 * `data/content/resources`. The loader guards a missing directory by returning
 * `[]`, so the mismatch was silent: `getAllResources()` returned nothing,
 * `generateStaticParams()` emitted zero routes, and every article was
 * unreachable without a single error anywhere.
 *
 * The count assertion below is derived from disk, not hardcoded, so adding an
 * article cannot make this test stale. It fails against the unfixed loader
 * (0 !== the number of files present).
 */
const RESOURCES_DIR = path.join(process.cwd(), "data", "content", "resources");

function articleFilesOnDisk(): string[] {
  return fs.readdirSync(RESOURCES_DIR).filter((f) => f.endsWith(".json"));
}

describe("resource article loader", () => {
  it("loads every article that exists on disk", async () => {
    const onDisk = articleFilesOnDisk();
    const loaded = await getAllResources();

    // Guard the guard: a suite that passes against an empty corpus proves nothing.
    expect(onDisk.length).toBeGreaterThan(0);
    expect(loaded).toHaveLength(onDisk.length);
  });

  it("gives every article the fields the page renders", async () => {
    const loaded = await getAllResources();

    for (const article of loaded) {
      expect(article.slug, "slug").toBeTruthy();
      expect(article.title, `title for ${article.slug}`).toBeTruthy();
      expect(article.transcript, `transcript for ${article.slug}`).toBeTruthy();
      expect(article.uploadDate, `uploadDate for ${article.slug}`).toBeTruthy();
    }
  });

  it("resolves an article by its slug", async () => {
    const [first] = await getAllResources();
    expect(first).toBeDefined();

    const found = await getResourceBySlug(first.slug);
    expect(found?.slug).toBe(first.slug);
  });

  it("returns null for a slug that does not exist", async () => {
    expect(await getResourceBySlug("no-such-article-slug")).toBeNull();
  });
});
