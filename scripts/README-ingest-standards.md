# ingest-standards — StandardsChunk RAG Ingestion

Populates the `StandardsChunk` table with in-house authored clause summaries and pgvector embeddings for RAG search.

## Prerequisites

| Variable         | Description                              |
| ---------------- | ---------------------------------------- |
| `OPENAI_API_KEY` | OpenAI API key with embeddings access    |
| `DATABASE_URL`   | PostgreSQL connection string (target DB) |

## Run

```bash
OPENAI_API_KEY=sk-... DATABASE_URL=postgres://... npx tsx scripts/ingest-standards.ts
```

## Cost estimate

```
~25 entries × ~150 tokens = 3,750 tokens
text-embedding-3-small: $0.02 / 1M tokens
≈ $0.00008 USD per full run
```

## Corpus

`scripts/data/standards-corpus.json` — 25 in-house authored clause **summaries** (not verbatim text):

| Standard           | Entries |
| ------------------ | ------- |
| IICRC S500:2025    | 8       |
| AS/NZS 4849.1:2019 | 4       |
| AS/NZS 4360:2004   | 3       |
| AS/NZS 3000:2018   | 3       |
| NZBS E2:2004       | 3       |
| NZBS E3:2004       | 2       |
| NADCA ACR 2021     | 2       |

**Licensing note:** Full IICRC S500:2025 clause text ingestion is blocked pending legal clearance (tracked in RA-1132). This script only ingests in-house authored topic-level descriptions.

## Behaviour

- Idempotent — safe to re-run; uses `ON CONFLICT ... DO UPDATE`.
- Raw SQL is used for embedding writes because `vector(1536)` is a Prisma `Unsupported` type.
- Embedding text = `title + "\n\n" + summary`.
- Exits with code 1 if any entry fails.
