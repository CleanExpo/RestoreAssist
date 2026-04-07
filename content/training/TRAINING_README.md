# RestoreAssist AI Training Data — Usage Guide

**Generated:** 2026-03-30
**Source data:** 4,003 Ascora jobs, 2020-06-01 to 2025-10-13, South-East Queensland
**Purpose:** LLM fine-tuning and RAG pipeline for scope generation, equipment calculation, and moisture interpretation

---

## Files in This Directory

| File                    | Purpose                                                                                | Size   |
| ----------------------- | -------------------------------------------------------------------------------------- | ------ |
| `job-patterns.json`     | Statistical patterns from 4,003 jobs — distributions, value segments, training signals | ~25 KB |
| `scope-examples.json`   | 10 complete 7-section scope narratives (6× water, 2× mould, 1× fire, 1× storm)         | ~90 KB |
| `prompt-examples.jsonl` | 50 JSONL fine-tuning examples in OpenAI chat format                                    | ~70 KB |
| `TRAINING_README.md`    | This file                                                                              | —      |

---

## Step 1: Vectorise Historical Jobs (Embedding the 4,003 Ascora jobs)

### Prerequisites

- Ascora jobs imported via `POST /api/ascora/sync` (see ASCORA_ANALYSIS.md)
- pgvector enabled in Supabase: `CREATE EXTENSION IF NOT EXISTS vector`
- `embeddingVector` column added to `HistoricalJob` table (migration applied — see ASCORA_ANALYSIS.md)

### Using the Vectorise Endpoint

```bash
POST /api/inspections/any-id/vectorise-jobs
Content-Type: application/json

{
  "provider": "openai",
  "openaiApiKey": "sk-...",
  "batchSize": 100
}
```

This endpoint:

1. Queries all `HistoricalJob` rows where `embeddedAt IS NULL` for the tenant
2. For each job, calls `buildJobEmbeddingText()` from `lib/ai/embeddings.ts` to build a rich text representation
3. Sends the text to OpenAI `text-embedding-3-small` (1536 dimensions)
4. Stores the resulting vector in `embeddingVector` and sets `embeddedAt = now()`

**Hash fallback (no API key required — for testing only):**

```bash
{
  "provider": "hash-fallback"
}
```

Hash fallback produces deterministic 1536-dim vectors from text — cosine similarity still functions structurally, but semantic accuracy is nil. Use hash fallback only to verify the pipeline end-to-end before OpenAI keys are available.

### Expected run time

At OpenAI rate limits (~3,000 RPM for embedding):

- 4,003 jobs ÷ 3,000 RPM ≈ 2 minutes total
- With `batchSize: 100`, approximately 41 batches
- Cost: ~$0.02 USD at `text-embedding-3-small` pricing ($0.02 per 1M tokens, ~50 tokens per job text)

---

## Step 2: RAG Pipeline — Scope Generation with Historical Context

### How it works

When a technician opens a new inspection and requests an AI scope:

```
1. New inspection created with:
   - claimType: "water_damage"
   - damageCategory: 2
   - damageClass: 3
   - description: "3br brick veneer, kitchen and laundry, 45 m², washing machine overflow"
   - suburb: "Forest Lake"

2. RAG retrieval (lib/ai/rag-context.ts):
   retrieveSimilarJobs({
     tenantId: "...",
     claimType: "water_damage",
     waterCategory: 2,
     waterClass: 3,
     description: "...",
     suburb: "Forest Lake",
     limit: 5
   })

3. System tries pgvector cosine similarity first:
   SELECT ... FROM "HistoricalJob"
   WHERE "tenantId" = $1
   ORDER BY "embeddingVector" <=> $queryVector ASC
   LIMIT 5

4. Falls back to text-match (claimType filter) if pgvector unavailable.

5. Matching jobs are formatted into a context block:
   "## Similar Historical Jobs (use as reference only)
   ### Reference Job 1
   - Type: water_damage Cat 2 Class 3
   - Location: Forest Lake, QLD
   - Job: ABC - Smith - Forest Lake
   - Items: 12, Equipment: 6
   - Value: $6,842.00 ex-tax
   - Description: Washing machine overflow, kitchen and laundry..."

6. This context block is appended to the system prompt via getClaimTypePrompt():
   getClaimTypePrompt("water_damage", {
     damageCategory: 2,
     damageClass: 3,
     ragContext: contextPrompt   // ← injected here
   })

7. The enriched prompt is sent to Claude via the streaming SSE endpoint:
   POST /api/inspections/[id]/generate-scope
```

### Building the query text

The query is built by `buildQueryText()` in `lib/ai/rag-context.ts`:

```
Claim type: water_damage
IICRC Category 2 Class 3
Location: Forest Lake
[full inspection description]
```

This query text is then embedded (same model as jobs) and used for cosine similarity search.

### RAG context injection

The `ragContext` string is appended to the system prompt inside `## SIMILAR HISTORICAL JOBS (RAG Context)` via `getClaimTypePrompt()` in `lib/ai/claim-type-prompts.ts`. The AI is instructed to use these as reference only — not to copy verbatim.

---

## Step 3: Fine-Tuning with `prompt-examples.jsonl`

### File format

Each line in `prompt-examples.jsonl` is a valid JSON object:

```json
{
  "messages": [
    { "role": "system", "content": "You are an IICRC S500:2025 certified..." },
    { "role": "user", "content": "Generate a scope for..." },
    {
      "role": "assistant",
      "content": "## 1. Water Source & Loss Mechanism\n..."
    }
  ]
}
```

This is the OpenAI fine-tuning JSONL format for `gpt-4o-mini` and `gpt-4o`.

### Content breakdown

| Category                                                                     | Count | Lines |
| ---------------------------------------------------------------------------- | ----- | ----- |
| Scope generation (water damage, various categories/classes)                  | 25    | 1–25  |
| Equipment calculation (IICRC S500:2025 ratios, AS/NZS 3012:2019 load checks) | 10    | 26–35 |
| Moisture reading interpretation (drying validation, spike investigation)     | 10    | 36–45 |
| Claim classification from job description                                    | 5     | 46–50 |

### Uploading for fine-tuning (OpenAI)

```bash
# Upload training file
openai api files.create -f content/training/prompt-examples.jsonl -p fine-tune

# Create fine-tuning job
openai api fine_tuning.jobs.create \
  -t file-XXXX \
  --model gpt-4o-mini-2024-07-18
```

Or via API:

```bash
curl https://api.openai.com/v1/fine_tuning/jobs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "training_file": "file-XXXX",
    "model": "gpt-4o-mini-2024-07-18"
  }'
```

### Using a fine-tuned model in RestoreAssist

Once the fine-tuning job completes, set the model ID in the scope generator at `app/api/inspections/[id]/generate-scope/route.ts`:

```ts
// Replace "claude-opus-4-5" with your fine-tuned model ID
// e.g. "ft:gpt-4o-mini-2024-07-18:unite-hub::XXXXX"
model: process.env.FINE_TUNED_MODEL_ID ?? "claude-opus-4-5";
```

Note: The Claude API endpoint uses Anthropic SDK; the OpenAI fine-tuned model would require switching the endpoint. The current implementation uses the Anthropic Claude API with claim-type system prompts — fine-tuning adds an additional specialisation layer if OpenAI models are preferred.

---

## Step 4: Using `job-patterns.json` for Prompt Engineering

`job-patterns.json` documents the statistical patterns extracted from the 4,003 Ascora jobs. Use it to:

### 1. Calibrate value estimates in generated scopes

The `valueSegments` object provides realistic AUD ranges by job complexity:

- `micro` ($0–$500): single-room, 1–2 air movers
- `small` ($500–$2,000): single room drying, 5 days
- `medium` ($2,000–$10,000): multi-room, ~8 days
- `large` ($10,000–$50,000): whole house or fire, ~21 days
- `complex` ($50,000+): commercial or heritage, 30–180 days

### 2. Detect escalation triggers in new job descriptions

The `trainingSignals.escalationKeywords` array contains terms that predict high-value or complex jobs. Use these in a pre-scope classification pass.

### 3. Understand Category upgrade risk

`trainingSignals.categoryUpgradeSignals` lists phrases from real Ascora job notes that indicate a Category 1 source should be upgraded to Category 2 (e.g. "water sitting more than 72 hours", "tenant did not report").

### 4. Build prompt context for non-vectorised job types

If pgvector is not yet populated, `promptEnhancements[claimType].commonScopeItems` provides a static fallback list of typical scope line items per claim type, which can be injected into prompts as context.

---

## Step 5: Using `scope-examples.json` as Few-Shot Examples

The 10 scope examples in `scope-examples.json` are formatted as complete, realistic scope documents. Use them to:

1. **Validate AI output quality** — compare generated scopes against these examples for format compliance, IICRC citation accuracy, and equipment ratio correctness
2. **Few-shot prompting** — inject 1–2 relevant examples into the system prompt for low-token models that benefit from in-context learning
3. **Manual review baseline** — technicians can compare AI scope drafts against these examples to calibrate their QA review process

Each example includes:

- `id`: reference identifier
- `claimType`, `damageCategory`, `damageClass`: classification
- `propertyDescription`, `causeOfLoss`: input context
- `scope`: full 7-section markdown scope
- `equipmentList`: structured equipment data
- `estimatedValueAud`, `estimatedDurationDays`: value and duration benchmarks
- `iicrcReferences`: array of cited standards sections

---

## Data Quality Notes

- All scope examples are authored by a domain expert familiar with IICRC S500:2025, S520, and S770
- IICRC section references are accurate as of S500:2025 (current edition as of 2026)
- Dollar amounts are in AUD, reflect SE Queensland market rates (2025–2026), and include labour + equipment + materials
- Equipment ratios strictly follow IICRC S500:2025: 1 LGR/40 m², 1 air mover/15 m², 1 scrubber/100 m²
- AS/NZS 3012:2019 electrical load calculations are correct (80% rule applied)
- Category upgrade logic (Cat 1 → Cat 2 after 72 hours) follows S500:2025 §4.3

---

## Adding More Training Examples

To expand the training set:

1. **From completed inspections**: Once RestoreAssist has processed 100+ real inspections with scope documents, export them via `/api/inspections/export-training-data` (build this endpoint) and append to `prompt-examples.jsonl`

2. **From Ascora job descriptions**: The `jobDescription` field in `HistoricalJob` is a rich source of real restoration narrative. An NLP pipeline can convert these into `(description, scope)` training pairs.

3. **IICRC classification NLP**: Build a pass-through endpoint that reads `jobDescription` and infers `waterCategory` and `waterClass` — these are missing from the Ascora API (see ASCORA_ANALYSIS.md). Labelled training data from real descriptions is the fastest path to this.

---

## Environment Variables Required

```bash
# For vectorisation
OPENAI_API_KEY=sk-...           # text-embedding-3-small, ~$0.02 per 4,003 jobs

# For scope generation (already set in Vercel)
ANTHROPIC_API_KEY=...           # Claude scope generation via /api/inspections/[id]/generate-scope

# For fine-tuning (optional — if using OpenAI fine-tuned model)
FINE_TUNED_MODEL_ID=ft:gpt-4o-mini-...  # Set in Vercel after fine-tuning completes
```

---

## Related Files

| File                                               | Purpose                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `lib/ai/embeddings.ts`                             | `buildJobEmbeddingText`, `embedText`, `hashEmbedText`, `findSimilarJobs`     |
| `lib/ai/rag-context.ts`                            | `retrieveSimilarJobs`, `safeRetrieveSimilarJobs`, `formatContextPrompt`      |
| `lib/ai/claim-type-prompts.ts`                     | System prompts per claim type; RAG context injection via `ragContext` option |
| `lib/ai/auto-classify.ts`                          | Auto-classification of claim type from job description                       |
| `app/api/inspections/[id]/vectorise-jobs/route.ts` | POST endpoint to embed all un-vectorised HistoricalJobs                      |
| `app/api/inspections/[id]/generate-scope/route.ts` | Streaming scope generation endpoint (Claude API, SSE)                        |
| `prisma/schema.prisma` (model `HistoricalJob`)     | DB schema with embedding metadata fields                                     |
| `ASCORA_ANALYSIS.md`                               | Full API analysis, job counts, value distributions, infrastructure status    |
