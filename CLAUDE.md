@../Unite-Hub/.portfolio/PORTFOLIO.yaml

<!--
  RECONSTRUCTION NOTE (2026-06-15):
  This file was reconstructed. The original CLAUDE.md was UTF-8-corrupted since ~the
  initial commit (a Windows generation tool baked 1393 U+FFFD replacement characters
  into ~31% of the file), and that original text is overwritten/unrecoverable — the
  same systemic corruption that hit Synthex. The surviving clean fragments are
  preserved verbatim; corrupted sections were rebuilt from this repo's own grounded
  sources: `.claude/RULES.md` (the full 28-rule set), `.claude/TESTING.md`,
  `.claude/PACKAGE_LOOKUPS.md`, `.claude/rules/*`, `package.json`, `prisma/schema.prisma`,
  and the portfolio registry. There is no CONSTITUTION.md in this repo. Where the
  original intent was unrecoverable, content was written to match the repo's verified
  reality rather than guessed. `.claude/RULES.md` is the authoritative full rule set;
  this file is the condensed always-loaded summary.
-->

## Identity (SSOT)
**Canonical name:** RestoreAssist
**Aliases:** "Restore Assist", "RA"
**Canonical local path:** `D:\RestoreAssist`
**GitHub:** `CleanExpo/RestoreAssist`

> Registry: see `D:\Unite-Hub\.portfolio\PORTFOLIO.yaml` (single source of truth)

---

# RestoreAssist

TypeScript / Next.js 16 App Router compliance platform for Australian water damage restoration.

## Commands

Package manager is **pnpm-only** (`pnpm-lock.yaml` is the source of truth; CI and Vercel use `--frozen-lockfile`). Never mix in `npm`/`yarn`.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local dev server (port 3000) |
| `pnpm type-check` | `tsc --noEmit` — fastest verification, run after every change (use full `tsc --noEmit path/to/file` and you'll get false path-alias errors; prefer the script) |
| `pnpm lint` | ESLint |
| `pnpm build` | Full production build |
| `npx playwright test` | E2E tests |
| `npx prisma migrate dev --name <name>` | Create a migration after a schema change |
| `npx prisma generate` | Regenerate the Prisma client |

Full testing reference: `.claude/TESTING.md`.

## The 17 non-negotiables

These are the always-loaded essentials. The full 28-rule set, rationale, and the Progress Framework constraints live in `.claude/RULES.md` — read it before any non-trivial change to auth / data / billing / progress code.

1. **Auth on every route.** Every API route requires `getServerSession` — only `/api/auth/*`, `/api/cron/*` (bearer-token), and webhook endpoints are exempt.
2. **Identity is `session.user.id`** (JWT `sub`), the authoritative identifier — `session.user.email` can be stale.
3. **Prisma:** every query needs explicit `select`/`include` and a `take` limit — never an unbounded `findMany`.
4. **Migrations, not push.** All schema changes require `npx prisma migrate dev --name descriptive_name` before committing.
5. **Raw SQL is parameterised.** `$queryRaw` uses `Prisma.sql` tagged templates — never string-interpolate user values.
6. **Subscription gate before every AI call** — allowlist `["TRIAL","ACTIVE","LIFETIME"]`; block `CANCELED`/`PAST_DUE` at 402.
7. **Atomic credit deduction:** `updateMany({ where: { creditsRemaining: { gte: 1 } } })`; check `result.count === 0`. Never read-then-write.
8. **Rate-limit keys use `session.user.id`** — IP-based keys are bypassable in serverless cold starts.
9. **No `error.message` in 500s.** Return `{ error: "Internal server error" }` and log internally.
10. **Escape user content in emails** — `escapeHtml()` helper (`& < > " '`).
11. **File uploads validate magic bytes**, not `Content-Type` — canonical: `app/api/upload/route.ts`.
12. **Fire-and-forget integrations** — failures queue to a dead-letter, never block user-facing requests.
13. **AU compliance:** GST = 10%, ABN = 11 digits, state codes via `lib/nir-jurisdictional-matrix.ts`.
14. **IICRC references cite edition and section** — e.g. `S500:2025 §7.1`. Never abbreviate or omit the version.
15. **shadcn/ui only.** Use `components/ui/` — never hand-roll form controls or dialogs. Brand: navy `#1C2E47` · warm `#8A6B4E` · light `#D4A574` · dark bg `#050505`.
16. **Secrets in `.env.local` only** (never committed). Reference `.env.example` for the full variable list.
17. **Read before you modify.** 120+ Prisma models, 800+ files — never assume structure; don't fabricate APIs.

When you need to read a dependency's internals (Next.js Router, Prisma client, the AI SDK transport), read the source — don't guess. Use `opensrc` (e.g. `$(opensrc path zod)/src/types.ts`); `npm install -g opensrc` is fine (the pnpm-only rule covers RA's `package.json` deps, not global CLI tools). Source is vendored at `vendor/opensrc/`. Patterns: `.claude/PACKAGE_LOOKUPS.md`.

## Reference docs (`.claude/`)

- `.claude/RULES.md` — full 28-rule set + Progress Framework + multi-agent orchestration
- `.claude/ARCHITECTURE.md` — system architecture
- `.claude/STANDARDS.md` — patterns linters can't catch
- `.claude/WORKFLOWS.md` — branch naming + workflows
- `.claude/TESTING.md` — test scope + verification
- `.claude/PACKAGE_LOOKUPS.md` — opensrc patterns for reading dependency source
- `.claude/DESIGN.md` — design system + brand
- `.claude/rules/verification-gate.md` — always-on completion gate
- `.claude/rules/review-dimensions.md` — the 18 PR review dimensions

## Working principles (you already know these — write code that reflects them)

These are reminders, not training. Use them when a draft feels bloated.

- **Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and name it.
- **Simplicity first.** Minimum code that solves the problem. No abstractions for single-use code, no "flexibility" that wasn't requested, no error handling for impossible scenarios.
- **Surgical changes.** Touch only what you must. Don't "improve" adjacent code or refactor things that aren't broken. Every changed line should trace to the request.
- **Goal-driven execution.** Turn tasks into verifiable goals and state a brief plan with checks. Then close the verification gate (`.claude/rules/verification-gate.md`) before claiming done.
- **Trust internal code; verify externals.** Read this repo's own code directly (it's reality, not training); read dependency source via opensrc when behaviour is in question.
