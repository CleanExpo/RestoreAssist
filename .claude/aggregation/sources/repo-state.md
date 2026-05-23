# RestoreAssist — Local Repo State Snapshot

**Summary:** Local checkout sits on `release/sandbox-to-main-2026-05-16-final` (1 modified file, 3 untracked agent-scaffold dirs). The local `release/*` branch is **behind** `origin/main` — `main` already includes PR #946 (TLS pinning) that the local branch does not. `.claude/PROGRESS.md` is unreliable as a status source: the substantive narrative is frozen at 2026-04-18 and the tail is 100+ empty "Session End" stamps written by a commit hook. App router has 442 `route.ts` + 167 `page.tsx`. Heavy `.claude/` context layer exists (board records, swarm, plans, verifier reports, 150 worktrees, 747 verifier-report files).

---

## Current Branch & Working Tree

```text
* release/sandbox-to-main-2026-05-16-final     (local HEAD: 88278f58)
   origin/main HEAD: 0409c17 (TLS pinning #946 — NOT in local branch)

git status --short:
 M ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
?? .agents/
?? .codex/
?? AGENTS.md
```

**Observations:**
- One tracked iOS Package.resolved change (Swift PM lockfile, common drift from Xcode runs).
- Three untracked top-level artifacts (`.agents/`, `.codex/`, `AGENTS.md`) — likely from agent-scaffold runs that landed locally but aren't gitignored. Confirm whether they should be ignored or committed.
- `origin/main` is **ahead** of the current release branch by one commit (RA-3001 TLS pinning). The release branch was cut before that hotfix merged.

---

## .claude/PROGRESS.md — Status of the Status File

**Total length:** 2493 lines.

**Substantive narrative ends at 2026-04-18** (head describes Xero Integration Hardening + Billing Accuracy phase, PR #242 merge as last action). Multiple older sessions overlap (Track 3, Karpathy sprint, etc.).

**The tail is corrupted by a commit hook** — last ~100 lines are auto-appended empty "Session End" stamps:

```text
## 2026-05-15 23:41 — Session End
## 2026-05-15 23:41 — Session End
## 2026-05-15 23:41 — Session End
## 2026-05-15 23:52 — Session End
... (repeats ~50 times)
## 2026-05-16 23:50 — Session End
```

CLAUDE.md explicitly references this hook: *"Hooks write timestamps to `.claude/PROGRESS.md` on every commit, causing push rejections when remote has moved ahead."* The hook is firing but no session is writing real content into the file before the stamp. **PROGRESS.md is not a reliable source for current state — git log + Linear are more authoritative.**

### PROGRESS.md head verbatim (lines 1–46 — the only substantive recent block)

```markdown
# Progress — RestoreAssist

**Phase:** Xero Integration Hardening + Billing Accuracy
**Last updated:** 2026-04-18

## Current Session (2026-04-17 → 2026-04-18) — Xero + Billing Release

**Merge commit to main:** `80f05ae2` via PR #242 (MERGED 2026-04-17 16:08 UTC)

| Issue  | PR   | Summary                                                                     | Status |
| ------ | ---- | --------------------------------------------------------------------------- | ------ |
| RA-868 | #234 | Centralised Xero token-manager (getValidXeroToken + refresh)                | Done   |
| RA-869 | #236 | Per-category account code resolver + client-extensible mappings + LRU cache | Done   |
| RA-874 | #237 | Dashboard UI + API for account code mapping overrides                       | Done   |
| RA-875 | #239 | ATO-correct per-category GST treatment (fixes DISCOUNT bug)                 | Done   |
| RA-876 | #240 | Pre-invoice completeness check + DRAFT→INTERNAL_REVIEW gate                 | Done   |
| RA-871 | #241 | Extract verifyXeroWebhookSignature + 16 webhook-processor tests             | Done   |
| —      | #243 | CodeRabbit-flagged fixes (CLAUDE.md rule 4 + TOCTOU race)                   | Done   |

### Migration applied

- `20260417152430_add_estimate_metadata` — adds `Estimate.metadata TEXT` column (nullable JSON blob for dismissedWarnings + future per-estimate state). Purely additive.

### Test coverage added

- 121 new/updated unit tests across token-manager, account-code-resolver, webhook-processor, xero-account-mapping API, gst-treatment-rules, billing-completeness-check
```

**Reality check:** since 2026-04-18 narrative end, 50+ PRs have merged (SP-3, SP-8, P0 hotfixes, Customer Portal spec, Wave 2 specs) but none updated PROGRESS.md. Use `git log` and the github/state.md aggregation, not PROGRESS.md.

---

## .claude/ARCHITECTURE.md — Headings Only

```text
# Architecture — RestoreAssist (line 1)
## System Overview (line 3)
## Component Map (line 11)
## Module Boundaries (line 48)
### Inspection Engine (`lib/nir-*.ts`) (line 50)
### Integration Layer (`lib/integrations/`) (line 57)
### Content Pipeline (`lib/content-pipeline/`) (line 65)
### Invoicing (`app/api/invoices/`) (line 72)
## Data Model (Key Entities) (line 78)
## Third-Party Integrations (line 92)
## Design Decisions (line 111)
```

File: `/Users/phill-mac/RestoreAssist/.claude/ARCHITECTURE.md` — 9762 bytes, last touched 2026-05-11.

---

## .claude/STANDARDS.md — Headings Only

```text
# Standards — RestoreAssist (line 1)
## API Route Pattern (line 5)
## Cron Endpoint Pattern (line 46)
## Raw SQL Pattern (line 57)
## Error Handling (line 78)
## Domain Naming (line 85)
## File Organisation (line 97)
## State Management (line 106)
## Integration Sync (line 113)
## Progress Framework (RA-1376) (line 117)
## Patterns to Avoid (line 132)
```

File: `/Users/phill-mac/RestoreAssist/.claude/STANDARDS.md` — 7599 bytes, last touched 2026-05-07.

---

## CLAUDE.md (project root) — Headings Only

```text
# RestoreAssist (line 1)
## Commands (line 5)
## Rules (line 19)
### Auth & Identity (line 21)
### Dependencies & toolchain (line 27)
### Data & Queries (line 38)
### Security (line 44)
### Integrations (line 53)
### Compliance & UI (line 57)
### General (line 64)
### Progress Framework (Epic RA-1376 · Board 2026-04-18 · Motion M-4) (line 70)
## Reference Files (line 83)
## Context Window (line 91)
## Multi-agent orchestration (line 97)
## Git Recovery (line 107)
## Karpathy-Inspired Coding Guidelines (line 119)
### 1. Think Before Coding (line 125)
### 2. Simplicity First (line 136)
### 3. Surgical Changes (line 148)
### 4. Goal-Driven Execution (line 166)
```

File: `/Users/phill-mac/RestoreAssist/CLAUDE.md`.

---

## .claude/ Subfolders + Top-Level Files

```text
.claude/
├── ARCHITECTURE.md             9.5 K   2026-05-11
├── DESIGN.md                   8.9 K   2026-05-11
├── MANAGED_AGENTS_v4_FINAL.md  17  K   2026-04-28
├── PROGRESS.md                 64  K   2026-05-16  (CORRUPTED — hook spam at tail)
├── STANDARDS.md                7.4 K   2026-05-07
├── TESTING.md                  2.9 K   2026-05-04
├── WORKFLOWS.md                2.8 K   2026-05-11
├── agents/                     (5 entries)
├── aggregation/                (this dir — new, 10 entries incl. github/hermes/linear/pi-ceo/sources/supabase/vercel/wiki)
├── board-2026-04-18/           (6 entries — Board Motion M-4 records)
├── commands/                   (7 entries)
├── env-audit-2026-04-17.md     16 K
├── hooks/                      (4 entries)
├── launch.json
├── mcp/                        (3 entries)
├── plans/                      (3 entries)
├── rules/                      (4 entries — verification-gate, review-dimensions, etc.)
├── scripts/                    (4 entries)
├── senior-pm-backlog-analysis.md
├── senior-pm-phase-2-plan.md
├── settings.json
├── settings.local.json
├── skills/                     (8 entries)
├── sql-validation-report.md
├── swarm/                      (9 entries — multi-agent dispatch artifacts)
├── uni-171-phase-2-completion.md
├── v1.2-completion-summary.md
├── v1.3-completion-summary.md
├── v1.3-enhancement-plan.md
├── v1.4-completion-summary.md
├── v1.4-enhancement-plan.md
├── verifier-reports/           (747 files — verification gate output)
└── worktrees/                  (150 entries — local worktree state)
```

**Context layers present:** board records, verifier reports, swarm dispatch artifacts, completion summaries through v1.4, plans, hooks, skills, MCP configs, senior-PM backlog, env-audit, SQL validation report.

---

## Top-level Repo Layout (depth=2)

```text
/Users/phill-mac/RestoreAssist
├── app/                        (Next.js 15 App Router — 33 subroutes)
│   ├── about, api, auth, billing, blog, compliance, compliance-library,
│   ├── contact, contractors, dashboard, features, forgot-password,
│   ├── help, how-it-works, invite, login, onboarding, pilot, portal,
│   ├── pricing, privacy, reports, resources, setup, sign, signup,
│   ├── solutions, status, support, terms, .well-known
├── components/
├── content/                    (MDX help articles, marketing content)
├── docs/
├── e2e/                        (Playwright suite)
├── hooks/
├── ios/                        (Capacitor iOS app)
├── android/                    (Capacitor Android app)
├── mobile/
├── lib/
├── prisma/                     (120+ models per CLAUDE.md rule 20)
├── public/
├── scripts/
├── supabase/
├── types/
├── PROJECTS/RestoreAssist/     (nested? — investigate, possibly stale)
├── pilot-tester/
├── distribution/
├── fastlane/
├── playwright/, playwright-report/, test-results/
├── .agents/                    (UNTRACKED — agent scaffold)
├── .codex/                     (UNTRACKED — Codex scaffold)
├── .claude/                    (heavy context layer — see above)
├── .superpowers/
├── .planning/
├── .harness/
├── .capacitor-native-notes/
├── .do/                        (DigitalOcean?)
├── .github/, .next/, .vercel/, .git/
└── MISSION_REPORTS/, build/, __tests__/, node_modules/
```

---

## Route Counts

```text
app/**/route.ts:  442   API routes
app/**/page.tsx:  167   pages
```

For reference per CLAUDE.md rule 1: every API route must call `getServerSession` (except `/api/auth/*`, `/api/cron/*` bearer-token, and webhook endpoints). 442 is a large surface — expect a meaningful subset are auth/cron/webhook exempt.

---

## Errors

None. All `git`, `find`, and `Read` calls succeeded.
