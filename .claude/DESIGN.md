# DESIGN.md — RestoreAssist

> The brand contract every AI agent reads before producing UI, copy, or motion
> for this repo.
>
> **Source of truth is `app/globals.css`.** The `--color-brand-*` custom
> properties there are what ships; this file describes them. Where the two
> disagree, `globals.css` wins and this file is the bug —
> `npm run check:design-tokens` fails the build on any divergence.
>
> Updated: 2026-08-26. Spec: Google DESIGN.md v1 (community implementation).
>
> Earlier revisions of this file declared an orange `--ra-primary #E55A2B`
> palette with Inter and JetBrains Mono, sourced from a
> Synthex/packages/brand-config path outside this repository. None of it was
> ever real here: no `--ra-*` token appears in any file, Inter is not loaded as
> a font, and no Synthex directory exists. The CI lint could not detect this
> because it only checked that six headings were present. Anything generated
> against those tokens was off-brand.

---

## Brand Voice

**Brand:** RestoreAssist (RestoreAssist Pty Ltd)
**Tagline:** One National Inspection Standard.
**Audience (primary):** restoration company owners and field technicians (AU)
**Audience (secondary):** insurer claims teams and assessor networks
**Tone:** direct, grounded, informed, human
**Cadence:** short sentences. Active voice.
**Voice construct:** Klark Brown — the most informed voice in the room with no
need to impress anyone. The reader is in crisis (water damage at 2am, mould
diagnosis after months of illness, house fire). Earn trust by being clear,
not by being loud.
**Reading level:** target grade 4, tolerance 6, hard fail 8.

---

## Visual Tokens

The palette is B, "Paper and cobalt" (chosen 19/11/2026, replacing palette A).
Token names describe roles, not hues: `harbour` and `bronze` are now cobalt,
`navy` is ink and `gold` is a pale cobalt. Use the Tailwind utility (`bg-brand-navy`) rather than the hex;
components must carry no raw hex literal.

### Colour — core brand

| Token | Hex | Use |
|---|---|---|
| `--color-brand-navy` | `#17181c` | Primary — ink for headings, strong text, foreground |
| `--color-brand-navy-hover` | `#2b2d33` | Navy, hover |
| `--color-brand-harbour` | `#1638c8` | Cobalt — links, focus ring, accents on light |
| `--color-brand-harbour-light` | `#7b96f4` | Cobalt for dark surfaces — links, primary in dark mode |
| `--color-brand-bronze` | `#1d3fc4` | Cobalt — secondary highlight, borders |
| `--color-brand-slate` | `#5a574e` | Muted — body copy, meta text |
| `--color-brand-gold` | `#9db1ff` | Pale cobalt — highlight on dark surfaces only |
| `--color-brand-gold-hover` | `#bccaff` | Pale cobalt, hover |

### Colour — CTA and light surfaces

| Token | Hex | Use |
|---|---|---|
| `--color-brand-cta` | `#1638c8` | Primary CTA (solid, white text) |
| `--color-brand-cta-hover` | `#0f2a9e` | Primary CTA, hover |
| `--color-brand-steel` | `#6b685f` | Secondary CTA steel |
| `--color-brand-steel-hover` | `#2e2c28` | Secondary CTA steel, hover |
| `--color-brand-mist` | `#dedbd2` | Borders, glass surface on hero |
| `--color-brand-cloud` | `#f7f6f2` | Paper — off-white section surface, light sidebar |
| `--color-brand-cream` | `#efece4` | Accent surface, active nav item |
| `--color-brand-cream-2` | `#e6e2d6` | Accent surface, hover |

### Colour — dark surfaces

| Token | Hex | Use |
|---|---|---|
| `--color-brand-canvas` | `#121212` | Dark-mode page background |
| `--color-brand-surface` | `#1a1a1c` | Dark-mode card / panel |
| `--color-brand-surface-2` | `#232327` | Dark-mode card, hover; muted surface |
| `--color-brand-deep` | `#17171a` | Sketch editor / capture flow |
| `--color-brand-ink` | `#0e0e0f` | Drawer / sidebar in dark mode |
| `--color-brand-abyss` | `#08080a` | Deepest background |

### Colour — harbour scale (signed-in app accent)

The signed-in app's accent tints, badges, rings and gradients use an eleven-step
scale on the brand-cta hue (oklch hue 265.6): `brand-harbour-50` to
`brand-harbour-950` (`bg-brand-harbour-500/10`, `text-brand-harbour-600`,
`ring-brand-harbour-400/40`). It replaces the Tailwind cyan utilities (RA-8464),
which move over in three PRs. Until the last one lands, `app/globals.css` keeps a
cyan bridge on the same values so unmoved screens still render the brand cobalt.
New code uses `brand-harbour-*`, never `cyan-*`.

| Token | Value |
|---|---|
| `--color-brand-harbour-50` | `oklch(0.97 0.078 265.6)` |
| `--color-brand-harbour-100` | `oklch(0.94 0.078 265.6)` |
| `--color-brand-harbour-200` | `oklch(0.89 0.156 265.6)` |
| `--color-brand-harbour-300` | `oklch(0.82 0.156 265.6)` |
| `--color-brand-harbour-400` | `oklch(0.72 0.223 265.6)` |
| `--color-brand-harbour-500` | `oklch(0.6 0.223 265.6)` |
| `--color-brand-harbour-600` | `oklch(0.5 0.223 265.6)` |
| `--color-brand-harbour-700` | `oklch(0.43 0.223 265.6)` |
| `--color-brand-harbour-800` | `oklch(0.37 0.223 265.6)` |
| `--color-brand-harbour-900` | `oklch(0.31 0.223 265.6)` |
| `--color-brand-harbour-950` | `oklch(0.24 0.223 265.6)` |

The single tokens `brand-harbour` (`#1638c8`) and `brand-harbour-light`
(`#7b96f4`) stay the link and focus colours; the scale is for tints and fills.
Steps 600 and up carry white text at 6:1 or better; step 500 measures 4.19:1, so
a solid white-text fill uses step 600 or `brand-cta`.

### Colour — chart palette (RA-8465)

Every Recharts chart takes its colours from `lib/charts/palette.ts`, never a
literal. The module hands out CSS variables (`var(--chart-1)` and so on) that
`app/globals.css` declares under `:root` (light) and `.dark`, so light and dark
swap in CSS. `lib/charts/__tests__/chart-palette.test.ts` fails on a hex,
`rgb()`, `hsl()` or `oklch()` literal in any file that imports recharts, and on
a chart variable that is not declared for both modes.

Colour is assigned by the job it does:

- **Categorical** (which series): `CHART_SERIES`, eight slots in the fixed
  order below. Assign in sequence and never cycle: `seriesColour(i)` folds a
  ninth series to neutral. Give a known entity a fixed slot with
  `colourForKey(order, key)`, so a filter never repaints the survivors.
- **Single series**: `CHART_ACCENT` (slot 1). One series is one colour; never
  colour bars by category when the axis already names them.
- **Status** (a mark that means a state, such as dry or wet): `CHART_STATUS`
  good, info, warning, critical, on the app's status tokens. Never used as a
  series colour, and always paired with a label or icon.
- **Neutral**: `CHART_NEUTRAL` for "Other", archived and folded series.
- **Chrome**: `CHART_CHROME` (grid, axis, threshold lines, target curves, dot
  ring) and `CHART_TOOLTIP_STYLE`. Values, labels and legends stay in text ink.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | harbour blue | `brand-harbour` `#1b5fa6` | `#4d8fda` |
| 2 | burnt orange | `brand-bronze` `#a34a06` | `#d95926` |
| 3 | aqua green | `#199e70` | `#199e70` |
| 4 | amber | `#c98500` | `#c98500` |
| 5 | magenta | `#d55181` | `#d55181` |
| 6 | green | `#008300` | `#0ca30c` |
| 7 | violet | `#6250d6` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

Validated with the dataviz skill's `validate_palette.js` against the card
surfaces (`#ffffff` light, `brand-surface` `#10202f` dark): every slot inside
the lightness band and chroma floor, every slot at 3:1 or better on its
surface, worst adjacent pair CVD delta E 8.4 and normal-vision delta E 19.3 in
both modes. Slots 1 to 3 also pass as all pairs (scatter, map, small
multiples); those forms carry at most three series.

`brand-gold` is not a chart colour: it fails 3:1 on white and sits next to the
warning status amber.

| Token | Hex | Use |
|---|---|---|
| `--color-brand-chart-aqua` | `#199e70` | Chart slot 3, both modes |
| `--color-brand-chart-amber` | `#c98500` | Chart slot 4, both modes |
| `--color-brand-chart-magenta` | `#d55181` | Chart slot 5, both modes |
| `--color-brand-chart-green` | `#008300` | Chart slot 6, light |
| `--color-brand-chart-violet` | `#6250d6` | Chart slot 7, light |
| `--color-brand-chart-red` | `#e34948` | Chart slot 8, light |
| `--color-brand-chart-harbour-dark` | `#4d8fda` | Chart slot 1, dark |
| `--color-brand-chart-orange-dark` | `#d95926` | Chart slot 2, dark |
| `--color-brand-chart-green-dark` | `#0ca30c` | Chart slot 6, dark |
| `--color-brand-chart-violet-dark` | `#9085e9` | Chart slot 7, dark |
| `--color-brand-chart-red-dark` | `#e66767` | Chart slot 8, dark |

### Contrast — read before choosing a colour

Measured WCAG ratios. `tests/unit/brand-contrast.test.ts` recomputes every row
from `app/globals.css`, so a palette change that leaves this table stale fails CI.

| Pair | Ratio |
|---|---|
| White on `brand-cta` `#1638c8` | 8.63:1 |
| White on `brand-bronze` `#1d3fc4` | 8.20:1 |
| `brand-slate` on white | 7.22:1 |
| `brand-harbour-light` on `brand-canvas` | 6.70:1 |
| `brand-gold` on `brand-navy` | 8.59:1 |
| `brand-gold` on white | 2.07:1 (fails) |

Rules that follow from these:

- Solid buttons with white text use `brand-cta` (or a step 600 colour), never a
  step 500 colour.
- `brand-gold` is for dark surfaces only. On a light surface it fails AA.
- In dark mode, links and the primary colour use `brand-harbour-light`;
  `brand-harbour` on `brand-canvas` measures 2.17:1 and fails.
- Charts sit on white cards, never straight onto the paper surface
  `brand-cloud`, where the paler chart colours lose contrast.
- Light mode is the default theme; every route follows the user's Appearance
  choice.

### Typography

Loaded in `app/layout.tsx` via `next/font/google`:

- **Sans:** Geist, exposed as `--font-sans`.
- **Mono:** Geist Mono, exposed as `--font-mono`.

### Radius

- CEO register: 4–6px (sharp).
- Product / client register: 10px (soft).

### Motion

- Signature: **sweep** (horizontal reveal — decisive).
- Durations (frames @ 30fps): fast 8, base 18, slow 36.
- Easing: expo-out for entrance, expo-in for exit, expo-in-out for state changes.
- Transition between scenes: 14 frames.

---

## Forbidden Patterns

These are **auto-fail** in CI lint and code review.

### Icons
- **NO Lucide, HeroIcons, FontAwesome, or any other icon library in app code.**
  Phill Rule 1. Generic icons make every app look the same.
- Shadcn UI library internals may keep their own icons. App-level code defines
  the mark it needs as an inline SVG in the component that uses it — see the
  `CheckCircleMark` / `SpinnerMark` pattern in `components/setup/AiKeyCard.tsx`.
  There is no shared marks module; earlier revisions of this file pointed at a
  src/components/ui/marks.tsx that has never existed in this repo, which also
  has no src/ directory.

### AI-Slop Phrases (from brand-guardian global banned list)

- "In today's fast-paced world" / "In today's competitive landscape"
- "Game-changer" / "game-changing"
- "Seamless" (unless quoting a client)
- "Leverage" (as a verb meaning "use")
- "Robust"
- "Cutting-edge" / "state-of-the-art"
- "Dive into" / "delve into"
- "It's worth noting"
- "In conclusion" / "To summarise" (as a paragraph opener)
- "Our passionate team"
- "End-to-end solution"
- "Best-in-class"
- "Empower" / "empowering"
- "Unlock [potential/value/growth]"
- Rhetorical questions as paragraph openers ("Are you tired of...?")

### Brand-Specific Forbidden (from ra.ts `forbiddenWords` + `doNot`)

- `leverage`, `utilise`, `best-in-class`, `world-class`, `game-changer`,
  `revolutionary`, `seamless`, `powerful`, `unlock`, `journey`, `excited`,
  `thrilled`, `delighted`
- First-person plural for the company ("we", "our") in product copy — write about what the customer does, not what we do. (Earlier revisions cited a FORBIDDEN_PRONOUNS constant from a package outside this repo; neither exists.)
- Never abbreviate the company name to "RA" in voiceover or on-screen titles.
- Never use red as a primary brand colour (reserved for danger only).
- Never imply the NIR is optional or vendor-specific.
- Never write copy that creates urgency — the reader already has it.
- Never use passive voice when active voice is available.
- Never use a technical term without a plain-English explanation in the same sentence.
- Never position the brand before the reader's problem in any opening line.
- Never end a post with a CTA that drives traffic to a brand destination —
  direct the reader to act in their own interest instead.

### Visual

- **No generic AI aesthetics** — no purple gradients, glowing brains, blue
  particles, holographic UI chrome. Phill Rule 3.
- **No placeholder logos, initials, or generic square avatars** for any
  business or client. Phill Rule 4.
- **No Lorem ipsum** in any committed code or content.

---

## Required Patterns

### Custom Geometric Marks (Phill Rule 2 — Option B)

All visual indicators, navigation symbols, and status marks must be
purpose-designed SVGs, unique to Unite Group / RestoreAssist.

Design grammar:
- 24×24 viewBox
- 1.5px stroke, `strokeLinecap="square"`, `strokeLinejoin="miter"`
- Sharp corners only — no rounded ends
- 1–3 path elements maximum per mark
- Derived from the hexagon in the Unite-Group logo mark

Before adding an icon-like element, grep for an existing inline mark with the
same job — several components define their own. If none fits, design one
following the grammar above and keep it local to the component.

### Real Logos (Phill Rule 4)

- Every business in the system must have its real logo, not initials or
  placeholder squares.
- Logo auto-fetch via `/api/logo-fetch?domain=`.
- Store at `public/logos/{slug}.png` (or SVG when available).
- Use the `BusinessLogo` component with geometric-mark fallback.

### CEO-Facing Surfaces (Phill Rule 5)

Any view marked CEO-facing must show **WHAT TO DO**, not just metrics.

- Health scores belong in the background strip, not as the headline.
- Primary content: TODAY'S PRIORITIES → the next decision the CEO needs to make.
- Every metric is paired with an action or recommendation.

### Design Tokens (Phill Rule 6)

- No hardcoded colours in code. Use the CSS variables in `## Visual Tokens`.
- No hardcoded radii. Use the CEO / product register conventions.
- No inline styles for typography. Use the typography tokens.

### Autonomy (Phill Rule 7)

Anything that happens manually for a client (logo fetch, monitoring setup,
report generation) must be automated and happen without Phill lifting a
finger. If a component requires manual setup, ticket it as a follow-up to
remove the manual step.

---

## Approval Gates

Before any client-facing surface ships to production:

1. **brand-guardian skill** must return `APPROVED` (not `REVISE`).
   Invoke via the brand-guardian skill at `~/.claude/skills/brand-guardian/SKILL.md`.
2. **qa-lead skill** runs the pass/fail rubric (see `~/.claude/skills/qa-lead/`).
3. **One hallucination = automatic REVISE.** No exceptions for client-facing
   content (per brand-guardian Step 3).
4. **The $2B filter** — every piece must position the brand as the authority
   in its category. If a piece is accurate and brand-consistent but serves no
   strategic purpose, flag it; if it undermines positioning, block it.

Surfaces that bypass these gates are not allowed to merge to `main`.

---

## CI Lint Integration

This repo runs the DESIGN.md lint on every PR via
`.github/workflows/design-lint.yml`. The lint asserts:

1. `.claude/DESIGN.md` exists.
2. All required H2 headings are present (Brand Voice, Visual Tokens, Forbidden
   Patterns, Required Patterns, Approval Gates, CI Lint Integration).
3. No forbidden phrases from the brand-guardian banned list appear in
   tracked content files (excluding this DESIGN.md and brand-guardian's own
   reference docs).
4. No **net-new** imports from `lucide-react`, `@heroicons/react`, or
   `@fortawesome/*` (Phill Rule 1). The pre-existing count is recorded per file
   in `scripts/lucide-baseline.json`; a PR that grows any file past its
   baseline, or adds an import to a file with no baseline, fails
   `npm run check:no-lucide`. Replace with an inline mark and lower the
   baseline.

To run locally: `bash .github/scripts/design-md-lint.sh`.

The heading lint cannot tell whether what this file says is true — it passed
throughout the period the palette above was fiction. `npm run check:design-tokens`
is the check that compares the token tables against `app/globals.css`; keep both
in the workflow.

---

## References

In this repository:

- Token source of truth: `app/globals.css` (`--color-brand-*`)
- Token drift gate: `scripts/check-design-tokens.mjs`
- Heading lint: `.github/scripts/design-md-lint.sh`
- Icon baseline: `scripts/lucide-baseline.json`
- Known accessibility debt: `docs/design/a11y-tokens.md`, `docs/design/modal-focus-audit.md`

Referenced from the owner's machine, not this repo, so an agent cannot open
them and must not assume their contents: the brand-guardian and qa-lead skills
under the user-level `.claude/skills/`, and the 2nd Brain wiki notes on brand
voice and design-system approach.
