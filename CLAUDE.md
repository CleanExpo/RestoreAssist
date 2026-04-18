# RestoreAssist

TypeScript / Next.js 15 App Router compliance platform for Australian water damage restoration.

## Commands

| Command                | Purpose                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`             | Development server                                                                                          |
| `pnpm build`           | Prisma generate + migrate deploy + next build                                                               |
| `pnpm lint`            | ESLint                                                                                                      |
| `pnpm type-check`      | **Authoritative type check** — never use `npx tsc --noEmit path/to/file.ts` alone (false path-alias errors) |
| `npx playwright test`  | E2E suite / single: `npx playwright test e2e/auth.spec.ts`                                                  |
| `npx vitest run`       | Unit tests / single: `npx vitest run lib/interview/__tests__/...`                                           |
| `pnpm db:studio`       | Prisma Studio                                                                                               |
| `pnpm prisma:generate` | Run after every schema change, before type-check                                                            |
| `npx prisma validate`  | Schema syntax check — no DB connection needed                                                               |

## Rules

### Auth & Identity
1. Every API route requires `getServerSession` — only `/api/auth/*`, `/api/cron/*` (bearer-token), and webhook endpoints are exempt
2. Use `session.user.id` (JWT `sub`) as authoritative identifier — `session.user.email` can be stale
3. Admin routes use `verifyAdminFromDb()` from `lib/admin-auth.ts` — JWT role claim can be stale; always re-validate from DB

### Data & Queries

4. All Prisma queries require explicit `select`/`include` and a `take` limit — never unbounded `findMany`
5. All schema changes require a migration — `npx prisma migrate dev --name descriptive_name` before committing
6. `$queryRaw` must use `Prisma.sql` tagged templates — never string-interpolate user values into raw SQL

### Security

7. Never expose `error.message` in 500 responses — return `{ error: "Internal server error" }` and log internally
8. Subscription gate before every AI call: allowlist `["TRIAL","ACTIVE","LIFETIME"]` — block `CANCELED`/`PAST_DUE` at 402
9. Atomic credit deduction: `updateMany({ where: { creditsRemaining: { gte: 1 } } })`, check `result.count === 0` — never read-then-write
10. Rate-limit keys use `session.user.id` — IP-based keys are bypassable in serverless cold starts
11. File uploads must validate magic bytes, not `Content-Type` — canonical: `app/api/upload/route.ts`
12. Escape HTML before interpolating user content into email bodies — `escapeHtml()` helper (`&` `<` `>` `"` `'`)

### Integrations

13. All sync is fire-and-forget — failures queue to dead-letter, never block user-facing requests

### Compliance & UI

14. IICRC references cite edition and section: `S500:2025 §7.1` — never abbreviate or omit version
15. Australian compliance: GST = 10%, ABN = 11 digits, state building codes via `lib/nir-jurisdictional-matrix.ts`
16. Use shadcn/ui from `components/ui/` — never create custom form controls or dialogs
17. Brand: navy `#1C2E47` · warm `#8A6B4E` · light `#D4A574` · dark bg `#050505`

### General

18. REST conventions: GET/POST/PATCH/DELETE — consistent `{ data }` or `{ error }` response shape
19. Secrets in `.env.local` only (never committed) — reference `.env.example` for full variable list
20. Read source files before modifying — 120+ Prisma models, 800+ files; never assume structure

### Progress Framework (Epic RA-1376 · Board 2026-04-18 · Motion M-4)

Non-negotiable engineering constraints on every `lib/progress/**` and related surface. Reviews reject PRs that regress any. Full rationale: `.claude/board-2026-04-18/progress-principles.md`.

21. **Cryptographic chain-of-custody** — every evidence file carries a C2PA-style manifest (SHA-256 + UTC + GPS + device + user hash), generated at capture, verified at read
22. **Append-only audit** — `ProgressTransition` and `ProgressAttestation` are never UPDATEd or DELETEd outside `ClaimProgress` cascade; corrections use `supersedesId`
23. **Evidence-gated promotion** — a transition fails with `{ ok: false, missing: string[] }` if any `required=true` Stage × Evidence matrix entry (M-2) is unattached
24. **Offline-first** — attestor captures + queues transitions offline; reconnect flushes with idempotent keys so replays never double-submit
25. **Role-based disclosure** — `canPerformTransition(role, state, transitionKey)` gates both server-side enforcement and client-side `<TransitionButton>` render; Junior Technician is evidence-only (M-16)
26. **Immutable attestation** — once a `ProgressAttestation` is written, body/signature/hashes are final; deletions are logical (`withdrawnAt`), never physical
27. **Deterministic integration fan-out** — at most one outbound event per (`transitionId`, `integrationKey`); retries and replays are idempotent
28. **Engagement-time licence verification** — IICRC / WHS / state licences verified against `Authorisation` (M-7) at the moment a user is attached to an attestation, NOT at login

## Reference Files

Before structural changes or new features, read:

- `.claude/ARCHITECTURE.md` — system design and data flow
- `.claude/STANDARDS.md` — code patterns and conventions
- `.claude/TESTING.md` — test scope and verification

## Context Window

**Session start:** read `.claude/PROGRESS.md` → `git log --oneline -10` → `pnpm type-check`

**Before compaction:** update `.claude/PROGRESS.md` with active task state and uncommitted decisions.

## Git Recovery

Hooks write timestamps to `.claude/PROGRESS.md` on every commit, causing push rejections when remote has moved ahead.

```
git stash && git pull --rebase origin sandbox && git stash pop && git push
```

PROGRESS.md rebase conflict: `git checkout --ours .claude/PROGRESS.md && git add .claude/PROGRESS.md && git rebase --continue`

---

## Karpathy-Inspired Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
