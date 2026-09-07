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
- **Production is deployed by hand.** Merging to `main` ships nothing;
  `deploy-production.yml` is `workflow_dispatch`-only and owner-gated.

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
