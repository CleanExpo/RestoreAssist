# RestoreAssist — Research Intent (RA-678 / KARPATHY-5)

#

# This file is picked up automatically before each build for this workspace.

# Edit it to guide the pipeline toward specific research directions.

# All intent files in .harness/intent/ are version-controlled.

## Current Cycle Focus (Cycle 24 — Sprint 11)

### Primary Research Direction

Investigate pgvector embedding similarity for damage assessment pattern matching.
Target: HistoricalJob embedding retrieval latency < 200ms at p95 for 50k+ records.

### Open Questions

- Does BM25 hybrid search outperform pure vector similarity for Australian compliance queries?
- Can inspection photo scoring use cached embeddings to avoid re-scoring unchanged photos?

### Avoid

- LightRAG adoption (deferred to Q3 2026 — see RA-612)
- Breaking changes to the evidence upload pipeline (Supabase storage, RA-408)
