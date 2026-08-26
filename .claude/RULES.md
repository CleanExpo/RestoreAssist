# Rules — RestoreAssist (full list)

The 33 rules below are the full set: engineering non-negotiables (1-20), the
Progress Framework constraints (21-28), and the owner-gated actions (29-33).

**Nothing auto-loads this file.** Claude Code loads `CLAUDE.md`, `AGENTS.md` and
`.claude/rules/*.md` only, so `CLAUDE.md` routes here. Read it before any change
to auth, data, billing, AI calls or `lib/progress/**`, and whenever you are
about to do something that looks owner-gated.

## The 33 rules

### Auth & Identity
1. Every API route requires `getServerSession` — only `/api/auth/*`, `/api/cron/*` (bearer-token), and webhook endpoints are exempt.
2. Use `session.user.id` (JWT `sub`) as authoritative identifier — `session.user.email` can be stale.
3. Admin routes use `verifyAdminFromDb()` from `lib/admin-auth.ts` — JWT role claim can be stale; always re-validate from DB.

### Dependencies & toolchain
npm-only. `package-lock.json` is the source of truth; CI and production builds use `npm ci`. Mixing managers has bricked sessions, so the release-bootstrap guard rejects non-npm lockfiles and pnpm runtime commands.

Any dependency change:
1. Edit `package.json` by hand OR run `npm install <pkg>` / `npm uninstall <pkg>`.
2. Run `npm install --package-lock-only` (or `npm install` for a full refresh).
3. Commit `package.json` and `package-lock.json` in the **same** commit.
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
14. IICRC references cite edition and section: `S500:2021 §7.1` — never abbreviate or omit version. Generate them with `standardCite()` (`lib/nir-standards-mapping.ts`), which owns the current editions; a hand-typed year goes stale silently and `npm run check:standards` will reject an invented one.
15. Tax and identifiers come from `lib/gst-rules.ts` — **AU GST 10%, NZ GST 15%**. Never hardcode `0.1`, `?? 10` or `/ 11`; the product ships to both countries and roughly a dozen call sites still bypass this helper. ABN = 11 digits (`lib/validation/`), NZBN via `lib/validation/nzbn-validator.ts`. State building codes via `lib/nir-jurisdictional-matrix.ts`.
16. Use shadcn/ui from `components/ui/` — never create custom form controls or dialogs.
17. Brand: navy `#1C2E47` · warm `#8A6B4E` · light `#D4A574` · dark bg `#050505`.

### General
18. REST conventions: GET/POST/PATCH/DELETE — consistent `{ data }` or `{ error }` response shape.
19. Secrets in `.env.local` only (never committed) — reference `.env.example` for full variable list.
20. Read source files before modifying — 221 Prisma models, ~3,200 TypeScript files; never assume structure. Several concerns have a correct owner and a tempting near-duplicate (see the source-of-truth table in `CLAUDE.md`), so grep for an existing helper before adding one.

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
33. **Merging into `main`, and promoting a release** — an agent opens a PR and stops. Merging is the owner's, and merging ships nothing on its own: `deploy-production.yml` is `workflow_dispatch`-only and needs a release-gate run ID plus the 40-character SHA typed as confirmation.

An agent that reaches an owner-gated action must stop, state exactly what it would do and why, and wait for explicit human go-ahead in that session. It must not infer prior approval from a Linear ticket status, a runbook's existence, or a prior session's notes.

## Multi-agent orchestration

When spawning `Agent` with `isolation: "worktree"`, the main thread's CWD **must** be inside a git repo. If invoked from a non-repo directory (e.g. `/Users/phill-mac/Pi-CEO`) Claude Code errors with `Cannot create agent worktree: not in a git repository`. Fix: `cd <repo>` before the `Agent` call, or pass an explicit repo-rooted `cwd` in the Agent prompt.

Without worktree isolation, parallel code-modifying agents share the working tree. This has stomped uncommitted edits in past sessions. **At most one code-modifying agent running at any time** unless worktree isolation is in place. Filing-only tracks (Smoke, Discovery) can run in parallel — they don't mutate source.

Every Agent prompt must open with a **mandatory existing-code audit**: grep for the primitive / component it intends to create, and skip the scaffold if one already exists. Past sessions have shipped duplicates (`PWAInstallPrompt.tsx` vs pre-existing `pwa-install-prompt.tsx`) when this step was skipped.

Agents must **checkpoint-commit every ~3 edits** with `git commit --allow-empty -m "checkpoint: <scope>"`. If the agent is killed mid-run, the last checkpoint becomes the recovery point instead of orphaned uncommitted state on the shared tree.

The Linear-driven continuous loop is **session-bound, not a standing cron**: it runs only for the lifetime of the invoking session and must not schedule, daemonize, or re-trigger itself after the session ends. (A prior autonomous "Shipit continuous-execution cron" was paused after it opened conflicting PRs into `main` unattended — this constraint exists to prevent a repeat.) Each backlog item dispatched by the loop follows the same one-code-modifying-agent-at-a-time / worktree-isolation / checkpoint-commit rules above, and every item's terminus is a single PR-open — never a merge, never a chain of dependent unmerged PRs assumed to land together.

## Working style

General engineering judgement is assumed; this section only covers where this
repo's grain differs from the obvious default.

- **Scope is the deliverable.** Touch what the request needs. Noticing adjacent
  dead code is worth a sentence, not a commit.
- **A test that has never been red proves nothing.** Run it against the unfixed
  code and watch it fail before you claim it guards anything. This repo has a
  standing weekly job hunting suites that pass without exercising the
  production path, because they keep appearing.
- **"Did not run" and "ran and found nothing" look identical in a summary.**
  Say which one it was, and say plainly when something could not be checked
  from the current environment rather than reporting a confident zero.
- **Read before you assume.** 221 models and ~3,200 files mean the helper you
  are about to write probably exists under a different name.
