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
