# SP-8 — Help Library + "How To" dropdown

> **Sub-project #8.** In-app, content-rich, designer-quality Help Library. Ships the foundation that **SP-G AI Setup Agent** (Feature B, follow-up) will read.

**Status:** brainstormed 2026-05-15 · awaiting Phill spec review → writing-plans handoff.
**Spec author:** Claude Opus 4.7 + senior product designer agent (Componentry curation).

---

## 1. Context

The user's framing: *"We need a full dropdown for all 'How To' built and filled with everything. This also needs Images to make it easy along with the ability for AI (Like Claude Chrome Desktop) to setup for the clients."* Decomposed during brainstorm into Feature A (this spec — Help Library) and Feature B (SP-G AI Setup Agent — separate spec, follow-up).

Existing in-repo help surfaces today are fragmented:

| Path | Today |
|---|---|
| `app/dashboard/help/page.tsx` | 15kB · hardcoded FAQ array · ~10 entries · ReactMarkdown · accordion |
| `app/help/page.tsx` | Marketing-style public FAQ (framer-motion, dark-mode toggle) |
| `app/faq/page.tsx` | Yet another public FAQ |
| `app/dashboard/support/`, `app/support/` | Support contact forms (out of scope) |
| `app/api/support/route.ts` | Backing API for contact form |
| `components/help/HelpButton.tsx`, `HelpTooltip.tsx` | Inline help UI primitives |
| `components/IICRCComplianceHelper.tsx` | IICRC-specific helper |
| `components/onboarding/ProductTour.tsx` + `/api/user/product-tour/route.ts` | Guided tour, already mounted |

Three competing FAQ surfaces, ~10% feature coverage, no images, no AI-readable structure. SP-8 consolidates these into a single MDX-driven library reachable from a top-bar **How To** dropdown (using the `@componentry/magnetic-dock` pattern, restrained), with `showcase-card` article tiles, client-side fuzzy search, and frontmatter that SP-G can read directly.

---

## 2. Scope

### 2.1 In scope (Wave 1 ship)

- **Top-bar "How To" dropdown** in `app/dashboard/layout.tsx` using `magnetic-dock` (magnetic scale stripped — restraint over flourish).
- **8 top-level categories**: Getting started · Inspections · Reports · Clients & Portal · Billing · Team · Integrations · Compliance.
- **MDX article store** at `/content/help/<category>/<slug>.mdx` with YAML frontmatter (including AI fields for SP-G).
- **Article index page** at `/dashboard/help` using `showcase-card` (3D tilt + parallax + mouse-glow disabled).
- **Article detail page** at `/dashboard/help/[category]/[slug]` — typography-led, plain Cloudinary hero (zero motion).
- **Public mirror** at `/help/[category]/[slug]` rendering the same MDX content (with auth-gated articles redacted).
- **Client-side fuzzy search** with `fuse.js` + build-time JSON index + ⌘K modal.
- **8 seed articles** — one hero article per category, content authored by Phill + Claude during impl.
- **Image pipeline** — Cloudinary public IDs in frontmatter, rendered via Next.js `<Image>`.
- **Existing-page consolidation**: `/dashboard/help` page rewritten; `/faq` and `/help` 308-redirected to the new `/help` public Help Library index.
- **AI-readiness frontmatter** so SP-G doesn't need a separate metadata pass.

### 2.2 Out of scope (SP-G or future Wave)

- **SP-G AI Setup Agent** itself — a separate brainstorm (already queued as task #279).
- **Server-side full-text search** (deferred; ship when ~500+ articles).
- **AI-powered semantic search at the help library surface** (SP-G subsumes).
- **Admin CMS / content-editor UI** (MDX-in-repo means Phill edits in his editor; no admin UI needed).
- **Multi-language content** (English / AU only for v1).
- **Inline article comments / feedback voting** (defer; possibly add a thumbs up/down in v2).
- **Support contact forms / `app/api/support/route.ts`** — untouched.
- **Existing onboarding `ProductTour.tsx`** — untouched (complementary, not consolidated).
- **Articles 9+** (initial ship is 8 seed articles; more drop in via async content PRs over the following 2 weeks).

---

## 3. Approach (locked)

A single **top-bar dropdown** drives navigation to a unified Help Library at `/dashboard/help`. Articles are MDX files in the repo, loaded at build time, image-rich via Cloudinary, frontmatter-tagged for AI consumption. Public mirror at `/help` redirects `/faq` and the old marketing `/help` for clean SEO + bookmarks.

The Componentry palette is curated by a senior product designer agent. Of the 9 installed components, **2 KEEPS** (magnetic-dock, showcase-card), **4 DEFERS** (letter-cascade, auth-modal, testimonial-marquee, scroll-split-card), **3 REJECTS** (circuit-board, webgl-liquid, scrub-input). The design language: *considered minimalism with zero animation* — Linear / Stripe-docs restraint, not marketing-page flourish.

---

## 4. Architecture

### 4.1 Routing topology

```
DASHBOARD (AUTHED)
/dashboard/help                                 ← article index (showcase-card grid)
/dashboard/help/[category]                      ← category index (same grid, filtered)
/dashboard/help/[category]/[slug]               ← article detail page

PUBLIC (UNAUTHED + ANONYMOUS-OK)
/help                                           ← public Help Library index
/help/[category]/[slug]                         ← public article (gated articles 404 here)

API
/api/help/index                                 ← search index JSON (build-time generated)
/api/help/search?q=...                          ← optional v1.5 server-side search (out of scope)

REDIRECTS (next.config.mjs)
/faq                  → 308 /help
/help (current)       → unchanged (REPLACED with the new public Help Library)
```

### 4.2 Top-bar dropdown

Wired in `app/dashboard/layout.tsx`. New component `components/help/HowToDropdown.tsx` consumes the `magnetic-dock` primitive (magnetic scale stripped via prop or fork). Trigger: `How To ▾` button in the dashboard header. Panel: 520px-wide, 2-column grid of 8 categories with icon + label + 1-line description + a "Browse all N articles" footer link. ⌘K opens the search modal anywhere.

### 4.3 MDX pipeline

- **Source:** `/content/help/<category>/<slug>.mdx`
- **Loader:** `@next/mdx` or `next-mdx-remote` (decide during impl; reuse whichever already exists in RA — check `package.json`).
- **Components in MDX scope:** `<Screenshot>`, `<VideoExplainer slug="...">` (links to existing onboarding videos), `<Callout type="tip|warning|iicrc">`, `<StepList>`, `<Kbd>`.
- **Build-time index:** `scripts/build-help-index.ts` reads all .mdx files, extracts frontmatter + body summary, writes `public/help-index.json` (~50-100KB) consumed by fuse.js client-side.
- **Image pipeline:** frontmatter carries Cloudinary public IDs (`heroImage: "ra-help/getting-started/first-inspection-hero"`). MDX `<Screenshot>` resolves to Next.js `<Image src={cld.url(...)} ... />`.

### 4.4 Article detail page

Typography-led, no motion. Layout:
- Breadcrumb: `Help / Getting started / Your first inspection`
- 34px display headline
- Byline strip: read-time + last-updated + category chip
- Body width: 680px max · line-height: 1.7 · base font 16px (17px on desktop)
- Cloudinary hero image immediately after byline, with caption (no scroll-driven parallax)
- IICRC citations styled as inline `code` per CLAUDE.md rule #14
- Related articles footer (from frontmatter `relatedSlugs`)
- "Still stuck? Contact us" CTA → `/dashboard/support`

---

## 5. Components (curated palette — 2 KEEPS only)

### 5.1 KEEP — `magnetic-dock` (already installed at `components/ui/magnetic-dock.tsx`)

**Used by:** top-bar "How To" dropdown panel — 8 categories laid out in 2 columns.
**Restraint:** the magnetic-scale effect is **disabled** (overboard for nav). Keep the layout discipline, hairline dividers, hover lift.

### 5.2 KEEP — `showcase-card` (already installed at `components/ui/showcase-card.tsx`)

**Used by:** article-index card grid on `/dashboard/help` and `/help`.
**Restraint:** 3D tilt + parallax + mouse-tracking glow **disabled**. Keep the dark-glass elevation + tagline + heading + tag-chip structure.

### 5.3 DEFER (not in SP-8, banked for future)

| Component | Banked for |
|---|---|
| `letter-cascade` | Marketing-site hero rewrite |
| `auth-modal` | Future auth UX pass |
| `testimonial-marquee` | Marketing-site social-proof band |
| `scroll-split-card` | Possibly a "feature highlight" on the marketing site |

### 5.4 REJECT (not in any near-term SP-8/marketing surface)

| Component | Rationale |
|---|---|
| `circuit-board` | System-architecture diagram — wrong for help-library |
| `webgl-liquid` | iPad mid-inspection battery/thermal — explicit overboard |
| `scrub-input` | Drag-to-scrub numeric input — no SP-8 JTBD |

---

## 6. Data shape (MDX frontmatter)

Every article carries this frontmatter. Fields marked `[AI]` are consumed by SP-G AI Setup Agent — they let the agent answer questions without reading every article body.

```yaml
---
title: "Your first inspection in 8 minutes"
slug: "first-inspection"
category: "getting-started"
order: 1
audience: ["tradie", "admin"]                     # role-filtering
readTimeMin: 5
updatedAt: "2026-05-15"
status: "published"                               # draft | published | archived
heroImage: "ra-help/getting-started/first-inspection-hero"  # Cloudinary public ID
relatedSlugs: ["claim-types", "evidence-capture"]

# AI fields (consumed by SP-G)
aiSummary: |                                      # [AI] 1-paragraph exec summary the agent reads first
  Walks a tradie from "+ New inspection" through claim-type pick, photo capture
  with chain-of-custody, scope items, AI draft, sign-off, and close. Average
  8 minutes for a standard water-damage Cat-1 inspection.
userIntents:                                      # [AI] phrasing variants — agent matches against
  - "how do I create an inspection"
  - "first inspection walkthrough"
  - "what's the new inspection flow"
  - "how to start a job"
successCriteria:                                  # [AI] what "done" looks like
  - "Inspection in COMPLETED or CLOSED status"
  - "All required photos uploaded with chain-of-custody hashes"
  - "Scope items added"
  - "AI draft generated and reviewed"
---

# Article body (MDX from here)
...
```

### Type definition at `lib/help/types.ts`

```ts
export type HelpFrontmatter = {
  title: string;
  slug: string;
  category: HelpCategory;
  order: number;
  audience: ("tradie" | "admin" | "client")[];
  readTimeMin: number;
  updatedAt: string;          // ISO date
  status: "draft" | "published" | "archived";
  heroImage?: string;         // Cloudinary public ID
  relatedSlugs: string[];
  aiSummary: string;
  userIntents: string[];
  successCriteria: string[];
};

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
```

---

## 7. Visual design language

Locked via senior designer agent + user approval on `curation-v1.html` mockup:

- **Surface palette (post-Wave-2 RA tokens):** navy `#1C2E47` · warm `#765C43` (bumped from `#8A6B4E` per Wave 2 WCAG fix) · light `#D4A574` · dark bg `#050505`
- **Authed dashboard surface:** `#050505` base, `#0E1320` cards, hairline `rgba(255,255,255,0.08)` dividers
- **Typography:** body text `#F2F4F8` on `#050505` = ~17:1 contrast (well past WCAG AA's 4.5:1 floor)
- **Spacing scale:** 4 / 8 / 16 / 24 / 32 / 48 px (no others)
- **Motion budget:** 120-160ms ease for hover lifts. **Zero scroll-driven motion, zero WebGL, zero marquees, zero 3D-tilt.** Hover = +1px translate + border lift. That's the entire motion vocabulary.
- **Hover/focus states:** every interactive element has a visible focus ring (WCAG 2.4.7), brand-aligned not browser-default
- **Empty states:** quiet glyph + echoed query + single "Ask the team" CTA. Never apologetic, never blank.

---

## 8. Search (Wave 1)

**Client-side fuzzy search** via `fuse.js`:

- Build-time script at `scripts/build-help-index.ts` runs during `pnpm build` (or as a Next.js plugin), walks `/content/help/**/*.mdx`, extracts frontmatter + first 200 chars of body, writes `public/help-index.json` (~50-100 KB at scale).
- `<HelpSearchModal>` (new component at `components/help/HelpSearchModal.tsx`) loads `/help-index.json` once, opens on ⌘K from anywhere in the dashboard.
- Indexes: `title`, `slug`, `aiSummary`, `userIntents`, `category`.
- Body text not indexed in v1 (would inflate bundle); add server-side in v2 at scale.
- No network round-trip → instant search, works offline once loaded.

**Trigger:** ⌘K (also Cmd-K on Mac, Ctrl-K on Win/Linux) → modal opens centered. Results = 5-7 article cards (compressed `showcase-card` variant). Arrow keys navigate. Enter opens.

---

## 9. Existing-page consolidation

| Path today | Action | Rationale |
|---|---|---|
| `app/dashboard/help/page.tsx` (15kB FAQ) | **Replace** with MDX-driven index | Hardcoded FAQ array migrates to MDX articles (8 seed articles cover the most-asked Qs) |
| `app/help/page.tsx` (public marketing FAQ) | **Replace** with public Help Library index | Same MDX content as authed; gated articles 404 to unauthed users |
| `app/faq/page.tsx` | **308 redirect to `/help`** | One canonical public help surface |
| `app/dashboard/support/`, `app/support/` | **Unchanged** | Contact forms — different feature |
| `components/help/HelpButton.tsx`, `HelpTooltip.tsx` | **Unchanged** | Inline help primitives — orthogonal to library |
| `components/IICRCComplianceHelper.tsx` | **Unchanged** | IICRC-specific helper — orthogonal |
| `components/onboarding/ProductTour.tsx` | **Unchanged** | Complementary surface, not consolidated |

Redirect added to `next.config.mjs`:

```js
redirects: async () => [
  // ... existing redirects (signin → login, register → signup, etc, from SP-3 T3)
  { source: "/faq", destination: "/help", permanent: true },
];
```

---

## 10. Content for v1 (8 seed articles)

One hero article per category, authored during implementation:

| Category | Seed article | Read time |
|---|---|---|
| Getting started | "Your first inspection in 8 minutes" | 5 min |
| Inspections | "Capture photos with chain-of-custody" | 4 min |
| Reports | "Generate your first AI-drafted S500 report" | 5 min |
| Clients & Portal | "Share a report with your client via the portal" | 3 min |
| Billing | "Upgrade from trial to paid plan" | 3 min |
| Team | "Invite a technician + verify their licence" | 4 min |
| Integrations | "Connect Xero to push invoices automatically" | 4 min |
| Compliance | "How RestoreAssist cites IICRC standards" | 5 min |

Categories without a seed article on day-1 show an empty state ("More articles landing soon").

---

## 11. AI-readiness for SP-G handoff

SP-G AI Setup Agent (task #279) will read these MDX files directly. The frontmatter's AI fields (`aiSummary`, `userIntents`, `successCriteria`) let SP-G:

1. Match user phrasing against `userIntents` array to find the right article.
2. Read `aiSummary` to give a 1-paragraph answer without reading the whole body.
3. Use `successCriteria` to know when the user has actually completed the task (vs just clicked through).

SP-G's brainstorm + plan happens after SP-8 ships. SP-8 does NOT build the AI agent — it builds the data + UI substrate the agent will need.

---

## 12. Testing strategy

### 12.1 Unit (Vitest)

| Target | Cases |
|---|---|
| `lib/help/load-article.ts` (MDX loader) | Parses frontmatter · resolves Cloudinary URL · validates required fields |
| `lib/help/validate-frontmatter.ts` (zod schema) | 8 cases — required fields present · status enum · category enum · audience enum |
| `lib/help/search-index-builder.ts` | Generates expected JSON shape from MDX fixtures |
| `<HelpSearchModal>` | Opens on ⌘K · returns 5-7 results · arrow keys navigate · Esc closes |
| `<HowToDropdown>` | Renders 8 categories · "Browse all" link · keyboard focus correct |

### 12.2 Integration

| Target | Cases |
|---|---|
| `/dashboard/help` page | Renders 8 seed articles · empty categories show empty state · search index served as JSON |
| `/dashboard/help/getting-started/first-inspection` | Renders MDX body · breadcrumb correct · IICRC citations stay inline-code · related articles render |
| `/help` public mirror | Renders without auth · gated articles 404 |
| `/faq` redirect | Returns 308 to `/help` |
| Build-time index generation | `scripts/build-help-index.ts` produces valid JSON ≤ 200KB at 50-article scale |

### 12.3 E2E (Playwright)

| Spec | Scenario |
|---|---|
| `e2e/help/dropdown-open.spec.ts` | Click "How To" → dropdown panel renders 8 categories → click category → land on filtered index |
| `e2e/help/search-cmd-k.spec.ts` | Press ⌘K → search modal opens → type "photo" → results include the photo-capture article |
| `e2e/help/article-detail.spec.ts` | Open seed article → headline + hero + body render → related-articles section populated |
| `e2e/help/public-mirror.spec.ts` | Visit `/help/getting-started/first-inspection` without auth → article renders (it's an unauthed seed) |
| `e2e/help/redirects.spec.ts` | `curl -I /faq` returns 308 location `/help` |

### 12.4 Verification gate (per `.claude/rules/verification-gate.md`)

PR description must include a manual checklist:
- **Where:** Vercel preview URL
- **How to walk it:** open `/dashboard/help` → confirm 8 categories visible in top-bar dropdown · click each category → confirm seed article visible OR empty-state · press ⌘K → search "photo" → confirm article found · open article → confirm Cloudinary hero loads · navigate to `/help/getting-started/first-inspection` unauthed → confirm renders · `curl -I https://<preview>/faq` → confirm 308
- **What NOT to see:** 3D tilt on cards · WebGL/marquee anywhere · low-contrast text · authed-only article rendering on public mirror
- **Confirmation prompt for Phill**

---

## 13. Out of scope (explicit deferrals)

- **SP-G AI Setup Agent** — task #279, follow-up brainstorm
- Article voting / feedback (thumbs up/down) — v2
- Admin CMS / content-editor UI — content is MDX-in-repo
- Multi-language content
- Server-side full-text search
- AI-powered semantic search at the help surface (subsumed by SP-G)
- Marketing-site rewrite (separate motion)
- Migrating existing ProductTour into the library
- Support contact-form changes

---

## 14. Tools used during execution

- `git`, `pnpm`, `pnpm dlx shadcn@latest add @componentry/*` (already done for magnetic-dock + showcase-card + 7 banked components)
- `next-mdx-remote` or `@next/mdx` (decide during impl)
- `fuse.js` for client search
- `cloudinary-next` for image rendering (already in RA stack)
- Playwright + Vitest for tests
- Chrome MCP for `/dashboard/help` UI verification on Vercel preview

---

## 15. Linear

10 follow-up tickets to file post-merge:

1. RA-XXXX — `<HowToDropdown>` component + mount in dashboard layout (uses `magnetic-dock`)
2. RA-XXXX — MDX loader + frontmatter zod validator + types module (`lib/help/`)
3. RA-XXXX — Article index page at `/dashboard/help` + `<HelpArticleCard>` (uses `showcase-card`)
4. RA-XXXX — Article detail page at `/dashboard/help/[category]/[slug]`
5. RA-XXXX — Public Help Library at `/help` + `/help/[category]/[slug]` (auth-aware)
6. RA-XXXX — Build-time search-index script + `<HelpSearchModal>` (⌘K trigger)
7. RA-XXXX — Cloudinary `<Screenshot>` MDX component + image pipeline
8. RA-XXXX — Redirects in `next.config.mjs` (`/faq` → `/help`)
9. RA-XXXX — 8 seed articles authored (1 per category)
10. RA-XXXX — 5 E2E specs + verification-gate checklist

---

## 16. Post-approval handoff

After Phill approves this spec:

1. Spec lives at `docs/superpowers/specs/2026-05-15-sp8-help-library-design.md`
2. Invoke `superpowers:writing-plans` skill to produce the implementation plan at `docs/superpowers/plans/2026-05-15-sp8-help-library.md`
3. Plan execution likely uses `superpowers:subagent-driven-development` — many tasks are independent (each component, each page, each seed article).

No implementation actions are authorised before that handoff completes.
