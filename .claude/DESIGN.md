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

The palette is A, "Harbour blue and signal orange" (chosen 19/11/2026). Token
names describe roles, not hues: `bronze` is now burnt orange and `gold` is signal
orange. Use the Tailwind utility (`bg-brand-navy`) rather than the hex;
components must carry no raw hex literal.

### Colour — core brand

| Token | Hex | Use |
|---|---|---|
| `--color-brand-navy` | `#12324f` | Primary — headings, strong text, foreground |
| `--color-brand-navy-hover` | `#0c2238` | Navy, hover |
| `--color-brand-harbour` | `#1b5fa6` | Harbour blue — links, focus ring, accents on light |
| `--color-brand-harbour-light` | `#6aa5e2` | Harbour blue for dark surfaces — links, primary in dark mode |
| `--color-brand-bronze` | `#a34a06` | Burnt orange — secondary highlight, borders |
| `--color-brand-slate` | `#4a5868` | Muted — body copy, meta text |
| `--color-brand-gold` | `#f5a623` | Signal orange — highlight on dark surfaces only |
| `--color-brand-gold-hover` | `#f7b955` | Signal orange, hover |

### Colour — CTA and light surfaces

| Token | Hex | Use |
|---|---|---|
| `--color-brand-cta` | `#1b5fa6` | Primary CTA (solid, white text) |
| `--color-brand-cta-hover` | `#154c86` | Primary CTA, hover |
| `--color-brand-steel` | `#55687c` | Secondary CTA steel |
| `--color-brand-steel-hover` | `#2f4053` | Secondary CTA steel, hover |
| `--color-brand-mist` | `#d5dde5` | Borders, glass surface on hero |
| `--color-brand-cloud` | `#f4f7fa` | Off-white section surface, light sidebar |
| `--color-brand-cream` | `#eaf1f8` | Accent surface, active nav item |
| `--color-brand-cream-2` | `#dbe7f3` | Accent surface, hover |

### Colour — dark surfaces

| Token | Hex | Use |
|---|---|---|
| `--color-brand-canvas` | `#0b1520` | Dark-mode page background |
| `--color-brand-surface` | `#10202f` | Dark-mode card / panel |
| `--color-brand-surface-2` | `#152839` | Dark-mode card, hover; muted surface |
| `--color-brand-deep` | `#0e1c2b` | Sketch editor / capture flow |
| `--color-brand-ink` | `#0a131c` | Drawer / sidebar in dark mode |
| `--color-brand-abyss` | `#060c14` | Deepest background |

### Contrast — read before choosing a colour

Measured WCAG ratios:

| Pair | Ratio |
|---|---|
| White on `brand-cta` `#1b5fa6` | 6.49:1 |
| White on `brand-bronze` `#a34a06` | 5.93:1 |
| `brand-slate` on white | 7.27:1 |
| `brand-harbour-light` on `brand-canvas` | 7.08:1 |
| `brand-gold` on `brand-navy` | 6.50:1 |
| `brand-gold` on white | 2.03:1 (fails) |

Rules that follow from these:

- Solid buttons with white text use `brand-cta` (or a step 600 colour), never a
  step 500 colour.
- `brand-gold` is for dark surfaces only. On a light surface it fails AA.
- In dark mode, links and the primary colour use `brand-harbour-light`;
  `brand-harbour` on `brand-canvas` measures 2.83:1 and fails.
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
