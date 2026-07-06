# RA-6934: Populate the IICRC standards RAG (`IicrcChunk`)

**Who this is for:** the founder, running this once creds land.
**What it fixes:** `IicrcChunk` has 0 rows on prod, so the knowledge-graph
IICRC enrichment on inspection reports (see "What this does and does not fix"
below) has nothing to match against.
**What it does NOT fix by itself:** the separate, dead **live Drive standards
retrieval** (`lib/standards-retrieval.ts`) — that needs its own two env vars
and is a different code path. Both are covered below as Part A and Part B.

---

## Part A — Populate `IicrcChunk` (the pgvector RAG)

### A0. What the ingest script actually reads

`scripts/ingest-iicrc.ts` reads **plain-text files from a local directory**
you point it at with `--dir`. It does **not** talk to Google Drive itself —
there is no Drive-fetching code in this script. So step A1 below is a manual
download from the verified Drive folder, not something the script automates.

### A1. Download the standards docs from Drive

Folder (verified genuine, RA-6934 audit): **"IICRC Standards"**
`https://drive.google.com/drive/folders/1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1`

Download each document to a local working folder, **one subfolder per
standard** — the ingest script tags every file in a `--dir` run with a single
`--standard`/`--edition`, so mixing standards in one folder mislabels chunks.

```bash
mkdir -p ~/iicrc-source/{S500,S520,S540,S700,S900,S410,S400,S300}
# Download each PDF from the Drive folder into the matching subfolder above.
```

Editions per the RA-6934 audit (cross-check the cover page of what you
actually download — this is what you pass as `--edition`):

| Standard | Edition (per audit) |
|---|---|
| S500 | 2021 (5th ed.) |
| S520 | 2024 |
| S540 | 2023 |
| S700, S900, S410, S400, S300 | 2025 |

If time-constrained, ingest **S500 first** — `lib/knowledge/index.ts`'s
`_evidenceClassToIicrcStandard` map routes most evidence classes to S500; it's
the standard every report's knowledge-graph enrichment actually queries for.

### A2. Extract text (pdftotext)

The script refuses raw `.pdf` files with no matching `.txt` (it fails loud
now — see "What changed" below) rather than silently ingesting garbage bytes.

```bash
# One-time: brew install poppler   (provides pdftotext)
for f in ~/iicrc-source/S500/*.pdf; do pdftotext "$f" "${f%.pdf}.txt"; done
# Repeat per subfolder (S520, S540, S700, S900, S410, S400, S300).
```

### A3. Set the two env vars this script needs

Run `validateIngestEnv` fails loud and lists exactly what's missing if you
skip this — but do it right the first time:

- **`OPENAI_API_KEY`** — the embedding provider (`text-embedding-3-small`,
  1536 dims — must match the `IicrcChunk.embedding vector(1536)` column).
  Get it from Vercel: Project **restoreassist** → Settings → Environment
  Variables → Production → copy `OPENAI_API_KEY` if already set for another
  feature (`app/api/admin/vectorise` and `lib/testimonial/transcribe.ts` both
  use it), otherwise create one at platform.openai.com and add it there too.
- **`DATABASE_URL`** — the **same prod pooled connection string** Vercel uses
  (Project **restoreassist** → Settings → Environment Variables → Production
  → `DATABASE_URL`). This is a Supabase-backed Postgres with the `vector`
  extension already enabled (migration `20260406_iicrc_chunk_pgvector`). You
  do NOT need `DIRECT_URL` — that's only required for `prisma migrate deploy`
  advisory locks, not for this script's plain INSERTs.

```bash
export OPENAI_API_KEY="sk-..."          # from Vercel prod env
export DATABASE_URL="postgresql://..."  # from Vercel prod env (pooled, :6543)
```

You are now running against **production data** — this DB write is real.

### A4. Run the ingest — once per standard/edition

```bash
cd RestoreAssist   # repo root
pnpm install        # if not already installed

npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S500 --standard S500 --edition 2021
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S520 --standard S520 --edition 2024
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S540 --standard S540 --edition 2023
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S700 --standard S700 --edition 2025
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S900 --standard S900 --edition 2025
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S410 --standard S410 --edition 2025
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S400 --standard S400 --edition 2025
npx tsx scripts/ingest-iicrc.ts --dir ~/iicrc-source/S300 --standard S300 --edition 2025
```

Each run prints a summary line, e.g.:

```
Done. Files processed: 1. Chunks embedded (new): 214. Chunks skipped (already ingested): 0. Total chunks seen: 214.
```

- **Safe to re-run** — chunks already ingested (by standard+edition+content
  hash) are skipped, not duplicated or re-embedded (no wasted OpenAI spend).
- **Fails loud, not partial-and-silent** — missing `OPENAI_API_KEY` /
  `DATABASE_URL` stops the run before any file is touched; a raw un-extracted
  `.pdf` stops the run before any embedding call; an embedding-provider
  shape mismatch (wrong count or dimension) stops the run before any bad row
  is written; zero chunks produced from files that were actually read exits
  non-zero instead of silently reporting "done" with nothing ingested.

### A5. Verify — SQL

Run against the same prod DB (Supabase SQL editor, or `psql "$DATABASE_URL"`):

```sql
-- Overall count — must be > 0
SELECT count(*) FROM "IicrcChunk";

-- Coverage by standard/edition — every row from Part A1's table should appear
SELECT standard, edition, count(*) AS chunks
FROM "IicrcChunk"
GROUP BY standard, edition
ORDER BY standard;
```

If the second query is missing a standard you ran in A4, that ingest run
either failed (check its console output — it fails loud, so a real failure
is visible, not swallowed) or all its chunks were sub-`MIN_CHUNK_LENGTH`
(unlikely for a real standards PDF).

---

## Part B — Fix the dead live Drive retrieval (separate code path)

This is the other RA-6934 blocker: `lib/standards-retrieval.ts` calls Google
Drive live, per report request, and is unrelated to `IicrcChunk`/Part A. It
is dead on prod today because these are unset:

- **`GOOGLE_CLIENT_EMAIL`** — the service-account email (`lib/google-drive.ts`)
- **`GOOGLE_PRIVATE_KEY`** — the service-account private key (keep the
  literal `\n` escapes; the code unescapes them at runtime)

Get both from the GCP service-account JSON key (Cloud Console → IAM & Admin →
Service Accounts). The service account must also be **shared as a viewer** on
the "IICRC Standards" Drive folder (`1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1`) —
Drive sharing is separate from having the key.

`GOOGLE_DRIVE_STANDARDS_FOLDER_ID` does not need setting — it already
defaults to the correct folder id in `lib/google-drive.ts::getStandardsFolderId`.

Set both in Vercel (Project **restoreassist** → Settings → Environment
Variables → Production), then redeploy with build cache off.

### Verify Part B worked

Generate (or re-generate) an inspection report and check for the RA-6934
degradation alert (`lib/observability.ts` → `reportError`, stage
`standards-retrieval-degraded` or `standards-ungrounded-report`) — it should
**not** fire. Before the fix it fires on every report with
`degradedReason: "drive_access_error"` or similar. After the fix,
`retrieveRelevantStandards()` returns `degraded: false` and the report prompt
is built from real Drive documents (`buildStandardsContextPrompt`).

---

## The gap this runbook does NOT close: silent RAG-empty degradation

`app/api/reports/generate-inspection-report/route.ts` (lines ~337–376) has a
**second**, independent IICRC-grounding path beyond Part B's Drive composer:
knowledge-graph enrichment via `expandContext()` (`lib/knowledge/index.ts`),
which queries `IicrcChunk` directly (heuristic `evidenceClass → standard`
match, not vector similarity yet — that's flagged Phase-2 in the code).

That whole block is wrapped in a bare `try { ... } catch { /* best-effort;
never block */ }` with **no logging, no `reportError` call, no `degraded`
flag** — unlike Part B's composer, which the RA-6934/#1669 guard instruments
thoroughly. Two consequences, both silent today:

1. If `expandContext()` throws for any reason, the catch swallows it with
   zero signal.
2. If `IicrcChunk` is empty (or has no rows for the inspection's evidence
   classes — mostly S500), `prisma.iicrcChunk.findMany(...)` just returns
   `[]`. The route only appends a "Relevant IICRC sections" line to the
   prompt when `iicrcChunks.length > 0` — otherwise it's silently omitted,
   with no error, no alert, no indication in the report that this
   enrichment didn't happen.

**This means:** completing Part A (populating `IicrcChunk`) is necessary for
the knowledge-graph enrichment to have anything to return, but even after
Part A there is no alerting if a future ingest gap, evidence-class mapping
miss, or code regression silently empties this signal again. This is a real
gap in the RA-6934 degradation coverage, separate from and not fixed by
either Part A or Part B above, and was out of scope for this hardening pass
(it lives in the report route, not the ingest script) — flagging it here so
it's tracked rather than assumed covered.

## Remote ingest path (sensitive-env wall)

`DATABASE_URL` and `OPENAI_API_KEY` are **Vercel-sensitive**: they decrypt only
inside the Vercel runtime and pull as empty strings via `vercel env pull`, so
the local script path above cannot run from an operator machine that doesn't
hold its own copies. The server-side path added for this (2026-07-06):

1. `POST /api/cron/ingest-standards` — runs the identical chunk → embed →
   upsert pipeline inside Vercel (imports the same pure functions from
   `scripts/ingest-iicrc.ts`). Auth: `Authorization: Bearer
   ${STANDARDS_INGEST_TOKEN}` (dedicated secret, fail-closed; rotate/revoke
   independently of `CRON_SECRET`).
2. Driver: `STANDARDS_INGEST_TOKEN=<token> npx tsx
   scripts/ingest-standards-remote.ts --dir ~/iicrc-source/.staging` — expects
   `<STANDARD>-<EDITION>/*.txt` folders of pre-extracted text (any extraction
   method; pdftotext, textutil, or Drive-MCP export all work).

Both paths are idempotent with each other — same `(standard, edition,
content)` hash, so re-running either skips already-ingested chunks.
