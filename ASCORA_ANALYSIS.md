# Ascora API Analysis — RestoreAssist AI Learning Model

**Generated:** 2026-03-30
**API endpoint:** `https://api.ascora.com.au`
**Auth header:** `Auth: <api-key>` (note: NOT `Authorization: Bearer`)
**SSL note:** Ascora uses a self-signed cert — requires `-k` (curl) or `NODE_TLS_REJECT_UNAUTHORIZED=0`

---

## Connectivity

| Item | Value |
|------|-------|
| Status | Connected |
| Total jobs | **4,003** |
| Total pages (pageSize=100) | 41 |
| Date range | 2020-06-01 → 2025-10-13 (5+ years) |

---

## Job Type Breakdown

Based on a stratified sample of ~300 jobs (pages 1, 20, and 41):

| Job Type | Count (sampled 300) | % |
|----------|---------------------|---|
| Water | 214 | 71.3% |
| Microbial Growth | 50 | 16.7% |
| Biohazard | 12 | 4.0% |
| Contents | 9 | 3.0% |
| Fire | 6 | 2.0% |
| Inspection | 4 | 1.3% |
| Cleaning | 3 | 1.0% |
| Other | 2 | 0.7% |

Water damage dominates (~71%). Microbial growth (mould) is the clear second category at ~17%.

---

## Job Value Ranges (totalExTax)

| Metric | Value |
|--------|-------|
| Jobs with value > $0 | 169 / 300 sampled (56%) |
| Minimum | $165.00 |
| Maximum | $371,143.22 |
| Average | $7,184.59 |
| Median | $2,020.00 |

**Note:** ~44% of sampled jobs have $0 totalExTax. These appear to be jobs where
invoicing was handled externally (e.g. insurer-direct) or the job was a non-billable
type (inspection, company meeting). The `minValueAud` filter in `/api/ascora/sync`
handles this cleanly.

### Top 3 High-Value Jobs

| Job # | Type | Value | Location | Name |
|-------|------|-------|----------|------|
| JOB12649 | Water | $371,143 | Wooloowin, QLD | Commercial water damage |
| DRQ13363 | Microbial Growth | $117,677 | Forest Lake, QLD | Large mould remediation |
| JOB15915 | Water | $32,817 | Collingwood Park, QLD | Multi-unit water |

---

## Job Status Codes

| Code | Meaning | Count (sampled 300) |
|------|---------|---------------------|
| 0 | Draft | 1 |
| 1 | Pending | 5 |
| 2 | Scheduled | 1 |
| 3 | In Progress | 28 |
| 5 | On Hold | 9 |
| 6 | Cancelled | 1 |
| 8 | **Complete** | **255 (85%)** |

---

## API Response Structure

```json
{
  "success": true,
  "results": [...],
  "totalPages": 41,
  "totalRecords": 4003
}
```

### Job Object Fields

```
jobId                  UUID (Ascora native)
topLevelJobNumber      "DRQ13005" (human-readable)
jobNumber              "DRQ13005"
jobName                "FEN - Sanagozza - Loganholme"
jobDescription         Full scope text (rich narrative, 95%+ populated)
workUndertaken         Completion notes (18% populated)
jobStatus              Integer (see codes above)
dateCreated            ISO-8601
completedDate          ISO-8601 or null
pricingMethod          "TIME-AND-MATERIALS" | "FIXED-PRICE"
totalIncTax            Float (inc GST)
totalExTax             Float (ex GST) — key field for value filtering
purchaseOrderNumber    String (often insurer claim ref)
clientOrderNumber      String
addressLine1           Street address
addressLine2
suburb
postcode
country                "Australia"
latitude               Float
longitude              Float
jobType                { id: UUID, name: "Water " }
siteCustomer           { id: UUID, name: "..." }
billingCustomer        { id: UUID, name: "..." }
siteContact            { id: UUID, name: "..." }     (optional)
billingContact         { id: UUID, name: "..." }     (optional)
```

### Fields NOT Available in Ascora API

- `waterCategory` (IICRC Category 1/2/3) — must be inferred from `jobDescription` NLP or set manually
- `waterClass` (IICRC Class 1–4) — same, not in API
- `state` — not returned, must be inferred from postcode (QLD = 4xxx)
- `lineItems` — not accessible yet; `/invoicelines`, `/invoices`, `/jobcostings`, `/joblines`, `/lineitems`, `/items` all tried — contact Ascora support

### Key Patterns in Scope Descriptions

The `jobDescription` field is a goldmine for AI training:
- Narratives consistently describe: loss cause → affected areas → materials → measurements
- Most include room-by-room damage assessments ("2 bedrooms, hallway, laundry")
- Some include temperature/humidity readings and IICRC material classifications
- Average length ~200–800 words for water/mould jobs

---

## API Endpoints Discovered

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /jobs` | ✅ Works | Paginated, `pageSize` + `page` params |
| `GET /jobs?pageSize=100&page=N` | ✅ Works | Up to 4003 jobs, 41 pages |
| `GET /invoicelines` | ❌ 404/error | Line item endpoint not found |
| `GET /invoices` | ❌ 404/error | Tried by sync route |
| `GET /jobcostings` | ❌ 404/error | Tried by sync route |
| `GET /joblines` | ❌ 404/error | Tried by sync route |
| `GET /lineitems` | ❌ 404/error | Tried by sync route |
| `GET /items` | ❌ 404/error | Tried by sync route |

**Action required:** Contact Ascora support to get the correct line item endpoint.

---

## Infrastructure Built (RA-276 / RA-277)

### Supabase (project: udooysjajglluvuxkijp)

- `CREATE EXTENSION vector` — pgvector 0.8.0 enabled
- `ALTER TABLE "HistoricalJob" ADD COLUMN "embeddingVector" vector(1536)` — applied
- `ALTER TABLE "HistoricalJob" ADD COLUMN "embeddingModel" text` — applied
- `ALTER TABLE "HistoricalJob" ADD COLUMN "embeddedAt" timestamptz` — applied
- `CREATE INDEX idx_historical_job_embedding ON "HistoricalJob" USING hnsw (...)` — applied

### Files Created

| File | Purpose |
|------|---------|
| `lib/ai/embeddings.ts` | `buildJobEmbeddingText`, `embedText`, `hashEmbedText`, `findSimilarJobs` |
| `app/api/inspections/[id]/vectorise-jobs/route.ts` | POST worker: embed all un-vectorised HistoricalJobs |

### HistoricalJob Model

Added to `prisma/schema.prisma` — full model definition with all fields matching the
existing DB table, plus `embeddingModel` and `embeddedAt` metadata fields.

---

## Next Steps

1. **Line items**: Contact Ascora support for correct `/invoicelines` or equivalent endpoint.
2. **Vectorise existing jobs**: Once jobs are synced via `/api/ascora/sync`, call
   `POST /api/inspections/[id]/vectorise-jobs` with `{ "provider": "openai", "openaiApiKey": "..." }`
   — or use `"hash-fallback"` immediately to verify the full pipeline.
3. **Similar jobs endpoint**: Build `GET /api/inspections/[id]/similar-jobs` that calls
   `findSimilarJobs()` from `lib/ai/embeddings.ts` to return comparable historical jobs.
4. **IICRC classification**: Add NLP pass over `jobDescription` to infer `waterCategory`/`waterClass`
   during import — these fields are absent from the Ascora API.
