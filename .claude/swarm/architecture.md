# Swarm Architecture — Two-PC Parallel Execution for RestoreAssist

**Authority:** `work-together.md` is the protocol; this file is the roster.
**Scope:** How the swarm is structured on each PC to execute the Progress framework (and residual break-test backlog) at maximum parallelism without collisions.

---

## 1. The top-level shape

```
                    ┌──────────────────────┐    ┌──────────────────────┐
                    │  PC1-orchestrator    │◀──▶│  PC2-orchestrator    │
                    │  (Senior Orchestrator)│    │  (Senior Orchestrator)│
                    └──────────┬───────────┘    └──────────┬───────────┘
                               │ spawns ≤3                 │ spawns ≤3
            ┌──────────────────┼──────────────────┐        │
            ▼                  ▼                  ▼        ▼
      ┌──────────┐       ┌──────────┐       ┌──────────┐  ...
      │ PM-A     │       │ PM-B     │       │ PM-C     │
      │ (domain) │       │ (domain) │       │ (domain) │
      └────┬─────┘       └────┬─────┘       └────┬─────┘
           │ spawns ≤5        │                  │
    ┌──────┼──────┬──────┐    ...                ...
    ▼      ▼      ▼      ▼
  ┌───┐  ┌───┐  ┌───┐  ┌───┐
  │S1 │  │S2 │  │S3 │  │Sub│  ← Specialists (6-8 skills each) + sub-agents
  └───┘  └───┘  └───┘  └───┘
```

**Hard caps (per PC):** 3 PMs concurrent, 5 specialists per PM, 15 total agents.

---

## 2. Senior Orchestrator — the apex role

One per PC. Only role allowed to:

- Claim Linear issues
- Merge PRs (via `gh api` — never `gh pr merge` with dirty worktree)
- Push to `sandbox`
- Append to `coordination.md`
- Spawn PMs

**Responsibilities:**

1. Read `work-together.md`, `coordination.md`, inbox at session start
2. Assess Linear backlog + claims state
3. Partition work with the other swarm via coordination log
4. Spawn PMs for parallel domains
5. Monitor PM returns, stitch context across PRs
6. Keep the cadence — push every 30 min, merge when green, update coordination log on every meaningful transition

**Context discipline:** never let raw tool output flow into orchestrator context. Every PM returns a summary ≤400 words.

---

## 3. Senior PM roster (spawned as needed)

Each PM owns a Linear umbrella issue + a scope of work. Spawned fresh — no cross-PM memory, full self-contained briefing.

### Backend PMs (default PC1)

| Name                      | Domain                                                                                    | Specialists they command                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **pm-schema-architect**   | Prisma schema changes + migrations                                                        | schema-designer, migration-verifier, code-reviewer                                   |
| **pm-service-layer**      | `lib/progress/**`, `lib/**` core libs                                                     | state-machine-coder, guard-function-coder, integrity-hash-coder, test-writer         |
| **pm-api-progress**       | New routes under `app/api/progress/**`                                                    | api-implementer, auth-enforcer, rate-limit-applier, test-writer                      |
| **pm-api-retrofit**       | Retrofit existing routes (`app/api/inspections`, `app/api/invoices`, `app/api/estimates`) | api-integrator, regression-test-writer, backward-compat-auditor                      |
| **pm-integrations**       | Xero, Guidewire, DocuSign, Cloudinary, Twilio fan-out                                     | xero-specialist, docusign-specialist, webhook-idempotency-coder, dead-letter-handler |
| **pm-break-test-backlog** | Residual break-test P2/P3 fixes                                                           | security-auditor, load-test-writer, chain-of-custody-coder                           |

### Frontend / UX PMs (default PC2)

| Name                  | Domain                                            | Specialists they command                                                                |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **pm-ui-progress**    | `app/dashboard/progress/**`, claim timeline views | component-coder, shadcn-integrator, a11y-auditor, responsive-designer                   |
| **pm-ui-field**       | `app/dashboard/field/**`, mobile-first tech UI    | capacitor-specialist, offline-queue-coder, voice-capture-coder, glove-friendly-designer |
| **pm-ui-admin**       | Admin dashboard + claim timeline + audit export   | dashboard-coder, audit-export-coder, csv-generator                                      |
| **pm-telemetry**      | Instrumentation (8 events, 4 funnels, 2 KPIs)     | event-schema-designer, metric-emitter-coder, dashboard-builder                          |
| **pm-carrier-portal** | `app/portal/[token]/**` external carrier view     | portal-token-coder, read-only-view-coder, signature-capturer                            |
| **pm-test-e2e**       | Playwright E2E for Progress flows                 | e2e-scenario-writer, fixture-builder, flake-detector                                    |

### Cross-cutting PMs (either PC, claim first)

| Name                    | Domain                                                       | Specialists they command                                        |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| **pm-legal-compliance** | /privacy /terms /policy updates per M-8/M-9                  | legal-drafter, APP-compliance-checker, retention-schedule-coder |
| **pm-research**         | Guidewire API spec, DocuSign eSign SDK, ICA/AFCA rules       | documentation-scraper, SDK-explorer, carrier-field-mapper       |
| **pm-linear-triage**    | Ticket filing, backlog grooming, motion-to-ticket conversion | linear-mcp-user, ticket-writer                                  |

---

## 4. Specialist roster (6–8 skills each)

Every specialist carries a named skill set. When a PM spawns a specialist it passes the skill set in the prompt.

### Domain specialists (from the board papers, reusable)

1. **ops-director** — IICRC S500:2025 progression, scope authoring, psychrometrics, moisture discipline, WHS hazard register, labour-hire coordination, field ergonomics, jurisdictional codes
2. **claims-carrier** — Carrier submission formats, scope approval thresholds, CAT codes, evidence classes, three-quote rules, make-safe authority, variation lifecycle, panel relationships
3. **legal-litigation** — Chain-of-custody, ACL s18/54–62, Privacy Act APPs 1/3/6/11/12/13, contract formation, subrogation, limitation periods, expert-witness standards, privilege
4. **accounting-ato** — GST per phase, tax invoices s.29-70, RCTIs, AASB 15 WIP, Fair Work sham-contracting, SG 12%, portable LSL, STP Phase 2, BAS
5. **software-architect** — Event-sourced state machines, Prisma schema minimisation, RBAC, WORM audit log, offline-first mobile, integration fan-out, idempotency, migration strategy
6. **product-ux** — Field ergonomics, cognitive load, role-based progressive disclosure, offline sync, forcing functions vs nudges, handoff rituals, WCAG AA, instrumentation

### Technical specialists (new — for execution)

7. **schema-designer** — Prisma model design, index planning, relation mapping, enum design, migration generation, rollback planning, additive-only patterns, introspection verification
8. **state-machine-coder** — Pure TypeScript guard functions, transition tables, optimistic locking, hash chaining, append-only log, idempotency keys, unit-testable design, Mermaid diagram auth
9. **api-implementer** — Next.js App Router routes, `getServerSession`, explicit `select`, `take` limits, `{ data }/{ error }` shapes, `$transaction` patterns, rate-limit application, CSRF validation
10. **test-writer** — Vitest unit tests, Playwright E2E, fixture builders, mock Anthropic/Xero/DocuSign clients, flake detection, deterministic test data, coverage analysis, TDD discipline
11. **integration-specialist** (Xero / Guidewire / DocuSign / Cloudinary / Twilio — spawned per integration) — Webhook signature verification, OAuth refresh, retry with backoff, dead-letter handling, idempotency keys, sandbox testing, contract testing, error taxonomy
12. **security-auditor** — CLAUDE.md rule enforcement, secret exposure, authz re-verification, magic-byte validation, SSRF allowlists, timing oracle detection, XSS attack surface, CSRF coverage
13. **code-reviewer** — Pattern conformance, rule-violation detection, N+1 detection, unbounded query detection, error-leak detection, dependency audit, bundle-size analysis
14. **a11y-auditor** — ARIA labels, keyboard navigation, focus management, contrast ratios, screen reader text, alt text, semantic HTML, form labelling
15. **offline-queue-coder** — IndexedDB wrapper, dedup keys, conflict resolution, background sync, retry with backoff, network detection, storage quota management
16. **voice-capture-coder** — Web Speech API, Capacitor speech plugin, punctuation restoration, intent parsing, field mapping, error recovery
17. **migration-verifier** — `prisma migrate dev` vs `deploy`, shadow DB validation, lock-time analysis, data preservation, rollback rehearsal, prod-replica testing
18. **linear-mcp-user** — Issue creation, state transitions, comment posting (`[CLAIM]`/`[DONE]`/etc), dependency linking, project assignment, label application

### Sub-agents (short-lived, parallel, single-task)

Spawned ad-hoc for focused work. Common types:

- `sub-grep-audit` — Grep one pattern across codebase, return findings
- `sub-schema-diff` — Diff two Prisma schemas, summarise additive/destructive changes
- `sub-pr-review` — Read one PR diff, return review ≤300 words
- `sub-test-run` — Run one test file, return pass/fail + failures
- `sub-linear-search` — Query Linear with one filter, return ticket list
- `sub-vercel-check` — Check one deployment's status, return summary
- `sub-env-probe` — Check one env var or config, return value/presence

---

## 5. Spawn protocol

### Orchestrator → PM

```
Agent(
  description: "PM: schema for Progress framework (M-5)",
  subagent_type: "general-purpose" | "feature-dev:code-architect",
  prompt: "You are Senior PM for <domain>. Your skills include <list>.
           You own Linear ticket <RA-XXX>. You may spawn up to 5
           specialists. You report back a summary ≤400 words with:
           (1) what changed, (2) files touched, (3) PR URL,
           (4) any blockers. DO NOT return raw tool output.",
  run_in_background: true
)
```

### PM → Specialist

```
Agent(
  description: "specialist: schema-designer for ClaimProgress",
  subagent_type: "general-purpose",
  prompt: "You are a schema-designer specialist. Your 8 skills:
           <list>. Your task: design Prisma schema for
           <ClaimProgress | ProgressTransition | ProgressAttestation>
           per board paper 05 §4. Additive only — no existing
           model changes. Return: exact Prisma snippet + rationale
           for index choices. Under 300 words."
)
```

### Specialist → Sub-agent

Only when genuinely parallel-independent work exists. Never for sequential steps.

### Returns

Every agent returns:

1. Summary (bounded word count)
2. File paths touched
3. Branch / PR URL (if applicable)
4. Next-step suggestion (if handing off)
5. Blockers (if any)

**Never return raw tool output to orchestrator context.** Write to a file, return the path.

---

## 6. Parallelism patterns

### Pattern A — Schema + Service + Tests (PC1 only)

Three PMs work in sequence because they share dependencies:

1. `pm-schema-architect` lands the schema (Linear M-5)
2. `pm-service-layer` picks up immediately; writes `lib/progress/` against the schema
3. `pm-api-progress` picks up after service; writes routes against the service

Each of these PMs internally parallelises its specialists (3–5 in flight).

### Pattern B — UI + Telemetry + E2E (PC2 only)

Three PMs work truly in parallel because they touch different file roots:

1. `pm-ui-progress` on `app/dashboard/progress/**`
2. `pm-telemetry` on `lib/telemetry/**` + instrumentation calls
3. `pm-test-e2e` on `e2e/progress.spec.ts` — can write against PC1's API even before UI lands

### Pattern C — Cross-PC pattern (full plan)

- PC1 does Pattern A (backend)
- PC2 does Pattern B (frontend + tests)
- PC1 publishes mid-sprint status in `coordination.md`
- PC2 consumes that status to align fixture data

### Pattern D — Idle swarm

When a PC is waiting on CI or the other PC:

- Do NOT sit idle
- Pick a break-test ticket from Linear `Todo`
- Claim, work, ship, repeat

---

## 7. Rate-of-work targets

Without sprint vocabulary — just throughput targets:

- **Orchestrator turn overhead:** <90s per decision
- **PM return latency:** 2–6 min for contained work
- **Specialist return latency:** 30s–3 min
- **Sub-agent return latency:** 10–60s
- **PR open → merge:** 3–15 min for contained P2 fixes, 20–45 min for multi-file PRs
- **Coordination log write cadence:** every claim, every ship, every handoff — minimum one entry per hour of active work

**If these targets slip by >2×, something is wrong. Pause, assess, consult the other swarm.**

---

## 8. What each PC should never do to the other

- **PC1 never** commits to `app/dashboard/**` without an active claim. PC2 may be mid-edit.
- **PC2 never** commits to `prisma/schema.prisma` or `lib/progress/state-machine.ts` without an active claim.
- **Neither PC** runs `prisma migrate dev` while the other has any schema claim.
- **Neither PC** ships a PR to a ticket the other has `[CLAIM]`ed.
- **Neither PC** edits `work-together.md`, CLAUDE.md, or `vercel.json` without a `[COORD]` umbrella ticket.

---

## 9. Bootstrap checklist

For each new PC joining:

- [ ] `identity.local.md` created with unique SWARM_ID
- [ ] `work-together.md` read top-to-bottom
- [ ] `coordination.md` last 200 lines read
- [ ] Inbox read + cleared
- [ ] `git fetch origin sandbox` done
- [ ] Linear claims scan done
- [ ] Session-init entry appended to `coordination.md`
- [ ] `CLAUDE.md` rules re-read

Only then spawn the first PM.

---

**Version:** 1.0 · 2026-04-18 · Authored by PC1-orchestrator
**Pairs with:** `work-together.md` (protocol), `.claude/board-2026-04-18/00-board-minutes.md` (what we're building)
