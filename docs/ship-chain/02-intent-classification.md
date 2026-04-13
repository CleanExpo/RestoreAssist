# 02 — Intent Classification

> **Series:** [Ship Chain](./00-index.md) · Document 2 of 5

Intent classification is the first stage of the pipeline.
It converts a human-written brief into a machine-readable `Intent` struct that the planner can act on.

---

## The Three Brief Tiers

The pipeline accepts briefs at three levels of detail.
More detail → less inference → better output quality.

### BasicBrief (3 fields, ~30 seconds)

```yaml
tier: basic
title: "Add dark mode toggle"
description: "Users want to switch between light and dark themes to reduce eye strain."
repo: "CleanExpo/restoreassist"
```

PITER fills the missing fields by:

1. Reading the repo's `CLAUDE.md` for architectural constraints
2. Scanning recent commits to infer what "must not break"
3. Parsing the description to generate `acceptance_criteria`

Source: `.harness/templates/basic-brief.yaml`
API: `GET /api/harness/brief-templates?tier=basic`

### DetailedBrief (6 fields, ~2 minutes)

Adds the three fields PITER would otherwise infer:

```yaml
tier: detailed
title: "Add dark mode toggle"
description: "Users want to switch between light and dark themes."
repo: "CleanExpo/restoreassist"
intent_type: feature # feature | bugfix | chore | hotfix | spike
acceptance_criteria: |
  Toggle persists after page reload.
  Works on mobile viewport.
do_not_break: "Login flow, dashboard charts, PDF export"
```

Source: `.harness/templates/detailed-brief.yaml`
API: `GET /api/harness/brief-templates?tier=detailed`

### AdvancedBrief (full spec, ~5 minutes)

Adds pipeline control fields on top of DetailedBrief:

```yaml
custom_eval_threshold: 8.5 # override quality gate (0–10)
autonomy_budget: 60 # minutes → maps to model tier + retries
target_files: # restrict scope
  - "app/dashboard/components/"
research_intent: | # guide the research phase
  Explore CSS variables vs Tailwind dark: prefix
max_files_modified: 5 # abort eval loop if exceeded
plan_discovery: true # generate 3 approaches, pick best (+5 min)
```

Source: `.harness/templates/advanced-brief.yaml`
API: `GET /api/harness/brief-templates?tier=advanced`

---

## Complexity Tiers

The classifier maps `intent_type` + description length + `target_files` count to a complexity tier:

| Tier       | Signals                                    | Model  |
| ---------- | ------------------------------------------ | ------ |
| `simple`   | bugfix, chore, ≤ 3 target files            | haiku  |
| `moderate` | feature, ≤ 8 files, no migration           | sonnet |
| `complex`  | migration required, hotfix, plan_discovery | opus   |

The complexity tier feeds directly into the `BuildSpec.modelTier` and `timeoutMinutes` in the next stage.

---

## PITER Context Injection

PITER runs two intent files before every build. These are not brief fields — they are workspace-level configuration injected automatically.

**`.harness/intent/ENGINEERING_CONSTRAINTS.md`** — non-negotiable rules:

- Auth & security (all `/api/` routes require session)
- Data safety (atomic deduction, no N+1 queries)
- Australian compliance (IICRC citations, ABN format, GST)
- UI/component rules (shadcn/ui only, brand colours)
- Integration rules (fire-and-forget sync)

**`.harness/intent/RESEARCH_INTENT.md`** — current cycle focus:

- Primary research direction (e.g. pgvector embedding for damage assessment)
- Open questions the build phase should explore
- Topics explicitly deferred to future cycles

Both files are version-controlled in `.harness/intent/` and apply to every brief submitted in this workspace.

---

## Why Separate Briefs from Constraints?

Brief fields answer "what do you want built?"
Constraint files answer "what are the rules this workspace always follows?"

Mixing them produces bloated briefs where every engineer must remember to include auth rules, ABN format requirements, and IICRC citation styles. Separating them means a BasicBrief with 3 fields still produces compliant output.

---

→ Next: **[03 — The Evaluator](./03-the-evaluator.md)**
