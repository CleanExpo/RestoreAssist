# `.harness/learning/` — RA-1745/RA-1746 Training-pipeline signal

This directory is the **training-pipeline input** for the Pi-CEO autonomous system, per the architecture in `~/.claude/projects/-Users-phill-mac-Pi-CEO/memory/project_training_inference.md`.

## How the loop closes

| Pipeline  | Mode    | Cadence              | Reads                                                 | Writes                                          |
| --------- | ------- | -------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Inference | Apply   | Every session        | `~/.claude/skills/`, `~/.claude/projects/.../memory/` | code, PRs, Linear tickets, **and entries here** |
| Training  | Distill | Weekly Sat 23:00 UTC | **entries here** + same of all portfolio repos        | new skills, memory entries, CLAUDE.md mandates  |

Any agent finishing a piece of work in inference mode appends a structured row to one of the five logs below when it spots something the system could learn from. The training run reads all five, identifies recurring patterns (≥ 3 entries), and promotes them.

## The five logs

| File                            | When to append                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `adversary-disagreements.jsonl` | When `opus-adversary` flags a real concern Sonnet missed, or vice-versa. Captures the disagreement so the planner can be tuned.    |
| `ci-failures.jsonl`             | When CI flips red **after** a local typecheck passed — captures the signal CI catches that local doesn't.                          |
| `user-corrections.jsonl`        | When the user reverses an agent decision (e.g. "we don't use Sentry"). Highest-value training data — direct preference correction. |
| `false-positives.jsonl`         | When a tool / linter / scanner / validator fires on a real-but-not-actionable finding. Stops future agents from re-acting on it.   |
| `incident-postmortems.jsonl`    | After resolving an outage, capture root cause + recovery steps + prevention. Future agents use this to recognise the shape early.  |

## Append shape

Each file is JSONL — one JSON object per line. Required fields:

```json
{
  "ts": "2026-04-27T11:10:00Z",
  "type": "incident-postmortems",
  "session_id": "<claude-session-id>",
  "summary": "<one-line headline>",
  "context": "<2-5 sentence narrative of what happened>",
  "lesson": "<one-line takeaway, the rule the system should learn>",
  "tickets": ["RA-1740", "RA-1742"],
  "tags": ["prisma", "vercel", "outage"]
}
```

`tags` are free-form for now; the weekly distiller clusters by tag.

## Why per-repo, not central

Each portfolio repo has its own `.harness/learning/` so:

- Signal is co-located with the code it's about (easier to read in PR review)
- Per-repo CLAUDE.md mandates evolve from per-repo signal
- The weekly distiller can rank patterns by repo (e.g. "Prisma drift hits restoreassist + restoreassist-sandbox + carsi → cross-repo skill")

## Don't stop work to write here

The mandate (per `feedback_autonomy.md`): if you notice something the system should learn from, append a structured entry **and keep working**. Do not pause to reason about meta-rules. The weekly distillation is when meta-rules get processed.

## Tracked tickets

- RA-1745 — architecture master (training/inference framework)
- RA-1746 — RestoreAssist adoption (this directory)
- DR-797 — DR-NRPG adoption
- SYN-819 — Synthex adoption
- UNI-1971 — Unite-Group adoption
- GP-377 — G-Pilot adoption
