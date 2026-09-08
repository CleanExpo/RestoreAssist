# ADR: Mission Control boundaries and the read-path truthfulness rule

- Date: 2026-09-08
- Status: Accepted
- Repository: CleanExpo/RestoreAssist (`ra-main`)
- Branch observed: `content/video-scripts-concept-and-portfolio` at `6b2cefb3b`
- Complements `docs/definition-of-done/MISSION_CONTROL_COVERAGE_VISIBILITY.md`.

## Context

The goal is a Mission Control surface where the founder can run projects through a
visible Kanban workflow, see worker health, and reach the Mac Mini.

What actually exists in this repository today, verified by reading it:

- `app/dashboard/mission-control/page.tsx` (191 lines) — a read-only Tier 2 panel showing
  Hermes online state and a preview of the Nexus context bundle. It states in its own copy
  that "Primary home UI is the Nexus Hub Command Center on disk".
- `app/api/mission-control/context/route.ts` (22 lines) — admin-gated, returns the bundle.
- `lib/nexus-hub-context.ts` — reads `data/content/nexus-hub/*.md`, optionally overlays
  `HERMES_BASE_URL`.
- `app/api/margot/linear/top/route.ts` — admin-gated read of the top 5 Linear issues.
- `lib/margot-linear.ts` (340 lines) — Linear GraphQL wrappers that never throw and gate
  writes behind a confirmation handshake.

What does not exist, verified by exhaustive search rather than assumed:

- No Kanban board, column model, or card persistence. A repository-wide search for
  kanban/board names returns governance documents and unrelated dashboard pages only.
- No SSH, worker, or Mac Mini control code. A search for ssh across `scripts`, `lib` and
  `app` returns nothing; a search for worker across tracked files returns nothing.
- No model-routing layer. The only routing seam is `AgentDefinition.defaultProvider` and
  `defaultModel` in `prisma/schema.prisma`.

This repository is a customer-facing multi-tenant Next.js product on Vercel, with 221 Prisma
models, row-level security, and an admin-route auth rule. That constrains what may be added
to it far more than the feature list does.

## Decision

**D1. Mission Control in this repository is a read-only projection. It is not the system of
record and it does not execute.**

Board state, worker control, and scheduling live on the Nexus Hub / Hermes host. This
repository renders what it can read and says plainly when it could not read.

**D2. Linear is the source of truth for the Kanban board. No board tables are added here.**

The founder's standing rules say do not build a second CRM, prefer rented tools to
self-hosted ones, and treat harness work as frozen below break-even. Linear already holds
the issues, already has the columns, and `lib/margot-linear.ts` already talks to it. Mission
Control renders a projection of Linear; it does not own cards.

Explicitly: `AgentWorkflow` and `AgentTask` are **not** the board substrate. They are keyed
to `userId` / `reportId` / `inspectionId` and carry an execution status enum, not Kanban
columns. Shoehorning founder projects into them would mix tenant execution records with
group operations in one table. Recorded here so a later worker does not rediscover the idea
and act on it.

**D3. Every external read carries an explicit receipt, and a failed read is never rendered
as a successful read that found nothing.**

This is the load-bearing rule. The shape already used by
`app/api/margot/telegram/recent/route.ts` and by the unconfigured-key branch of the
top-issues route is adopted as the contract for all Mission Control reads:

    { data, fetchedAt, stale: boolean, reason?: string }

Set `stale: true` with a `reason` for unconfigured, unreachable, and errored. Set
`stale: false` only when the read genuinely completed. An empty result set is reported as
fresh-and-empty only when it truly is empty.

**D4. Worker health is pull-based and read-only. Direct SSH control is out of this
repository, permanently.**

An SSH executor behind an admin session in a tenant product is a remote-code-execution
surface: one auth regression turns a customer application into a shell on the founder's
machine. Worker health is instead an env-configured URL polled with a timeout, failing
closed to an offline state with a reason — the shape `app/api/margot/health/route.ts`
already uses for Hermes. Control actions stay on the Hermes host, behind its own boundary.

This is a decision, not a deferral. It does not get revisited by a worker picking up the
backlog.

**D5. Model routing is a policy on the existing seam, not a new router.**

Default to the light model. Escalate to a high-effort model only for: architecture and
boundary decisions, blind-spot review before a change is locked, and any failure that has
recurred — the founder's rule is that two identical failures stop the loop and earn an
independent second-model audit. The configuration seam is `AgentDefinition.defaultProvider`
and `defaultModel`; no new abstraction is introduced for a policy that is currently three
sentences.

**D6. Linear and Wiki writes are gated, and an ungated write reports BLOCKED.**

Reads may degrade to stale and keep rendering. Writes may not degrade at all: when the
Linear MCP or API key is unavailable, the operation returns BLOCKED naming the missing
credential. It never reports "synced". `lib/margot-linear.ts` already gates writes behind a
confirmation handshake; that gate stands.

## Rejected

**File-backed board persistence** (JSON on disk under `data/`). Vercel's filesystem is
ephemeral, so a card the founder moves would appear to save and then silently vanish on the
next cold start. That is precisely the fake-as-real failure the estate doctrine forbids, and
it is worse than having no board at all because it destroys trust in the boards that do work.

**A Prisma `MissionControlCard` model in this run.** It is the correct fallback if Linear
ever proves too slow or too coarse for the board, but it is a migration against a 221-model
production database, it cannot be verified in this checkout (`test:db` needs a provisioned
database that is not available here), and it is speculative until Linear is measured and
found wanting. Kept as a named future task with an explicit trigger, not started.

**An SSH control endpoint.** See D4.

**A model-routing abstraction layer.** See D5. No abstraction for single-use policy.

## Consequences

- Mission Control can show a board without owning one, and without a migration.
- The founder sees "Linear unreachable" instead of an empty board that looks like a finished
  week. This is the whole point.
- Worker health will show fewer facts than SSH would. That is the accepted price of not
  putting a shell behind a customer login.
- If Linear latency or rate limits make the projection unusable, the escape hatch is the
  `MissionControlCard` model named above, with its trigger written down in advance.
- Cost note, stated rather than hidden: the founder's addendum freezes harness and tooling
  work below break-even, and Mission Control is tooling. This work proceeded on an explicit
  directive. It adds no recurring cost and no new credential, and it claims no revenue
  impact.

## Next

Three bounded tasks for lower-cost workers, each in the four-field form. They are recorded in
full, with verifiers and falsification proofs, in the run receipt at
`.claude/done/work/w_832f72b139ff/receipt.md`:

1. Linear read-projection endpoint for the board columns, fail-closed per D3.
2. Worker health panel reading env-configured URLs, read-only per D4.
3. The `MissionControlCard` fallback — specified, not built, with its trigger condition.
