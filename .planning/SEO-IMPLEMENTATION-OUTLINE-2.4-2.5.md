# SEO Implementation Outline: Sections 2.4 & 2.5

**Source:** `.planning/SEO-ANALYSIS-REPORT.md` (On-Page SEO Analysis)  
**Purpose:** Actionable changes for Heading Structure (2.4) and Image Optimization (2.5).

---

## 2.4 Heading Structure

### 2.4.1 Homepage – Add H2 section headings

**File:** `app/page.tsx`

**Issue:** No H2–H6 hierarchy for content sections; crawlers see only one H1 and then footer H2.

**Change:** Add one visible H2 per main content section so the outline is: H1 → H2(s) → H3 where needed.

| Location (approx) | Current | Change |
|-------------------|--------|--------|
| After Hero (around line 226, before the workflow section) | Section has no heading | Add an H2 at the start of the section (e.g. inside the `max-w-7xl` div, before `MobileWorkflowCarousel`). **Suggested text:** "How It Works" or "Inspection to Report in One Flow". Keep styling (e.g. `className`) so it matches the design. |
| Optional | — | If you add more sections later, give each a single H2; use H3 for subsections. |

**Example (conceptual):**
```tsx
{/* Section - Inspection. Scoping. Estimating. Connected. */}
<section className={...}>
  ...
  <div className="max-w-7xl mx-auto relative z-10">
    <h2 className="sr-only">How It Works</h2>  {/* or visible, styled like your other section titles */}
    <motion.div ...>
      <MobileWorkflowCarousel darkMode={true} />
    </motion.div>
  </div>
</section>
```
Use `sr-only` only if you don’t want a visible heading; otherwise use a visible H2 with your existing section-title styles.

---

### 2.4.2 Homepage & Footer – Footer tagline not an H2

**Files:**
- `app/page.tsx` (lines ~278–287)
- `components/landing/Footer.tsx` (lines ~27–36)

**Issue:** "Inspection. Scoping. Estimating. Connected." is a tagline, not a section heading. Using H2 here is semantically incorrect and skews the document outline.

**Change:** Use a non-heading element for the tagline (e.g. `<p>`) and keep the same look with CSS.

| File | Current | Change |
|------|--------|--------|
| `app/page.tsx` | `<motion.h2>Inspection. Scoping. Estimating. Connected.</motion.h2>` | Replace with `<motion.p>` (and keep the same `className` / styles so it looks unchanged). |
| `components/landing/Footer.tsx` | `<motion.h2>Inspection. Scoping. Estimating. Connected.</motion.h2>` | Same: use `<motion.p>` with same styling. |

**Example:**
```tsx
<motion.p
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
  className="text-4xl md:text-5xl font-bold mb-6 text-center ..."
>
  Inspection. Scoping. Estimating. Connected.
</motion.p>
```

---

### 2.4.3 Features page – H1 too generic

**File:** `app/features/page.tsx` (around lines 208–216)

**Issue:** H1 is "Features" with no keywords; report recommends keyword-rich H1.

**Change:** Set the visible H1 text to match the page topic (e.g. AI damage assessment and IICRC S500). Keep layout/metadata as-is.

| Current | Recommended |
|--------|-------------|
| `<motion.h1>Features</motion.h1>` | Use H1 text such as: **"AI Damage Assessment & IICRC S500 Compliance"** or **"Features: AI Damage Assessment & IICRC Compliance"** (match tone of your metadata title). |

**Example:**
```tsx
<motion.h1 ...>
  AI Damage Assessment & IICRC S500 Compliance
</motion.h1>
```

---

### 2.4.4 Pricing page – H1 too generic

**File:** `app/pricing/page.tsx` (around lines 240–248)

**Issue:** H1 is "Pricing" with no keywords.

**Change:** Use a keyword-rich H1 that matches the page (e.g. restoration report software plans).

| Current | Recommended |
|--------|-------------|
| `<motion.h1>Pricing</motion.h1>` | **"Restoration Report Software Plans"** or **"Pricing – Restoration Report Software Plans Australia"** (align with metadata title if desired). |

**Example:**
```tsx
<motion.h1 ...>
  Restoration Report Software Plans
</motion.h1>
```

---

## 2.5 Image Optimization

### 2.5.1 Above-the-fold logo – add `priority`

**Files:** Any page where the logo is in the initial viewport (e.g. homepage header, landing headers).

**Issue:** No `priority` on above-the-fold images; Next.js may load them later and hurt LCP.

**Change:** Add `priority` to the main logo `Image` in the header on:

- `app/page.tsx` (lines ~45–50, header logo)
- Optionally: `components/landing/Header.tsx` if that logo is above the fold on other public pages

**Example (`app/page.tsx`):**
```tsx
<Image
  src="/logo.png"
  alt="Restore Assist Logo"
  width={100}
  height={100}
  priority
  className="object-contain p-1 md:p-2"
/>
```

**Check:** In `components/landing/Header.tsx`, if the logo is the first visible image on features/pricing/about etc., add `priority` there too.

---

### 2.5.2 Logo format (WebP/AVIF)

**Issue:** Report suggests moving from PNG to WebP/AVIF for better performance.

**Change (choose one):**

1. **Option A – New assets:** Export logo as WebP (and optionally AVIF), add files under `public/` (e.g. `logo.webp`, `logo.avif`), and use them in `Image` components (e.g. `src="/logo.webp"` or use `srcSet`/sizes if you use multiple resolutions). Next.js can also serve WebP via image optimization if configured.
2. **Option B – Rely on Next.js:** If using Next.js Image Optimization (default when using `next/image` with a local `src`), ensure config allows modern formats; you may still get WebP/AVIF in the response without changing file names.

**Recommendation:** Add `logo.webp` (and optionally AVIF) in `public/` and point the above-the-fold logo to `logo.webp` (or use a single `src` and let Next.js optimize). Keep PNG as fallback in manifest/favicon if needed.

---

### 2.5.3 Decorative SVGs – hide from accessibility tree

**Files:** Any component that uses decorative SVGs (e.g. `app/page.tsx`, `components/landing/Footer.tsx`).

**Issue:** Decorative SVGs should not be announced by screen readers; missing `aria-hidden` and/or empty `alt` can clutter the accessibility tree.

**Change:** For SVGs that are purely visual (shapes, backgrounds, ornaments):

- Add `aria-hidden="true"` to the `<svg>` element, **or**
- If the SVG is used inside an `<img>`, use `alt=""`.

**Example (`app/page.tsx` and similar):**
```tsx
<svg aria-hidden="true" className="absolute top-1/3 right-1/4 w-96 h-96 opacity-20" viewBox="0 0 200 200">
  ...
</svg>
```

**Scope:** Apply to decorative SVGs in:
- `app/page.tsx` (hero, workflow section, footer)
- `components/landing/Footer.tsx`
- Other landing pages that reuse the same decorative patterns

---

## Summary checklist

| # | Item | File(s) | Status |
|---|------|--------|--------|
| 2.4.1 | Add H2 for homepage workflow section | `app/page.tsx` | Pending |
| 2.4.2 | Footer tagline: change H2 → P | `app/page.tsx`, `components/landing/Footer.tsx` | Pending |
| 2.4.3 | Features H1: keyword-rich text | `app/features/page.tsx` | Pending |
| 2.4.4 | Pricing H1: keyword-rich text | `app/pricing/page.tsx` | Pending |
| 2.5.1 | Add `priority` to above-fold logo | `app/page.tsx`, optionally `Header.tsx` | Pending |
| 2.5.2 | Logo as WebP (and optionally AVIF) | `public/`, `Image` src | Pending |
| 2.5.3 | Decorative SVGs: `aria-hidden="true"` | `app/page.tsx`, `Footer.tsx`, others | Pending |

---

**Note:** Sections 2.1–2.3 (metadata, title tags, meta descriptions) are already implemented via server layouts. This outline covers only 2.4 (heading structure) and 2.5 (image optimization).
