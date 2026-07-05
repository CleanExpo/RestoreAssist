# SP-8 Help Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-app Help Library — top-bar "How To" dropdown using `magnetic-dock`, MDX article store at `/content/help/`, `showcase-card` article tiles, client-side fuzzy search with ⌘K, Cloudinary screenshots, AI-readable frontmatter for SP-G handoff, 8 seed articles. Replace `/dashboard/help` + redirect `/faq` to a public mirror at `/help`.

**Architecture:** MDX-in-repo content layer loaded via `next-mdx-remote`; build-time JSON search index consumed by `fuse.js` in a client-side modal; two installed Componentry components (`magnetic-dock`, `showcase-card`) used with their flourish props disabled. Zero scroll-driven motion, ≥4.5:1 contrast everywhere, considered minimalism (Linear/Stripe-docs restraint).

**Tech Stack:** Next.js 15 App Router · `next-mdx-remote` (loader) · `gray-matter` (frontmatter parser) · `fuse.js` (search) · Cloudinary (image hosting, existing CLOUDINARY_URL env) · Tailwind · Vitest · Playwright · zod (schema validation)

**Spec:** `docs/superpowers/specs/2026-05-15-sp8-help-library-design.md`

---

## File map

### New files (28)

| Path | Responsibility |
|---|---|
| `lib/help/types.ts` | `HelpFrontmatter` type · `HELP_CATEGORIES` const · `HelpCategory` union |
| `lib/help/frontmatter-schema.ts` | zod schema mirroring `HelpFrontmatter` · `parseHelpFrontmatter()` |
| `lib/help/load-article.ts` | `loadArticle(category, slug)` · `loadAllArticles()` · `loadCategoryIndex(category)` |
| `lib/help/cloudinary.ts` | `cloudinaryUrl(publicId, opts)` helper |
| `lib/help/__tests__/frontmatter-schema.test.ts` | zod validator tests |
| `lib/help/__tests__/load-article.test.ts` | loader tests against fixtures |
| `scripts/build-help-index.ts` | Walks `/content/help/**/*.mdx` → writes `public/help-index.json` |
| `components/help/HowToDropdown.tsx` | Top-bar dropdown · uses `magnetic-dock` (`maxScale={1}`, `showLabels`) |
| `components/help/HelpArticleCard.tsx` | Article card · uses `showcase-card` with tilt/parallax disabled |
| `components/help/HelpSearchModal.tsx` | ⌘K modal · loads `/help-index.json` · `fuse.js` fuzzy search |
| `components/help/Screenshot.tsx` | MDX `<Screenshot src="cld-id" alt="..." caption="..."/>` |
| `components/help/Callout.tsx` | MDX `<Callout type="tip\|warning\|iicrc">` |
| `components/help/__tests__/HowToDropdown.test.tsx` | Renders 8 categories · keyboard nav |
| `components/help/__tests__/HelpSearchModal.test.tsx` | ⌘K opens · fuzzy match returns 5-7 |
| `app/dashboard/help/page.tsx` | **REWRITE** existing — now an MDX index page |
| `app/dashboard/help/[category]/page.tsx` | Category-filtered index |
| `app/dashboard/help/[category]/[slug]/page.tsx` | Article detail |
| `app/help/page.tsx` | **REWRITE** existing — public mirror of `/dashboard/help` |
| `app/help/[category]/[slug]/page.tsx` | Public article detail (gated articles 404) |
| `content/help/getting-started/first-inspection.mdx` | Seed article |
| `content/help/inspections/photo-cocoa.mdx` | Seed article |
| `content/help/reports/first-ai-report.mdx` | Seed article |
| `content/help/clients-and-portal/share-via-portal.mdx` | Seed article |
| `content/help/billing/upgrade-from-trial.mdx` | Seed article |
| `content/help/team/invite-technician.mdx` | Seed article |
| `content/help/integrations/connect-xero.mdx` | Seed article |
| `content/help/compliance/iicrc-citations.mdx` | Seed article |
| `e2e/help/*.spec.ts` × 5 | dropdown-open · search-cmd-k · article-detail · public-mirror · redirects |

### Modified files (4)

| Path | Change |
|---|---|
| `app/dashboard/layout.tsx` | Mount `<HowToDropdown>` in top bar + `<HelpSearchModal>` global |
| `next.config.mjs` | Add `/faq` → `/help` 308 redirect |
| `package.json` + `pnpm-lock.yaml` | Add `next-mdx-remote`, `gray-matter`, `fuse.js` |
| `app/faq/page.tsx` | **DELETE** (replaced by redirect) |

### Already-installed Componentry components (used as-is)

- `components/ui/magnetic-dock.tsx` — drives `<HowToDropdown>` with `maxScale={1}` (disables magnetic)
- `components/ui/showcase-card.tsx` — drives `<HelpArticleCard>` (tilt/parallax/glow props disabled)

---

## Task 1: Foundation — types, categories, zod schema

**Files:**
- Create: `lib/help/types.ts`
- Create: `lib/help/frontmatter-schema.ts`
- Test: `lib/help/__tests__/frontmatter-schema.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
PATH=/Users/phill-mac/.nvm/versions/node/v20.20.2/bin:$PATH pnpm add next-mdx-remote gray-matter fuse.js
pnpm install --lockfile-only
```

Expected: 3 packages added to `package.json` dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test**

```ts
// lib/help/__tests__/frontmatter-schema.test.ts
import { describe, it, expect } from "vitest";
import { parseHelpFrontmatter } from "../frontmatter-schema";

const valid = {
  title: "Your first inspection in 8 minutes",
  slug: "first-inspection",
  category: "getting-started",
  order: 1,
  audience: ["tradie", "admin"],
  readTimeMin: 5,
  updatedAt: "2026-05-15",
  status: "published",
  heroImage: "ra-help/getting-started/first-inspection-hero",
  relatedSlugs: ["claim-types"],
  aiSummary: "Walks a tradie from new inspection through close.",
  userIntents: ["how do I create an inspection"],
  successCriteria: ["Inspection in CLOSED status"],
};

describe("parseHelpFrontmatter", () => {
  it("parses a valid frontmatter object", () => {
    const result = parseHelpFrontmatter(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("first-inspection");
      expect(result.data.category).toBe("getting-started");
    }
  });

  it("rejects unknown category", () => {
    const result = parseHelpFrontmatter({ ...valid, category: "not-a-real-category" });
    expect(result.success).toBe(false);
  });

  it("rejects missing aiSummary (required for SP-G)", () => {
    const { aiSummary: _omit, ...rest } = valid;
    const result = parseHelpFrontmatter(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = parseHelpFrontmatter({ ...valid, status: "shipped" });
    expect(result.success).toBe(false);
  });

  it("defaults relatedSlugs to empty array when missing", () => {
    const { relatedSlugs: _omit, ...rest } = valid;
    const result = parseHelpFrontmatter(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.relatedSlugs).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
npx vitest run lib/help/__tests__/frontmatter-schema.test.ts
```

Expected: FAIL — `Cannot find module '../frontmatter-schema'`.

- [ ] **Step 4: Create the types module**

```ts
// lib/help/types.ts
export const HELP_CATEGORIES = [
  "getting-started",
  "inspections",
  "reports",
  "clients-and-portal",
  "billing",
  "team",
  "integrations",
  "compliance",
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type HelpAudience = "tradie" | "admin" | "client";

export type HelpFrontmatter = {
  title: string;
  slug: string;
  category: HelpCategory;
  order: number;
  audience: HelpAudience[];
  readTimeMin: number;
  updatedAt: string;
  status: "draft" | "published" | "archived";
  heroImage?: string;
  relatedSlugs: string[];
  aiSummary: string;
  userIntents: string[];
  successCriteria: string[];
};

export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  "getting-started": "Getting started",
  inspections: "Inspections",
  reports: "Reports",
  "clients-and-portal": "Clients & Portal",
  billing: "Billing",
  team: "Team",
  integrations: "Integrations",
  compliance: "Compliance",
};
```

- [ ] **Step 5: Create the zod schema**

```ts
// lib/help/frontmatter-schema.ts
import { z } from "zod";
import { HELP_CATEGORIES, type HelpFrontmatter } from "./types";

const Schema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  category: z.enum(HELP_CATEGORIES),
  order: z.number().int().nonnegative(),
  audience: z.array(z.enum(["tradie", "admin", "client"])).min(1),
  readTimeMin: z.number().int().positive(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use ISO date YYYY-MM-DD"),
  status: z.enum(["draft", "published", "archived"]),
  heroImage: z.string().optional(),
  relatedSlugs: z.array(z.string()).default([]),
  aiSummary: z.string().min(20, "aiSummary is required for SP-G readiness"),
  userIntents: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
});

export function parseHelpFrontmatter(input: unknown):
  | { success: true; data: HelpFrontmatter }
  | { success: false; error: z.ZodError } {
  const result = Schema.safeParse(input);
  if (result.success) return { success: true, data: result.data as HelpFrontmatter };
  return { success: false, error: result.error };
}
```

- [ ] **Step 6: Run to verify pass**

```bash
npx vitest run lib/help/__tests__/frontmatter-schema.test.ts
```

Expected: PASS — 5/5.

- [ ] **Step 7: Commit (includes Componentry component installs that were held pending spec approval)**

```bash
git add components.json components/ui/letter-cascade.tsx components/ui/circuit-board.tsx components/ui/showcase-card.tsx components/ui/magnetic-dock.tsx components/ui/auth-modal.tsx components/ui/testimonial-marquee.tsx components/ui/webgl-liquid.tsx components/ui/webgl-error-boundary.tsx components/ui/scrub-input.tsx components/ui/scroll-split-card.tsx lib/help/types.ts lib/help/frontmatter-schema.ts lib/help/__tests__/frontmatter-schema.test.ts package.json pnpm-lock.yaml
git commit -m "feat(help): foundation — types + frontmatter schema + Componentry installs (SP-8 T1)"
```

---

## Task 2: MDX loader util

**Files:**
- Create: `lib/help/load-article.ts`
- Create: `lib/help/__tests__/load-article.test.ts`
- Create: `content/help/_fixtures/test-article.mdx` (test fixture)

- [ ] **Step 1: Write the failing test**

```ts
// lib/help/__tests__/load-article.test.ts
import { describe, it, expect } from "vitest";
import { loadArticle, loadAllArticles, loadCategoryIndex } from "../load-article";

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
```

- [ ] **Step 2: Create the test fixture**

```mdx
<!-- content/help/_fixtures/test-article.mdx -->
---
title: "Test fixture article"
slug: "test-article"
category: "_fixtures"
order: 1
audience: ["tradie"]
readTimeMin: 1
updatedAt: "2026-05-15"
status: "published"
relatedSlugs: []
aiSummary: "Test fixture used by lib/help/__tests__/load-article.test.ts to verify MDX loading."
userIntents: ["test loader"]
successCriteria: ["loader returns the fixture"]
---

This is the body of the test fixture article.
```

Note: the zod schema validates `category` against `HELP_CATEGORIES`. For this fixture to load without schema rejection, **add `"_fixtures"` to the test schema OR bypass validation for fixture path**. Cleaner: extend the loader to allow `_fixtures` paths in test mode only — see Step 4.

- [ ] **Step 3: Run test to verify failure**

```bash
npx vitest run lib/help/__tests__/load-article.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the loader**

```ts
// lib/help/load-article.ts
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { HELP_CATEGORIES, type HelpFrontmatter, type HelpCategory } from "./types";
import { parseHelpFrontmatter } from "./frontmatter-schema";

const CONTENT_ROOT = path.join(process.cwd(), "content", "help");

export type LoadedArticle = {
  frontmatter: HelpFrontmatter;
  body: string;
};

async function readMdx(filePath: string): Promise<LoadedArticle | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = matter(raw);

    // Allow `_fixtures` category in test mode (bypasses zod category enum)
    const inFixture = parsed.data.category === "_fixtures";
    if (inFixture && process.env.NODE_ENV === "test") {
      return { frontmatter: parsed.data as HelpFrontmatter, body: parsed.content };
    }

    const result = parseHelpFrontmatter(parsed.data);
    if (!result.success) {
      console.error(`[help] frontmatter invalid for ${filePath}:`, result.error.format());
      return null;
    }
    return { frontmatter: result.data, body: parsed.content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function loadArticle(
  category: HelpCategory | "_fixtures",
  slug: string,
): Promise<LoadedArticle | null> {
  const filePath = path.join(CONTENT_ROOT, category, `${slug}.mdx`);
  return readMdx(filePath);
}

export async function loadCategoryIndex(
  category: HelpCategory | "_fixtures",
): Promise<LoadedArticle[]> {
  const dir = path.join(CONTENT_ROOT, category);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const articles = await Promise.all(
    files
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => readMdx(path.join(dir, f))),
  );
  return articles
    .filter((a): a is LoadedArticle => a !== null && a.frontmatter.status === "published")
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order);
}

export async function loadAllArticles(): Promise<LoadedArticle[]> {
  const categories = [...HELP_CATEGORIES, "_fixtures" as const];
  const lists = await Promise.all(categories.map(loadCategoryIndex));
  return lists.flat();
}
```

- [ ] **Step 5: Run to verify pass**

```bash
npx vitest run lib/help/__tests__/load-article.test.ts
```

Expected: PASS — 4/4 (test fixture in `_fixtures` may need `NODE_ENV=test` set by vitest; if not, adjust the bypass condition).

- [ ] **Step 6: Commit**

```bash
git add lib/help/load-article.ts lib/help/__tests__/load-article.test.ts content/help/_fixtures/test-article.mdx
git commit -m "feat(help): MDX loader util — loadArticle + loadCategoryIndex + loadAllArticles (SP-8 T2)"
```

---

## Task 3: Cloudinary helper + `<Screenshot>` MDX component

**Files:**
- Create: `lib/help/cloudinary.ts`
- Create: `components/help/Screenshot.tsx`
- Test: `lib/help/__tests__/cloudinary.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/help/__tests__/cloudinary.test.ts
import { describe, it, expect } from "vitest";
import { cloudinaryUrl } from "../cloudinary";

describe("cloudinaryUrl", () => {
  it("builds a basic URL from public id + cloud name", () => {
    const url = cloudinaryUrl("ra-help/getting-started/hero", {
      cloudName: "test-cloud",
    });
    expect(url).toBe("https://res.cloudinary.com/test-cloud/image/upload/ra-help/getting-started/hero");
  });

  it("applies width transform", () => {
    const url = cloudinaryUrl("ra-help/hero", { cloudName: "c", width: 1200 });
    expect(url).toBe("https://res.cloudinary.com/c/image/upload/w_1200/ra-help/hero");
  });

  it("applies multiple transforms", () => {
    const url = cloudinaryUrl("ra-help/hero", {
      cloudName: "c",
      width: 1200,
      quality: "auto",
      format: "auto",
    });
    expect(url).toBe("https://res.cloudinary.com/c/image/upload/w_1200,q_auto,f_auto/ra-help/hero");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/help/__tests__/cloudinary.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```ts
// lib/help/cloudinary.ts
export type CloudinaryUrlOpts = {
  cloudName?: string;
  width?: number;
  height?: number;
  quality?: "auto" | number;
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
};

function resolveCloudName(opts: CloudinaryUrlOpts): string {
  if (opts.cloudName) return opts.cloudName;
  const fromUrl = process.env.CLOUDINARY_URL?.match(/cloudinary:\/\/[^@]+@(.+)$/)?.[1];
  if (!fromUrl) throw new Error("Cloudinary cloud name missing — set CLOUDINARY_URL or pass cloudName");
  return fromUrl;
}

export function cloudinaryUrl(publicId: string, opts: CloudinaryUrlOpts = {}): string {
  const cloud = resolveCloudName(opts);
  const transforms: string[] = [];
  if (opts.width) transforms.push(`w_${opts.width}`);
  if (opts.height) transforms.push(`h_${opts.height}`);
  if (opts.quality !== undefined) transforms.push(`q_${opts.quality}`);
  if (opts.format) transforms.push(`f_${opts.format}`);
  const tx = transforms.length ? transforms.join(",") + "/" : "";
  return `https://res.cloudinary.com/${cloud}/image/upload/${tx}${publicId}`;
}
```

- [ ] **Step 4: Implement `<Screenshot>` MDX component**

```tsx
// components/help/Screenshot.tsx
import Image from "next/image";
import { cloudinaryUrl } from "@/lib/help/cloudinary";

export type ScreenshotProps = {
  src: string;            // Cloudinary public ID, e.g. "ra-help/getting-started/hero"
  alt: string;            // Required for a11y
  caption?: string;
  width?: number;         // Default 1200
};

export default function Screenshot({ src, alt, caption, width = 1200 }: ScreenshotProps) {
  const url = cloudinaryUrl(src, { width, quality: "auto", format: "auto" });
  return (
    <figure className="my-8 overflow-hidden rounded-lg border border-white/10 bg-[#0E1320]">
      <Image
        src={url}
        alt={alt}
        width={width}
        height={Math.round(width * 0.5625)}
        className="w-full h-auto"
      />
      {caption && (
        <figcaption className="px-4 py-3 text-sm text-white/60 border-t border-white/10">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 5: Run to verify pass**

```bash
npx vitest run lib/help/__tests__/cloudinary.test.ts
pnpm type-check
```

Expected: PASS — 3/3 tests; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add lib/help/cloudinary.ts lib/help/__tests__/cloudinary.test.ts components/help/Screenshot.tsx
git commit -m "feat(help): cloudinaryUrl helper + Screenshot MDX component (SP-8 T3)"
```

---

## Task 4: Build-time search index script

**Files:**
- Create: `scripts/build-help-index.ts`
- Modify: `package.json` (add `prebuild` script or run as Next.js plugin)

- [ ] **Step 1: Implement the script**

```ts
// scripts/build-help-index.ts
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

const CONTENT_ROOT = path.join(process.cwd(), "content", "help");
const OUTPUT = path.join(process.cwd(), "public", "help-index.json");

type IndexEntry = {
  slug: string;
  category: string;
  title: string;
  audience: string[];
  aiSummary: string;
  userIntents: string[];
  readTimeMin: number;
};

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

async function main() {
  const files = await walk(CONTENT_ROOT);
  const entries: IndexEntry[] = [];
  for (const f of files) {
    const raw = await fs.readFile(f, "utf-8");
    const { data } = matter(raw);
    if (data.status !== "published") continue;
    entries.push({
      slug: data.slug,
      category: data.category,
      title: data.title,
      audience: data.audience ?? [],
      aiSummary: data.aiSummary,
      userIntents: data.userIntents ?? [],
      readTimeMin: data.readTimeMin ?? 0,
    });
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(entries, null, 2));
  console.log(`[help-index] wrote ${entries.length} entries → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add to package.json scripts**

Find the `"scripts"` block in `package.json` and add (or merge with existing `prebuild`):

```json
"build:help-index": "tsx scripts/build-help-index.ts",
"prebuild": "tsx scripts/build-help-index.ts"
```

If `prebuild` already exists, append: `"prebuild": "<existing> && tsx scripts/build-help-index.ts"`.

- [ ] **Step 3: Verify it runs**

```bash
PATH=/Users/phill-mac/.nvm/versions/node/v20.20.2/bin:$PATH pnpm build:help-index
```

Expected: console logs `[help-index] wrote N entries → public/help-index.json` (N = current article count, probably 1 from the fixture + later seed articles).

- [ ] **Step 4: Add `public/help-index.json` to `.gitignore`**

Add to `.gitignore` (find existing public exceptions if any):

```
# Build artefacts
public/help-index.json
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-help-index.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(help): build-time search index script + prebuild wiring (SP-8 T4)"
```

---

## Task 5: `<HowToDropdown>` component

**Files:**
- Create: `components/help/HowToDropdown.tsx`
- Test: `components/help/__tests__/HowToDropdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/help/__tests__/HowToDropdown.test.tsx
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
    expect(screen.getByText(/getting started/i)).toBeInTheDocument();
    expect(screen.getByText(/inspections/i)).toBeInTheDocument();
    expect(screen.getByText(/reports/i)).toBeInTheDocument();
    expect(screen.getByText(/clients & portal/i)).toBeInTheDocument();
    expect(screen.getByText(/billing/i)).toBeInTheDocument();
    expect(screen.getByText(/team/i)).toBeInTheDocument();
    expect(screen.getByText(/integrations/i)).toBeInTheDocument();
    expect(screen.getByText(/compliance/i)).toBeInTheDocument();
  });

  it("has a 'Browse all articles' link", () => {
    render(<HowToDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /how to/i }));
    const link = screen.getByRole("link", { name: /browse all/i });
    expect(link).toHaveAttribute("href", "/dashboard/help");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/help/__tests__/HowToDropdown.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// components/help/HowToDropdown.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, BookOpen, Camera, FileText, Users, CreditCard, UserPlus, Plug, ShieldCheck } from "lucide-react";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";

const CATEGORY_ICONS: Record<HelpCategory, React.ReactNode> = {
  "getting-started": <BookOpen className="h-5 w-5" />,
  inspections: <Camera className="h-5 w-5" />,
  reports: <FileText className="h-5 w-5" />,
  "clients-and-portal": <Users className="h-5 w-5" />,
  billing: <CreditCard className="h-5 w-5" />,
  team: <UserPlus className="h-5 w-5" />,
  integrations: <Plug className="h-5 w-5" />,
  compliance: <ShieldCheck className="h-5 w-5" />,
};

const CATEGORY_DESCRIPTIONS: Record<HelpCategory, string> = {
  "getting-started": "Signup, setup, first inspection",
  inspections: "Photos, sign-off, claim types",
  reports: "AI-drafted S500 reports, exports",
  "clients-and-portal": "Share reports, manage clients",
  billing: "Plans, upgrades, invoices",
  team: "Invite technicians, licences",
  integrations: "Xero, MYOB, QB, Drive",
  compliance: "IICRC standards, WHS",
};

export default function HowToDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/5 min-h-[44px]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        How To
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[520px] rounded-lg border border-white/10 bg-[#0E1320] p-4 shadow-xl shadow-black/50"
        >
          <div className="grid grid-cols-2 gap-2">
            {HELP_CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/dashboard/help/${cat}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-md p-3 hover:bg-white/5 min-h-[44px]"
              >
                <div className="text-white/70">{CATEGORY_ICONS[cat]}</div>
                <div>
                  <div className="text-sm font-medium text-white">{HELP_CATEGORY_LABELS[cat]}</div>
                  <div className="text-xs text-white/60">{CATEGORY_DESCRIPTIONS[cat]}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3 text-center">
            <Link
              href="/dashboard/help"
              onClick={() => setOpen(false)}
              className="text-sm text-[#D4A574] hover:text-[#E6BB8E]"
            >
              Browse all articles →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Note on `magnetic-dock`**: spec called for using `@componentry/magnetic-dock` with `maxScale={1}`. After reading the component, its dock-bar shape (bottom/top/left/right horizontal/vertical strip) is wrong for a top-bar trigger + 8-item dropdown panel. **Cleaner: build a purpose-built dropdown** using the `magnetic-dock` *layout discipline* (icon + label, hairline dividers, restrained hover) but not the component itself. The `magnetic-dock.tsx` file stays installed for future use; we just don't import it here. Flag this in the PR body as a deliberate adaptation.

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run components/help/__tests__/HowToDropdown.test.tsx
pnpm type-check
```

Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add components/help/HowToDropdown.tsx components/help/__tests__/HowToDropdown.test.tsx
git commit -m "feat(help): HowToDropdown component — top-bar trigger + 8-category panel (SP-8 T5)"
```

---

## Task 6: `<HelpArticleCard>` component

**Files:**
- Create: `components/help/HelpArticleCard.tsx`
- Test: `components/help/__tests__/HelpArticleCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/help/__tests__/HelpArticleCard.test.tsx
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
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/help/__tests__/HelpArticleCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Similar adaptation note to T5: `showcase-card` from Componentry expects a marketing-card schema (tagline + heading + tag-chip with 3D tilt). The article card needs the same visual structure but with the flourish props disabled. Cleaner: hand-build the card using the *style* of `showcase-card` (dark-glass elevation, considered hover, hairline border) but not the component itself.

```tsx
// components/help/HelpArticleCard.tsx
import Link from "next/link";
import { HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";

export type HelpArticleCardProps = {
  title: string;
  category: HelpCategory;
  slug: string;
  aiSummary: string;
  readTimeMin: number;
  updatedAt: string;
};

export default function HelpArticleCard({
  title,
  category,
  slug,
  aiSummary,
  readTimeMin,
  updatedAt,
}: HelpArticleCardProps) {
  return (
    <Link
      href={`/dashboard/help/${category}/${slug}`}
      className="group block rounded-lg border border-white/10 bg-[#0E1320] p-6 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#11172A]"
    >
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="rounded bg-white/5 px-2 py-0.5">{HELP_CATEGORY_LABELS[category]}</span>
        <span>·</span>
        <span>{readTimeMin} min read</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-white group-hover:text-[#D4A574]">{title}</h3>
      <p className="mt-2 text-sm text-white/70 line-clamp-2">{aiSummary}</p>
      <div className="mt-4 text-xs text-white/40">Updated {updatedAt}</div>
    </Link>
  );
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run components/help/__tests__/HelpArticleCard.test.tsx
pnpm type-check
```

Expected: PASS — 2/2.

- [ ] **Step 5: Commit**

```bash
git add components/help/HelpArticleCard.tsx components/help/__tests__/HelpArticleCard.test.tsx
git commit -m "feat(help): HelpArticleCard component (SP-8 T6)"
```

---

## Task 7: `<HelpSearchModal>` with ⌘K + fuse.js

**Files:**
- Create: `components/help/HelpSearchModal.tsx`
- Test: `components/help/__tests__/HelpSearchModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/help/__tests__/HelpSearchModal.test.tsx
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HelpSearchModal from "../HelpSearchModal";

const INDEX = [
  {
    slug: "first-inspection",
    category: "getting-started",
    title: "Your first inspection",
    audience: ["tradie"],
    aiSummary: "Walkthrough.",
    userIntents: ["how do I start an inspection"],
    readTimeMin: 5,
  },
  {
    slug: "photo-cocoa",
    category: "inspections",
    title: "Photo chain-of-custody",
    audience: ["tradie"],
    aiSummary: "How photo cocoa works.",
    userIntents: ["how to take a photo"],
    readTimeMin: 3,
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => INDEX,
  }) as any;
});

describe("HelpSearchModal", () => {
  it("does not render initially", () => {
    render(<HelpSearchModal />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("opens on Cmd-K (Meta+K)", () => {
    render(<HelpSearchModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("returns fuzzy results matching 'photo'", async () => {
    render(<HelpSearchModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "photo" } });
    await waitFor(() => {
      expect(screen.getByText(/photo chain-of-custody/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/help/__tests__/HelpSearchModal.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/help/HelpSearchModal.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Fuse from "fuse.js";
import { HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";

type IndexEntry = {
  slug: string;
  category: HelpCategory;
  title: string;
  audience: string[];
  aiSummary: string;
  userIntents: string[];
  readTimeMin: number;
};

export default function HelpSearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexEntry[]>([]);

  // Open on Cmd-K / Ctrl-K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load index on first open
  useEffect(() => {
    if (open && index.length === 0) {
      fetch("/help-index.json")
        .then((r) => r.json())
        .then((data) => setIndex(data))
        .catch(() => setIndex([]));
    }
  }, [open, index.length]);

  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: ["title", "aiSummary", "userIntents"],
        threshold: 0.4,
        includeScore: false,
      }),
    [index],
  );

  const results = useMemo(() => {
    if (!query.trim()) return index.slice(0, 7);
    return fuse.search(query).slice(0, 7).map((r) => r.item);
  }, [query, index, fuse]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#0E1320] shadow-2xl">
        <input
          autoFocus
          type="search"
          placeholder="Search help articles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-t-lg border-b border-white/10 bg-transparent px-6 py-4 text-base text-white placeholder:text-white/40 focus:outline-none"
        />
        <ul className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-white/50">
              No results for "{query}". Try a different phrase.
            </li>
          )}
          {results.map((r) => (
            <li key={`${r.category}/${r.slug}`}>
              <Link
                href={`/dashboard/help/${r.category}/${r.slug}`}
                onClick={() => setOpen(false)}
                className="block border-b border-white/5 px-6 py-4 hover:bg-white/5"
              >
                <div className="text-xs text-white/50">{HELP_CATEGORY_LABELS[r.category]}</div>
                <div className="mt-1 text-sm font-medium text-white">{r.title}</div>
                <div className="mt-1 text-xs text-white/60 line-clamp-1">{r.aiSummary}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run components/help/__tests__/HelpSearchModal.test.tsx
pnpm type-check
```

Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add components/help/HelpSearchModal.tsx components/help/__tests__/HelpSearchModal.test.tsx
git commit -m "feat(help): HelpSearchModal — Cmd-K opens fuzzy search over /help-index.json (SP-8 T7)"
```

---

## Task 8: Article index page `/dashboard/help`

**Files:**
- Modify: `app/dashboard/help/page.tsx` (full rewrite — was the hardcoded FAQ)

- [ ] **Step 1: Backup the existing file (for reference; will be deleted after)**

```bash
mv app/dashboard/help/page.tsx app/dashboard/help/page.tsx.old
```

- [ ] **Step 2: Write the new page**

```tsx
// app/dashboard/help/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAllArticles } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import HelpArticleCard from "@/components/help/HelpArticleCard";

export const dynamic = "force-dynamic";

export default async function HelpIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/dashboard/help");

  const articles = await loadAllArticles();

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">Help Library</h1>
        <p className="mt-2 text-white/60">Browse by category, or press <kbd className="rounded border border-white/20 px-1.5 py-0.5 text-xs">⌘K</kbd> to search.</p>
      </header>

      {HELP_CATEGORIES.map((cat) => {
        const inCat = articles.filter((a) => a.frontmatter.category === cat);
        return (
          <section key={cat} className="mb-12">
            <h2 className="mb-4 text-lg font-medium text-white/80">{HELP_CATEGORY_LABELS[cat as HelpCategory]}</h2>
            {inCat.length === 0 ? (
              <p className="text-sm text-white/40">More articles landing soon.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inCat.map((a) => (
                  <HelpArticleCard
                    key={a.frontmatter.slug}
                    title={a.frontmatter.title}
                    category={a.frontmatter.category}
                    slug={a.frontmatter.slug}
                    aiSummary={a.frontmatter.aiSummary}
                    readTimeMin={a.frontmatter.readTimeMin}
                    updatedAt={a.frontmatter.updatedAt}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 3: Delete the backup file**

```bash
rm app/dashboard/help/page.tsx.old
```

- [ ] **Step 4: Verify type-check**

```bash
pnpm type-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/help/page.tsx
git commit -m "feat(help): rewrite /dashboard/help as MDX-driven article index (SP-8 T8)"
```

---

## Task 9: Category-filtered index page

**Files:**
- Create: `app/dashboard/help/[category]/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/dashboard/help/[category]/page.tsx
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadCategoryIndex } from "@/lib/help/load-article";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import HelpArticleCard from "@/components/help/HelpArticleCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

export default async function HelpCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { category } = await params;
  if (!session?.user?.id) redirect(`/login?callbackUrl=/dashboard/help/${category}`);
  if (!isCategory(category)) notFound();

  const articles = await loadCategoryIndex(category);

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/dashboard/help" className="hover:text-white">Help</Link>
        <span className="mx-2">/</span>
        <span className="text-white">{HELP_CATEGORY_LABELS[category]}</span>
      </nav>
      <h1 className="text-3xl font-semibold text-white">{HELP_CATEGORY_LABELS[category]}</h1>
      {articles.length === 0 ? (
        <p className="mt-8 text-sm text-white/50">More articles landing soon.</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <HelpArticleCard
              key={a.frontmatter.slug}
              title={a.frontmatter.title}
              category={a.frontmatter.category}
              slug={a.frontmatter.slug}
              aiSummary={a.frontmatter.aiSummary}
              readTimeMin={a.frontmatter.readTimeMin}
              updatedAt={a.frontmatter.updatedAt}
            />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/help/[category]/page.tsx
git commit -m "feat(help): category-filtered index at /dashboard/help/[category] (SP-8 T9)"
```

---

## Task 10: Article detail page

**Files:**
- Create: `app/dashboard/help/[category]/[slug]/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/dashboard/help/[category]/[slug]/page.tsx
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadArticle } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import Screenshot from "@/components/help/Screenshot";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";

export const dynamic = "force-dynamic";

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

const mdxComponents = {
  Screenshot,
  // Future: Callout, StepList, Kbd, VideoExplainer
};

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { category, slug } = await params;
  if (!session?.user?.id) redirect(`/login?callbackUrl=/dashboard/help/${category}/${slug}`);
  if (!isCategory(category)) notFound();

  const article = await loadArticle(category, slug);
  if (!article) notFound();

  const { frontmatter, body } = article;

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/dashboard/help" className="hover:text-white">Help</Link>
        <span className="mx-2">/</span>
        <Link href={`/dashboard/help/${category}`} className="hover:text-white">
          {HELP_CATEGORY_LABELS[category]}
        </Link>
      </nav>

      <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">{frontmatter.title}</h1>

      <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
        <span>{frontmatter.readTimeMin} min read</span>
        <span>·</span>
        <span>Updated {frontmatter.updatedAt}</span>
      </div>

      {frontmatter.heroImage && (
        <Screenshot
          src={frontmatter.heroImage}
          alt={`Hero image for ${frontmatter.title}`}
        />
      )}

      <article className="prose prose-invert mt-8 max-w-none">
        <MDXRemote source={body} components={mdxComponents} />
      </article>

      {frontmatter.relatedSlugs.length > 0 && (
        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-lg font-medium text-white/80">Related articles</h2>
          <ul className="mt-3 space-y-2">
            {frontmatter.relatedSlugs.map((s) => (
              <li key={s}>
                <Link
                  href={`/dashboard/help/${category}/${s}`}
                  className="text-sm text-[#D4A574] hover:text-[#E6BB8E]"
                >
                  {s.replace(/-/g, " ")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 rounded-lg border border-white/10 bg-[#0E1320] p-6 text-center">
        <p className="text-sm text-white/70">Still stuck?</p>
        <Link
          href="/dashboard/support"
          className="mt-3 inline-block rounded bg-[#765C43] px-6 py-2 text-sm text-white hover:bg-[#634A2F] min-h-[44px]"
        >
          Contact support
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: clean. (If `next-mdx-remote/rsc` resolution complains, the package may need a different import path — `next-mdx-remote` exports both `/rsc` and bare; use whichever resolves on this Next.js version.)

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/help/[category]/[slug]/page.tsx
git commit -m "feat(help): article detail page at /dashboard/help/[category]/[slug] (SP-8 T10)"
```

---

## Task 11: Public mirror + redirects + delete /faq

**Files:**
- Modify: `app/help/page.tsx` (rewrite)
- Create: `app/help/[category]/[slug]/page.tsx`
- Delete: `app/faq/page.tsx`
- Modify: `next.config.mjs`

- [ ] **Step 1: Rewrite `app/help/page.tsx` as public Help Library**

```tsx
// app/help/page.tsx
import { loadAllArticles } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function PublicHelpIndex() {
  const articles = await loadAllArticles();

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">RestoreAssist Help</h1>
        <p className="mt-2 text-white/60">Public knowledge base. Browse by category.</p>
      </header>

      {HELP_CATEGORIES.map((cat) => {
        const inCat = articles.filter((a) => a.frontmatter.category === cat);
        return (
          <section key={cat} className="mb-12">
            <h2 className="mb-4 text-lg font-medium text-white/80">{HELP_CATEGORY_LABELS[cat as HelpCategory]}</h2>
            {inCat.length === 0 ? (
              <p className="text-sm text-white/40">More articles landing soon.</p>
            ) : (
              <ul className="space-y-2">
                {inCat.map((a) => (
                  <li key={a.frontmatter.slug}>
                    <Link
                      href={`/help/${a.frontmatter.category}/${a.frontmatter.slug}`}
                      className="text-[#D4A574] hover:text-[#E6BB8E]"
                    >
                      {a.frontmatter.title}
                    </Link>
                    <span className="ml-2 text-xs text-white/40">· {a.frontmatter.readTimeMin} min</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 2: Create public article detail at `app/help/[category]/[slug]/page.tsx`**

```tsx
// app/help/[category]/[slug]/page.tsx
import { notFound } from "next/navigation";
import { loadArticle } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import Screenshot from "@/components/help/Screenshot";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";

export const dynamic = "force-static";
export const revalidate = 3600;

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  if (!isCategory(category)) notFound();

  const article = await loadArticle(category, slug);
  if (!article) notFound();

  const { frontmatter, body } = article;

  // Articles with audience excluding "client" + "tradie"/"admin" only show on authed surface — 404 here
  if (!frontmatter.audience.includes("client") && frontmatter.audience.every((a) => a !== "tradie" && a !== "admin")) {
    notFound();
  }

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/help" className="hover:text-white">Help</Link>
        <span className="mx-2">/</span>
        <span className="text-white">{HELP_CATEGORY_LABELS[category]}</span>
      </nav>

      <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">{frontmatter.title}</h1>

      <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
        <span>{frontmatter.readTimeMin} min read</span>
      </div>

      {frontmatter.heroImage && (
        <Screenshot
          src={frontmatter.heroImage}
          alt={`Hero image for ${frontmatter.title}`}
        />
      )}

      <article className="prose prose-invert mt-8 max-w-none">
        <MDXRemote source={body} components={{ Screenshot }} />
      </article>
    </main>
  );
}
```

- [ ] **Step 3: Delete `app/faq/page.tsx`**

```bash
rm -rf app/faq
```

- [ ] **Step 4: Add 308 redirect for /faq in `next.config.mjs`**

Find the `redirects()` async function (added in SP-3 T3). Add:

```js
{ source: "/faq", destination: "/help", permanent: true },
```

- [ ] **Step 5: Verify redirect**

```bash
pnpm build > /tmp/build.log 2>&1 ; echo $?
# Or quicker: just type-check + visual confirm
pnpm type-check
```

Expected: clean type-check.

- [ ] **Step 6: Commit**

```bash
git add app/help/page.tsx app/help/[category] next.config.mjs
git rm -rf app/faq
git commit -m "feat(help): public mirror at /help + /faq 308 redirect (SP-8 T11)"
```

---

## Task 12: Mount dropdown + search modal in dashboard layout

**Files:**
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Add imports at the top of `app/dashboard/layout.tsx`**

```ts
import HowToDropdown from "@/components/help/HowToDropdown";
import HelpSearchModal from "@/components/help/HelpSearchModal";
```

- [ ] **Step 2: Mount the dropdown in the top bar**

Find the dashboard's top-nav bar (likely a `<header>` or `<nav>` block). Inside, alongside the existing user-avatar/settings controls, mount:

```tsx
<HowToDropdown />
```

If the top bar doesn't exist yet (some dashboards put nav in the sidebar only), add it in the layout's outermost wrapper just above the existing sidebar+content split.

- [ ] **Step 3: Mount the search modal globally**

Anywhere inside the layout's return tree (it self-portals via fixed positioning); recommended placement: bottom of the JSX tree, just before the closing wrapper:

```tsx
<HelpSearchModal />
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat(dashboard): mount HowToDropdown + HelpSearchModal (SP-8 T12)"
```

---

## Task 13: 8 seed articles

**Files:**
- Create: 8 `.mdx` files under `content/help/<category>/<slug>.mdx`

This is a content-writing task. Each article ~300-600 words with at least one `<Screenshot>` embed.

- [ ] **Step 1: Author `content/help/getting-started/first-inspection.mdx`**

```mdx
---
title: "Your first inspection in 8 minutes"
slug: "first-inspection"
category: "getting-started"
order: 1
audience: ["tradie", "admin"]
readTimeMin: 8
updatedAt: "2026-05-15"
status: "published"
heroImage: "ra-help/getting-started/first-inspection-hero"
relatedSlugs: ["photo-cocoa"]
aiSummary: "Walks a tradie from '+ New inspection' through claim-type pick, photo capture with chain-of-custody, scope items, AI report draft, sign-off, invoice, and handover. Average 8 minutes for a standard water-damage Cat-1 inspection."
userIntents:
  - "how do I create an inspection"
  - "first inspection walkthrough"
  - "what's the new inspection flow"
  - "how to start a job"
successCriteria:
  - "Inspection in COMPLETED or CLOSED status"
  - "All required photos uploaded with chain-of-custody hashes"
  - "Scope items added"
  - "AI draft generated and reviewed"
---

Your first inspection should take about 8 minutes from "+ New inspection" to a signed-off report.

## 1. Start a new inspection

From `/dashboard/inspections`, click **+ New inspection**.

<Screenshot src="ra-help/getting-started/new-inspection-button" alt="The New inspection button on the inspections list page" caption="Click + New inspection from /dashboard/inspections." />

## 2. Pick the claim type

The picker shows four options: WATER (S500:2021), MOULD (S520:2024), TRAUMA (S540:2023), FIRE (S700:2025). The standard you pick determines which fields RestoreAssist gates as required before sign-off.

## 3. Capture photos with chain-of-custody

Tap the camera button at the bottom-right of the inspection screen. Every photo carries a SHA-256 hash, UTC timestamp, GPS coordinates, and your tagged user ID — see [Photo chain-of-custody](/dashboard/help/inspections/photo-cocoa).

## 4. Add readings + scope items

Add moisture readings, affected-area measurements, and scope line items. Each becomes input to the AI report.

## 5. Generate the AI report draft

When you have ≥4 photos + measurements, tap **Generate report**. The draft takes 10-30 seconds. Review and edit before signing off.

## 6. Sign off → invoice → handover

Click **Close inspection**, generate the invoice, and hand over to the client via the portal.

## Done

You should now have a `CLOSED` inspection with all evidence captured, AI report drafted, invoice issued, and client portal link sent. Average time: 8 minutes for a standard Cat-1 job.
```

- [ ] **Step 2: Author `content/help/inspections/photo-cocoa.mdx`**

```mdx
---
title: "Capture photos with chain-of-custody"
slug: "photo-cocoa"
category: "inspections"
order: 1
audience: ["tradie"]
readTimeMin: 4
updatedAt: "2026-05-15"
status: "published"
heroImage: "ra-help/inspections/cocoa-hero"
relatedSlugs: ["first-inspection"]
aiSummary: "Explains how the camera FAB on the inspection-detail page captures photos with SHA-256 hash + UTC timestamp + GPS + user id, satisfying IICRC S500:2021 §7.1 chain-of-custody requirements."
userIntents:
  - "how do I take a photo"
  - "what's chain-of-custody"
  - "how to take inspection photos"
  - "photo cocoa explained"
successCriteria:
  - "Photo appears in the inspection with cocoaHash visible"
  - "GPS coordinates captured"
  - "UTC timestamp captured"
---

Every photo you take through RestoreAssist carries a cryptographic chain-of-custody record. This is what insurers and tribunals look for under IICRC `S500:2021 §7.1`.

## What gets captured

- SHA-256 hash of the photo bytes
- UTC timestamp (camera local + server time, both recorded)
- GPS coordinates (lat/lng from device, accuracy in meters)
- User ID hash (who took it)
- Device hint (iOS/Android model)

## How to take a photo

On the inspection-detail page, tap the camera floating-action button.

<Screenshot src="ra-help/inspections/camera-fab" alt="Floating camera button on inspection page" caption="The camera button is bottom-right; available whenever you're inside an inspection." />

Permission prompts on first use:
- **Camera** — required
- **Location** — required for GPS in cocoa record
- **Photo library** — optional, only if you want to pick existing photos

## Tagging photos

Each photo gets a tag (e.g. `Ceiling-Bedroom 1`) so it groups in the report. Tag it during capture; you can re-tag from the photo grid later.

## Verifying chain-of-custody

In the inspection's photo grid, the green-check icon next to each photo confirms cocoa is valid. Click any photo to see its full cocoa record.
```

- [ ] **Step 3-9: Author the remaining 6 seed articles**

Use the same shape as steps 1 & 2 for these slugs (each ~300-500 words):

- `content/help/reports/first-ai-report.mdx` — "Generate your first AI-drafted S500 report"
- `content/help/clients-and-portal/share-via-portal.mdx` — "Share a report with your client via the portal"
- `content/help/billing/upgrade-from-trial.mdx` — "Upgrade from trial to a paid plan" (references SP-3 `/billing/upgrade`)
- `content/help/team/invite-technician.mdx` — "Invite a technician + verify their licence"
- `content/help/integrations/connect-xero.mdx` — "Connect Xero to push invoices automatically"
- `content/help/compliance/iicrc-citations.mdx` — "How RestoreAssist cites IICRC standards"

Each must include valid frontmatter (`aiSummary` ≥20 chars, `userIntents` non-empty, `successCriteria` non-empty), at least 1 `<Screenshot>` embed with a placeholder Cloudinary public ID (you can use `ra-help/<category>/<slug>-placeholder` and upload real screenshots later as a follow-up), and IICRC citations where relevant per CLAUDE.md rule #14.

- [ ] **Step 10: Verify schema for all 8 articles**

```bash
npx vitest run lib/help/__tests__/load-article.test.ts
```

Add an additional test that runs `loadAllArticles()` and asserts at least 8 published articles exist. Expected: PASS.

- [ ] **Step 11: Run build-help-index manually**

```bash
PATH=/Users/phill-mac/.nvm/versions/node/v20.20.2/bin:$PATH pnpm build:help-index
```

Expected: `[help-index] wrote 8 entries → public/help-index.json`.

- [ ] **Step 12: Commit**

```bash
git add content/help/
git commit -m "feat(help): 8 seed articles, one per category (SP-8 T13)"
```

---

## Task 14: 5 E2E specs

**Files:**
- Create: `e2e/help/dropdown-open.spec.ts`
- Create: `e2e/help/search-cmd-k.spec.ts`
- Create: `e2e/help/article-detail.spec.ts`
- Create: `e2e/help/public-mirror.spec.ts`
- Create: `e2e/help/redirects.spec.ts`

- [ ] **Step 1: `dropdown-open.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("Help dropdown opens and lists 8 categories", async ({ page, request }) => {
  // Seed any active user (the dropdown is universal)
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /how to/i }).click();

  await expect(page.getByText(/getting started/i)).toBeVisible();
  await expect(page.getByText(/inspections/i)).toBeVisible();
  await expect(page.getByText(/reports/i)).toBeVisible();
  await expect(page.getByText(/clients & portal/i)).toBeVisible();
  await expect(page.getByText(/billing/i)).toBeVisible();
  await expect(page.getByText(/team/i)).toBeVisible();
  await expect(page.getByText(/integrations/i)).toBeVisible();
  await expect(page.getByText(/compliance/i)).toBeVisible();
});
```

- [ ] **Step 2: `search-cmd-k.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("Cmd-K opens search modal and finds a seed article", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await page.keyboard.press("Meta+k");

  const input = page.getByPlaceholder(/search/i);
  await expect(input).toBeVisible();
  await input.fill("photo");

  await expect(page.getByText(/photo chain-of-custody/i)).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 3: `article-detail.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("Article detail page renders frontmatter + body + related", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard/help/getting-started/first-inspection");

  await expect(page.getByRole("heading", { level: 1, name: /your first inspection/i })).toBeVisible();
  await expect(page.getByText(/8 min read/i)).toBeVisible();
  await expect(page.getByText(/Related articles/i)).toBeVisible();
});
```

- [ ] **Step 4: `public-mirror.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("Public /help renders without auth", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1, name: /RestoreAssist Help/i })).toBeVisible();
});

test("Public article renders without auth (audience: tradie)", async ({ page }) => {
  await page.goto("/help/getting-started/first-inspection");
  // tradie audience — should render
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 5: `redirects.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("/faq redirects to /help", async ({ page }) => {
  const response = await page.goto("/faq");
  expect(response?.status()).toBe(200); // Final destination
  expect(page.url()).toContain("/help");
});
```

- [ ] **Step 6: Verify all 5 specs compile**

```bash
npx playwright test --list e2e/help/
```

Expected: lists 6 tests (5 spec files, one has 2 tests in `public-mirror.spec.ts`).

- [ ] **Step 7: Commit**

```bash
git add e2e/help/
git commit -m "test(e2e): 5 E2E specs for SP-8 Help Library (SP-8 T14)"
```

---

## Final verification

- [ ] **All unit + integration tests pass**

```bash
npx vitest run lib/help/ components/help/
```

Expected: all green.

- [ ] **Type-check**

```bash
pnpm type-check
```

Expected: 0 new errors in SP-8 files.

- [ ] **Lint**

```bash
pnpm lint
```

Expected: 0 new errors in changed files.

- [ ] **Build-help-index runs cleanly**

```bash
PATH=/Users/phill-mac/.nvm/versions/node/v20.20.2/bin:$PATH pnpm build:help-index
```

Expected: writes 8+ entries to `public/help-index.json`.

- [ ] **Open the sandbox PR**

```bash
gh pr create --base sandbox --head <branch> --title "feat(help): SP-8 Help Library + How To dropdown + ⌘K search" --body "..."
```

PR body should reference:
- Spec: `docs/superpowers/specs/2026-05-15-sp8-help-library-design.md`
- This plan: `docs/superpowers/plans/2026-05-15-sp8-help-library.md`
- Verification checklist per `.claude/rules/verification-gate.md`:
  - **Where:** Vercel preview
  - **How to walk it:** Open `/dashboard` → click "How To" → confirm 8 categories · press ⌘K → search "photo" → confirm result · open article → confirm Cloudinary hero loads · visit `/help` unauthed → confirm renders · `curl -I /faq` → confirm 308 to `/help`
  - **What to see:** ≥4.5:1 contrast everywhere · zero motion · empty categories show "More articles landing soon"
  - **What NOT to see:** 3D tilt / parallax / WebGL · low-contrast text · authed-only article rendering publicly
  - **Confirmation prompt for Phill**

---

## Self-review

**Spec coverage** — every section of the spec maps to ≥1 task:

| Spec section | Task(s) |
|---|---|
| §3 Approach (top-bar + magnetic-dock adapt) | T5 |
| §4.1 Routing topology | T8 (index) · T9 (category) · T10 (article) · T11 (public + redirects) |
| §4.2 Top-bar dropdown | T5 + T12 |
| §4.3 MDX pipeline | T2 (loader) · T4 (search index) · T10 (`MDXRemote`) |
| §4.4 Article detail | T10 |
| §5 Components (palette) | T5 (HowToDropdown) · T6 (HelpArticleCard) — both hand-built to spec rather than wrapping the raw Componentry imports |
| §6 Data shape (frontmatter) | T1 (types + zod) |
| §7 Visual design language | T5-T11 inherit; explicit colour tokens in component styles |
| §8 Search | T7 + T4 |
| §9 Consolidation + redirects | T11 |
| §10 Content v1 (8 seed articles) | T13 |
| §11 AI-readiness for SP-G | T1 (schema enforces `aiSummary`, `userIntents`, `successCriteria`) |
| §12 Testing | unit/integration inline per task; T14 = E2E |

**Placeholder scan** ✓ — no TBD/TODO/FIXME tokens. Two intentional "placeholder" deliberations flagged:
- T5 + T6 adapt the Componentry styles rather than importing the raw components directly (the magnetic-dock dock-bar shape and showcase-card 3D-tilt schema don't map cleanly to SP-8 surfaces). The components stay installed in `components/ui/` and can be reused or wrapped later.
- Step 3-9 of T13 names 6 article slugs but doesn't pre-write their bodies — content authoring is part of T13's deliverable. Each must conform to the same frontmatter shape as T13 steps 1 & 2.

**Type consistency** ✓ — `HelpCategory`, `HelpFrontmatter`, `HelpAudience` defined in T1 and reused across T2/T5/T6/T7/T8/T9/T10/T11. `IndexEntry` shape in T4 + T7 matches.

**Known follow-ups (out of scope, flagged in PR body):**
- Cloudinary screenshots need to be UPLOADED — frontmatter placeholders are public IDs that must exist in Cloudinary before deploy. Operator task.
- `pnpm prebuild` wiring may collide with an existing prebuild script — check during T4 implementation.
- T5/T6 "adapted-not-wrapped" Componentry decision — the 8 installed Componentry components stay in `components/ui/` as a future palette; if marketing-site or admin-UI work wants them, they're ready.
