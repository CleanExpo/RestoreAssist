# DESIGN.md — RestoreAssist

> The brand contract every AI agent (Claude Code, Claude Design, Cursor, v0, Aura)
> reads before producing UI, copy, or motion for this repo. Source of truth at
> `Synthex/packages/brand-config/src/brands/ra.ts`. This file is the human- and
> agent-readable projection of that config plus Phill's 7 non-negotiable rules.
>
> Updated: 2026-05-11. Spec: Google DESIGN.md v1 (community implementation).

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

> The CEO register (Command Center, internal ops) uses Gun Metal + Candy Red.
> The product register (field technician app) uses RestoreAssist orange.
> Tokens below are the product register. CEO surfaces overlay Gun Metal.

### Colour

| Token | Hex | Use |
|---|---|---|
| `--ra-primary` | `#E55A2B` | Brand primary — candy orange dark |
| `--ra-secondary` | `#2A3D45` | Slate — body chrome |
| `--ra-accent` | `#C5E063` | Lime — NIR highlight / action confirm |
| `--neutral-50` | `#F5F7F8` | Canvas |
| `--neutral-100` | `#E4E9EC` | Surface |
| `--neutral-500` | `#6F7B82` | Muted text |
| `--neutral-900` | `#0E1518` | Body text |
| `--success` | `#3FA34D` | Pass / completed |
| `--warning` | `#E0A800` | Attention required |
| `--danger` | `#C0392B` | Reserved for danger only — never as brand primary |

### CEO-Surface Overlay Tokens (Phill Rule 6)

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#0e1014` | Gun Metal base — all CEO views |
| `--red-500` | `#b30000` | Candy Red primary — CEO actions |
| `--orange-400` | `#e07020` | CEO secondary |
| `--green-500` | `#00a854` | CEO success |

### Typography

- **Display:** Inter, weight 800. `fonts/ra/Inter-ExtraBold.woff2`
- **Body:** Inter, weight 400. `fonts/ra/Inter-Regular.woff2`
- **Mono:** JetBrains Mono, weight 500. `fonts/ra/JetBrainsMono-Medium.woff2`

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
- Shadcn UI library internals may keep their own icons — app-level code only
  imports from `src/components/ui/marks.tsx`.

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
- Pronouns from `FORBIDDEN_PRONOUNS` (see `Synthex/packages/brand-config/src/types.ts`)
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

Before adding any icon-like element, check `src/components/ui/marks.tsx` first.
If a mark doesn't exist, design one following the grammar above.

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
   `@fortawesome/*` in `src/**/*.{ts,tsx,js,jsx}` (Phill Rule 1). The
   pre-existing count is recorded as a baseline in
   `.github/design-md-lint.baseline.txt`; PRs that grow the count fail CI.
   Migrate to `src/components/ui/marks.tsx` and lower the baseline.

To run locally: `bash .github/scripts/design-md-lint.sh`.

To upgrade this lint to the Google `google-labs-code/design.md` CLI once it
publishes an npm package, swap the shell script for `npx design-md lint`
and keep the same workflow trigger.

---

## References

- Source of truth (typed BrandConfig): `Synthex/packages/brand-config/src/brands/ra.ts`
- Visual tokens (.design.md projection): `Synthex/packages/brand-config/src/brands/ra.design.md`
- Phill's 7 design rules: `~/.claude/projects/-Users-phill-mac-2nd-Brain/memory/feedback_design_preferences.md`
- Brand voice (Klark Brown): `~/2nd Brain/2nd Brain/Wiki/voice-klark-brown.md`
- Brand guardian skill: `~/.claude/skills/brand-guardian/SKILL.md`
- Pattern reference: `~/2nd Brain/2nd Brain/Wiki/design-system-approach.md`
