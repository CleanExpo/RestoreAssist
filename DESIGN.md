# RestoreAssist Design System

_Updated: 2026-04-18_
_Status: Bootstrap v0.1 — descriptive of current state; evolves with each UI PR._

> Authoritative design reference for all UI work in this repo. Every new page,
> component, or refactor starts here. Discrepancies between this document and
> shipped code are resolved in one of two directions — update the code, or
> update this document. Silent drift is the anti-pattern.

---

## 1. Visual Theme & Atmosphere

**5-word character statement:** Operational · trustworthy · dark-first · Australian · fieldwork-grade.

RestoreAssist is a compliance platform used by water-damage restoration
technicians in the field and by operators reviewing reports in the office. The
aesthetic sits between a workmanlike operations dashboard (Linear-density,
Sentry-data) and a regulated enterprise tool (Stripe-trust, IBM-formality).
Dark-first because the mobile app runs in Capacitor WebView and our users
often work in low-light environments (basements, after-hours).

**Not:** playful, consumer-SaaS, illustration-heavy, gradient-forward.
**Yes:** precise typography, semantic colour, tabular numerics, clear hierarchy.

Nearest archetypes: **Linear** (density + clarity) and **Sentry** (data-dense
dashboard, calm accent palette).

---

## 2. Color Palette & Roles

The codebase runs two overlapping colour systems that must converge. This
section documents both so future PRs can migrate to the semantic system only.

### Brand tokens (CLAUDE.md, authoritative)

| Role              | Hex        | Use                                           |
| ----------------- | ---------- | --------------------------------------------- |
| Brand primary     | `#1C2E47`  | Navy — headings on light surface, data labels |
| Brand warm        | `#8A6B4E`  | Secondary accent, section dividers            |
| Brand light       | `#D4A574`  | Tertiary highlight, timeline markers          |
| Canvas (dark)     | `#050505`  | Full-bleed backgrounds (true black avoided)   |

### Semantic tokens (app/globals.css — OKLCH)

Consumed as Tailwind classes — `bg-background`, `text-foreground`,
`bg-card`, `border-border`, `text-muted-foreground`, etc. These auto-switch
between light and dark via `ThemeProvider` (class-based).

| Token                   | Light                  | Dark                   | Role                      |
| ----------------------- | ---------------------- | ---------------------- | ------------------------- |
| `--background`          | `oklch(1 0 0)`         | `oklch(0.145 0 0)`     | Page canvas               |
| `--foreground`          | `oklch(0.145 0 0)`     | `oklch(0.985 0 0)`     | Body text                 |
| `--card`                | `oklch(1 0 0)`         | `oklch(0.145 0 0)`     | Elevated surface          |
| `--primary`             | `oklch(0.205 0 0)`     | `oklch(0.985 0 0)`     | Primary CTA               |
| `--secondary`           | `oklch(0.97 0 0)`      | `oklch(0.269 0 0)`     | Secondary CTA             |
| `--muted`               | `oklch(0.97 0 0)`      | `oklch(0.269 0 0)`     | Inactive surface          |
| `--muted-foreground`    | `oklch(0.556 0 0)`     | `oklch(0.708 0 0)`     | Caption text              |
| `--destructive`         | `oklch(0.577 0.245 27)` | `oklch(0.396 0.141 26)` | Danger action             |
| `--border`              | `oklch(0.922 0 0)`     | `oklch(0.269 0 0)`     | Hairline between surfaces |
| `--ring`                | `oklch(0.708 0 0)`     | `oklch(0.439 0 0)`     | Focus ring                |

### Status / accent palette (globals.css `@theme inline`)

| Role       | Hex         | Use                               |
| ---------- | ----------- | --------------------------------- |
| Accent     | `#3b82f6`   | Primary link, info state          |
| Info       | `#06b6d4`   | Secondary info, chart cyan        |
| Success    | `#10b981`   | Positive state, toast success     |
| Warning    | `#f59e0b`   | Caution state                     |
| Error      | `#f43f5e`   | Destructive, toast error          |
| Surface    | `#0f172a`   | `slate-950` — dark canvas default |
| Surface-1  | `#1e293b`   | `slate-800` — toast / card        |
| Surface-2  | `#334155`   | `slate-700` — borders             |
| Text hi    | `#f8fafc`   | `slate-50` — primary text (dark)  |
| Text mid   | `#cbd5e1`   | `slate-300`                       |
| Text lo    | `#94a3b8`   | `slate-400`                       |

### Rules

- **Never interpolate brand hex directly into components.** Use a semantic
  Tailwind class (`text-primary`, `bg-card`) or a documented utility class.
  Hardcoded `#1C2E47` inside a component is a **Critical** audit finding.
- Status colours (`success`, `warning`, `error`) are reserved for actual
  status — never decorative.
- Brand navy `#1C2E47` on a dark canvas requires a tinted surface behind it
  (`bg-slate-900` or `bg-card`) to maintain contrast — never place it on pure
  `bg-slate-950`.

---

## 3. Typography Rules

**Font stack (current):** `Inter` (loaded via `next/font/google` in `app/layout.tsx`).
**Font stack (declared in CSS):** `Geist` / `Geist Mono`.

> **Known inconsistency:** `globals.css` declares `--font-sans: "Geist"` but
> `layout.tsx` loads Inter. Resolution tracked as follow-up. Until resolved,
> Inter is what renders. Do not introduce a third font.

**Recommended direction:** migrate to Geist + Geist Mono to match Pi-Dev-Ops
Nexus stack. Geist's engineered precision matches the 3-word test
(**operational · trustworthy · precise**) better than Inter's generic tech-sans.

### Hierarchy

| Role       | Class (Tailwind)                              | Weight | Use                       |
| ---------- | --------------------------------------------- | ------ | ------------------------- |
| Display    | `text-4xl font-bold tracking-tight`           | 700    | Marketing hero            |
| H1         | `text-2xl font-bold`                          | 700    | Page title                |
| H2         | `text-xl font-semibold`                       | 600    | Section heading           |
| H3         | `text-lg font-semibold`                       | 600    | Card title                |
| Body       | `text-sm`                                     | 400    | Default paragraph         |
| Body-lg    | `text-base`                                   | 400    | Marketing body            |
| Caption    | `text-xs text-muted-foreground`               | 400    | Helper text, row subtitle |
| Mono       | `font-mono tabular-nums`                      | 400    | IDs, codes, metrics       |
| Data table | `tabular-nums`                                | —      | Numeric columns           |

Rules:

- Tables and metric rows **must** use `tabular-nums`. Proportional digits
  misalign columns.
- Numeric Xero account codes, inspection IDs, claim IDs, ABN — all `font-mono`.
- Weight jump between body (400) and heading (≥600) establishes hierarchy
  without needing colour or size alone.

---

## 4. Component Stylings

RestoreAssist uses **shadcn/ui** from `components/ui/*`. Never create a custom
form control when a shadcn primitive exists (CLAUDE.md rule 16). Current
inventory (non-exhaustive): accordion, alert, alert-dialog, badge, button,
card, checkbox, dialog, drawer, dropdown-menu, input, label, select, table,
tabs, toast (via react-hot-toast).

### Button variants (components/ui/button.tsx)

| Variant       | Visual                                    | Use                             |
| ------------- | ----------------------------------------- | ------------------------------- |
| `default`     | `bg-primary` filled                       | Primary CTA — one per view      |
| `destructive` | `bg-destructive` red                      | Delete, cancel-sync, irreversible |
| `outline`     | Bordered, `bg-background`                 | Secondary action                |
| `secondary`   | `bg-secondary` subdued fill               | Tertiary action                 |
| `ghost`       | Transparent, hover fill                   | In-row actions, icon buttons    |
| `link`        | Underline on hover, no chrome             | Inline navigation               |

Sizes: `sm` (h-8), `default` (h-9), `lg` (h-10), `icon*` (square 8/9/10).

All variants include `focus-visible:ring-ring/50 focus-visible:ring-[3px]`
and hover states (`scale-[1.02]`, `shadow-lg` for filled, `shadow-md` for
outline). Keep this — keyboard-visible focus is mandatory.

### Cards

`components/ui/card.tsx` with `CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`. Default elevation is a single subtle shadow
(Level 1). Use `Card` for any bounded information region on a dashboard page.

### Inputs

`components/ui/input.tsx` — 36px height default, `rounded-md`, `border` using
semantic `--input` token. Invalid state: `aria-invalid="true"` drives
`ring-destructive/20` automatically. Always pair an error `<div>` with
`aria-describedby` — see `app/dashboard/settings/xero-mapping/page.tsx` row
editor for the pattern.

### Tables

`components/ui/table.tsx` — hairline borders via `--border`. Numeric columns
**must** add `tabular-nums` to the `<TableCell>`. Row hover state comes from
the primitive; don't override.

### Toasts (react-hot-toast)

Configured in `app/layout.tsx`. Dark surface (`#1e293b`), success green
(`#10b981`), error red (`#ef4444`), 4s duration, top-right position. Use
`toast.success("Saved X → Y")` with the concrete entity, never
`"Success!"`.

### Badges

`components/ui/badge.tsx` — use variant + semantic colour. Status badges:
`success` (green), `warning` (amber), `destructive` (red), `secondary`
(neutral). Never use a badge decoratively.

---

## 5. Layout Principles

### Spacing scale

Tailwind default (`0 1 2 3 4 5 6 8 10 12 16`). **Off-scale values
(`mt-7`, `px-3.5`, `gap-[13px]`) are a Critical audit finding.**

### Container

Dashboard pages use `space-y-6 p-6` as the default wrapper. Full-width forms
use `max-w-2xl`. Long-form prose uses `max-w-prose` (~65ch) — never wider.

### Grid

Use CSS Grid (`grid grid-cols-*`) for panel layouts. **No flexbox percentage
math** (`flex: 0 0 33.333%` — breaks at gap edge cases). Use `grid-cols-3 gap-6`.

### Border radius

| Token          | Value                    | Use                             |
| -------------- | ------------------------ | ------------------------------- |
| `rounded-sm`   | `calc(0.625rem - 4px)`   | Inline chips                    |
| `rounded-md`   | `calc(0.625rem - 2px)`   | Buttons, inputs (default)       |
| `rounded-lg`   | `0.625rem`               | Cards, dialogs                  |
| `rounded-xl`   | `calc(0.625rem + 4px)`   | Modal, hero card                |
| `rounded-full` | 9999px                   | Avatars, pill badges            |

Never `rounded-none` on interactive elements — users expect affordance.

### Whitespace philosophy

Dense by default (this is an operations tool, not a marketing site). A
dashboard page typically shows: page heading + 1-sentence description + 1–3
cards. Avoid marketing-site `py-16` hero padding inside the app shell.

---

## 6. Depth & Elevation

Dark-theme UIs derive depth from **surface lightness**, not shadow. Shadows
on dark backgrounds are invisible — use them sparingly and only when the
surface is materially lighter than the canvas.

| Level | Surface (dark)          | Shadow                         | Use                        |
| ----- | ----------------------- | ------------------------------ | -------------------------- |
| 0     | `bg-slate-950` (canvas) | none                           | Page background            |
| 1     | `bg-card` / `slate-900` | none                           | Card resting state         |
| 2     | `bg-slate-800`          | `shadow-sm`                    | Card hover / dropdown      |
| 3     | `bg-slate-800`          | `shadow-md`                    | Popover, hover card        |
| 4     | `bg-slate-800`          | `shadow-lg`                    | Dialog, command palette    |
| 5     | `bg-slate-800`          | `shadow-xl shadow-primary/20`  | Modal centrepiece          |

Rules:

- **No `shadow-lg` on surface Level 0 or 1 in dark mode.** It's undetectable.
- Button hover shadows (`shadow-primary/20`) are fine — they sit on the
  contrast edge of the button fill, not the canvas.

---

## 7. Do's and Don'ts

### Do

- Read this document before creating any new page or component.
- Use semantic Tailwind tokens (`bg-card`, `text-muted-foreground`) over raw
  slate/hex classes wherever possible.
- Apply `tabular-nums` to any numeric data in tables or metric cards.
- Wire `aria-invalid` + `aria-describedby` on every field that has an error
  state.
- Pair every loading state with a skeleton (pattern: `app/dashboard/settings/xero-mapping/page.tsx:LoadingSkeleton`).
- Write concrete toast copy: `toast.success("Saved LABOUR → 210")`, not
  `toast.success("Saved!")`.
- Use `prefers-reduced-motion: reduce` guards around any non-trivial animation.
- Run `pnpm type-check` before committing UI changes.

### Don't

- Don't hardcode brand hex (`#1C2E47`, `#8A6B4E`) inside a component —
  introduce a semantic token first.
- Don't use `shadow-lg` on dark canvas surfaces — it's invisible.
- Don't animate layout properties (`top`, `left`, `width`, `height`). Use
  `transform` and `opacity`.
- Don't skip heading levels (`h1` → `h3` with no `h2`).
- Don't use a free-form `<Input>` where an enumerated set would use a
  `<Select>` (example: Xero tax types — `OUTPUT`, `INPUT`, `EXEMPT`, etc.).
- Don't ship a component without empty, loading, and error states.
- Don't use `text-red-600` / `text-green-600` directly — use `text-destructive`
  / `text-success` semantic tokens.
- Don't centre-align prose or three-equal-cards as a page layout pattern —
  asymmetry reads more confident.

---

## 8. Responsive Behavior

### Breakpoints (Tailwind defaults)

| Name  | Min width | Use                                     |
| ----- | --------- | --------------------------------------- |
| `sm`  | 640 px    | Large phone, small tablet portrait      |
| `md`  | 768 px    | Tablet portrait / small tablet landscape |
| `lg`  | 1024 px   | Tablet landscape, small laptop          |
| `xl`  | 1280 px   | Desktop                                 |
| `2xl` | 1536 px   | Large desktop, site-wide max            |

### Mobile-first collapsing rules

- Dashboard cards: single column below `md`, two-up at `md`, three-up at `lg`.
- Data tables: wrap in `overflow-x-auto` + `min-w-[640px]` on the `<table>` —
  never truncate columns.
- Navigation collapses to a drawer below `md` (use `components/ui/drawer.tsx`).
- Forms: single-column below `md`, two-column (`grid-cols-2`) above `md` only
  for visually-grouped fields.

### Touch targets

All interactive elements must be **≥ 44 × 44 px** on touch devices. Button
`size="sm"` (h-8 = 32 px) is permissible only inside dense table rows where
the `<tr>` hit area carries the padding.

### Capacitor WebView

The mobile app wraps the same Next app in Capacitor. Safe-area classes
(`safe-area-top`, `safe-area-bottom`) are defined in `globals.css` — apply to
any fixed-position element near device edges.

---

## 9. Agent Prompt Guide

### Quick colour reference (copy-paste)

```
Canvas:    bg-slate-950 (dark) / bg-background (semantic)
Card:      bg-card border-border
Text:      text-foreground (primary) / text-muted-foreground (secondary)
Brand:     text-[#1C2E47] navy — ONLY on light surfaces, never literal in new code
CTA:       <Button>Action</Button> (default variant)
Danger:    <Button variant="destructive">Delete</Button>
Status:    text-destructive (error) / text-green-600 (success — will migrate to success token)
Mono:      font-mono tabular-nums
Font:      Inter (body) — Geist migration pending
```

### 5 copy-paste component prompts

**1. Dashboard list page**

> Build a dashboard page at `app/dashboard/<feature>/page.tsx`. Use
> `"use client"` if interactive. Wrap content in `<div className="space-y-6 p-6">`.
> Page header is an `<h1 className="text-2xl font-bold">` + 1-sentence
> description in `text-sm text-muted-foreground`. Body is one or more `<Card>`
> from `components/ui/card.tsx`. Fetch data via `useFetch` from
> `lib/hooks/useFetch`. Handle loading (skeleton), error (inline in Card), and
> empty (dedicated component). Match the pattern in
> `app/dashboard/settings/xero-mapping/page.tsx` once its audit findings are
> resolved.

**2. Data table with inline editing**

> Use `<Table>` from `components/ui/table.tsx`. Header row gets a subtle tinted
> background (`bg-muted/50`). Numeric cells get `className="tabular-nums"`.
> Each row wires an internal edit-state component — see `MappingRowEditor` in
> `app/dashboard/settings/xero-mapping/page.tsx`. Per-row `Save` button
> (default variant, `size="sm"`) disabled until dirty; secondary `Reset` in
> `variant="outline"`. Toast on success with the concrete entity name.

**3. Form dialog**

> Use `<Dialog>` from `components/ui/dialog.tsx`. Width `max-w-md` for simple
> forms, `max-w-2xl` for complex. Title in `<DialogTitle>`. Description in
> `<DialogDescription className="text-sm text-muted-foreground">`. Body as a
> grid of `<Label>` + `<Input>` pairs. Footer has primary action on the right,
> cancel (`variant="ghost"`) on the left. Wire `aria-invalid` on fields with
> errors.

**4. Empty state**

> Use a `<Card>` wrapping a centred `<div className="p-6 text-center">`.
> Icon (optional) → `<h2 className="text-lg font-semibold">` stating the
> absence in positive terms → `<p className="mt-1 text-sm text-muted-foreground">`
> explaining how to resolve → one primary `<Button asChild>` linking to the
> resolution path. Copy must be concrete: `"Connect Xero first"`, not
> `"No data"`.

**5. Form field with validation**

> `<div>` containing `<Label htmlFor="...">`, `<Input id="..." value={...}
> onChange={...} aria-invalid={!!err} aria-describedby={err ? "...-err" : undefined} />`,
> and — when `err` — `<div id="...-err" className="mt-1 text-xs text-destructive">{err}</div>`.
> Clear the error on next keystroke. Never rely on colour alone for invalid
> state — the `aria-invalid` ring and text message both carry the signal.

---

## Governance

- This document lives at the repo root as `DESIGN.md`.
- Every UI PR that introduces a new pattern must update the relevant section.
- Every UI PR is reviewed against this document using the `design-audit` skill
  (see `.claude/skills/design-audit/SKILL.md`).
- The `design-intelligence`, `design-audit`, and `design-system` skills
  orchestrate the design stack — they read this document as the single source
  of truth.
