# Verification Gate — Always-On Rule

> **Authority**: Always loaded. Applies to ALL tasks.
> **Purpose**: Keeps completion claims honest. Not a ritual — a standard of evidence.

## The Rule

**Never report work as complete on reasoning alone. Point at the tool result that proves it.**

A claim of "done", "passing", "fixed" or "working" must be traceable to something that ran in
this session: test output, a command's exit code, a file you read back, a page you loaded. If no
such evidence exists, say what you did and what remains unverified. That sentence is always
acceptable; a confident claim without evidence never is.

**Negative claims need more evidence than positive ones.** "Missing", "not set", "not found",
"blocked", "not possible" are the claims that stop work, and a false one dies quietly instead of
being caught. Before writing one, state where you looked and why that set is exhaustive.

State the basis, not the verdict. Two distinctions read identically in a summary and mean
opposite things, so keep them explicit:

- **"Did not run"** vs **"ran and found nothing"**.
- **"Unavailable from this environment"** vs **"not configured"**.

A test that has never been observed to fail has not been shown to guard anything. Run it
against the unfixed code first.

## Rewritten 2026-08-26 — what changed and why

This file previously mandated a five-part VERIFICATION CHECKLIST (where to check, how to get
there, what to see, what not to see, confirmation prompt) on every task.

That was scaffolding for an earlier model. Anthropic's Opus 5 migration guidance is explicit:
remove verification instructions carried over from earlier models — *"include a final verification
step," "use a subagent to verify"* — because **they cause over-verification on Opus 5**, which
verifies its own work without being told to. `~/.claude/CLAUDE.md` already carries that guidance,
so the old version of this file put the two directly in conflict on every turn.

What is kept is the substance: evidence over assertion. That is engineering discipline and does
not decay with the model. What is dropped is the mandatory ceremony around it.

## Banned: dressing up an unverified claim

Do not use these when nothing ran:

- "The feature is now complete"
- "Everything is working as expected"
- "I've implemented everything you requested"
- "Ready for testing"

**"Done" is not banned.** When something genuinely ran and passed, say so plainly — the harness
asks for exactly that, and hedging a verified result is its own failure. The ban is on the
*unearned* claim, never on plain reporting of an earned one.

## When a visual check is genuinely needed

For UI work where correctness is visual, look at it — screenshot the running app, load the page,
read the rendered output. Do that because the change is visual, not because a checklist demanded
a section. State what you saw.

## Exceptions

Does not apply to: documentation-only, config, test-only, or git operations.
