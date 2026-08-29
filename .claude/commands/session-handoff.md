---
description: "Gate the tree, then write a session handoff to docs/session-handoffs/ recording what was done, what shipped, and where the next session picks up"
---

# Session Handoff

Write the handoff that lets the next session resume without re-deriving
context. `.claude/hooks/stop-handoff-nudge.sh` points here on Stop.

## Usage

```
/session-handoff            # standard gates
/session-handoff --quick    # type-check + lint + no-emoji only; for mid-session handoffs
/session-handoff --full     # installs deps first, then adds the production build and audit suite
```

## Phase 0 — gate the tree first, every time

Run the gate before writing anything. Pass the flag through verbatim:

```bash
bash scripts/handoff-loop.sh            # or --quick / --full
```

It tees to `.handoff-logs/handoff-<ts>.log`. Cite that path in the handoff.

**The exit code alone is not the story.** The script reports a gate it could
not run as `SKIPPED`, never as passed — so `exit 0` with eight skips is not a
green tree, it is one gate that ran. Read the `== summary ==` block, not just
the status:

| Exit | Meaning | What to write |
| --- | --- | --- |
| `0`, `RESULT: green — all gates passed` | every gate ran and passed | a normal handoff |
| `0`, `RESULT: green (with skips: …)` | some gates could not run | a normal handoff whose §6 names each skip and why |
| `1`, `RESULT: BLOCKED` | a gate failed | a **BLOCKED** handoff naming the failing gate in the title and §1 |
| `2` | usage or setup error | fix the invocation and re-run; do not write a handoff |

`HANDOFF_GATE_SKIP=1` bypasses every gate. Use it only when gates are known
broken upstream, and say so in §6 — a handoff written that way is ungated.

## Phase 1 — write the document

Write to `docs/session-handoffs/handoff-<UTC timestamp>.md`, matching the
timestamp of the gate log so the two pair up. Use the same seven sections the
existing handoffs use:

1. **Summary of what was done** — outcomes, not a diary of steps.
2. **Where it started** — the request or condition that began the session.
3. **Decisions locked + what shipped** — decisions that outrank a plausible
   alternative later, and what actually merged.
4. **Key files** — a table: path, and what a reader needs to know about it.
   Include files deliberately *not* changed when that was a decision.
5. **Running state** — what is still live, still broken, still deployed or
   not. The most important open thing goes first, in bold.
6. **Verification — exact commands** — the commands, and their real results.
7. **Deferred + open questions** — numbered, so the next session can pick one.

Open with a title line, then a bold metadata line carrying **When**,
**Branch**, **PR**, and the Phase 0 result with its log path.

## What makes a handoff worth reading

State the basis, not the verdict. `.claude/rules/verification-gate.md` applies
here in full: this document is the record a later session will trust, so a
claim that outruns its evidence does real damage.

- Distinguish **"did not run"** from **"ran and found nothing"**.
- Distinguish **"unavailable from this environment"** from **"not configured"**.
- If a gate skipped, §6 says which and why — never let `exit 0` imply more than
  it earned.
- Prefer "type-check and 41 unit tests pass; not opened in a browser" over
  "verified".
- Record what was *wrong* as readily as what worked, including your own
  corrections. A handoff that hides a false start makes the next session
  repeat it.

## Phase 2 — index and commit

Add an entry to `docs/session-handoffs/index.md` under `## Concepts`:

```
- [[handoff-<timestamp>]] — <title>
```

Bump the `description:` concept count and set `updated:` in its frontmatter.

Then run the content gates that apply to prose, and commit:

```bash
node scripts/check-au-english.mjs
node scripts/check-no-emoji.mjs
node scripts/check-encoding.mjs
```

`.handoff-logs/` is gitignored — commit the document and the index, not the log.
