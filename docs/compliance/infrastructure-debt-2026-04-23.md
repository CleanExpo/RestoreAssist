# Infrastructure debt log — 2026-04-23

Seven recurring failure modes observed across this session's RestoreAssist
work. Each one has been treated as a one-off in the past; this doc groups
them so none gets pushed under the rug again. Items are numbered in the
order they were triaged in-session.

## #1 — MCP servers disconnect mid-session

**Observed:** Linear, Chrome, Supabase, Vercel, Slack, Telegram MCPs have
dropped repeatedly. Each drop forces a fallback or blocks a feature (e.g.
Smoke track's Chrome-based preview tests go dead, Linear ticket filing
routes to the web UI).

**Cause:** transport-level — MCP processes crash or hit their own session
timeout. Claude Code has no auto-reconnect in the current release.

**Durable fix:** Anthropic-side change (auto-reconnect loop + exponential
backoff). Out of our control; file as product feedback.

**Session mitigation:** `/mcp` to re-register, or restart the CLI. Linear
tickets filed during an outage get held in PR bodies + bulk-backfilled via
the web UI on reconnect.

**Status:** external — needs Anthropic.

---

## #2 — Worktree isolation unavailable

**Observed:** `Cannot create agent worktree: not in a git repository and no
WorktreeCreate hooks are configured` when spawning an Agent with
`isolation: "worktree"` from `/Users/phill-mac/Pi-CEO` (not a git repo).
The actual repo lives at `/tmp/pi-ceo-workspaces/ra-1494-directurl/`.

**Cause:** the Agent tool tries to resolve a worktree rooted at the
main thread's CWD, which was a non-repo directory. No `WorktreeCreate`
hook was configured in `~/.claude/settings.json` either, so Claude
Code had no fallback strategy.

**Durable fix:**

1. Process fix (done this pass): CLAUDE.md now documents that any
   `isolation: "worktree"` Agent spawn must be invoked from a cwd inside
   a git repo, or passed an explicit repo-rooted `cwd`.
2. Config fix (follow-up): add `WorktreeCreate` + `WorktreeRemove` hooks
   to `~/.claude/settings.json` that shell out to `git worktree add` /
   `git worktree remove` against a known repo root. Needs the
   Anthropic docs on the hook I/O contract before committing.

**Status:** process mitigation landed; config hook pending docs.

---

## #3 — Concurrent agents stomp each other's uncommitted edits

**Observed:** "my edits got wiped too" after the Adoption agent was
killed while editing `app/dashboard/integrations/page.tsx` on the shared
tree. The Finish agent on a separate branch was also editing files,
and the two tracks were only nominally isolated by branch prefix.

**Cause:** direct consequence of #2. No worktree → shared tree → one
agent's uncommitted edit travels with the next `git checkout`.

**Durable fix:** #2. Until it lands, only one code-modifying track
runs at a time — filing-only tracks (Smoke, Discovery) can run in
parallel because they don't mutate source.

**Status:** covered by #2's process fix.

---

## #4 — Duplicate components shipped without an existing-code audit

**Observed:** The RA-1586 "ship PWAInstallPrompt scaffold" agent
created `components/PWAInstallPrompt.tsx` while
`components/pwa-install-prompt.tsx` was already mounted in the root
layout. A near-repeat occurred for the RA-1125 floor-plan sketch —
almost scaffolded `components/inspection/FloorPlanSketch.tsx` before
noticing the mature `components/sketch/SketchEditorV2.tsx` that just
needed to be promoted.

**Cause:** agent prompts dispatched scaffold work without a mandatory
pre-flight grep. The orchestration plan said "reuse existing functions"
but the agent prompt didn't enforce it.

**Durable fix:** every Agent prompt template now opens with an
**existing-code audit** preflight step — grep for the primitive /
component the prompt asks to create; if a name-similar file exists,
read it and decide to extend / replace / skip before any new file is
added. Landed in `.claude/plans/eager-herding-hejlsberg.md`.

**Status:** done.

---

## #5 — Toolchain corruption from mixing npm + pnpm

**Observed:**
- `npm uninstall sonner @radix-ui/react-toast` errored with
  `Cannot read properties of null (reading 'matches')`.
- Lockfile drift from hand-editing `package.json` without regenerating
  `pnpm-lock.yaml` caused the Vercel preview build to fail with
  `ERR_PNPM_OUTDATED_LOCKFILE`. PR #712 bounced red until the lockfile
  was regenerated with `pnpm install --lockfile-only` and committed.

**Cause:** RestoreAssist is a pnpm-managed repo. `npm` wrote a partial
`package.json` state but didn't touch `pnpm-lock.yaml`; pnpm then
refused to proceed under `--frozen-lockfile`.

**Durable fix:** `CLAUDE.md` now carries a **Dependencies & toolchain**
section that names the rule: this repo is pnpm-only. No `npm install`,
`npm uninstall`, `yarn`, or `bun`. Dep changes edit `package.json` +
run `pnpm install --lockfile-only` + commit both files in the same
commit.

**Status:** done.

---

## #6 — Prisma migration drift (P3009)

**Observed:** 45 pending migrations failed with `table "..." already
exists` errors after a schema was edited directly against the prod DB
out-of-band. Session recovery required
`prisma migrate resolve --applied <name>` on 45 rows.

**Cause:** out-of-band schema edits without matching migration files.
No CI gate to catch drift before merge.

**Durable fix:** RA-1546 (already filed) tracks a migration-drift
baseline reconcile + a CI check running
`prisma migrate status --schema ./prisma/schema.prisma` against a
clean ephemeral DB. PR gate fails if status is anything other than
"database schema is up to date". Owner: needs assigning.

**Status:** RA-1546 open; needs CI wiring as a follow-up PR on the
Pi-Dev-Ops pipeline.

---

## #7 — Agent killed mid-run leaves uncommitted state on the shared tree

**Observed:** Adoption agent `ada5b82f…` was stopped; the branch
`adopt-confirm-dialog-dash` was empty (no commits) and the
`app/dashboard/integrations/page.tsx` edit sat uncommitted on the
shared working tree. Next agent that switched branches carried the
edit with them, conflating tracks.

**Cause:** no crash-recovery protocol. When an agent dies, its
uncommitted edits are an implicit shared state.

**Durable fix:**

- Primary: #2's worktree isolation makes this a non-issue.
- Secondary: every Agent prompt now requires
  `git commit --allow-empty -m "checkpoint: ..."` every 3 edits, so a
  death leaves at least a WIP commit on the agent's own branch.
  Landed in `.claude/plans/eager-herding-hejlsberg.md`.

**Status:** process mitigation landed; worktree fix pending #2.

---

## Summary table

| # | Failure | Status | Owner |
|---|---|---|---|
| 1 | MCP auto-reconnect | external | Anthropic (file feedback) |
| 2 | Worktree isolation | process ✅, config pending | RestoreAssist docs lookup |
| 3 | Concurrent agent stomp | covered by #2 | n/a |
| 4 | Duplicate component ship | ✅ plan template updated | n/a |
| 5 | npm + pnpm mixing | ✅ CLAUDE.md rule | n/a |
| 6 | Prisma migration drift | RA-1546 open | needs assignee |
| 7 | Killed agent uncommitted state | ✅ checkpoint rule | n/a |

Five of seven have a durable fix landed in this pass. #1 is external;
#6 needs the RA-1546 CI pipeline follow-up.
