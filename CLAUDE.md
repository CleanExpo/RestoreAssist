# RestoreAssist

TypeScript / Next.js App Router compliance platform for Australian water damage restoration professionals.

## Commands

- **Dev**: `pnpm dev`
- **Build**: `pnpm build` (runs prisma generate + migrate deploy + next build)
- **Lint**: `pnpm lint`
- **Type check**: `pnpm type-check` — **only authoritative check**; `npx tsc --noEmit path/to/file.ts` gives false path-alias errors, never use it alone
- **Test (e2e)**: `npx playwright test` (single: `npx playwright test e2e/auth.spec.ts`)
- **Test (unit)**: `npx vitest run` (single: `npx vitest run lib/interview/__tests__/question-generation-engine.test.ts`)
- **DB studio**: `pnpm db:studio`
- **Prisma generate**: `pnpm prisma:generate` (run after every schema change, before type-check)
- **Prisma validate**: `npx prisma validate` (schema syntax check — no DB connection needed)

## Rules

1. All API routes require `getServerSession` auth check — no unauthenticated access to `/api/` routes except `/api/auth/*`, `/api/cron/*` (bearer-token gated), and webhook endpoints
2. Use Prisma `include`/`select` to prevent N+1 queries — never raw `findMany` without pagination or `take` limit
3. IICRC references must cite edition and section number (e.g., "IICRC S500:2025 §7.1") — never abbreviate or omit the standard version
4. Australian compliance: GST is always 10%, ABN format is 11 digits, state building codes vary by jurisdiction (use `lib/nir-jurisdictional-matrix.ts`)
5. Integration sync is always fire-and-forget — sync failures must never block user-facing operations
6. Use shadcn/ui components from `components/ui/` — never create custom form controls or dialogs
7. Brand colours: primary navy `#1C2E47`, warm accent `#8A6B4E`, light accent `#D4A574`, dark bg `#050505`
8. New API routes follow REST conventions: GET (list/read), POST (create), PATCH (update), DELETE (remove) — consistent `{ data }` or `{ error }` response shape
9. Environment secrets go in `.env.local` (never committed) — reference `.env.example` for the full variable list
10. Mobile app uses Capacitor (server-hosted WebView at restoreassist.app) — no static export needed for Android/iOS builds
11. All Prisma schema changes require a migration — run `npx prisma migrate dev --name descriptive_name` locally before committing
12. Read source files before modifying — this codebase has 120+ Prisma models and 800+ source files; never assume structure
13. Admin routes must use `verifyAdminFromDb()` from `lib/admin-auth.ts` — JWT role claim can be stale; always re-validate role from DB
14. Rate-limit keys must use `session.user.id`, not client IP — IP-based keys are bypassable in serverless (cold-start resets in-process Maps)
15. File upload validation must check magic bytes (not Content-Type) — see `app/api/upload/route.ts` for the JPEG/PNG/GIF/WebP pattern
16. Subscription gate before every AI call: allowlist is `["TRIAL","ACTIVE","LIFETIME"]` — CANCELED and PAST_DUE must be blocked at 402
17. Atomic credit/limit deduction: use `updateMany({ where: { creditsRemaining: { gte: 1 } } })` and check `result.count === 0` — never read-then-write
18. Never expose `error.message` in API 500 responses — always return generic `{ error: "..." }` shape; log internally only
19. Escape HTML before interpolating user content into email bodies — use a local `escapeHtml()` helper (`&`, `<`, `>`, `"`, `'`)
20. Use `session.user.id` (JWT `sub`) as the authoritative user identifier in API routes — `session.user.email` can be stale

## Architecture

Read `.claude/ARCHITECTURE.md` before structural changes or new features.

## Standards

Read `.claude/STANDARDS.md` before writing new modules or refactoring.

## Testing

Read `.claude/TESTING.md` for verification. After any task, run the relevant
test scope and verify output before reporting completion.

## Current State

Read `.claude/PROGRESS.md` at the start of every new context window.
Update it when completing tasks or making significant decisions.

## Context Management

Context will be compacted automatically. Do not stop tasks early due to
context concerns. When compacting, preserve: modified file list, test
commands, active task state from PROGRESS.md, and uncommitted decisions.

When starting a fresh context window:

1. Read `.claude/PROGRESS.md` for current state
2. Read `git log --oneline -10` for recent changes
3. Run `pnpm type-check` to verify environment
4. Continue from the next task in PROGRESS.md

## Investigation Rule

Read relevant source files before making claims about this codebase.
Never speculate about code, APIs, or data structures you haven't opened.

## Git Recovery

Automated hooks write timestamps to `.claude/PROGRESS.md` on every commit, which causes push rejections when remote has moved ahead.

Recovery: `git stash && git pull --rebase origin main && git stash pop && git push`

PROGRESS.md conflicts during rebase: `git checkout --ours .claude/PROGRESS.md && git add .claude/PROGRESS.md && git rebase --continue`
