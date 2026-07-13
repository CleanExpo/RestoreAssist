# Welcome to RestoreAssist

## How We Use Claude

Based on Claude's usage over the last 30 days:

Work Type Breakdown:
  _TODO — only 1 session in window with no descriptors to classify.
   Strongest signal: GitHub MCP-heavy work (PR / review / CI automation)._

Top Skills & Commands:
  _None recorded this window._

Top MCP Servers:
  GitHub  ████████████████████  59 calls

## Your Setup Checklist

### Codebases
- [ ] restoreassist — https://github.com/cleanexpo/restoreassist

### MCP Servers to Activate
- [ ] GitHub — PRs, reviews, CI status, issues, and merges from inside Claude
      (the team's most-used integration, 59 calls). Access: install the GitHub
      MCP server, authenticate with a token scoped to `cleanexpo/restoreassist`
      (repo + PR).

### Skills to Know About
- [ ] /security-review — full security review of pending changes on the branch
      (the team leans on this — RA-6800 TOCTOU/IDOR hardening).
- [ ] /review-pr — run a single PR through the full review pipeline
      (triage → checks → 18-dimension review → verdict).
- [ ] /code-review — review the current diff for correctness + cleanup before pushing.
- [ ] /verify — run the app and confirm a change actually works (Verification Gate).

## Team Tips

- **Branch + draft PR, never push to `main`.** Work on a `claude/<slug>` branch,
  open a **draft** PR, and let CI run. Mark it **ready for review** when green —
  that's what triggers the CodeRabbit review.
- **`Quality Checks` is the merge gate.** It runs `prisma generate` + `tsc` +
  Vitest + build against a real Postgres. The Vercel preview building is *not*
  the gate — wait for Quality Checks.
- **Re-assert ownership in the write, not just a pre-check (RA-6800).** Every
  mutation scopes its Prisma `where` by owner/tenant
  (`{ id, userId }`, `{ id, library: { userId } }`, …). Prisma 6
  `extendedWhereUnique` makes relation filters in singular `update`/`delete`
  valid — confirmed by real-DB integration tests. Return **404, not 403**, for
  cross-tenant misses (no ID enumeration).
- **Verification Gate (`.claude/rules/`).** Before claiming done, produce a
  verification checklist; avoid "done/all set" phrasing without it.
- **Prisma counters:** never read-then-write — use atomic `update`/`updateMany`
  with a conditional `where` and check `count`.
- **DB-gated tests** use `describe.skipIf(!process.env.DATABASE_URL)` so they run
  in CI and skip locally.
- **AU compliance:** GST 10%, ABN 11 digits, IICRC citations exact — see
  `lib/nir-jurisdictional-matrix.ts` and `CLAUDE.md`.

## Get Started

1. Read `CLAUDE.md` and `.claude/rules/` — the project's non-negotiables.
2. Set up the GitHub MCP server (above) and clone `restoreassist`.
3. Make a small change on a `claude/<slug>` branch; run `pnpm type-check` and
   `pnpm exec vitest run` locally.
4. Open a **draft** PR, watch `Quality Checks`, mark **ready** when green.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
