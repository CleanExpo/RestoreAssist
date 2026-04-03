# RestoreAssist

TypeScript / Next.js App Router compliance platform for Australian water damage restoration professionals.

## Commands

- **Dev**: `pnpm dev`
- **Build**: `pnpm build` (runs prisma generate + migrate deploy + next build)
- **Lint**: `pnpm lint`
- **Type check**: `pnpm type-check` (single file: `npx tsc --noEmit path/to/file.ts`)
- **Test (e2e)**: `npx playwright test` (single: `npx playwright test e2e/auth.spec.ts`)
- **Test (unit)**: `npx vitest run` (single: `npx vitest run lib/interview/__tests__/question-generation-engine.test.ts`)
- **DB studio**: `pnpm db:studio`
- **Prisma generate**: `pnpm prisma:generate` (run after every schema change before type-check)
- **Prisma validate**: `npx prisma validate` (verify schema syntax without DB connection)

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
10. Mobile app uses Capacitor (server-hosted WebView at restoreassist.com.au) — no static export needed for Android/iOS builds
11. All Prisma schema changes require a migration — run `npx prisma migrate dev --name descriptive_name` locally before committing
12. Read source files before modifying — this codebase has 120+ Prisma models and 800+ source files; never assume structure

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
