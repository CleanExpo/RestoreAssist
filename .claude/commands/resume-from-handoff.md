---
description: "Read the latest session handoff, verify its claims against current repo state (read-only), and resume from the documented point"
---

# Resume From Handoff

Pick up where the last session stopped, without re-deriving context.
`.claude/hooks/session-start-resume-nudge.sh` points here on SessionStart,
naming the handoff it found.

## Usage

```
/resume-from-handoff                                    # latest handoff
/resume-from-handoff docs/session-handoffs/handoff-<ts>.md   # a specific one
```

## Phase 0 — read only

**This command changes nothing.** No commits, no pushes, no fixes, no new
branches. Its output is an assessment and a proposed next step. Work begins
only after the user picks one. If verification uncovers something broken,
report it — do not start repairing it under cover of "resuming".

## Phase 1 — locate and read

With no argument, take the newest handoff, the same selection the hook makes:

```bash
ls -t docs/session-handoffs/handoff-*.md | head -1
```

`docs/session-handoffs/index.md` lists every handoff with a one-line summary
if you need an older one. Read the whole document, not just §7 — §5 carries
what was still running and §6 what was actually verified.

## Phase 2 — verify before trusting

**A handoff is a claim about a moment that has passed, not ground truth.**
Its author could not see what happened next, and may simply have been wrong;
handoffs in this repo have carried corrections of their own earlier revisions.
Treat every load-bearing statement as needing confirmation:

| The handoff says | Check |
| --- | --- |
| a PR is open | its real state — it may be merged, closed, or conflicted since |
| a branch holds the work | whether it still exists; merged branches get auto-deleted here |
| CI was green or red | the current head's run, not the one it described |
| an item is deferred | whether a later session already did it |
| production is or is not deployed | the actual deploy state; `deploy-production.yml` is manual |

Useful reads, all non-mutating:

```bash
git fetch origin main                     # then compare, do not merge
git log --oneline -5 origin/main
git status --porcelain                    # uncommitted work left behind?
git branch -a --contains HEAD
```

For anything the handoff claims about GitHub, read the API rather than the
prose: PR state, the current head's checks, open review threads.

## Phase 3 — report the delta

Say plainly, in this order:

1. **Which handoff** you read, and when it was written.
2. **What has changed since** — items now done, PRs merged, branches gone.
3. **What still holds** — open items that survive verification, most important
   first.
4. **Anything the handoff got wrong**, and the corrected fact. This matters
   more than the rest: an inherited error repeats itself silently.
5. **A proposed next step**, drawn from §7, with the reason it is next.

Then stop and let the user choose. Do not begin the work.

## Reading §6 correctly

The verification section is where a handoff is most easily misread. Its author
was required to distinguish **"did not run"** from **"ran and found nothing"**,
and **"unavailable from this environment"** from **"not configured"** — so
preserve those distinctions rather than flattening them into "verified".

A Phase 0 gate line reading `exit 0` proves nothing on its own: `handoff-loop.sh`
reports gates it could not run as `SKIPPED`, so a green exit with most gates
skipped means one gate ran. If §6 names skips, those checks are still outstanding
and belong in your Phase 3 report as open, not done.

## When there is nothing to resume

If no handoff exists, or the newest one is stale enough that everything in it
verifies as done, say so in a sentence and ask what to work on. Do not
manufacture continuity that is not there.
