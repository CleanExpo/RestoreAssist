@AGENTS.md

# RestoreAssist

Job system for Australian and New Zealand restoration contractors: one job
carries site capture, evidence, sketch, report, scope and invoice. Next.js App
Router, Prisma, 221 models, ~3,200 TypeScript files.

## Read before you write

Claude Code auto-loads this file, `AGENTS.md` and `.claude/rules/*.md` — nothing
else. Everything below has to be opened deliberately.

| Read | When |
| --- | --- |
| `.claude/RULES.md` | **Before any change to auth, data, billing, AI calls, or `lib/progress/**`.** 33 rules, most written after an incident. Also lists the owner-gated actions no agent may execute. |
| `.claude/STANDARDS.md` | IICRC citations, copyright guard, `standardCite()`. |
| `.claude/DESIGN.md` | Brand tokens and UI conventions. |
| `.claude/TESTING.md` | What runs where, and which globs CI actually picks up. |
| `.claude/ARCHITECTURE.md` | Where a thing belongs before you add it. |
| `docs/architecture/RESTOREASSIST-DECISIONS.md` | D-001 onward. A decision here outranks a plausible-sounding alternative. |
| `docs/session-handoffs/index.md` | What the last session left running. |

## Single sources of truth

Each of these has one owner and several tempting near-duplicates. Import the
owner; do not re-derive the value.

| Concern | Owner | Not |
| --- | --- | --- |
| GST and currency | `lib/gst-rules.ts` (AU 10%, NZ 15%) | a hardcoded `0.1`, `?? 10`, or `/ 11` |
| Locale formatting | `lib/locale/format.ts` | `lib/formatters.ts`, which pins `en-AU` |
| IICRC citations | `standardCite()` in `lib/nir-standards-mapping.ts` | a hand-typed edition or year |
| Brand colour | `app/globals.css` `--color-brand-*` | a hex literal in a component |
| Room identity | `SketchRoom`, keyed by `fabricObjectId` | a free-text room name column |
| Stripe API version | `STRIPE_API_VERSION` in `lib/stripe.ts` | a second `apiVersion:` literal; one drifted four versions behind unnoticed |

## Costly to get wrong here

- **Prisma `onDelete: SetNull` on evidence.** Deleting a `SketchRoom` does not
  fail and does not cascade — it silently blanks the room link on pins,
  moisture readings and hazards. Detach instead; see `partitionStaleRooms()`.
- **Token-gated routes** (`/sign`, `/capture`, `/invite`, `/invoices/public`,
  `/portal/<token>`) are protected only by the secrecy of the URL. They must
  serve `noindex`, and `robots.txt` must not `Disallow` them — a Disallow stops
  the crawler reading the `noindex`.
- **`gitleaks --no-git` ignores `.gitignore`.** Verify against a
  `git checkout-index` export, which is what CI scans.
- **Merging to `main` deploys production.** The DigitalOcean app auto-deploys
  on push to `main` (about 16 minutes); `/api/health` reports the live
  `deploymentSha`. `deploy-production.yml` is not the release path.

## Australian and New Zealand English

Product copy, comments and documentation use AU/NZ spelling — `organisation`,
`colour`, `authorised`. `npm run check:au-english` enforces it. Identifiers and
API fields keep whatever spelling the code already uses.

## Vendor routing (temporary, expires 2026-09-12)

CURSOR for Codex until 12th Sept

VENDOR ROUTING ORDER — effective immediately, expires 2026-09-12.

FACT: Codex quota is exhausted until 2026-09-12. Cursor plans are active
and funded. This order overrides any document that says otherwise.

STANDING RULES
1. Do NOT invoke `codex` in any form. No retries, no probes, no queuing
   work while waiting for it. Every Codex failure before this notice is
   explained by the quota fact — stop treating it as transient.
2. Wherever ANY prompt, doc, skill, CLAUDE.md, or goal card says "Codex",
   read it as "the adversarial / second-vendor slot". That slot is filled
   by CURSOR until 2026-09-12.
3. Invoke Cursor headlessly:
     agent -p "<the adversarial brief>" --output-format text
   The binary is `agent`; -p/--print is non-interactive. Omit --model to
   use the plan default unless the card's model registry names one. Wrap
   the call in a timeout: if it hangs, kill it, retry once, then file a
   blocker — never fall back to codex.
4. Auth is founder-side, once per machine: `agent login` (or a
   CURSOR_API_KEY in env, via the password manager). Missing auth = a
   NAMED BLOCKER on the scoreboard, not a reason to touch Codex.
5. Fallback ladder if Cursor is unavailable on this machine: run the
   review as a FRESH-CONTEXT Claude session (clean context, no shared
   state with the authoring session) and record the degradation on the
   scoreboard as "cross-vendor pass ran single-vendor fresh-context".
   Skipping the audit stage entirely is never an option.
6. Every cross-vendor pass records which engine ran it. On or after
   2026-09-12: check the date, ASK THE FOUNDER whether Codex returns to
   the slot — do not auto-revert.

## Premium Visual & Motion Standard (HARD RULE — Phill McGurk, 2 Nov 2026)

This applies to every page a customer can see. It is enforced in CI by `check-visuals`; a PR that fails it is not done.

1. **No code-drawn graphics.** Zero TypeScript/CSS/SVG/canvas illustrations, decorative shapes, conic/radial gradient "art", clip-path shapes or placeholder images. UI icons come from a real icon set (lucide-react); logos are marked `data-pv-allow="logo"`.
2. **Real media only, in this order:** the client's own photos/video → licensed real stock (downloaded and self-hosted, never hot-linked) → Higgsfield photoreal images/video using the `cinematic-au-restoration` preset → Blender renders for products/equipment (offline turntables, never heavy runtime WebGL). Every file is listed in `media.manifest.json` with `source` (client|stock|generated|blender), `credit` and `alt`.
3. **Every marketing page uses the standard package** `@cleanexpo/premium-visuals`: `<PremiumHero>` with a muted, looping, lazy-loaded video (AV1 MP4 + WebM + H.264 MP4, poster required) or a real photo; at least one `<MotionSection>`; `<Carousel>` (Embla) for galleries, testimonials, services/courses; page transitions via `navigateWithTransition`/View Transitions; all motion honours `prefers-reduced-motion`. Start new pages from `scripts/premium-visuals/marketing-page.template.tsx.txt`.
4. **Premium type and layout:** Fraunces display + Manrope body + JetBrains Mono data via next/font (or the repo's approved brand system). No system/Inter/Roboto/Arial.
5. **Media budgets:** AVIF/WebP images ≤ 450 KB, videos ≤ 6 MB, no PNG/JPG > 80 KB, no .mov.
6. **Visibility pillars first:** Find → Crawl → Index → Ranking are set up before any SEO/AEO/GEO tactics.
7. **Process:** plan the page with the **SPM** skill (`/spm` — spec before build, include the media plan and prompt manifest), then pass the **SDA visual and commercial evidence gate** (`skills/visual-qa`, `sda_evidence_gate.py`: real Playwright screenshots at 390/768/1440, reduced-motion check, video frame review, named SDA rubric). Non-zero = HOLD.
8. Generate media with `npx generate-media --prompts media.prompts.json` (dry run by default; `--go` uses the existing Higgsfield plan; keys from env, never printed). Render 3D with `npx blender-render model.glb --id <id>`.
