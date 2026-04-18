# work-together.md

**Purpose:** Coordination protocol for parallel AI swarms working on RestoreAssist across **multiple independent Claude Code instances / PCs**. Read this file first, every invocation, before picking up work.

**Authority:** This document is the traffic controller. If you are about to act against it, stop and re-read.

---

## 0. The Rule Above All Rules

**Linear is the single source of truth for WHO owns WHAT.** Not git, not files, not prose in a chat. If Linear doesn't say you own it, you don't own it. Claim it in Linear first, then work.

---

## 1. Swarm Identity

Before any agent on any PC starts work, it declares an identity:

```
SWARM_ID = <one of: PC1-orchestrator | PC2-orchestrator | PC3-... >
AGENT_ROLE = <orchestrator | pm | specialist | subagent>
AGENT_NAME = <descriptive, e.g. "pm-schema-architect">
```

The **SWARM_ID** is the PC or Claude Code instance. Set by the human operator of that PC in a `.claude/swarm/identity.local.md` file (git-ignored).

**If `identity.local.md` doesn't exist, STOP.** Ask the operator to set it before doing anything else. A swarm without identity will collide.

---

## 2. Work Claim Protocol (Linear)

Every unit of work corresponds to a Linear issue. To claim an issue:

1. **Check the issue's current state in Linear** via `mcp__linear__search_issues` or direct API.
2. **Verify no other swarm has claimed it.** Claim signal: issue has a comment from a SWARM_ID tagged `[CLAIM]` within the last 60 minutes AND the issue is `In Progress`.
3. **Post a claim comment** on the issue with exact format:
   ```
   [CLAIM] swarm=PC1-orchestrator agent=pm-schema-architect role=pm
   intent: Implement Prisma schema changes for ClaimProgress/ProgressTransition/ProgressAttestation (RA-Progress-M5)
   est-turns: ~8 sub-agent spawns, ~45 tool calls
   lockable-paths: prisma/schema.prisma; app/api/progress/**
   ```
4. **Move issue state to `In Progress`** (state ID `3ff96a21-7e90-4126-942f-034e09ebc3b6` for RA team).
5. **Only then start the work.**

### Releasing a claim

When you finish, abandon, or hand off:

- **Completed:** post `[DONE] swarm=X pr=#NNN` and move state to `In Review` (`9c4a7737-55c0-47e9-9cf6-cbd430685698`).
- **Handing off:** post `[HANDOFF] swarm=X → swarm=Y reason: <text>` and leave in `In Progress`.
- **Blocked:** post `[BLOCKED] swarm=X reason: <text>` and move to `Backlog`. Another swarm can pick up.

### Stale claims

A `[CLAIM]` comment older than **2 hours** with no subsequent `[DONE]`/`[HANDOFF]`/`[BLOCKED]` is stale. Another swarm MAY pick up, but must first post `[STEAL] swarm=X taking-over-from=Y reason:stale` and wait 5 minutes for a reply from Y. If no reply, proceed.

---

## 3. File & Path Ownership (soft lock)

Linear claims declare `lockable-paths`. While a claim is live:

- **Never edit a file listed in another swarm's active `lockable-paths`.** No exceptions.
- **Never run `prisma migrate` while another swarm has any `prisma/schema.prisma` claim open.** Schema is single-writer.
- **Branch naming:** prefix every branch with your SWARM_ID:
  - `pc1/fix/ra-1313-counter-race`
  - `pc2/feat/progress-schema-m5`
- **Pull before push. Always.** If the remote has moved, rebase onto `origin/sandbox`, re-run type-check, then force-push WITH LEASE (`--force-with-lease`) never plain `--force`.

### Hot files (always single-writer)

These files must never be claimed by two swarms at once:

- `prisma/schema.prisma`
- `CLAUDE.md`
- `work-together.md` (this file)
- `.claude/swarm/coordination.md` (see §6)
- `vercel.json`
- `package.json` / `pnpm-lock.yaml`
- Any file under `prisma/migrations/`

If you need to edit one of these, **claim the umbrella Linear issue for that edit first**. If no umbrella ticket exists, create one titled `[COORD] Hot file edit: <filename>`.

---

## 4. Git Discipline

- **One branch per Linear issue.** Never mix tickets.
- **Branch target is always `sandbox`**, never `main`. (CLAUDE.md rule: all PRs → sandbox.)
- **Push cadence:** push at least once every 30 minutes of active work so the other swarm can see state.
- **PR auto-merge is allowed** after CI green, but ONLY if Linear shows `[DONE]` posted AND no `[BLOCK-MERGE]` comment from another swarm exists.
- **Never force-push to a branch another swarm may have pulled.** Use `--force-with-lease` defensively.

### Rebase etiquette

If your branch conflicts with `sandbox` due to another swarm's merge:

```
git fetch origin sandbox
git rebase origin/sandbox
# resolve
git push --force-with-lease
```

If conflict resolution is non-trivial (>10 files, schema touch, integration code), post `[COORD] rebase-conflict` on the Linear issue and consult before resolving. The other swarm likely has context.

---

## 5. Communication Channels

| Channel                                               | Use for                                            | Cadence                             |
| ----------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| **Linear issue comments**                             | Work claim, state, handoff, done, block            | Every meaningful transition         |
| **`.claude/swarm/coordination.md`** (git-tracked)     | High-level swarm-to-swarm notes, session summaries | Append-only log                     |
| **`.claude/swarm/inbox-<SWARM_ID>.md`** (git-tracked) | Direct messages to a specific swarm                | When you need to brief the other PC |
| **PR descriptions**                                   | Technical context for review                       | Per PR                              |
| **Commit messages**                                   | Granular rationale                                 | Per commit                          |

**Every swarm, every session, starts by:**

1. Reading `.claude/swarm/coordination.md` (last 200 lines)
2. Reading `.claude/swarm/inbox-<YOUR_SWARM_ID>.md` (full — clear entries as you action them)
3. Checking Linear for issues `In Progress` tagged with any other SWARM_ID

---

## 6. The Coordination Log

Location: `.claude/swarm/coordination.md`

Append-only. Format:

```
## 2026-04-18T14:32:00Z · PC1-orchestrator
Context-set for session: Phase-A rollout, Sprint-1 schema + service layer.
Spawned: pm-schema-architect, pm-api-routes, pm-state-machine-tests.
Currently claiming: RA-Progress-M5 (schema), RA-Progress-M21 (sprint-1 umbrella).
Not touching: anything under app/dashboard/** (expected PC2 territory for UI).

## 2026-04-18T14:45:00Z · PC2-orchestrator
Picked up from coordination log. Acknowledge PC1 owns schema + service.
Will pick up: RA-Progress-Telemetry (Motion 17) and carrier-integration research.
Not touching: prisma/** or app/api/progress/** until PC1 posts [DONE] on M5.
```

**Both swarms append to the same file.** Use merge conflict resolution to interleave — order by timestamp.

---

## 7. Workload Partitioning (default split)

Unless the operator says otherwise, the default split when two PCs are active:

| Domain                                                                   | Default owner        | Why                                               |
| ------------------------------------------------------------------------ | -------------------- | ------------------------------------------------- |
| Schema + Prisma migrations                                               | **PC1**              | Single-writer rule — less conflict if one PC owns |
| Core service-layer libs (`lib/progress/**`)                              | **PC1**              | Follows schema                                    |
| API routes under `app/api/progress/**`                                   | **PC1**              | Follows service                                   |
| Existing API route retrofits (`app/api/inspections`, `app/api/invoices`) | **PC2**              | Spreads the load                                  |
| UI components + dashboard (`app/dashboard/**`, `components/**`)          | **PC2**              | Parallel to PC1's backend work                    |
| Telemetry + instrumentation                                              | **PC2**              | Independent of schema                             |
| Tests (`**/__tests__/**`, `e2e/**`)                                      | **PC2**              | Writes against PC1's API                          |
| External integrations research (Guidewire, DocuSign)                     | **PC2**              | Non-code research                                 |
| Break-test P2 backlog fixes (unrelated to Progress)                      | **PC1 when idle**    | Residual work                                     |
| Linear ticket filing + triage                                            | Either — claim first | Coordinate via log                                |

**When a PC is idle** (waiting for CI, waiting for review), it picks up break-test fixes from the Linear backlog. Never sit idle.

---

## 8. Swarm Structure (per PC)

Every PC runs the same internal hierarchy:

```
Senior Orchestrator (the Claude Code top-level agent)
│
├─ Senior PM Agents (spawned per domain — schema, api, ui, tests, research)
│  │
│  ├─ Specialist Agents (6–8 skills each, as defined in board papers)
│  │  │
│  │  └─ Sub-agents (focused, single-task, parallel)
```

### Roles

**Senior Orchestrator** (one per PC):

- Reads Linear, claims work, assigns to PMs, monitors progress
- Only agent allowed to merge PRs or push to `sandbox`
- Posts to coordination log
- Delegates everything else

**Senior PMs** (spawned as needed):

- Own a Linear umbrella issue end-to-end
- Spawn specialists + sub-agents
- Report back to Orchestrator with summary only (never raw output)

**Specialist Agents** (6–8 skills each):

- Match the board-paper specialists (Ops, Claims, Legal, Accounting, Architect, UX)
- Plus technical specialists: `schema-architect`, `api-implementer`, `test-writer`, `integration-researcher`, `code-reviewer`, `security-auditor`
- Each specialist carries a named skill set in its system prompt

**Sub-agents:**

- Short-lived, single-task, parallel-dispatchable
- Return file paths + summaries; never raw tool output

### Parallelism rules

- **Orchestrator may spawn ≤3 PMs concurrently.**
- **Each PM may spawn ≤5 specialists/sub-agents concurrently.**
- **Maximum 15 concurrent agents per PC** (soft cap — monitor context and cost).
- **Never spawn an agent to do work another agent is already doing.** Check Linear claims and the coordination log first.

---

## 9. Safety Gates (non-negotiable)

No agent on any PC may:

1. Push or merge to `main` (always `sandbox`; CLAUDE.md rule).
2. Run `prisma migrate deploy` against any database without human approval.
3. Force-push (plain `--force`) — always `--force-with-lease`.
4. Modify a board-paper file under `.claude/board-2026-04-18/` (those are frozen records).
5. Drop or rename any Prisma model without a motion-approved migration plan.
6. Send customer-facing emails from non-test environments.
7. Edit `work-together.md` without consulting both operators.
8. Spend >100k tokens on a single sub-agent task without checking in.

---

## 10. Conflict Resolution

If two swarms believe they own the same issue:

1. The swarm with the **earlier timestamped `[CLAIM]` comment** wins.
2. If timestamps tie (<10s apart), the swarm with the **lower SWARM_ID** (alphabetical: PC1 < PC2) wins.
3. Loser posts `[YIELD] swarm=X ceding-to=Y` and picks something else.

If two PRs conflict at merge:

1. **Earlier-opened PR wins**; later PR rebases.
2. Rebasing swarm posts `[COORD] rebased-onto=#NNN` on its PR.

If the coordination log has interleaved entries that contradict:

1. **Later timestamp wins** (append-only principle).
2. The swarm with the overridden intent posts a new entry acknowledging the change.

---

## 11. Start-of-session checklist (every swarm, every session)

Before spawning any agent or touching any file:

- [ ] Read `identity.local.md` — confirm SWARM_ID.
- [ ] Read last 200 lines of `.claude/swarm/coordination.md`.
- [ ] Read `.claude/swarm/inbox-<SWARM_ID>.md` — action + clear.
- [ ] `git fetch origin sandbox && git log --oneline -10` to see what the other swarm shipped.
- [ ] Check Linear for `In Progress` tickets with any `[CLAIM]` comments — note what's locked.
- [ ] Append a session-start entry to `coordination.md` with intent.

**Do not skip this. A single skipped check is how two swarms waste 3 hours duplicating work.**

---

## 12. End-of-session checklist

Before the swarm quiets down:

- [ ] Every `[CLAIM]` you hold has a matching `[DONE]`, `[HANDOFF]`, or `[BLOCKED]`.
- [ ] Every branch you created is pushed (not just committed locally).
- [ ] `coordination.md` has a session-end entry summarising what changed + what the other swarm should know.
- [ ] `.claude/PROGRESS.md` (existing — hooks write to it) is up to date.

---

## 13. The philosophy

Two swarms working together can produce 2–3× the throughput of one. Two swarms working without protocol produce 0.5× — they collide, overwrite, and waste context on merge drama.

**This protocol is the difference.**

When in doubt: over-communicate in the coordination log. A 10-line note costs nothing. A missed merge conflict costs an hour.

---

**Version:** 1.0 · 2026-04-18 · Authored by Senior Orchestrator (PC1) on RestoreAssist sandbox branch
**Amendments:** require both operators' acknowledgement in `coordination.md`
