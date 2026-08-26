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
- **Production is deployed by hand.** Merging to `main` ships nothing;
  `deploy-production.yml` is `workflow_dispatch`-only and owner-gated.

## Australian and New Zealand English

Product copy, comments and documentation use AU/NZ spelling — `organisation`,
`colour`, `authorised`. `npm run check:au-english` enforces it. Identifiers and
API fields keep whatever spelling the code already uses.
