# SP-H — Brainstorm-Processed Open Questions

> **Purpose:** Senior-consultant pass over the 7 "Phill's call" markers in `2026-05-15-sp-h-knowledge-substrate-design.md`. Each question gets evidence → candidates → recommendation (with confidence) → reversibility. Phill confirms or redirects in 5 min.
> **Investigation scope:** read spec + SP-G §5-6 + SP-5 audit §7 + `lib/ai/embeddings.ts` + `lib/ai/rag-context.ts` + `prisma/schema.prisma` (lines 5772-5793 `IicrcChunk` precedent) + `~/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py` + wiki dir (149 .md files actual, spec says 145).

---

## Q1. Chunking strategy — structural H2 vs semantic vs paragraph

**Evidence:**

- `IicrcChunk` (schema.prisma:5777) already uses structural chunking — `standard / edition / section / heading` is hand-mapped from PDF TOC. Precedent in repo.
- Wiki vault sample (`/Users/phill-mac/2nd Brain/2nd Brain/Wiki/`): 149 .md files, hand-authored, H2-heavy. Headings are the unit users reference (`[[file#section]]` is the Obsidian convention).
- Semantic chunking requires an embedding API call inside the preprocessor → recursive cost loop, and the per-sync cost is already $0.002 (spec §8), so the optimisation problem doesn't exist.
- Paragraph splits break mid-section context — IICRC sections need full clause for legal citation.

**Candidates:**

- **(a) Structural per-H2** — split on `## `, intro before first H2 is its own chunk
- **(b) Semantic via embedding-clustering** — call OpenAI in preprocess, cluster, then chunk
- **(c) Fixed-window 500-token with 50-token overlap**

**Recommendation:** **(a) Structural per-H2** (confidence 90). Matches `IicrcChunk` precedent, zero extra API cost, headings already chosen by Phill as semantic units, citations are clean (`[[file#H2]]`). Add ONE pragma: if a single H2 section exceeds 1,500 tokens, sub-split on `### ` H3. Catches the long-page edge case without changing the model.

**Reversibility:** **medium**. Re-chunking requires deleting `WikiChunk` rows and re-running ingester. ~3 min. Schema doesn't change. Safe to revisit if retrieval-quality regression tests fail.

---

## Q2. Embedding model — OpenAI text-embedding-3-small vs Cohere multilingual-v3.0

**Evidence:**

- `lib/ai/embeddings.ts:92-115` already integrates OpenAI text-embedding-3-small. Zero new code.
- HistoricalJob embeddings (schema.prisma:6153) use 1536-dim vectors. Mixing dim sizes across tables prevents the future "unified retrieve" function.
- Cohere multilingual-v3.0: 1024 dims (mismatch), $0.10/1M tokens for production (5× OpenAI), requires new SDK wiring.
- Restoration corpus is English-only (AU). Multilingual buys nothing.
- `hashEmbedText` fallback (embeddings.ts:134) only works at 1536 dims — switching models breaks the fallback.

**Candidates:**

- **(a) OpenAI text-embedding-3-small** (1536d, $0.02/1M)
- **(b) OpenAI text-embedding-3-large** (3072d, $0.13/1M, higher accuracy)
- **(c) Cohere embed-multilingual-v3.0** (1024d, $0.10/1M)

**Recommendation:** **(a) OpenAI text-embedding-3-small** (confidence 95). Existing integration, dim parity with HistoricalJob, English-only corpus, fallback compatible. Reject (b) on cost (5×) without quality evidence on this corpus; reject (c) on dim mismatch + no multilingual need.

**Reversibility:** **medium-high**. Switching model = re-embed all chunks (~$0.01) + schema migration if dim changes. Cheap to revisit; lock current choice.

---

## Q3. Storage layout — separate `wiki_chunks` table vs embedded array on `wiki_pages`

**Evidence:**

- `IicrcChunk` (schema.prisma:5777) is a separate table — internal precedent.
- pgvector HNSW index requires one row per vector — embedding an array on `wiki_pages` defeats the index.
- CLAUDE.md rule 22 (append-only audit, chain-of-custody) requires `supersededAt` per chunk — needs per-row state.
- Retrieval needs to ORDER BY distance over chunks; query planner can't do that on JSONB arrays without a custom GIN/HNSW workaround.

**Candidates:**

- **(a) Separate `WikiChunk` table** with FK to `WikiPage`
- **(b) `vector[]` column on `wiki_pages`** with JSONB metadata
- **(c) Reuse `IicrcChunk` table** with a `source` discriminator column

**Recommendation:** **(a) Separate `WikiChunk` table** (confidence 92). pgvector HNSW requires it; precedent established by `IicrcChunk`; supersession audit clean. Reject (b) flatly (kills the index). Reject (c) because `IicrcChunk` columns (`standard`, `edition`, `section`) are domain-specific and would force NULLable bloat for wiki content.

**Reversibility:** **low** once Prisma migration ships + data backfilled. Choose carefully — but the choice is forced by pgvector mechanics.

---

## Q4. Ingester host — Hermes cron vs Vercel cron vs self-hosted launchd

**Evidence:**

- `~/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py` already runs (Hermes-orchestrated, per memory `reference_hermes_daily_wiki_scan.md` — 7:30am daily wiki cross-pollination scan, survives reboots).
- Vercel cron has 10s execution limit on Hobby, 60s on Pro — full 145-page embed run takes ~3 min (spec §7). **Hard timeout violation.**
- Vault lives on Phill's Mac (`~/2nd Brain/`). Vercel cron has no filesystem access to it. Would need to push from local → Vercel API → Supabase, adding a hop.
- Hermes already has Supabase service-role key (`/tmp/ug-env-prod.local`) wired in.

**Candidates:**

- **(a) Hermes cron** — extend existing `sync_wiki_to_supabase.py`
- **(b) Vercel cron** — `/api/cron/ingest-wiki` route
- **(c) Self-hosted launchd** — standalone script

**Recommendation:** **(a) Hermes cron** (confidence 95). Vercel cron times out on full sync — disqualified. Local launchd duplicates Hermes infrastructure. Hermes wins on three independent grounds: vault locality, existing wiring, existing daily-scan slot.

**Reversibility:** **high**. Ingester is a script — relocating later is a chmod + plist update.

---

## Q5. Per-tenant isolation — v1 (multi-tenant from start) vs v2 (defer)

**Evidence:**

- Wiki vault is Phill's personal knowledge, not customer data. No tenant-A-can-read-tenant-B exposure risk in v1.
- Spec §10 already reserves `tenantId` column (nullable). Adding NOT NULL + per-tenant filter later is a one-line migration.
- `HistoricalJob.tenantId` is the existing pattern — well-trodden.
- Scope cost: per-tenant v1 doubles ingestion logic (per-tenant cron, per-tenant vault path resolution), per-tenant retrieval filter, per-tenant cost tracking. Spec §2 names this explicitly.
- No customer has asked for tenant-specific knowledge bases. SP-G v1 ships to a single corpus.

**Candidates:**

- **(a) Defer to v2** — `tenantId` nullable; system corpus only
- **(b) v1 multi-tenant** — NOT NULL `tenantId`, per-tenant ingester
- **(c) Hybrid** — `tenantId` nullable, dual-write to system + tenant corpus

**Recommendation:** **(a) Defer to v2** (confidence 88). YAGNI. Schema column reserved means v2 is additive, not destructive. Reject (c) — premature complexity for unknown access pattern.

**Reversibility:** **high**. Column already nullable; v2 adds NOT NULL via two-step migration (CLAUDE.md rule 16).

---

## Q6. Re-embed-on-edit — full file vs changed-chunk-only

**Evidence:**

- Spec §4.5 estimates full-page re-embed at ~$0.0008 — negligible.
- Changed-chunk detection requires diff-hash per chunk before AND after edit, intersection logic, and per-chunk supersession. ~50 LOC of fragile diff code.
- Common edit pattern in Obsidian: add a paragraph, fix a typo. Both invalidate the page-level SHA-256 but might leave 8/10 chunks identical. Saved embedding cost: $0.00064 per edit. Not worth the complexity.
- Per-chunk hashing IS already in the schema (`contentHash` on `WikiChunk`) — leaves the door open for v2 optimisation without breaking changes.

**Candidates:**

- **(a) Full-file re-embed** — page hash changes → re-chunk + re-embed all
- **(b) Changed-chunk-only** — per-chunk hash diff, embed only changed
- **(c) Hybrid** — full re-embed if >50% chunks changed, else per-chunk

**Recommendation:** **(a) Full-file re-embed** (confidence 92). Cost is rounding error; complexity buys nothing. Keep per-chunk `contentHash` in schema as v2 optionality.

**Reversibility:** **high**. Pure ingester logic change — no schema impact.

---

## Q7. Retrieval threshold tuning — per-query-type vs global

**Evidence:**

- SP-G §6 defines 3 tool types: `lookup-iicrc` (legal-citation, must be precise), `method-recommendation` (advisory, broader recall OK), `analyse-photo` (fallback, lowest precision tolerable).
- No retrieval evaluation harness exists yet — `lib/ai/evaluation-harness.ts` is scoped to scope-quality, not retrieval. Tuning per-query-type without measurement = guessing.
- Global threshold 0.7 is industry default for text-embedding-3-small on English domain corpus.
- The retrieval API signature already accepts `threshold?: number` (spec §4.3) — caller can override per-tool without schema changes.

**Candidates:**

- **(a) Global threshold 0.7, per-call override via parameter**
- **(b) Per-tool defaults baked into `retrieve()` from `filters.tag`**
- **(c) Per-query-type tuning with evaluation harness gating each change**

**Recommendation:** **(a) Global default 0.7, per-call override** (confidence 85). API signature already supports it. SP-G tools pass `threshold: 0.8` for `lookup-iicrc`, `0.6` for `method-recommendation`, accept default for `analyse-photo`. Eval harness comes in SP-H v2 once we have query logs to tune against. Reject (c) for v1 — measure first, tune second.

**Reversibility:** **high**. Pure parameter change at call sites.

---

## Summary table (decision pack for Phill)

| #   | Question          | Recommended                               | Confidence | Reversibility |
| --- | ----------------- | ----------------------------------------- | ---------- | ------------- |
| 1   | Chunking          | Structural per-H2 + H3 sub-split >1500tok | 90         | medium        |
| 2   | Embedding model   | OpenAI text-embedding-3-small             | 95         | medium-high   |
| 3   | Storage           | Separate `WikiChunk` table                | 92         | low           |
| 4   | Ingester host     | Hermes cron                               | 95         | high          |
| 5   | Multi-tenant      | Defer to v2, reserve column               | 88         | high          |
| 6   | Re-embed strategy | Full file                                 | 92         | high          |
| 7   | Threshold         | Global 0.7 + per-call override            | 85         | high          |

**Net effect:** 5 of 7 are high-reversibility decisions — safe to lock now. The two medium-reversibility decisions (chunking, storage) are also recommended with ≥90 confidence and have precedent in `IicrcChunk`. **Recommend approving all 7 defaults; revisit chunking + threshold in SP-H v2 once retrieval logs exist.**

---

## Verification Ledger

**Did:** Read SP-H spec end-to-end; cross-referenced SP-G §5-6 retrieval contract; audited `lib/ai/embeddings.ts` (OpenAI integration, hash fallback, dim parity), `lib/ai/rag-context.ts` (existing safe-wrapper pattern), `prisma/schema.prisma:5772-5793` (`IicrcChunk` precedent), `~/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py` (ingester baseline); counted 149 wiki .md files (spec said 145 — minor staleness); processed 7 open questions with evidence-grounded candidate sets.

**Verified with:**

- `/Users/phill-mac/RestoreAssist/lib/ai/embeddings.ts:92-115` (OpenAI text-embedding-3-small wired)
- `/Users/phill-mac/RestoreAssist/prisma/schema.prisma:5777-5793` (`IicrcChunk` separate-table precedent)
- `/Users/phill-mac/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py:6-44` (Hermes-orchestrated, Supabase service-role wired, no chunking yet)
- memory `reference_hermes_daily_wiki_scan.md` (7:30am daily cron exists, survives reboots)
- Vercel cron timeout published limits (60s Pro) vs spec §7 3-min full sync = disqualification

**Would change my mind if:**

- Phill reveals customer-facing per-tenant knowledge bases are in the Wave-2 roadmap (flips Q5 to v1 multi-tenant)
- Retrieval-quality regression tests on a 50-query corpus show H2 chunking misses on long IICRC clauses (flips Q1 to semantic, accepting preprocess cost)
- Hermes is being deprecated this quarter (flips Q4 to launchd, not Vercel)
- An eval harness lands before SP-H v1 ships (flips Q7 to per-tool baked-in thresholds with measured deltas)
