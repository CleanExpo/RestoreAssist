@../Unite-Hub/.portfolio/PORTFOLIO.yaml

## Identity (SSOT)
**Canonical name:** RestoreAssist
**Aliases:** "Restore Assist", "RA"
**Canonical local path:** `D:$canon`
**GitHub:** `CleanExpo/RestoreAssist`

> Registry: see `D:\Unite-Hub\.portfolio\PORTFOLIO.yaml` (single source of truth)

---

# RestoreAssist

TypeScript / Next.js 15 App Router compliance platform for Australian water damage restoration.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Prisma generate + migrate deploy + next build |
| `pnpm lint` | ESLint |
| `pnpm type-check` | **Authoritative** type check (never `npx tsc --noEmit path/to/file` — false path-alias errors) |
| `npx playwright test` | E2E |
| `npx vitest run` | Unit |
| `pnpm prisma:generate` | After every schema change, before type-check |

## Non-negotiable rules

1. **Auth on every API route.** `getServerSession`. Exempt only: `/api/auth/*`, `/api/cron/*` (bearer-token), webhooks. Admin routes re-validate via `verifyAdminFromDb()` — JWT role claim is stale.
2. **`session.user.id` (JWT `sub`) is the identifier.** `session.user.email` can be stale.
3. **Prisma:** every `findMany` has explicit `select`/`include` + `take`. Raw SQL uses `Prisma.sql` tagged templates only.
4. **Migrations only.** `npx prisma migrate dev --name X` before commit. No raw schema edits.
5. **Subscription gate before AI calls.** Allowlist `["TRIAL","ACTIVE","LIFETIME"]`; block `CANCELED`/`PAST_DUE` at HTTP 402.
6. **Atomic credit deduction.** `updateMany({ where: { creditsRemaining: { gte: 1 } } })`; check `result.count === 0`. Never read-then-write.
7. **pnpm only.** Touching `package.json` requires touching `pnpm-lock.yaml` in the same commit. Never `npm`, `yarn`, `bun`.
8. **Rate-limit keys are `session.user.id`** — IP keys are bypassable in serverless cold starts.
9. **No `error.message` in 500s.** Internal log; return `{ error: "Internal server error" }`.
10. **Escape HTML before email-body interpolation** — `escapeHtml()` helper (`& < > " '`).
11. **File uploads validate magic bytes**, not `Content-Type`. Canonical: `app/api/upload/route.ts`.
12. **IICRC refs cite edition + section.** `S500:2021 §7.1`. Never abbreviate.
13. **AU compliance:** GST = 10%, ABN = 11 digits, state codes via `lib/nir-jurisdictional-matrix.ts`.
14. **shadcn/ui only** from `components/ui/`. Brand: navy `#1C2E47` · warm `#8A6B4E` · light `#D4A574` · bg `#050505`.
15. **Secrets in `.env.local` only.** Reference `.env.example`.
16. **Read before modify.** 120+ Prisma models, 800+ files — never assume.
17. **Progress Framework (RA-1376 Epic) is non-negotiable.** Full constraints in `.claude/RULES.md`.

## Package source — use opensrc, don't fabricate APIs

When you need to read a dependency's internals (Next.js Router, Prisma client emit, AI SDK transport, Radix primitive), don't guess.

```bash
rg "pattern" $(opensrc path next prisma @ai-sdk/anthropic)
cat $(opensrc path zod)/src/types.ts
```

Setup if not installed: `npm install -g opensrc` (one-time; pnpm-only rule applies to repo deps, not global CLI tools). Source vendored at `vendor/opensrc/` for reference.

## Reference files — read on demand

- `.claude/RULES.md` — full 28-rule list, Progress Framework, AppendKarpathy reminders
- `.claude/ARCHITECTURE.md` — system design + data flow
- `.claude/STANDARDS.md` — patterns + conventions
- `.claude/TESTING.md` — test scope + verification
- `.claude/PACKAGE_LOOKUPS.md` — opensrc patterns for common RA dependencies
- `.claude/aggregation/MASTER_PLAN.md` — current state + roadmap + stages to finish
- `.claude/rules/verification-gate.md` — always-on completion gate
- `.claude/rules/review-dimensions.md` — 18-dimension PR review rubric

## Session bootstrap

1. `git log --oneline -10`
2. `cat .claude/aggregation/MASTER_PLAN.md` (skim — section 1 is current state)
3. `pnpm type-check`

## Git recovery

PROGRESS.md hook causes push rejections when remote moves:
```
git stash && git pull --rebase origin sandbox && git stash pop && git push
```
Rebase conflict on PROGRESS.md: `git checkout --ours .claude/PROGRESS.md && git add .claude/PROGRESS.md && git rebase --continue`

## What you already know (Karpathy recall — these are reminders, not training)

- Think before coding. State assumptions. Surface tradeoffs. If unclear, stop and ask.
- Simplicity first. 50 lines beats 200. Would a senior engineer say this is overcomplicated?
- Surgical changes. Don't refactor adjacent code. Every changed line traces to the user's request.
- Goal-driven. Define success criteria, loop until verified. Strong criteria let you loop independently.
- No comments for what well-named identifiers already say. Only WHY (hidden constraints, invariants).
- Don't add error handling for impossible scenarios. Trust internal code and framework guarantees.

## Docs retrieval — check the index first, open files second

`docs/` carries an OKF index layer (one `index.md` per folder). For a known-fact docs
lookup run the deterministic path before Grep:
`node "$HOME/2nd Brain/2nd Brain/_system/brain.js" find "<question>" --root docs`
(scores every index line without opening files, answers from one file). On a miss:
Grep, then ADD the missing index line. Gate: `brain.js bench --root docs` must stay
5/5 (`docs/brain-bench.json`). Standard: brain-1 `Wiki/second-brain-standard.md`.
