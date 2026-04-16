# 03 — The Evaluator

> **Series:** [Ship Chain](./00-index.md) · Document 3 of 5

The evaluator is the quality gate between the build stage and shipping.
It uses Claude Haiku to score output across 5 dimensions, computes a weighted quality score and a confidence score, then routes to one of three decisions.

Source file: `lib/harness/gate-check.ts`

---

## The Five Dimensions

Haiku evaluates every build output on these dimensions:

| Dimension      | Question                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| `correctness`  | Is the output factually and logically correct?                               |
| `completeness` | Are all required fields/sections present and non-empty?                      |
| `compliance`   | Does the output meet IICRC/Australian regulatory requirements?               |
| `coherence`    | Does the output read naturally without contradictions?                       |
| `safety`       | Is the output free of hallucinations, harmful claims, or misleading content? |

Each dimension returns:

- `score` — integer 0–10
- `confidence` — integer 0–100 (Haiku's certainty in that score)
- `reason` — one sentence explaining the score

---

## Scoring

```typescript
// lib/harness/gate-check.ts — computeScores()

function computeScores(dimensions: DimensionResult[]): {
  qualityScore: number;
  confidence: number;
} {
  // Quality: mean of dimension scores, scaled 0–100
  const qualityScore = Math.round(
    (dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length) * 10,
  );

  // Confidence: mean of per-dimension confidence values
  const confidence = Math.round(
    dimensions.reduce((sum, d) => sum + d.confidence, 0) / dimensions.length,
  );

  return { qualityScore, confidence };
}
```

A dimension score of 8/10 contributes 80 to the quality score.
Five dimensions averaging 8/10 → `qualityScore = 80`.

---

## The Three-Tier Decision

```typescript
// lib/harness/gate-check.ts — makeDecision()

function makeDecision(
  qualityScore: number,
  confidence: number,
  retryCount: number,
  thresholds: ProjectThresholds,
): GateDecision {
  if (retryCount >= thresholds.max_retries) return "FLAG";

  if (
    qualityScore >= thresholds.auto_ship_quality &&
    confidence >= thresholds.auto_ship_confidence
  ) {
    return "AUTO_SHIP";
  }

  if (
    qualityScore < thresholds.retry_below_quality ||
    confidence < thresholds.retry_below_confidence
  ) {
    return "RETRY";
  }

  return "FLAG";
}
```

The decision space:

```
                     confidence
                  low     medium     high
              ┌─────────┬──────────┬──────────┐
         low  │  RETRY  │  RETRY   │  RETRY   │
quality  med  │  RETRY  │  FLAG    │  FLAG    │
         high │  FLAG   │  FLAG    │ AUTO_SHIP │
              └─────────┴──────────┴──────────┘
```

At `max_retries` exhausted → always FLAG regardless of scores.

---

## Default Thresholds

From `.harness/config.yaml`:

```yaml
defaults:
  auto_ship_quality: 80
  auto_ship_confidence: 70
  retry_below_quality: 50
  retry_below_confidence: 40
  max_retries: 2
```

Per-project overrides are applied on top of defaults:

```yaml
projects:
  scope-quality: # stricter — compliance-critical
    auto_ship_quality: 85
    auto_ship_confidence: 75
    max_retries: 3

  evidence-classification: # looser — creative task
    auto_ship_quality: 75
    auto_ship_confidence: 65
```

The `projectKey` in a gate-check request must match a key in `config.yaml` for overrides to apply.
Unknown keys fall back to defaults.

---

## The Retry Loop

On a RETRY decision, the pipeline:

1. Stores the failed `GateCheck` record in the DB (all runs are persisted)
2. Extracts the lowest-scoring dimension's `reason`
3. Injects it as a "lesson" into the next build prompt
4. Re-runs `build()` with `retryCount + 1`
5. Re-evaluates — the loop continues until AUTO_SHIP, FLAG, or `max_retries` hit

Lesson injection is the key difference between a retry loop and a simple re-run.
The model sees what it got wrong and has a specific instruction to fix it.

---

## Observability

Every evaluation — including retries — is persisted to the `GateCheck` table:

```prisma
model GateCheck {
  id           String   @id @default(cuid())
  projectKey   String
  taskId       String?
  qualityScore Int
  confidence   Int
  decision     String
  dimensions   String   @db.Text   // JSON array of DimensionResult
  retryCount   Int      @default(0)
  telegramSent Boolean  @default(false)
  rawResponse  String?  @db.Text
  createdAt    DateTime @default(now())

  @@index([projectKey, createdAt])
  @@index([decision, createdAt])
}
```

FLAG and RETRY decisions trigger a Telegram alert (when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set):

```
🚩 Gate Check: FLAG
Project: `scope-quality`
Task: `RA-701`
Quality: 72/100 | Confidence: 58/100
ID: `clx7...`
```

Query recent results:

```bash
GET /api/harness/gate-check?projectKey=scope-quality&limit=20
```

---

→ Next: **[04 — Karpathy Optimisations](./04-karpathy-optimisations.md)**
