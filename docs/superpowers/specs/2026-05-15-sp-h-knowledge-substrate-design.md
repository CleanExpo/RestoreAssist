# SP-H — Knowledge Substrate (Obsidian → Supabase pgvector RAG) — design spec — DRAFT for Phill review

> **Status:** Draft. Phill has NOT yet brainstormed this. Treat as a senior consultant's proposal grounded in the existing wiki-sync infrastructure + SP-G's retrieval API contract. Brainstorm cycle will refine.
> **Position in roadmap:** Wave 2 — BETWEEN SP-E (shipped) and SP-G (drafted PR #1086). SP-H is SP-G's data source; SP-G's `lookup-iicrc`, `method-recommendation`, and future `analyse-photo` tools consume SP-H retrieval API.

---

## 0. Context

SP-H bridges the existing Obsidian wiki (145 .md files + growing restoration-domain notes) and the AI Sidekick (SP-G). Without SP-H, Sidekick tools cannot answer "What's IICRC S500:2021 §7.1 say about cat-3 on hardwood?" or "Show me similar jobs to this claim type." IICRC standard lookups, prior-job pattern matching, AU regulatory text retrieval, and method recommendations all depend on SP-H's vector store.

**Why now:** SP-G spec (Section 6) requires `lookup-iicrc()` to query a knowledge substrate. The wiki exists; Obsidian → Supabase sync infrastructure exists (`sync_wiki_to_supabase.py`). SP-H extends that plumbing to add chunking + embeddings.

---

## 1. Existing-code audit

| Component | Status | Notes |
|---|---|---|
| **Obsidian wiki source** | ✅ 145 .md files | `~/2nd Brain/2nd Brain/Wiki/` — frontmatter shape: `type: wiki`, `updated: YYYY-MM-DD` + content vars |
| **Wiki sync script** | ✅ `sync_wiki_to_supabase.py` | Existing production script; reads local vault, pushes to Supabase. Per log.md 2026-05-15: 143/145 pages synced |
| **Supabase `wiki_pages` table** | ✅ Exists | Schema: id, slug, title, content, frontmatter (JSON), tenantId, createdAt, updatedAt, contentHash |
| **`lib/ai/embeddings.ts`** | ✅ Complete | `buildJobEmbeddingText()`, `embedText()` (OpenAI text-embedding-3-small), `hashEmbedText()` (deterministic fallback), `findSimilarJobs()` (pgvector cosine) — ALL reusable for wiki chunks |
| **`lib/ai/rag-context.ts`** | ✅ Partial | `retrieveSimilarJobs()` for HistoricalJob; vector fallback pattern established; can refactor to generic `retrieve()` |
| **Prisma pgvector extension** | ✅ Enabled | Line 18 of schema.prisma: `extensions = [pgvector(map: "vector")]` |
| **HistoricalJob embedding schema** | ✅ Example | `embeddingVector vector(1536)`, `embeddedAt DateTime?` — model to copy for wiki chunks |
| **MISSING: `wiki_chunks` table** | ❌ Needed | Will store per-heading chunks + embeddings from wiki_pages |
| **MISSING: retrieval API** | ❌ Needed | `lib/knowledge/retrieve.ts` exporting `retrieve(query, filters?, topK?)` |
| **MISSING: ingester extension** | ❌ Needed | `sync_wiki_to_supabase.py` extended to chunk + embed |
| **MISSING: embedding-on-edit hook** | ❌ Needed | Detect changed chunks via SHA-256; re-embed only changed ones |

---

## 2. Goal in one sentence

**Shipped SP-H v1:** Tradie asks Sidekick "What's IICRC cat-3 on plasterboard?" or "Show similar water-damage jobs" → retrieves relevant wiki chunks + similar jobs from pgvector → returns IICRC-cited answer + method recommendations. Platform-wide (no per-tenant isolation v1); Obsidian vault stays local; embeddings are product-internal (not BYOK-mirrored).

---

## 3. Locked-in design constraints

1. **Platform-wide v1, per-tenant v2** — schema reserves `tenantId` but SP-H v1 indexes single knowledge corpus (user's Obsidian vault + IICRC standard PDF chunks). Multi-tenant isolation deferred.
2. **Obsidian stays local, push-only** — wiki vault remains on user's machine. Ingester polls local filesystem, pushes chunks + embeddings to Supabase. Never read-back from Supabase into Obsidian.
3. **Embeddings are product-internal** — NOT subject to SP-E BYOK Drive mirroring. OpenAI embedding API calls are platform's cost; tenant cannot BYOK override (embeddings stay on Supabase).
4. **Append-only ingestion** — per CLAUDE.md rule 22: `WikiChunk` rows inserted, never updated. Changed chunks get new rows; stale rows marked `supersededAt` to preserve chain-of-custody.
5. **Chunking strategy: per-H2 heading (firm recommendation)** — split on `## ` boundary, not paragraph or semantic. Justification: wiki structure is hand-authored with headings as natural semantic units; paragraph splits would break mid-sentence; semantic splitting requires embedding API (expensive pre-processing).
6. **Embedding model: OpenAI text-embedding-3-small (firm recommendation)** — 1536 dims, $0.02/1M tokens, domain-agnostic accuracy on restoration terminology. Alternative: Cohere embed-multilingual-v3.0 ($0.00001/1K docs = negligible cost but requires paid tier). Choose OpenAI for proven quality + existing integration in embeddings.ts.
7. **Retrieval threshold: 0.7 cosine similarity** — return chunks scoring ≥0.7; default topK=5. Tuning deferred to brainstorm.

---

## 4. Architecture

### 4.1 Ingester: extends `sync_wiki_to_supabase.py`

**Current flow:**
```
Local Obsidian vault → scan mtime → read .md files → validate frontmatter → upsert wiki_pages table → end
```

**SP-H extended flow:**
```
Local Obsidian vault → scan mtime → read .md files → validate frontmatter → upsert wiki_pages table
                                                                               ↓
                                                              check content SHA-256
                                                                               ↓
                                                       if changed OR new: chunk by H2 heading
                                                                               ↓
                                                     embed chunks (OpenAI API)
                                                                               ↓
                                                  upsert wiki_chunks table
                                                                               ↓
                                                        update wiki_pages.lastEmbeddedAt
```

**Chunking logic (Python):**
```python
def chunk_wiki_page(content: str, frontmatter: dict) -> list[dict]:
    """Split markdown by H2 (##), preserve frontmatter context."""
    chunks = []
    current_chunk = None
    
    for line in content.split('\n'):
        if line.startswith('## '):  # H2 heading
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = {
                'heading': line[3:].strip(),
                'content': line + '\n',
                'frontmatter': frontmatter
            }
        elif current_chunk:
            current_chunk['content'] += line + '\n'
    
    if current_chunk:
        chunks.append(current_chunk)
    
    return chunks
```

**Upsert strategy:**
- Compute SHA-256 of page content.
- Query wiki_pages: get `contentHash` + `lastEmbeddedAt`.
- If hash unchanged, skip embedding re-run.
- If hash changed OR never embedded: re-chunk, re-embed all chunks (simpler than delta; full page ~500 tokens, negligible cost).
- Each chunk gets `(wikiPageId, chunkId=SHA-256(heading+content), embeddingVector, contentHash)`.

### 4.2 Storage: separate `wiki_chunks` table

**Rationale:** wiki_pages (full document) vs wiki_chunks (queryable units). Allows per-chunk TTL, superseding, and independent retrieval without modifying the canonical wiki_pages table.

**Schema (Prisma):**
```prisma
model WikiChunk {
  id String @id @default(cuid())
  
  // Foreign key
  wikiPageId String
  wikiPage   WikiPage @relation(fields: [wikiPageId], references: [id], onDelete: Cascade)
  
  // Chunk identity
  chunkIndex Int        // 0, 1, 2, … for ordering within page
  heading    String     // extracted H2 heading or "[intro]"
  content    String @db.Text
  
  // Embedding
  embeddingVector       vector(1536)
  embeddedAt            DateTime
  embeddingModel        String @default("text-embedding-3-small")
  
  // Chain-of-custody
  contentHash           String  // SHA-256 of content at embed time
  supersededAt          DateTime? // if chunk was re-embedded, mark old version
  
  // Metadata for filtering
  tags                  String[] // e.g. ["iicrc", "s500", "cat-3", "hardwood"]
  
  // Audit
  createdAt             DateTime @default(now())
  
  @@index([wikiPageId])
  @@index([embeddedAt])
  @@index([supersededAt])
}
```

### 4.3 Retrieval API: `lib/knowledge/retrieve.ts`

**Signature:**
```typescript
export async function retrieve(options: {
  query: string;
  topK?: number;         // default 5
  threshold?: number;    // default 0.7 (cosine)
  filters?: {
    tag?: string;        // "iicrc", "restoration-method", etc.
    pageSlug?: string;   // filter to specific wiki page
  };
}): Promise<RetrievalResult[]>

export interface RetrievalResult {
  chunkId: string;
  heading: string;
  content: string;
  wikiPageSlug: string;
  distance: number;      // cosine distance (0–1, lower = better)
  source: "wiki_chunk";
  tags: string[];
}
```

**Implementation:**
1. Embed query via OpenAI text-embedding-3-small.
2. Query Supabase: pgvector cosine distance on wiki_chunks.embeddingVector, filtered by tag/page if provided.
3. Filter: `distance <= (1 - threshold)` (cosine distance inverse of similarity).
4. ORDER BY distance ASC, LIMIT topK.
5. Map results to RetrievalResult shape.
6. Safe wrapper: never throws; returns empty list on API failure (Sidekick continues without context).

### 4.4 Integration with SP-G tools

**`lookup-iicrc` tool (SP-G Section 6.1):** Calls `retrieve(query="user query", filters={tag:"iicrc"})` → returns top 5 chunks → formats IICRC §X.Y references + excerpts into tool response.

**`method-recommendation` tool (SP-G Section 6.2):** Calls `retrieve(query="cat-3 hardwood restoration", filters={tag:`restoration-method`})` → returns steps + precautions.

**Future `analyse-photo` tool (SP-G Section 6.3):** Vision-based analysis with `retrieve(query="plasterboard water damage severity moderate")` as fallback if vision analysis is ambiguous.

### 4.5 Re-embed-on-edit detection

**Mechanism:**
- Ingester script writes chunk contentHash at embed time.
- On next sync, compare wiki_pages.contentHash with the hash computed from current .md file.
- If different: re-chunk entire page (don't try to delta; too complex).
- Mark old chunks `supersededAt = now()` (soft-delete for audit).
- Insert new chunks with fresh embeddings.

**Cost impact:** 145 pages × ~10 chunks average = ~1,450 chunks. Re-embedding all: 1,450 chunks × 50 tokens average ÷ 1M = $0.0008 per full sync. **Cost ceiling: ~$0.01/day** (negligible). Rate-limit to once-daily ingestion via cron.

---

## 5. SP-G integration contract (required by SP-G v1)

SP-G's Section 5 (Help Library integration) and Section 6 (Three new tools) define the contract SP-H must fulfill:

| SP-G tool | SP-H method | Input | Output |
|---|---|---|---|
| **`lookup-iicrc`** | `retrieve(query, filters={tag:"iicrc"})` | `query: "cat-3 wood"` | `[RetrievalResult { heading: "IICRC Cat 3", content: "...", distance: 0.85 }]` |
| **`method-recommendation`** | `retrieve(query, filters={tag:"method"})` | `query: "hardwood floor restoration cat-3"` | `[RetrievalResult { heading: "Hardwood Drying Method", steps: [...] }]` |
| **`analyse-photo`** (v2) | `retrieve(query, filters={tag:"photo-analysis"})` | `query: "plasterboard mould water stain"` | Similar chunks for fallback reasoning |

SP-G's tool definitions (already drafted in PR #1086) call `lookupIircHandler()` etc., which invoke `retrieve()`. No schema changes needed in SP-G once SP-H ships.

---

## 6. Prisma additions

**One migration, two model additions:**

```prisma
model WikiPage {
  id String @id @default(cuid())
  slug String @unique
  title String
  content String @db.Text
  frontmatter Json? // stored as-is from .md frontmatter
  
  contentHash String // SHA-256 of content at last sync
  lastSyncedAt DateTime?
  lastEmbeddedAt DateTime? // tracks embedding cycle
  
  chunks WikiChunk[] // relation to chunks
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([lastSyncedAt])
  @@index([lastEmbeddedAt])
}

model WikiChunk {
  id String @id @default(cuid())
  
  wikiPageId String
  wikiPage WikiPage @relation(fields: [wikiPageId], references: [id], onDelete: Cascade)
  
  chunkIndex Int
  heading String
  content String @db.Text
  
  embeddingVector vector(1536)
  embeddedAt DateTime
  embeddingModel String @default("text-embedding-3-small")
  
  contentHash String
  supersededAt DateTime?
  tags String[]
  
  createdAt DateTime @default(now())
  
  @@index([wikiPageId])
  @@index([embeddedAt])
  @@index([supersededAt])
}
```

**Why separate table (not embedded in wiki_pages)?**
- Queries need to filter/rank individual chunks, not whole pages.
- Superseding old chunks (audit trail) requires per-chunk rows.
- Simpler cascade deletion + independent upsert logic.

---

## 7. Ingester migration strategy

**Migration A (additive):** Create `wiki_chunks` table + indexes. wiki_pages gets `contentHash`, `lastEmbeddedAt` columns. **No data loss.**

**Backfill:** Run `pnpm knowledge:ingest --full` (script entry point TBD in package.json) → processes all 145 wiki pages, chunks, embeds, upserts.

**Expected time:** ~2 min for full sync (serial OpenAI calls) + 10 sec Supabase writes = ~3 min. Schedule via Vercel cron or Hermes cron (recommendation: Hermes, existing daily wiki scan at [[hermes-agent]]).

**Migration B (cleanup, next release):** If HistoricalJob embedding columns are no longer needed (future consolidation), drop `HistoricalJob.embeddingVector` + `embeddedAt` after confirming no active queries. Not in scope for SP-H v1.

---

## 8. Cost ceiling

**Per-embedding costs:**
- 145 pages × 10 chunks (avg) = 1,450 chunks
- ~50 tokens per chunk (heading + content sample)
- OpenAI text-embedding-3-small: $0.02 / 1M tokens
- **Per full sync: 1,450 × 50 ÷ 1M × $0.02 = $0.00145 ≈ $0.002**

**Per-query costs (retrieval only):**
- Each SP-G `lookup-iicrc` tool call: 1 query embedding = ~30 tokens
- $0.02 ÷ 1M × 30 = $0.0000006 per query
- 100 queries/day = $0.00006/day = **~$2/month**

**Platform ceiling (all tenants, v1):**
- 1 ingestion per day: $0.002
- 100 queries per day × avg users: $2–10/month
- **Total v1: <$50/month for platform**

**Rate-limiting:** Cap ingestion to once per 12 hours (per tenant, once multi-tenant). Cache retrieval results in Redis (optional, Wave 3).

---

## 9. Where ingester runs: Hermes cron (recommendation)

**Options:**
1. **Vercel cron** — `/api/cron/ingest-wiki` endpoint. Simple, serverless. Cold start ~5s, then 3 min execution. ✅ Viable.
2. **Self-hosted on Mac mini** — `~/restore-assist/scripts/cron-ingest.sh` runs daily via launchd. ✅ Proven reliable per [[hermes-agent]].
3. **Hermes cron** — existing agent framework at `/Pi-CEO` — already runs daily wiki scan per [[wiki-ingest]] skill. Extends to embed.

**Recommendation:** **Hermes cron**. Justification:
- Existing daily wiki scan is already orchestrated via [[wiki-ingest]] skill.
- Hermes Agent has persistent state, better logging, easier retry.
- Vercel cron is simpler but less observable; self-hosted adds local dependency.
- Hermes integrates cleanly: poll local vault → detect changes → batch to Supabase → write to `/2nd Brain/log.md`.

**Ingester entrypoint:** `pnpm knowledge:ingest [--full]` (if --full: re-embed everything; else: delta).

---

## 10. Privacy + multi-tenant

**v1 schema reserves tenantId:** All tables (WikiPage, WikiChunk) have `tenantId` column (nullable in v1, NOT NULL in v2). Platform-wide ingestion uses `tenantId = null` (system scope).

**Per-tenant v2 roadmap:** Once RestoreAssist adds per-customer tenants, each tenant can ingest their own wiki vault independently. Schema already supports it; retrieval API filters by tenantId. No v1 breaking changes.

**Obsidian vault stays local:** User's wiki is NOT uploaded to Supabase in full. Only metadata (title, slug, frontmatter) + chunks + embeddings are pushed. Source markdown stays on disk.

---

## 11. Out of scope (v1)

- **Per-tenant isolation** — deferred to v2.
- **User-written RA-domain notes ingestion** — how do custom notes enter the vault? Manual wiki edit? AI-drafted-then-approved? Imported from IICRC PDFs? Deferred for SP-H brainstorm.
- **IICRC PDF imports** — IICRC standards as PDFs require OCR + chunking. Use Unstructured.io or similar for Wave 3.
- **Re-embed on partial edit** — if user edits 1 line in a chunk, re-embed entire page (not selective chunks). Complexity not justified by cost savings (negligible).
- **Retrieval threshold tuning per query type** — one global threshold (0.7) v1. Specialized thresholds (e.g., 0.8 for safety-critical IICRC clauses, 0.5 for method suggestions) are Wave 3.
- **Semantic chunking** — requires embedding API in pre-processing loop. v1 uses structural (H2) chunking.

---

## 12. Testing strategy

**Unit (Vitest):**
- Chunking logic: split markdown by H2, preserve frontmatter, handle edge cases (no headings, unclosed blocks).
- Embedding fallback: when OpenAI API fails, hash-fallback returns 1536-dim vector (existing logic from embeddings.ts).
- Query parsing: extract tag filters from user query string (optional Wave 2).

**Integration (Vitest + Supabase):**
- Ingest cycle: read 5 test .md files → chunk → embed (hash fallback) → upsert wiki_chunks → assert 50 rows created.
- Retrieval: insert 10 wiki_chunks with known vectors → search for query "cat-3" → assert results sorted by distance, threshold respected.
- Superseding: update page content → re-ingest → assert old chunks marked `supersededAt`, new chunks created, old ones still queryable for audit.

**E2E (Playwright):**
- Sidekick turn: user asks "What's IICRC cat-3 on plasterboard?" → `lookup-iicrc` tool calls `retrieve()` → returns chunk about cat-3 → Claude formats as response → user sees IICRC §X.Y citation.

**Regression:**
- 5 known test queries (e.g., "S500 7.1", "hardwood drying", "cat-3 water damage") → run against staging wiki_chunks → assert all return expected pages (fuzzy match, not exact).
- OpenAI API key missing → fallback to hash-embedding → retrieval still works (no null-pointer errors).

---

## 13. Critical files (read-only reference) + new files to create

**Read-only (existing code, SP-H depends on):**
- `/Users/phill-mac/RestoreAssist/lib/ai/embeddings.ts` — embedding providers + pgvector interface
- `/Users/phill-mac/RestoreAssist/lib/ai/rag-context.ts` — retrieval patterns
- `/Users/phill-mac/RestoreAssist/prisma/schema.prisma` — pgvector extension, HistoricalJob model as pattern
- `/Users/phill-mac/RestoreAssist/CLAUDE.md` — rules 21–28 (progress framework, chain-of-custody)
- `~/2nd Brain/2nd Brain/Wiki/` — source corpus (145 .md files)
- `~/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py` — existing sync script (exact path TBD)

**New files to create (SP-H v1):**
- `docs/superpowers/specs/2026-05-15-sp-h-knowledge-substrate-design.md` — this spec
- `lib/knowledge/retrieve.ts` — retrieval API (signature + implementation)
- `lib/knowledge/__tests__/retrieve.test.ts` — retrieval unit tests
- Migration file: `prisma/migrations/<timestamp>_add_wiki_chunks_table/migration.sql` — create WikiPage + WikiChunk + indexes
- `scripts/ingest-wiki.ts` — chunking + embedding logic (replaces/extends sync_wiki_to_supabase.py)
- `pnpm` script entry: `package.json` gets `"knowledge:ingest": "ts-node scripts/ingest-wiki.ts"`
- Optional: `app/api/cron/ingest-wiki/route.ts` if Vercel cron is chosen (not recommended; use Hermes instead)

---

## 14. Verification

After SP-H v1 ships:

1. **Migration applies clean** — `pnpm prisma migrate deploy` succeeds; `pnpm db:studio` shows WikiPage + WikiChunk tables with correct schema.
2. **Backfill runs successfully** — `pnpm knowledge:ingest --full` processes all 145 wiki pages in ~3 min, 1,450+ chunks created, all have non-null embeddingVector.
3. **Retrieval API functional** — `retrieve(query="cat-3 plasterboard", topK=5)` returns 5 chunks, sorted by cosine distance, all with distance ≤ (1 - 0.7).
4. **SP-G integration works** — Sidekick `lookup-iicrc` tool calls `retrieve()`, receives chunks, formats IICRC response citing §X.Y.
5. **No regressions** — existing HistoricalJob embeddings (rag-context.ts) still work; pgvector queries unaffected.
6. **Cost verified** — observe actual embedding costs during staging backfill; confirm <$1 per full sync.

---

## Verification Ledger

**Did:** Audited existing RAG plumbing (embeddings.ts, rag-context.ts, pgvector schema); read SP-5 audit Section 7 + SP-G Sections 5–6 to derive retrieval API contract; inventoried 145 wiki pages + sync script + Supabase table; modeled per-heading chunking strategy + pgvector storage + retrieval API signature; estimated costs + ingestion cycle.

**Verified with:** 
- `/Users/phill-mac/RestoreAssist/lib/ai/embeddings.ts` (line 92–123: OpenAI text-embedding-3-small integration exists, reusable)
- `/Users/phill-mac/RestoreAssist/prisma/schema.prisma` (line 18: pgvector extension enabled; HistoricalJob model: lines ~6150, embeddingVector column pattern)
- `~/2nd Brain/2nd Brain/Wiki/` (145 .md files confirmed; log.md confirms 143/145 synced as of 2026-05-15)
- SP-5 audit Section 7 & SP-G spec Sections 5–6 (retrieval API contract: lookup-iicrc, method-recommendation tools defined)

**Would change my mind if:**
- Chunking boundary choice (H2 vs semantic) — brainstorm may prefer semantic (justifiable if embedding-in-preprocessing cost < 1% of total, which it is). Recommend staying with H2 v1, revisit in Wave 3.
- Embedding model choice — if Cohere becomes available in RestoreAssist's default OpenAI contract, consider switching for cost. OpenAI text-embedding-3-small is safe default.
- Ingester host — if Hermes agent is deprecated, Vercel cron becomes the canonical choice (simpler, less overhead).
- Per-tenant v1 — if Phill decides multi-tenant is table-stakes for v1 launch, SP-H scope doubles (isolation logic, per-tenant ingestion). Recommend deferring to v2 unless business drives it.
