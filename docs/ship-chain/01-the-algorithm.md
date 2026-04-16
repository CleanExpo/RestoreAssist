# 01 — The Algorithm

> **Series:** [Ship Chain](./00-index.md) · Document 1 of 5

The ship chain is five pure functions composed in sequence.
Each function takes the output of the previous one as its input.
Nothing is stateful between stages — each stage can be retried independently.

---

## The Five Functions

```
brief  →  classify  →  plan  →  build  →  evaluate  →  route
```

### 1. `classify(brief) → Intent`

Reads the brief fields and returns a structured `Intent`:

```typescript
interface Intent {
  type: "feature" | "bugfix" | "chore" | "hotfix" | "spike";
  complexity: "simple" | "moderate" | "complex";
  acceptanceCriteria: string[];
  doNotBreak: string[];
  targetFiles?: string[];
  researchIntent?: string;
}
```

A BasicBrief only has `title`, `description`, and `repo`.
PITER auto-fills `intent_type`, `acceptance_criteria`, and `do_not_break` by reading the repo's recent history and open issues.
See `.harness/templates/basic-brief.yaml` for the auto-fill comment block.

### 2. `plan(intent) → BuildSpec`

Uses the classified intent to generate a build specification:

```typescript
interface BuildSpec {
  filesToCreate: string[];
  filesToModify: string[];
  migrationRequired: boolean;
  modelTier: "haiku" | "sonnet" | "opus";
  timeoutMinutes: number;
  retryBudget: number;
}
```

The `autonomy_budget` field in AdvancedBrief maps directly to `modelTier` and `retryBudget`:

| Budget  | Model  | Retries | Timeout |
| ------- | ------ | ------- | ------- |
| 10 min  | haiku  | 1       | 8 min   |
| 30 min  | sonnet | 2       | 25 min  |
| 60 min  | sonnet | 3       | 50 min  |
| 120 min | opus   | 4       | 100 min |

See `.harness/templates/advanced-brief.yaml` for the full field list.

### 3. `build(spec) → Diff`

Runs the code generation model against the spec.
Constrained by `.harness/intent/ENGINEERING_CONSTRAINTS.md` — these are injected into every build prompt automatically. Key constraints:

- All `/api/` routes require `getServerSession` auth
- Atomic credit deduction via `updateMany` (never read-then-write)
- shadcn/ui components only — no custom form controls
- Schema changes require a Prisma migration

The `max_files_modified` field in AdvancedBrief caps the diff. Exceeding it triggers a Telegram alert and aborts the eval loop.

### 4. `evaluate(diff, task) → GateResult`

The confidence-weighted evaluator. This is the most important function in the chain.

```typescript
interface GateResult {
  qualityScore: number; // 0–100, mean of 5 dimension scores × 10
  confidence: number; // 0–100, mean of per-dimension confidence values
  decision: "AUTO_SHIP" | "FLAG" | "RETRY";
  dimensions: DimensionResult[];
}
```

Five dimensions are scored 0–10 each:
`correctness`, `completeness`, `compliance`, `coherence`, `safety`

Source: `lib/harness/gate-check.ts` — `evaluateOutput()` and `computeScores()`.

### 5. `route(gateResult) → Action`

Maps the gate decision to a concrete action:

| Decision    | Condition                                       | Action                               |
| ----------- | ----------------------------------------------- | ------------------------------------ |
| `AUTO_SHIP` | quality ≥ 80 AND confidence ≥ 70                | Open PR automatically                |
| `FLAG`      | medium quality/confidence, or retries exhausted | Telegram alert to Phill              |
| `RETRY`     | quality < 50 OR confidence < 40                 | Re-run `build` with lesson injection |

Thresholds are per-project. Source: `.harness/config.yaml`.

---

## Why Pure Functions?

Each stage is independently testable. You can call `POST /api/harness/gate-check` with any string and get a structured evaluation back without running the build stage at all.

This is how the evaluator was built first (RA-674) and the brief templates second (RA-681) — the pipeline is composable, not monolithic.

---

→ Next: **[02 — Intent Classification](./02-intent-classification.md)**
