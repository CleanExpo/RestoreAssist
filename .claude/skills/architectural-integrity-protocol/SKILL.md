---
name: architectural-integrity-protocol
description: Use at the start of every non-trivial user request and at any feature-completion / context-45%+ checkpoint. Forces a "Translation Blueprint" interception before code, enforces Service Layer separation, runs an automatic structural audit on completed features, and generates a dense session_manifest.md when context budget approaches the compaction threshold. Applies portfolio-wide; install per repo by reading this skill once and following the four phases exactly.
metadata:
  origin: User-authored "System Protocol: Architectural Integrity, Intent Translation & Context Compaction" — codified 2026-05-18.
  pairs_with: service-layer-architecture, superpowers:writing-plans, superpowers:subagent-driven-development
---

# Architectural Integrity Protocol

A four-phase operating discipline for autonomous developer sessions. The phases fire in this order across every request lifecycle:

1. **Intent translation** (before any code).
2. **Service Layer discipline** (while coding).
3. **Structural audit** (on completion).
4. **State compaction** (at 45% context or feature lifecycle end).

## Phase 1 — Translation Blueprint (interception layer)

Before executing any feature, change, or fix request, emit a four-field blueprint:

```markdown
**User Intent:** <one sentence, plain English>
**Target Architecture:** <Presentation / Service / Repository / Skill / Docs — which file paths>
**Token Optimisation Strategy:** <reuse what helper? abstract where? how to keep files small?>
**Autonomous Tool Selection:** <DI / Factory / Strategy / shared util / new service module / etc.>
```

Wait for explicit user approval **OR** execute immediately if the user message contains a clear directive ("do it", "ship it", "implement", "go", "execute", or the request is unambiguous). When in doubt, the directive is implicit if the user gave you a full spec — they don't want to re-confirm.

**If the request would cause bad architecture or duplication, push back in the blueprint.** Name the smell, propose the correct alternative, then await direction.

## Phase 2 — Service Layer discipline (during coding)

Reference: `.claude/skills/service-layer-architecture/SKILL.md`. The contract in one sentence:

- **Presentation / entry layer** (`app/api/**/route.ts`, Next.js Server Actions, FastAPI endpoints): auth, ownership, status transitions, audit events, persistence, HTTP error policy.
- **Service layer** (`lib/services/<domain>/<concern>.ts`): runtime mechanics — credentials, dispatcher setup, validation, readiness probes, restart / teardown. Returns `ServiceResult<T, E>` (`lib/services/_shared/result.ts`).
- **Repository layer** (`lib/repositories/`, Prisma calls inside cohesive helpers): persistence-only.

Never let business logic leak into entry points. Never let a service module import the HTTP framework.

## Phase 3 — Code Structure Skill (automatic audit)

Fire at two triggers:
- **Feature complete:** any time a logical unit of work just merged or committed.
- **Context ≈ 45%:** when self-assessed token budget approaches the compaction threshold.

Steps:

1. **Audit:** scan affected directories. `find <dirs> -type f -name '*.ts' | head -N` + cross-reference imports.
2. **Verify separation:** any `app/api/**` file importing a third-party SDK directly? Any `lib/services/**` file importing `next/server`, reading `cookies()`, reading `getServerSession()`? Either is a violation.
3. **Refactor inline if violation found.** No new feature starts while a violation is open.
4. **Log:** emit a compact ASCII map of the architecture state. Example shape:

```
RestoreAssist (post-feature audit, 2026-05-18)
├── app/api/                              [ENTRY LAYER]
│   └── inspections/[id]/submit/         ✅ thin orchestration
├── lib/services/                         [SERVICE LAYER]
│   ├── _shared/result.ts                ✅ ServiceResult<T,E>
│   ├── xero/credentials.ts              ✅ structured-result
│   └── inspection/validate-submission   ✅ pure
├── lib/integrations/xero/token-manager  🟡 deprecation shim (RA-1308 preserved)
└── prisma/schema.prisma                  [REPOSITORY LAYER]
```

Emoji legend: ✅ clean · 🟡 transitional / shim · 🔴 violation.

## Phase 4 — State Compaction & Session Handover

Triggers:
- Context utilisation ≥ 45% (rough heuristic).
- Major feature lifecycle complete.
- User signals handoff.

Steps:

1. **Generate `session_manifest.md`** at repo root with these dense sections:
   - **Current Architectural Tree** — ASCII map per Phase 3.
   - **Feature State** — `## Completed` / `## In Progress` / `## Backlog` lists with commit SHAs.
   - **Dependency Mapping** — file → file edges the next session must not break.
   - **Active Code Snippets** — only the absolute core service files relevant to the next immediate task. Inline them as fenced code blocks with path comments.
   - **Open Decisions** — what the next session needs to choose before proceeding.
   - **Verification Ledger** — what's been verified vs claimed-but-unverified.
2. **Emit the termination signal verbatim:**

> "STATE COMPLETED AND COMPACTED. Ready for Session Reset. Please copy this manifest into a fresh session."

## Execution constraints (always-on)

- Never write monolithic files. Soft cap: 300 LOC per file, 200 LOC per skill SKILL.md.
- Prioritise modular reusable helpers + service classes.
- If a user request would cause bad architecture or duplication, push back in the blueprint with the correct technical alternative. Do not silently implement the suboptimal request.
- The protocol overrides comfort-driven heuristics. If you find yourself skipping Phase 1 because "the request is small", you are wrong — the discipline IS the point.

## When NOT to apply

- Single-line typo fixes, one-character renames, log-level changes. Phase 1 blueprint is overkill for trivial mechanical edits. Use judgment.
- Conversational questions ("what does this code do?"). The protocol governs *changes*, not Q&A.

## Cross-references

- `service-layer-architecture` — the layer contract this protocol enforces.
- `superpowers:writing-plans` — multi-task feature work routes through plans, which feed Phase 2.
- `superpowers:subagent-driven-development` — task execution mechanics; this protocol decides *what* the tasks should be.
- `superpowers:verification-before-completion` — Phase 3's audit overlaps; this skill adds the architectural-layer check on top.
