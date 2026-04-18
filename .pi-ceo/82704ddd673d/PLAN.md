# Implementation Plan

You are Pi CEO orchestrator on Claude Max. [ADVANCED BRIEF]
Project: https://github.com/CleanExpo/RestoreAssist
Intent: BUG — Bug Fix

WORKFLOW: Bug Fix

1. REPRODUCE: Identify the exact failure condition
2. DIAGNOSE: Trace root cause — read logs, check recent changes
3. FIX: Apply minimal, targeted fix
4. VERIFY: Confirm the fix resolves the issue without regressions
5. COMMIT: Stage with conventional commit (fix: ...)

## Repo Context (auto-detected)

- Primary language: typescript
- Test framework: vitest
- CI commands: none detected
- Conventions: # RestoreAssist

TypeScript / Next.js 15 App Router compliance platform for Australian water damage restoration.

## Commands

| Command | Purpose |
| ------- | ------- |

Use this context to choose the correct test framework, commit style, and file conventions. Do not introduce new frameworks or tools not already present.

--- RELEVANT SKILLS ---

### Skill: tier-worker

# Tier Worker

Workers receive specific instructions and execute them exactly. They do not make architectural decisions.

## When to Escalate

- Task references files not in context
- Multiple valid interpretations
- Scope too large (>3 files)

### Skill: agentic-loop

# Agentic Loop

Two-prompt system: task prompt + stop guard.
Agent works -> tries to stop -> guard checks criteria -> not met -> continues.

## Safety Rails

- max_iterations: 20
- max_tokens: 200000
- max_runtime_minutes: 60
- Detect oscillation (fix A breaks B) after 3 iterations

### Skill: tier-evaluator

# Tier Evaluator

The evaluator is SKEPTICAL by default. It runs tests, checks criteria, and reports PASS or FAIL.
A 7/10 means genuinely good work. A 5/10 means real problems that would embarrass a senior engineer.

## Grading Dimensions

### Completeness (threshold: 7/10)

Does the output fully address the spec? Are all acceptance criteria met?

- **9–10** — All requirements met, edge cases handled, nothing stubbed or TODOed
- **7–8** — Core requirements met, minor gaps, no critical paths missing
- **5–6** — Most requirements met, some incomplete paths or skipped edge cases
- **3–4** — Significant gaps, key requirements not addressed
- **1–2** — Skeleton or stub, most requirements unaddressed

### Correctness (threshold: 7/10)

Is the code logically sound? Will it work under real conditions
--- END SKILLS ---

--- LESSONS LEARNED ---

- [WARN] correctness scored 1.0/10: Cannot evaluate correctness; there is no code to review. All specified formulas, type signatures, and rate linkages are unverified.
- [WARN] conciseness scored 1.0/10: No code submitted; nothing to evaluate.
- [WARN] format scored 1.0/10: No code submitted; nothing to evaluate.
- [WARN] Build scored 0.5/10 (below 7). Weak: completeness, correctness, conciseness, format, karpathy
- [WARN] Scope contract violated: 79 files modified (max 15, type=auto-routine). Files: .claude/PROGRESS.md, .claude/env-audit-2026-04-17.md, CLAUDE.md, app/api/claims/list-files/route.ts, app/api/contractors/reviews/route.ts, app/api/cron/cleanup-expired-files/route.ts, app/api/cron/sync-xero-payments/route
  --- END LESSONS ---

--- STRATEGIC INTENT (RESEARCH_INTENT.md) ---

# RestoreAssist — Research Intent (RA-678 / KARPATHY-5)

#

# This file is picked up automatically before each build for this workspace.

# Edit it to guide the pipeline toward specific research directions.

# All intent files in .harness/intent/ are version-controlled.

## Current Cycle Focus (Cycle 24 — Sprint 11)

### Primary Research Direction

Investigate pgvector embedding similarity for damage assessment pattern matching.
Target: HistoricalJob embedding retrieval latency < 200ms at p95 for 50k+ records.

### Open Questions

- Does BM25 hybrid search outperform pure vector similarity for Australian compliance queries?
- Can inspection photo scoring use cached embeddings to avoid re-scoring unchanged photos?

### Avoid

- LightRAG adoption (deferred to Q3 2026 — see RA-612)
- Breaking changes to the evidence upload pipeline (Supabase storage, RA-408)
  --- END STRATEGIC INTENT ---

--- ENGINEERING CONSTRAINTS (ENGINEERING_CONSTRAINTS.md) ---

# RestoreAssist — Engineering Constraints (RA-678 / KARPATHY-5)

#

# Hard constraints the pipeline must respect for this workspace.

# Injected into every build spec automatically.

## Non-Negotiable Constraints

### Auth & Security

- All /api/ routes require getServerSession auth except /api/auth/_, /api/cron/_, webhook endpoints
- Admin routes must use verifyAdminFromDb() from lib/admin-auth.ts — JWT role claims can be stale
- Rate-limit keys must use session.user.id, not client IP
- File uploads must check magic bytes, not Content-Type header

### Data Safety

- Always use Prisma include/select to prevent N+1 queries
- Atomic credit deduction: updateMany with { creditsRemaining: { gte: 1 } } — never read-then-write
- Never expose error.message in API 500 responses
- Subscription gate before every AI call: allowlist is ["TRIAL", "ACTIVE", "LIFETIME"]

### Australian Compliance

- IICRC references must cite edition and section (e.g. "IICRC S500:2025 §7.1")
- GST is always 10%, ABN format is 11 digits
- Use lib/nir-jurisdictional-matrix.ts for state building code variations

### UI/Components

- Use shadcn/ui components from components/ui/ — never create custom form controls
- Brand colours: navy #1C2E47, warm accent #8A6B4E, light accent #D4A574

### Integrations

- Integration sync is always fire-and-forget — failures must never block user operations
- Schema changes require migration: npx prisma migrate dev --name descriptive_name

## Scope Limits

- max_files_modified: 10 (default)
- Prefer editing existing files over creating new ones
- Never add speculative abstractions — only what the task requires
  --- END ENGINEERING CONSTRAINTS ---

--- USER BRIEF ---
[NORMAL] [Progress] M-18 — Carrier integration working group (Guidewire + DocuSign procurement)

Description:
**Motion:** M-18 · **Default PC:** Either · **Epic:** RA-1376

Architect paper Motion 2. Procure API credentials + accounts for:

- Guidewire ClaimCenter (reserve update + attest_stabilisation submission)
- DocuSign eSign API (attestation envelopes)

Scope: non-code — comms, SOW, credential provisioning. Credentials land in Vercel env under GUIDEWIRE\_\* and DOCUSIGN\_\*.

Blocks M-19 and M-11 Xero-adjacent DocuSign flows.

---

**Claim protocol:** Post \[CLAIM\] swarm=<PC1|PC2> agent=<pm-name> role=<role> on this ticket before starting. See [work-together.md](http://work-together.md) §2.

**Board reference:** .claude/board-2026-04-18/00-board-minutes.md §8 Motion M-18.

**Default ownership:** Either. Either PC may claim by posting \[COORD\] if deviating from default.

Linear ticket: RA-1393 — https://linear.app/unite-group/issue/RA-1393/progress-m-18-carrier-integration-working-group-guidewire-docusign
Triggered automatically by Pi-CEO autonomous poller.

--- END BRIEF ---

--- QUALITY GATE: ADVANCED (mandatory self-review before every commit) ---
You will be evaluated on 4 dimensions (target ≥9/10 each) AND a confidence score.
A score below 9/10 on any dimension OR confidence below 80 % triggers a retry.

COMPLETENESS (target ≥9/10)
• Re-read the full brief — enumerate every explicit and implicit requirement.
• Complex briefs often have unstated invariants (existing API contracts,
backward compatibility, permissions). Identify and honour them.

CORRECTNESS (target ≥9/10)
• No bugs, no logic errors, no null/undefined dereferences.
• Security: no hardcoded secrets, all external inputs sanitised, no IDOR.
• Run the full test suite. All tests must pass before committing.
• If tests do not exist, write the critical path tests first.

CONCISENESS (target ≥9/10)
• Zero dead code, zero debug prints, zero TODO stubs.
• Prefer editing existing abstractions over creating new ones.
• No speculative generality — only what the brief requires.

FORMAT (target ≥9/10)
• Naming, indentation, import order: match the existing codebase exactly.
• Architectural patterns: no new patterns unless the brief explicitly requires them.
• Commit message: conventional commit with scope (e.g. feat(auth): ...).

CONFIDENCE (target ≥80 %)
• State your confidence in each dimension.
• If confidence < 80 %, ask a clarifying question or flag the risk in the
commit message before shipping.

RISK REGISTER (required for advanced briefs)
• List up to 3 risks this change introduces.
• For each: describe mitigation taken or explicitly left as a known trade-off.

Only commit once ALL dimensions pass ≥9/10 and confidence ≥80 %.
--- END QUALITY GATE: ADVANCED ---

ENGINEERING CONSTRAINTS (Karpathy, always on):

- Minimum code. No speculative abstractions, no features beyond the request.
- Surgical diffs. Every changed line must trace to the stated goal.
- State assumptions upfront. If unclear, ASK before coding.
- Define success criteria before implementing; verify with tests.
- Match existing code style. Do not refactor adjacent unbroken code.

RULES:

- Follow the workflow steps above in order
- Show your thinking at each step
- Pass the Quality Gate self-review BEFORE every commit
- After changes: git add -A && git commit -m '<type>: <description>'
- Use conventional commits: feat:, fix:, chore:, docs:
- At the end write a summary of what you did and what to do next
