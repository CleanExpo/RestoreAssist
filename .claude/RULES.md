# Rules — RestoreAssist (full list)

`CLAUDE.md` lists the 17 non-negotiables. This file holds the full 28-rule set + the Progress Framework constraints + Karpathy recall principles. Read it when a rule in CLAUDE.md needs context, or before a non-trivial change to auth / data / billing / progress code.

## Full 28-rule set

### Auth & Identity
1. Every API route requires `getServerSession` — only `/api/auth/*`, `/api/cron/*` (bearer-token), and webhook endpoints are exempt.
2. Use `session.user.id` (JWT `sub`) as authoritative identifier — `session.user.email` can be stale.
3. Admin routes use `verifyAdminFromDb()` from `lib/admin-auth.ts` — JWT role claim can be stale; always re-validate from DB.

### Dependencies & toolchain
pnpm-only. `pnpm-lock.yaml` is the source of truth; CI uses `pnpm install --frozen-lockfile`; Vercel builds the same. Mixing managers has bricked sessions — `npm uninstall` wrote a partial `package.json`, left the pnpm lockfile untouched, Vercel rejected the frozen lockfile, PR gate went red until the lockfile was regenerated.

Any dependency change:
1. Edit `package.json` by hand OR run `pnpm add <pkg>` / `pnpm remove <pkg>`.
2. `pnpm install --lockfile-only` (or `pnpm install` for a full refresh).
3. Commit `package.json` and `pnpm-lock.yaml` in the **same** commit.
4. Never commit one without the other.

### Data & Queries
4. All Prisma queries require explicit `select`/`include` and a `take` limit — never unbounded `findMany`.
5. All schema changes require a migration — `npx prisma migrate dev --name descriptive_name` before committing.
6. `$queryRaw` must use `Prisma.sql` tagged templates — never string-interpolate user values into raw SQL.

### Security
7. Never expose `error.message` in 500 responses — return `{ error: "Internal server error" }` and log internally.
8. Subscription gate before every AI call: allowlist `["TRIAL","ACTIVE","LIFETIME"]` — block `CANCELED`/`PAST_DUE` at 402.
9. Atomic credit deduction: `updateMany({ where: { creditsRemaining: { gte: 1 } } })`, check `result.count === 0` — never read-then-write.
10. Rate-limit keys use `session.user.id` — IP-based keys are bypassable in serverless cold starts.
11. File uploads must validate magic bytes, not `Content-Type` — canonical: `app/api/upload/route.ts`.
12. Escape HTML before interpolating user content into email bodies — `escapeHtml()` helper (`&` `<` `>` `"` `'`).

### Integrations
13. All sync is fire-and-forget — failures queue to dead-letter, never block user-facing requests.

### Compliance & UI
14. IICRC references cite edition and section: `S500:2021 §7.1` — never abbreviate or omit version.
15. Australian compliance: GST = 10%, ABN = 11 digits, state building codes via `lib/nir-jurisdictional-matrix.ts`.
16. Use shadcn/ui from `components/ui/` — never create custom form controls or dialogs.
17. Brand: navy `#1C2E47` · warm `#8A6B4E` · light `#D4A574` · dark bg `#050505`.

### General
18. REST conventions: GET/POST/PATCH/DELETE — consistent `{ data }` or `{ error }` response shape.
19. Secrets in `.env.local` only (never committed) — reference `.env.example` for full variable list.
20. Read source files before modifying — 120+ Prisma models, 800+ files; never assume structure.

### Progress Framework (Epic RA-1376 · Board 2026-04-18 · Motion M-4)
Non-negotiable engineering constraints on every `lib/progress/**` and related surface. Reviews reject PRs that regress any. Full rationale: `.claude/board-2026-04-18/progress-principles.md`.

21. **Cryptographic chain-of-custody** — every evidence file carries a C2PA-style manifest (SHA-256 + UTC + GPS + device + user hash), generated at capture, verified at read.
22. **Append-only audit** — `ProgressTransition` and `ProgressAttestation` are never UPDATEd or DELETEd outside `ClaimProgress` cascade; corrections use `supersedesId`.
23. **Evidence-gated promotion** — a transition fails with `{ ok: false, missing: string[] }` if any `required=true` Stage × Evidence matrix entry (M-2) is unattached.
24. **Offline-first** — attestor captures + queues transitions offline; reconnect flushes with idempotent keys so replays never double-submit.
25. **Role-based disclosure** — `canPerformTransition(role, state, transitionKey)` gates both server-side enforcement and client-side `<TransitionButton>` render; Junior Technician is evidence-only (M-16).
26. **Immutable attestation** — once a `ProgressAttestation` is written, body/signature/hashes are final; deletions are logical (`withdrawnAt`), never physical.
27. **Deterministic integration fan-out** — at most one outbound event per (`transitionId`, `integrationKey`); retries and replays are idempotent.
28. **Engagement-time licence verification** — IICRC / WHS / state licences verified against `Authorisation` (M-7) at the moment a user is attached to an attestation, NOT at login.

### Owner-action gated (human sign-off required before execution)

These actions require explicit owner/human authorization before any agent — loop-dispatched or interactive — may execute them. Preparing the plan, runbook, or PR is allowed; running the action is not.

29. **Production database migrations / cutovers** — `prisma migrate deploy` against prod, pilot cutover phases, and any schema change applied outside local/preview.
30. **Secret and credential rotation** — API keys, OAuth client secrets, service-role tokens, signing keys, `.env` values in any deployed environment.
31. **Spend above a real-money threshold** — any action that provisions paid infrastructure, upgrades a paid tier, or otherwise commits spend over **$50 AUD** in a single action.
32. **Deleting or cancelling production resources** — dropping a prod database/branch, deleting a prod deployment, cancelling a subscription, revoking a domain, deleting user data outside a documented data-subject request.
33. **Merging into `main`** — see rule 18 (AGENTS.md); restated here for completeness of the owner-gated list.

An agent that reaches an owner-gated action must stop, state exactly what it would do and why, and wait for explicit human go-ahead in that session. It must not infer prior approval from a Linear ticket status, a runbook's existence, or a prior session's notes.

## Multi-agent orchestration

When spawning `Agent` with `isolation: "worktree"`, the main thread's CWD **must** be inside a git repo. If invoked from a non-repo directory (e.g. `/Users/phill-mac/Pi-CEO`) Claude Code errors with `Cannot create agent worktree: not in a git repository`. Fix: `cd <repo>` before the `Agent` call, or pass an explicit repo-rooted `cwd` in the Agent prompt.

Without worktree isolation, parallel code-modifying agents share the working tree. This has stomped uncommitted edits in past sessions. **At most one code-modifying agent running at any time** unless worktree isolation is in place. Filing-only tracks (Smoke, Discovery) can run in parallel — they don't mutate source.

Every Agent prompt must open with a **mandatory existing-code audit**: grep for the primitive / component it intends to create, and skip the scaffold if one already exists. Past sessions have shipped duplicates (`PWAInstallPrompt.tsx` vs pre-existing `pwa-install-prompt.tsx`) when this step was skipped.

Agents must **checkpoint-commit every ~3 edits** with `git commit --allow-empty -m "checkpoint: <scope>"`. If the agent is killed mid-run, the last checkpoint becomes the recovery point instead of orphaned uncommitted state on the shared tree.

The Linear-driven continuous loop is **session-bound, not a standing cron**: it runs only for the lifetime of the invoking session and must not schedule, daemonize, or re-trigger itself after the session ends. (A prior autonomous "Shipit continuous-execution cron" was paused after it opened conflicting PRs into `main` unattended — this constraint exists to prevent a repeat.) Each backlog item dispatched by the loop follows the same one-code-modifying-agent-at-a-time / worktree-isolation / checkpoint-commit rules above, and every item's terminus is a single PR-open — never a merge, never a chain of dependent unmerged PRs assumed to land together.

## Karpathy recall (you know these — write code that reflects them)

These are not training; they are reminders. The model already understands good engineering. Use this section when a draft response feels bloated.

### 1. Think before coding
State your assumptions explicitly. If uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first
Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?"

### 3. Surgical changes
Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style, even if you'd do it differently. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request.

### 4. Goal-driven execution
Transform tasks into verifiable goals: "Add validation" → "Write tests for invalid inputs, then make them pass." For multi-step tasks, state a brief plan: `1. step → verify: check 2. step → verify: check`. Strong success criteria let you loop independently.
