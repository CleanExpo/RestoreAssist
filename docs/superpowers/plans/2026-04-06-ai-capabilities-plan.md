# AI Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice copilot (push-to-talk dictation + conversational IICRC guidance), vision-based meter reading extraction (Delmhorst/Protimeter/Tramex), and a pgvector-backed IICRC RAG knowledge base that replaces slow per-request Drive downloads.

**Architecture:** pgvector extension + IicrcChunk Prisma model store pre-indexed PDF chunks. One-time idempotent ingestion script reads PDFs from existing Google Drive folder. Voice copilot uses React PTT hook + Whisper transcription + ElevenLabs TTS. Vision uses Claude Vision with brand-specific prompts.

**Tech Stack:** OpenAI (text-embedding-3-small, whisper-1), Anthropic Claude Vision + claude-sonnet-4-20250514, ElevenLabs TTS, pgvector, Prisma, Next.js 15 App Router, React, Capacitor

---

## Task 1: pgvector schema + migration

**What:** Enable the pgvector Postgres extension and add the `IicrcChunk` model to store pre-indexed IICRC PDF chunks with 1536-dimension embeddings.

**Why TDD first:** The Prisma client is generated from the schema — if `prisma.iicrcChunk` doesn't exist yet the import will fail at runtime. Writing the failing test first proves the migration is actually necessary and confirms the generated client exposes the new model after it runs.

### Steps

- [ ] **1.1 — Write the failing test**

  Create `lib/rag/__tests__/prisma-iicrc-chunk.test.ts`:

  ```typescript
  // lib/rag/__tests__/prisma-iicrc-chunk.test.ts
  import { describe, it, expect } from "vitest";

  describe("IicrcChunk model availability", () => {
    it("prisma client exposes iicrcChunk CRUD methods", async () => {
      const { prisma } = await import("@/lib/prisma");
      // If the migration has NOT run, prisma.iicrcChunk is undefined and this throws.
      expect(typeof prisma.iicrcChunk.findMany).toBe("function");
      expect(typeof prisma.iicrcChunk.create).toBe("function");
      expect(typeof prisma.iicrcChunk.upsert).toBe("function");
    });
  });
  ```

- [ ] **1.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/prisma-iicrc-chunk.test.ts
  ```

  Expected output contains:

  ```
  TypeError: Cannot read properties of undefined (reading 'findMany')
  ```

- [ ] **1.3 — Edit `prisma/schema.prisma`**

  Current generator block (lines 4–6):

  ```prisma
  generator client {
    provider = "prisma-client-js"
  }
  ```

  Replace with:

  ```prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["postgresqlExtensions"]
  }
  ```

  Current datasource block (lines 8–11):

  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
  }
  ```

  Replace with:

  ```prisma
  datasource db {
    provider   = "postgresql"
    url        = env("DATABASE_URL")
    extensions = [pgvector(map: "vector")]
  }
  ```

  Then append the following model at the **end** of `prisma/schema.prisma` (after all existing models):

  ```prisma
  model IicrcChunk {
    id          String   @id @default(cuid())
    standard    String
    section     String
    content     String   @db.Text
    contentHash String   @unique
    embedding   Unsupported("vector(1536)")?
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt

    @@index([standard])
  }
  ```

- [ ] **1.4 — Run the migration**

  ```bash
  cd D:/RestoreAssist
  npx prisma migrate dev --name add_iicrc_rag_pgvector
  ```

  Expected output:

  ```
  Environment variables loaded from .env.local
  Prisma schema loaded from prisma/schema.prisma
  Datasource "db": PostgreSQL database ...

  Applying migration `<timestamp>_add_iicrc_rag_pgvector`

  The following migration(s) have been created and applied from new schema changes:

  migrations/
    └─ <timestamp>_add_iicrc_rag_pgvector/
      └─ migration.sql

  Your database is now in sync with your schema.
  ```

  If pgvector is not installed on the Postgres server the migration will fail with:
  `ERROR: extension "vector" is not available`. Resolve by running `CREATE EXTENSION IF NOT EXISTS vector;` as a superuser on the database before retrying.

- [ ] **1.5 — Regenerate the Prisma client**

  ```bash
  cd D:/RestoreAssist
  npx prisma generate
  ```

  Expected output contains: `Generated Prisma Client`

- [ ] **1.6 — Run the test again (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/prisma-iicrc-chunk.test.ts
  ```

  Expected output:

  ```
  ✓ lib/rag/__tests__/prisma-iicrc-chunk.test.ts (1)
    ✓ IicrcChunk model availability (1)
      ✓ prisma client exposes iicrcChunk CRUD methods
  ```

- [ ] **1.7 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add prisma/schema.prisma prisma/migrations/ lib/rag/__tests__/prisma-iicrc-chunk.test.ts
  git commit -m "feat(rag): add pgvector extension + IicrcChunk model for IICRC embedding store"
  ```

---

## Task 2: lib/rag/embed.ts

**What:** A thin OpenAI embeddings wrapper. Lazy-initialises the client so tests can mock before it is constructed. Truncates input to 32 000 chars (≈8 k tokens) to stay inside the `text-embedding-3-small` context window.

### Steps

- [ ] **2.1 — Write the failing test first**

  Create `lib/rag/__tests__/embed.test.ts`:

  ```typescript
  // lib/rag/__tests__/embed.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Mock OpenAI before any module import
  vi.mock("openai", () => {
    const mockCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: Array.from({ length: 1536 }, (_, i) => i * 0.001) }],
    });
    return {
      default: vi.fn().mockImplementation(() => ({
        embeddings: { create: mockCreate },
      })),
      __mockCreate: mockCreate,
    };
  });

  describe("embed()", () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.OPENAI_API_KEY = "sk-test-key";
    });

    it("returns a 1536-length number array", async () => {
      const { embed } = await import("@/lib/rag/embed");
      const result = await embed("test query");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1536);
      expect(typeof result[0]).toBe("number");
    });

    it("truncates input to 32000 characters", async () => {
      const OpenAI = (await import("openai")).default as unknown as ReturnType<
        typeof vi.fn
      >;
      const instance = OpenAI.mock.results[0]?.value;
      const { embed } = await import("@/lib/rag/embed");
      const longText = "a".repeat(50000);
      await embed(longText);
      const callArg = instance.embeddings.create.mock.calls[0][0];
      expect(callArg.input.length).toBeLessThanOrEqual(32000);
    });

    it("throws if OPENAI_API_KEY is not set", async () => {
      delete process.env.OPENAI_API_KEY;
      vi.resetModules();
      // Re-mock with no API key path
      vi.mock("openai", () => ({
        default: vi.fn().mockImplementation(() => {
          throw new Error("OPENAI_API_KEY not configured");
        }),
      }));
      const { embed } = await import("@/lib/rag/embed");
      await expect(embed("hello")).rejects.toThrow(
        "OPENAI_API_KEY not configured",
      );
    });
  });
  ```

- [ ] **2.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/embed.test.ts
  ```

  Expected: `Cannot find module '@/lib/rag/embed'`

- [ ] **2.3 — Create `lib/rag/embed.ts`**

  ```typescript
  // lib/rag/embed.ts
  import OpenAI from "openai";

  let _client: OpenAI | null = null;

  function getClient(): OpenAI {
    if (!_client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
      _client = new OpenAI({ apiKey });
    }
    return _client;
  }

  export async function embed(text: string): Promise<number[]> {
    const client = getClient();
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 32000), // ~8k tokens safety limit
    });
    return response.data[0].embedding;
  }
  ```

- [ ] **2.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/embed.test.ts
  ```

  Expected output:

  ```
  ✓ lib/rag/__tests__/embed.test.ts (3)
    ✓ embed()
      ✓ returns a 1536-length number array
      ✓ truncates input to 32000 characters
      ✓ throws if OPENAI_API_KEY is not set
  ```

- [ ] **2.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit lib/rag/embed.ts
  ```

  Expected: no output (zero errors).

- [ ] **2.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add lib/rag/embed.ts lib/rag/__tests__/embed.test.ts
  git commit -m "feat(rag): add OpenAI text-embedding-3-small wrapper with 32k char safety limit"
  ```

---

## Task 3: lib/rag/retrieve.ts

**What:** Cosine similarity search against `IicrcChunk` using pgvector's `<=>` operator. Uses `prisma.$queryRawUnsafe` because Prisma's tagged-template parameterization cannot cast `$1` to `::vector` — the `::vector` suffix must appear literally in the SQL string and the value is passed as a separate positional parameter.

### Steps

- [ ] **3.1 — Write the failing test first**

  Create `lib/rag/__tests__/retrieve.test.ts`:

  ```typescript
  // lib/rag/__tests__/retrieve.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

  vi.mock("@/lib/rag/embed", () => ({
    embed: vi.fn().mockResolvedValue(FAKE_EMBEDDING),
  }));

  const mockQueryRawUnsafe = vi.fn().mockResolvedValue([
    {
      standard: "S500",
      section: "§7.1",
      content: "Class 3 water loss requires...",
      similarity: 0.92,
    },
    {
      standard: "S500",
      section: "§8.2",
      content: "Dehumidification criteria...",
      similarity: 0.87,
    },
  ]);

  vi.mock("@/lib/prisma", () => ({
    prisma: {
      $queryRawUnsafe: mockQueryRawUnsafe,
    },
  }));

  describe("retrieve()", () => {
    beforeEach(() => {
      mockQueryRawUnsafe.mockClear();
    });

    it("returns an array of RagChunk objects", async () => {
      const { retrieve } = await import("@/lib/rag/retrieve");
      const results = await retrieve("Class 3 water loss drying", 5);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        standard: "S500",
        section: "§7.1",
        content: expect.stringContaining("Class 3"),
        similarity: expect.any(Number),
      });
    });

    it("calls $queryRawUnsafe with the correct SQL shape", async () => {
      const { retrieve } = await import("@/lib/rag/retrieve");
      await retrieve("moisture mapping", 3);
      expect(mockQueryRawUnsafe).toHaveBeenCalledOnce();
      const [sql, embeddingStr, topK] = mockQueryRawUnsafe.mock.calls[0];
      expect(sql).toContain("IicrcChunk");
      expect(sql).toContain("::vector");
      expect(sql).toContain("embedding IS NOT NULL");
      // Embedding string is a JSON-array-like string of 1536 floats
      expect(embeddingStr).toMatch(/^\[[\d.,\s-]+\]$/);
      expect(topK).toBe(3);
    });

    it("defaults topK to 5", async () => {
      const { retrieve } = await import("@/lib/rag/retrieve");
      await retrieve("test");
      const [, , topK] = mockQueryRawUnsafe.mock.calls[0];
      expect(topK).toBe(5);
    });
  });
  ```

- [ ] **3.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/retrieve.test.ts
  ```

  Expected: `Cannot find module '@/lib/rag/retrieve'`

- [ ] **3.3 — Create `lib/rag/retrieve.ts`**

  ```typescript
  // lib/rag/retrieve.ts
  import { prisma } from "@/lib/prisma";
  import { embed } from "./embed";

  export interface RagChunk {
    standard: string;
    section: string;
    content: string;
    similarity: number;
  }

  export async function retrieve(query: string, topK = 5): Promise<RagChunk[]> {
    const queryEmbedding = await embed(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const results = await prisma.$queryRawUnsafe<RagChunk[]>(
      `SELECT standard, section, content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM "IicrcChunk"
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      embeddingStr,
      topK,
    );

    return results;
  }
  ```

- [ ] **3.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/retrieve.test.ts
  ```

  Expected output:

  ```
  ✓ lib/rag/__tests__/retrieve.test.ts (3)
    ✓ retrieve()
      ✓ returns an array of RagChunk objects
      ✓ calls $queryRawUnsafe with the correct SQL shape
      ✓ defaults topK to 5
  ```

- [ ] **3.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit lib/rag/retrieve.ts
  ```

  Expected: no output.

- [ ] **3.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add lib/rag/retrieve.ts lib/rag/__tests__/retrieve.test.ts
  git commit -m "feat(rag): add pgvector cosine similarity retrieval for IicrcChunk store"
  ```

---

## Task 4: scripts/ingest-iicrc.ts

**What:** One-time idempotent ingestion script. Downloads every PDF from the Google Drive IICRC Standards folder, chunks text at 4 000 chars with 800-char overlap, embeds each chunk, and upserts to the `IicrcChunk` table. Safe to re-run — the `ON CONFLICT ("contentHash") DO NOTHING` clause and the pre-check ensure existing chunks are never re-embedded.

### Steps

- [ ] **4.1 — Create `scripts/ingest-iicrc.ts`**

  ```typescript
  #!/usr/bin/env tsx
  // scripts/ingest-iicrc.ts
  // Run: npx tsx scripts/ingest-iicrc.ts
  import { prisma } from "@/lib/prisma";
  import { listDriveItems, downloadDriveFile } from "@/lib/google-drive";
  import { extractTextFromPDF } from "@/lib/file-extraction";
  import { embed } from "@/lib/rag/embed";
  import crypto from "crypto";

  const STANDARDS_FOLDER_ID = "1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1";
  const CHUNK_CHARS = 4000; // ~1 000 tokens per chunk
  const OVERLAP_CHARS = 800; // ~200 token overlap to preserve sentence context

  /** Split text into overlapping chunks. */
  function chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_CHARS, text.length);
      chunks.push(text.slice(start, end));
      start += CHUNK_CHARS - OVERLAP_CHARS;
    }
    return chunks;
  }

  /** Derive the IICRC standard code from a PDF file name. */
  function extractStandard(fileName: string): string {
    if (/s500/i.test(fileName)) return "S500";
    if (/s520/i.test(fileName)) return "S520";
    if (/s700/i.test(fileName)) return "S700";
    if (/s540/i.test(fileName)) return "S540";
    if (/s520/i.test(fileName)) return "S520";
    return "General";
  }

  /** Try to extract a section reference from the first line of the chunk. */
  function extractSection(chunk: string): string {
    const match = chunk.match(/(?:Section\s+|§\s*)(\d+(?:\.\d+)*)/);
    return match ? `§${match[1]}` : "General";
  }

  async function main() {
    console.log("[ingest-iicrc] Reading standards from Google Drive...");

    const { files } = await listDriveItems(STANDARDS_FOLDER_ID);
    const pdfs = (
      files as Array<{ id: string; name: string; mimeType: string }>
    ).filter((f) => f.mimeType === "application/pdf");
    console.log(`[ingest-iicrc] Found ${pdfs.length} PDF files`);

    let inserted = 0;
    let skipped = 0;

    for (const file of pdfs) {
      console.log(`[ingest-iicrc] Processing: ${file.name}`);

      const { buffer } = await downloadDriveFile(file.id);
      const text = await extractTextFromPDF(buffer);

      if (!text || text.length < 100) {
        console.log(`  → Skipped: no readable text extracted`);
        continue;
      }

      const standard = extractStandard(file.name);
      const chunks = chunkText(text);
      console.log(`  → ${chunks.length} chunks to process`);

      for (const chunk of chunks) {
        const contentHash = crypto
          .createHash("sha256")
          .update(chunk)
          .digest("hex");

        // Idempotency check — skip if chunk already stored
        const existing = await prisma.iicrcChunk.findUnique({
          where: { contentHash },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const section = extractSection(chunk);
        const embedding = await embed(chunk);
        const embeddingStr = `[${embedding.join(",")}]`;

        // INSERT with pgvector cast — must use executeRawUnsafe for ::vector syntax
        await prisma.$executeRawUnsafe(
          `INSERT INTO "IicrcChunk"
             (id, standard, section, content, "contentHash", embedding, "createdAt", "updatedAt")
           VALUES
             (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, NOW(), NOW())
           ON CONFLICT ("contentHash") DO NOTHING`,
          standard,
          section,
          chunk,
          contentHash,
          embeddingStr,
        );
        inserted++;
      }
    }

    console.log(
      `[ingest-iicrc] Done. Inserted: ${inserted}, Already existed (skipped): ${skipped}`,
    );
    await prisma.$disconnect();
  }

  main().catch((err) => {
    console.error("[ingest-iicrc] Fatal error:", err);
    process.exit(1);
  });
  ```

- [ ] **4.2 — Run the ingestion script**

  Ensure `DATABASE_URL` and Google Drive credentials are set in `.env.local`, then:

  ```bash
  cd D:/RestoreAssist
  npx tsx scripts/ingest-iicrc.ts
  ```

  Expected output (example with 3 PDFs, ~240 chunks per file):

  ```
  [ingest-iicrc] Reading standards from Google Drive...
  [ingest-iicrc] Found 3 PDF files
  [ingest-iicrc] Processing: IICRC S500 2025.pdf
    → 241 chunks to process
  [ingest-iicrc] Processing: IICRC S520 2023.pdf
    → 198 chunks to process
  [ingest-iicrc] Processing: IICRC S700 2022.pdf
    → 154 chunks to process
  [ingest-iicrc] Done. Inserted: 593, Already existed (skipped): 0
  ```

  Second run must show `Inserted: 0` and `skipped: 593` (all chunks already exist).

- [ ] **4.3 — Verify rows in DB**

  ```bash
  cd D:/RestoreAssist
  npx prisma studio
  ```

  Navigate to the `IicrcChunk` table. Verify:
  - Row count matches the `Inserted` number from the script
  - The `embedding` column is NOT NULL for all rows
  - The `standard` column contains values like `S500`, `S520`, `S700`

- [ ] **4.4 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add scripts/ingest-iicrc.ts
  git commit -m "feat(rag): add idempotent IICRC PDF ingestion script (pgvector embeddings)"
  ```

---

## Task 5: Upgrade lib/standards-retrieval.ts

**What:** Add the vector store as the primary retrieval path. If the vector store returns results the function returns immediately (fast path, ~50 ms). If the vector store is unavailable or empty, execution falls through to the existing Drive-download logic unchanged. This means no existing behaviour is broken.

### Steps

- [ ] **5.1 — Read the file**

  Confirm the opening of `retrieveRelevantStandards` at line 478 of `lib/standards-retrieval.ts`:

  ```typescript
  export async function retrieveRelevantStandards(
    query: RetrievalQuery,
    anthropicApiKey?: string,
  ): Promise<StandardsContext> {
    try {
      // Get standards folder ID (default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
      const standardsFolderId = getStandardsFolderId();
  ```

- [ ] **5.2 — Insert the vector-store fast path**

  In `lib/standards-retrieval.ts`, locate the exact string:

  ```typescript
  export async function retrieveRelevantStandards(
    query: RetrievalQuery,
    anthropicApiKey?: string,
  ): Promise<StandardsContext> {
    try {
      // Get standards folder ID (default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
      const standardsFolderId = getStandardsFolderId();
  ```

  Replace it with:

  ```typescript
  export async function retrieveRelevantStandards(
    query: RetrievalQuery,
    anthropicApiKey?: string,
  ): Promise<StandardsContext> {
    // ── Vector store fast path (~50ms) ─────────────────────────────────────
    // Try pgvector RAG first. If it returns results, return immediately
    // without hitting Google Drive. Falls through to Drive logic on error or
    // empty result (e.g. vector store not yet ingested).
    try {
      const { retrieve } = await import("@/lib/rag/retrieve");
      const chunks = await retrieve(
        [query.reportType, ...(query.keywords ?? []), ...(query.materials ?? [])].join(" "),
        8,
      );
      if (chunks.length > 0) {
        const standardsSeen = [...new Set(chunks.map((c) => c.standard))];
        const documents = chunks.map((c, i) => ({
          name: `${c.standard} ${c.section}`,
          fileId: `rag-chunk-${i}`,
          relevantSections: [c.content],
          standardType: c.standard,
        }));
        return {
          documents,
          summary: `Retrieved ${documents.length} relevant IICRC sections from vector store (${standardsSeen.join(", ")}).`,
        };
      }
    } catch (ragErr) {
      console.warn(
        "[standards-retrieval] Vector store unavailable, falling back to Drive:",
        ragErr,
      );
    }
    // ── End vector store fast path ─────────────────────────────────────────

    try {
      // Get standards folder ID (default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
      const standardsFolderId = getStandardsFolderId();
  ```

- [ ] **5.3 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit lib/standards-retrieval.ts
  ```

  Expected: no output (zero errors).

- [ ] **5.4 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add lib/standards-retrieval.ts
  git commit -m "feat(rag): upgrade standards-retrieval to use pgvector fast path before Drive fallback"
  ```

---

## Task 6: lib/vision/meter-prompts.ts

**What:** Brand-specific prompt constants for Delmhorst, Protimeter, and Tramex moisture meters, plus a JSON parser for Claude Vision responses. Pure functions — no I/O, easily testable.

### Steps

- [ ] **6.1 — Write the failing test first**

  Create `lib/vision/__tests__/meter-prompts.test.ts`:

  ```typescript
  // lib/vision/__tests__/meter-prompts.test.ts
  import { describe, it, expect } from "vitest";
  import {
    getMeterPrompt,
    parseMeterResponse,
    type MeterReading,
  } from "@/lib/vision/meter-prompts";

  describe("getMeterPrompt()", () => {
    it("returns base prompt when no brand hint given", () => {
      const prompt = getMeterPrompt();
      expect(prompt).toContain("moisture meter");
      expect(prompt).toContain('"confidence"');
      expect(prompt).not.toContain("Delmhorst");
      expect(prompt).not.toContain("Protimeter");
      expect(prompt).not.toContain("Tramex");
    });

    it("appends Delmhorst addendum for delmhorst brand hint", () => {
      const prompt = getMeterPrompt("delmhorst");
      expect(prompt).toContain("Delmhorst");
      expect(prompt).toContain("J-Lite");
      expect(prompt).toContain("6–40%");
    });

    it("appends Delmhorst addendum for bd-2100 model hint", () => {
      const prompt = getMeterPrompt("bd-2100");
      expect(prompt).toContain("Delmhorst");
    });

    it("appends Protimeter addendum for protimeter brand hint", () => {
      const prompt = getMeterPrompt("Protimeter MMS3");
      expect(prompt).toContain("Protimeter");
      expect(prompt).toContain("WME");
    });

    it("appends Tramex addendum for tramex brand hint", () => {
      const prompt = getMeterPrompt("Tramex CMEX5");
      expect(prompt).toContain("Tramex");
      expect(prompt).toContain("CMEX5");
    });
  });

  describe("parseMeterResponse()", () => {
    it("parses valid JSON response", () => {
      const json = JSON.stringify({
        brand: "Delmhorst",
        model: "J-Lite",
        value: 22.5,
        unit: "%",
        confidence: 0.95,
        rawText: "22.5",
      });
      const result = parseMeterResponse(json);
      expect(result.brand).toBe("Delmhorst");
      expect(result.model).toBe("J-Lite");
      expect(result.value).toBe(22.5);
      expect(result.unit).toBe("%");
      expect(result.confidence).toBe(0.95);
      expect(result.rawText).toBe("22.5");
    });

    it("returns zero confidence on invalid JSON", () => {
      const result = parseMeterResponse("not json at all");
      expect(result.confidence).toBe(0);
      expect(result.value).toBeNull();
      expect(result.brand).toBeNull();
    });

    it("uses brandHint as fallback for missing brand field", () => {
      const json = JSON.stringify({
        value: 18.0,
        unit: "%",
        confidence: 0.8,
        rawText: "18",
      });
      const result = parseMeterResponse(json, "Protimeter");
      expect(result.brand).toBe("Protimeter");
    });

    it("clamps confidence to 0–1 range", () => {
      const json = JSON.stringify({
        brand: null,
        model: null,
        value: 5,
        unit: "%",
        confidence: 2.5,
        rawText: "5",
      });
      const result = parseMeterResponse(json);
      expect(result.confidence).toBe(1);
    });

    it("returns null for non-numeric value field", () => {
      const json = JSON.stringify({
        brand: "Tramex",
        model: null,
        value: "high",
        unit: "REL",
        confidence: 0.5,
        rawText: "HIGH",
      });
      const result = parseMeterResponse(json);
      expect(result.value).toBeNull();
    });
  });
  ```

- [ ] **6.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/vision/__tests__/meter-prompts.test.ts
  ```

  Expected: `Cannot find module '@/lib/vision/meter-prompts'`

- [ ] **6.3 — Create `lib/vision/meter-prompts.ts`**

  ```typescript
  // lib/vision/meter-prompts.ts

  const BASE_PROMPT = `You are analyzing an image of a moisture meter used in water damage restoration.
  
  Extract the reading and respond ONLY with valid JSON matching this exact shape:
  {
    "brand": "Delmhorst" | "Protimeter" | "Tramex" | null,
    "model": string | null,
    "value": number | null,
    "unit": "%" | "WME" | "REL" | null,
    "confidence": number,
    "rawText": string
  }
  
  Rules:
  - confidence is 0.0–1.0. Set to 0 if you cannot read the display clearly.
  - value must be a number, not a string.
  - rawText is the exact reading as shown on the display.
  - Respond with JSON only. No prose before or after.`;

  const DELMHORST_ADDENDUM = `
  This is a Delmhorst meter (J-Lite or BD-2100). It has an LED 7-segment display.
  The main reading is the large numeric value in percent moisture content (%).
  Scale is typically 6–40%.`;

  const PROTIMETER_ADDENDUM = `
  This is a Protimeter meter (MMS3 or Surveymaster). It has an LCD display.
  It may show two readings — use the primary Moisture Content (MC) or WME reading.
  Unit is usually WME (Wood Moisture Equivalent) or % REL.`;

  const TRAMEX_ADDENDUM = `
  This is a Tramex meter (CMEX5 or ME5). It may have an analog dial or digital display.
  For the ME5 analog dial: the scale is 0–100. Read the needle position carefully.
  For the CMEX5: read the digital display value directly.`;

  export function getMeterPrompt(brandHint?: string): string {
    const hint = (brandHint ?? "").toLowerCase();
    if (
      hint.includes("delmhorst") ||
      hint.includes("j-lite") ||
      hint.includes("bd-2")
    ) {
      return BASE_PROMPT + DELMHORST_ADDENDUM;
    }
    if (
      hint.includes("protimeter") ||
      hint.includes("mms") ||
      hint.includes("surveymaster")
    ) {
      return BASE_PROMPT + PROTIMETER_ADDENDUM;
    }
    if (
      hint.includes("tramex") ||
      hint.includes("cmex") ||
      hint.includes("me5")
    ) {
      return BASE_PROMPT + TRAMEX_ADDENDUM;
    }
    return BASE_PROMPT;
  }

  export interface MeterReading {
    brand: string | null;
    model: string | null;
    value: number | null;
    unit: string | null;
    confidence: number;
    rawText: string;
  }

  export function parseMeterResponse(
    rawText: string,
    brandHint?: string,
  ): MeterReading {
    try {
      const parsed = JSON.parse(rawText) as MeterReading;
      return {
        brand: parsed.brand ?? brandHint ?? null,
        model: parsed.model ?? null,
        value: typeof parsed.value === "number" ? parsed.value : null,
        unit: parsed.unit ?? null,
        confidence:
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0,
        rawText: parsed.rawText ?? rawText,
      };
    } catch {
      return {
        brand: brandHint ?? null,
        model: null,
        value: null,
        unit: null,
        confidence: 0,
        rawText,
      };
    }
  }
  ```

- [ ] **6.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/vision/__tests__/meter-prompts.test.ts
  ```

  Expected output:

  ```
  ✓ lib/vision/__tests__/meter-prompts.test.ts (10)
    ✓ getMeterPrompt() (5)
      ✓ returns base prompt when no brand hint given
      ✓ appends Delmhorst addendum for delmhorst brand hint
      ✓ appends Delmhorst addendum for bd-2100 model hint
      ✓ appends Protimeter addendum for protimeter brand hint
      ✓ appends Tramex addendum for tramex brand hint
    ✓ parseMeterResponse() (5)
      ✓ parses valid JSON response
      ✓ returns zero confidence on invalid JSON
      ✓ uses brandHint as fallback for missing brand field
      ✓ clamps confidence to 0–1 range
      ✓ returns null for non-numeric value field
  ```

- [ ] **6.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit lib/vision/meter-prompts.ts
  ```

  Expected: no output.

- [ ] **6.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add lib/vision/meter-prompts.ts lib/vision/__tests__/meter-prompts.test.ts
  git commit -m "feat(vision): add brand-specific Claude Vision prompt builders for moisture meters"
  ```

---

## Task 7: app/api/vision/extract-reading/route.ts

**What:** POST endpoint that accepts a base64-encoded meter image, calls Claude Vision, returns the parsed `MeterReading`. Auth-gated (user session required).

### Steps

- [ ] **7.1 — Write the failing test first**

  Create `app/api/vision/extract-reading/__tests__/route.test.ts`:

  ```typescript
  // app/api/vision/extract-reading/__tests__/route.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { NextRequest } from "next/server";

  // Mock auth
  vi.mock("next-auth", () => ({
    getServerSession: vi.fn(),
  }));
  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  // Mock Anthropic
  const mockMessagesCreate = vi.fn();
  vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockMessagesCreate },
    })),
  }));

  // Mock meter-prompts
  vi.mock("@/lib/vision/meter-prompts", () => ({
    getMeterPrompt: vi.fn().mockReturnValue("mock prompt"),
    parseMeterResponse: vi.fn().mockReturnValue({
      brand: "Delmhorst",
      model: "J-Lite",
      value: 22.5,
      unit: "%",
      confidence: 0.95,
      rawText: "22.5",
    }),
  }));

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/vision/extract-reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("POST /api/vision/extract-reading", () => {
    beforeEach(() => {
      vi.resetModules();
      mockMessagesCreate.mockClear();
    });

    it("returns 401 when no session", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue(null);
      const { POST } = await import("@/app/api/vision/extract-reading/route");
      const res = await POST(makeRequest({ imageBase64: "abc123" }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 400 when imageBase64 is missing", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      const { POST } = await import("@/app/api/vision/extract-reading/route");
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("imageBase64 is required");
    });

    it("strips data URL prefix before sending to Anthropic", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"brand":"Delmhorst","model":"J-Lite","value":22.5,"unit":"%","confidence":0.95,"rawText":"22.5"}',
          },
        ],
      });
      const { POST } = await import("@/app/api/vision/extract-reading/route");
      const res = await POST(
        makeRequest({
          imageBase64: "data:image/jpeg;base64,REALBASE64DATA",
          brandHint: "delmhorst",
        }),
      );
      expect(res.status).toBe(200);
      const callArg = mockMessagesCreate.mock.calls[0][0];
      const imageContent = callArg.messages[0].content[0];
      expect(imageContent.source.data).toBe("REALBASE64DATA");
      expect(imageContent.source.data).not.toContain("data:image");
    });

    it("returns parsed reading in happy path", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"brand":"Delmhorst","model":"J-Lite","value":22.5,"unit":"%","confidence":0.95,"rawText":"22.5"}',
          },
        ],
      });
      const { POST } = await import("@/app/api/vision/extract-reading/route");
      const res = await POST(
        makeRequest({ imageBase64: "SOMEBASE64", brandHint: "delmhorst" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toMatchObject({
        brand: "Delmhorst",
        value: 22.5,
        unit: "%",
        confidence: 0.95,
      });
    });
  });
  ```

- [ ] **7.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/vision/extract-reading/__tests__/route.test.ts"
  ```

  Expected: `Cannot find module '@/app/api/vision/extract-reading/route'`

- [ ] **7.3 — Create `app/api/vision/extract-reading/route.ts`**

  ```typescript
  // app/api/vision/extract-reading/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import Anthropic from "@anthropic-ai/sdk";
  import {
    getMeterPrompt,
    parseMeterResponse,
    type MeterReading,
  } from "@/lib/vision/meter-prompts";

  const anthropic = new Anthropic();

  export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { imageBase64?: string; brandHint?: string };
    try {
      body = (await request.json()) as {
        imageBase64?: string;
        brandHint?: string;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { imageBase64, brandHint } = body;
    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,")
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Data,
              },
            },
            { type: "text", text: getMeterPrompt(brandHint) },
          ],
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";
    const reading: MeterReading = parseMeterResponse(rawText, brandHint);

    return NextResponse.json({ data: reading });
  }
  ```

- [ ] **7.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/vision/extract-reading/__tests__/route.test.ts"
  ```

  Expected output:

  ```
  ✓ app/api/vision/extract-reading/__tests__/route.test.ts (4)
    ✓ POST /api/vision/extract-reading (4)
      ✓ returns 401 when no session
      ✓ returns 400 when imageBase64 is missing
      ✓ strips data URL prefix before sending to Anthropic
      ✓ returns parsed reading in happy path
  ```

- [ ] **7.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit app/api/vision/extract-reading/route.ts
  ```

  Expected: no output.

- [ ] **7.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add app/api/vision/extract-reading/route.ts "app/api/vision/extract-reading/__tests__/route.test.ts"
  git commit -m "feat(vision): add POST /api/vision/extract-reading using Claude Vision for meter reading OCR"
  ```

---

## Task 8: lib/voice/recorder.ts

**What:** A React hook (`useRecorder`) that manages MediaRecorder lifecycle for push-to-talk audio capture. Returns an `AudioBlob` when the user releases the button. No unit test — relies on browser APIs (`navigator.mediaDevices`, `MediaRecorder`) not available in vitest/Node. Integration tested via the `VoiceCopilot` component.

### Steps

- [ ] **8.1 — Create `lib/voice/recorder.ts`**

  ```typescript
  // lib/voice/recorder.ts
  "use client";

  import { useRef, useState, useCallback } from "react";

  export interface UseRecorderReturn {
    isRecording: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<Blob | null>;
    error: string | null;
  }

  export function useRecorder(): UseRecorderReturn {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startRecording = useCallback(async () => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // collect data every 100ms
        setIsRecording(true);
      } catch {
        setError(
          "Microphone access denied. Check app permissions in Settings.",
        );
      }
    }, []);

    const stopRecording = useCallback((): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const mr = mediaRecorderRef.current;
        if (!mr || mr.state === "inactive") {
          resolve(null);
          return;
        }

        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          mr.stream.getTracks().forEach((t) => t.stop());
          setIsRecording(false);
          resolve(blob);
        };
        mr.stop();
      });
    }, []);

    return { isRecording, startRecording, stopRecording, error };
  }
  ```

- [ ] **8.2 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit lib/voice/recorder.ts
  ```

  Expected: no output.

- [ ] **8.3 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add lib/voice/recorder.ts
  git commit -m "feat(voice): add useRecorder hook for push-to-talk MediaRecorder lifecycle"
  ```

---

## Task 9: app/api/voice/transcribe/route.ts

**What:** POST endpoint that accepts a `multipart/form-data` `audio` field (WebM blob) and returns Whisper transcription. Auth-gated. Sets `maxDuration = 30` to accommodate Vercel's function timeout for audio processing.

### Steps

- [ ] **9.1 — Write the failing test first**

  Create `app/api/voice/transcribe/__tests__/route.test.ts`:

  ```typescript
  // app/api/voice/transcribe/__tests__/route.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { NextRequest } from "next/server";

  vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  const mockTranscriptionsCreate = vi.fn();
  vi.mock("openai", () => ({
    default: vi.fn().mockImplementation(() => ({
      audio: { transcriptions: { create: mockTranscriptionsCreate } },
    })),
  }));

  function makeFormRequest(hasAudio: boolean): NextRequest {
    const fd = new FormData();
    if (hasAudio) {
      fd.append(
        "audio",
        new File(["fake-audio-data"], "recording.webm", { type: "audio/webm" }),
      );
    }
    return new NextRequest("http://localhost/api/voice/transcribe", {
      method: "POST",
      body: fd,
    });
  }

  describe("POST /api/voice/transcribe", () => {
    beforeEach(() => {
      vi.resetModules();
      mockTranscriptionsCreate.mockClear();
    });

    it("returns 401 when no session", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue(null);
      const { POST } = await import("@/app/api/voice/transcribe/route");
      const res = await POST(makeFormRequest(false));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 400 when audio field is missing", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      const { POST } = await import("@/app/api/voice/transcribe/route");
      const res = await POST(makeFormRequest(false));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("audio field is required");
    });

    it("returns transcribed text in happy path", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      mockTranscriptionsCreate.mockResolvedValue({
        text: "Class 3 water loss in bedroom",
      });
      const { POST } = await import("@/app/api/voice/transcribe/route");
      const res = await POST(makeFormRequest(true));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ text: "Class 3 water loss in bedroom" });
    });

    it("calls Whisper with model whisper-1 and language en", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      mockTranscriptionsCreate.mockResolvedValue({ text: "test" });
      const { POST } = await import("@/app/api/voice/transcribe/route");
      await POST(makeFormRequest(true));
      const callArg = mockTranscriptionsCreate.mock.calls[0][0];
      expect(callArg.model).toBe("whisper-1");
      expect(callArg.language).toBe("en");
    });
  });
  ```

- [ ] **9.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/voice/transcribe/__tests__/route.test.ts"
  ```

  Expected: `Cannot find module '@/app/api/voice/transcribe/route'`

- [ ] **9.3 — Create `app/api/voice/transcribe/route.ts`**

  ```typescript
  // app/api/voice/transcribe/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import OpenAI from "openai";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export const maxDuration = 30;

  export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "audio field is required" },
        { status: 400 },
      );
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });

    return NextResponse.json({ data: { text: transcription.text } });
  }
  ```

- [ ] **9.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/voice/transcribe/__tests__/route.test.ts"
  ```

  Expected output:

  ```
  ✓ app/api/voice/transcribe/__tests__/route.test.ts (4)
    ✓ POST /api/voice/transcribe (4)
      ✓ returns 401 when no session
      ✓ returns 400 when audio field is missing
      ✓ returns transcribed text in happy path
      ✓ calls Whisper with model whisper-1 and language en
  ```

- [ ] **9.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit app/api/voice/transcribe/route.ts
  ```

  Expected: no output.

- [ ] **9.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add app/api/voice/transcribe/route.ts "app/api/voice/transcribe/__tests__/route.test.ts"
  git commit -m "feat(voice): add POST /api/voice/transcribe using OpenAI Whisper-1"
  ```

---

## Task 10: app/api/voice/respond/route.ts

**What:** POST endpoint that takes a natural-language question, retrieves relevant IICRC chunks from pgvector RAG, generates a concise answer via Claude, then optionally converts to speech via ElevenLabs TTS. Returns `{ answer, audioBase64, mimeType }`. If ElevenLabs is not configured, `audioBase64` and `mimeType` are `null` and the text answer is still returned.

### Steps

- [ ] **10.1 — Write the failing test first**

  Create `app/api/voice/respond/__tests__/route.test.ts`:

  ```typescript
  // app/api/voice/respond/__tests__/route.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { NextRequest } from "next/server";

  vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  const mockRetrieve = vi.fn().mockResolvedValue([
    {
      standard: "S500",
      section: "§7.1",
      content: "Class 3 means...",
      similarity: 0.92,
    },
  ]);
  vi.mock("@/lib/rag/retrieve", () => ({ retrieve: mockRetrieve }));

  const mockMessagesCreate = vi.fn();
  vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockMessagesCreate },
    })),
  }));

  // Mock global fetch for ElevenLabs
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/voice/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("POST /api/voice/respond", () => {
    beforeEach(() => {
      vi.resetModules();
      mockMessagesCreate.mockClear();
      mockRetrieve.mockClear();
      mockFetch.mockReset();
      delete process.env.ELEVENLABS_API_KEY;
      delete process.env.ELEVENLABS_VOICE_ID;
    });

    it("returns 401 when no session", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue(null);
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({ question: "What is Class 3?" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 when question is missing", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("question is required");
    });

    it("returns 400 when question is empty string", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({ question: "   " }));
      expect(res.status).toBe(400);
    });

    it("returns answer with null audio when ElevenLabs not configured", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: "Per IICRC S500:2025 §7.1, Class 3 water loss affects walls.",
          },
        ],
      });
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({ question: "What is Class 3?" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.answer).toContain("S500");
      expect(json.data.audioBase64).toBeNull();
      expect(json.data.mimeType).toBeNull();
    });

    it("returns base64 audio when ElevenLabs is configured and TTS succeeds", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      process.env.ELEVENLABS_API_KEY = "xi-test";
      process.env.ELEVENLABS_VOICE_ID = "voice-abc";
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "Per IICRC S500:2025 §7.1, Class 3." }],
      });
      const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => fakeAudio,
      });
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({ question: "What is Class 3?" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.audioBase64).toBeTruthy();
      expect(json.data.mimeType).toBe("audio/mpeg");
    });

    it("falls back to text-only when ElevenLabs TTS returns non-ok", async () => {
      const { getServerSession } = await import("next-auth");
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1" },
      } as any);
      process.env.ELEVENLABS_API_KEY = "xi-test";
      process.env.ELEVENLABS_VOICE_ID = "voice-abc";
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "Short answer." }],
      });
      mockFetch.mockResolvedValue({ ok: false });
      const { POST } = await import("@/app/api/voice/respond/route");
      const res = await POST(makeRequest({ question: "What is Class 3?" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.answer).toBe("Short answer.");
      expect(json.data.audioBase64).toBeNull();
    });
  });
  ```

- [ ] **10.2 — Run the failing test (expected: FAIL)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/voice/respond/__tests__/route.test.ts"
  ```

  Expected: `Cannot find module '@/app/api/voice/respond/route'`

- [ ] **10.3 — Create `app/api/voice/respond/route.ts`**

  ```typescript
  // app/api/voice/respond/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import Anthropic from "@anthropic-ai/sdk";
  import { retrieve } from "@/lib/rag/retrieve";

  const anthropic = new Anthropic();

  export const maxDuration = 60;

  const SYSTEM_PROMPT = `You are a senior IICRC-certified water damage restoration technician providing on-site guidance.
  Answer questions concisely using the provided IICRC standards context. Always cite the specific standard and section
  (e.g. "Per IICRC S500:2025 §7.3..."). Keep answers under 3 sentences — they will be spoken aloud to a technician in the field.`;

  export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { question?: string };
    try {
      body = (await request.json()) as { question?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { question } = body;
    if (!question?.trim()) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }

    // RAG retrieval
    const chunks = await retrieve(question, 5);
    const context =
      chunks.length > 0
        ? chunks
            .map((c) => `[${c.standard} ${c.section}]\n${c.content}`)
            .join("\n\n---\n\n")
        : "No specific IICRC sections found for this query.";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `IICRC Standards Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer =
      message.content[0].type === "text" ? message.content[0].text : "";

    // ElevenLabs TTS — optional; gracefully degrade to text-only if not configured
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!elevenLabsKey || !voiceId) {
      return NextResponse.json({
        data: { answer, audioBase64: null, mimeType: null },
      });
    }

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: answer,
          model_id: "eleven_turbo_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!ttsRes.ok) {
      return NextResponse.json({
        data: { answer, audioBase64: null, mimeType: null },
      });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      data: { answer, audioBase64, mimeType: "audio/mpeg" },
    });
  }
  ```

- [ ] **10.4 — Run the test (expected: PASS)**

  ```bash
  cd D:/RestoreAssist
  npx vitest run "app/api/voice/respond/__tests__/route.test.ts"
  ```

  Expected output:

  ```
  ✓ app/api/voice/respond/__tests__/route.test.ts (6)
    ✓ POST /api/voice/respond (6)
      ✓ returns 401 when no session
      ✓ returns 400 when question is missing
      ✓ returns 400 when question is empty string
      ✓ returns answer with null audio when ElevenLabs not configured
      ✓ returns base64 audio when ElevenLabs is configured and TTS succeeds
      ✓ falls back to text-only when ElevenLabs TTS returns non-ok
  ```

- [ ] **10.5 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit app/api/voice/respond/route.ts
  ```

  Expected: no output.

- [ ] **10.6 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add app/api/voice/respond/route.ts "app/api/voice/respond/__tests__/route.test.ts"
  git commit -m "feat(voice): add POST /api/voice/respond (RAG + Claude + ElevenLabs TTS)"
  ```

---

## Task 11: components/voice/VoiceCopilot.tsx

**What:** A push-to-talk React component with two modes: `dictation` (transcription → `onTranscription` callback to fill forms) and `conversational` (transcription → RAG answer → TTS playback). Uses pointer events for mobile compatibility (works on iOS Capacitor WebView where `onMouseDown` is unreliable).

**No automated unit test** — this component is a pure UI orchestrator over browser APIs (`MediaRecorder`, `Audio`). Integration tested manually using the steps in §11.5.

### Steps

- [ ] **11.1 — Create `components/voice/VoiceCopilot.tsx`**

  ```tsx
  // components/voice/VoiceCopilot.tsx
  "use client";

  import { useState, useRef, useCallback } from "react";
  import { Mic, MicOff, MessageSquare, Pencil } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { useRecorder } from "@/lib/voice/recorder";
  import { cn } from "@/lib/utils";

  type Mode = "dictation" | "conversational";
  type Status = "idle" | "recording" | "processing" | "speaking";

  export interface VoiceCopilotProps {
    /**
     * Called with the transcribed text when the component is in dictation mode.
     * Use this to populate a form field — e.g. `onTranscription={(t) => setValue("notes", t)}`
     */
    onTranscription?: (text: string) => void;
    className?: string;
  }

  export function VoiceCopilot({
    onTranscription,
    className,
  }: VoiceCopilotProps) {
    const [mode, setMode] = useState<Mode>("dictation");
    const [status, setStatus] = useState<Status>("idle");
    const [answer, setAnswer] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { startRecording, stopRecording } = useRecorder();

    const handlePTTStart = useCallback(async () => {
      setError(null);
      setAnswer(null);
      setStatus("recording");
      await startRecording();
    }, [startRecording]);

    const handlePTTEnd = useCallback(async () => {
      setStatus("processing");
      const audioBlob = await stopRecording();
      if (!audioBlob) {
        setStatus("idle");
        return;
      }

      try {
        const fd = new FormData();
        fd.append("audio", audioBlob, "recording.webm");

        const transcribeRes = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: fd,
        });
        if (!transcribeRes.ok) throw new Error("Transcription failed");
        const { data: transcribeData } = (await transcribeRes.json()) as {
          data: { text: string };
        };

        if (mode === "dictation") {
          onTranscription?.(transcribeData.text);
          setStatus("idle");
          return;
        }

        // Conversational mode: get IICRC-grounded answer
        const respondRes = await fetch("/api/voice/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: transcribeData.text }),
        });
        if (!respondRes.ok) throw new Error("Response generation failed");
        const { data: respondData } = (await respondRes.json()) as {
          data: {
            answer: string;
            audioBase64: string | null;
            mimeType: string | null;
          };
        };

        setAnswer(respondData.answer);

        if (respondData.audioBase64 && respondData.mimeType) {
          setStatus("speaking");
          const audio = new Audio(
            `data:${respondData.mimeType};base64,${respondData.audioBase64}`,
          );
          audioRef.current = audio;
          audio.onended = () => setStatus("idle");
          await audio.play();
        } else {
          setStatus("idle");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Voice processing failed",
        );
        setStatus("idle");
      }
    }, [mode, stopRecording, onTranscription]);

    const isDisabled = status === "processing" || status === "speaking";

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "dictation" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("dictation");
              setAnswer(null);
            }}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Dictate
          </Button>
          <Button
            variant={mode === "conversational" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("conversational");
              setAnswer(null);
            }}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Ask IICRC
          </Button>
        </div>

        {/* Push-to-talk button */}
        <Button
          variant={status === "recording" ? "destructive" : "secondary"}
          size="lg"
          className="w-full h-16 select-none touch-none"
          onPointerDown={handlePTTStart}
          onPointerUp={handlePTTEnd}
          disabled={isDisabled}
          aria-label={
            status === "recording"
              ? "Recording — release to process"
              : `Hold to ${mode === "dictation" ? "dictate" : "ask IICRC"}`
          }
        >
          {status === "recording" && (
            <>
              <MicOff className="h-5 w-5 mr-2" />
              Release to {mode === "dictation" ? "Fill" : "Ask"}
            </>
          )}
          {status === "processing" && (
            <>
              <Mic className="h-5 w-5 mr-2 animate-pulse" />
              Processing...
            </>
          )}
          {status === "speaking" && (
            <>
              <Mic className="h-5 w-5 mr-2" />
              Playing answer...
            </>
          )}
          {status === "idle" && (
            <>
              <Mic className="h-5 w-5 mr-2" />
              Hold to {mode === "dictation" ? "Dictate" : "Ask"}
            </>
          )}
        </Button>

        {/* Error display */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Answer display (conversational mode only) */}
        {answer && mode === "conversational" && (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <Badge variant="outline" className="mb-2 text-xs">
              IICRC Answer
            </Badge>
            <p className="leading-relaxed">{answer}</p>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **11.2 — Type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit components/voice/VoiceCopilot.tsx
  ```

  Expected: no output.

- [ ] **11.3 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add components/voice/VoiceCopilot.tsx
  git commit -m "feat(voice): add VoiceCopilot component (PTT dictation + conversational IICRC mode)"
  ```

- [ ] **11.4 — Manual integration test**

  Add the component to any existing dashboard form page temporarily to verify end-to-end. For example, at the top of `app/dashboard/inspections/new/page.tsx`, import and render:

  ```tsx
  import { VoiceCopilot } from "@/components/voice/VoiceCopilot";
  // ... inside the JSX:
  <VoiceCopilot
    onTranscription={(text) => console.log("Transcribed:", text)}
    className="max-w-sm"
  />;
  ```

  Verification steps:
  1. Open `http://localhost:3000/dashboard/inspections/new` in Chrome
  2. Switch to **Dictate** mode. Hold the button, say "Severe moisture damage to subfloor", release.
     - Expected: browser console logs `Transcribed: Severe moisture damage to subfloor`
     - Expected: button returns to idle state
  3. Switch to **Ask IICRC** mode. Hold the button, say "What is a Class 3 water loss?", release.
     - Expected: button shows "Processing..." briefly, then "Playing answer..."
     - Expected: ElevenLabs audio plays with the Claude-generated answer
     - Expected: the answer text appears below the button with the "IICRC Answer" badge
     - Expected: answer cites `IICRC S500:2025` with a section number
  4. Remove the temporary import from the page after verification.

---

## Task 12: Update .env.example

**What:** Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to `.env.example`. `OPENAI_API_KEY` is already present at line 68 — no change needed for that. The two new ElevenLabs variables must be added so the team knows they exist.

### Steps

- [ ] **12.1 — Verify OPENAI_API_KEY is already in .env.example**

  Read line 68 of `.env.example`. Confirm it contains:

  ```
  OPENAI_API_KEY="sk-..."
  ```

  If present, no change needed for OpenAI.

- [ ] **12.2 — Add ElevenLabs variables**

  In `.env.example`, locate the section:

  ```
  # OpenAI (alternative AI provider)
  OPENAI_API_KEY="sk-..."
  ```

  Replace with:

  ```
  # OpenAI (Whisper transcription + text-embedding-3-small for RAG)
  OPENAI_API_KEY="sk-..."

  # ElevenLabs TTS (voice copilot audio responses)
  # Get voice ID from https://elevenlabs.io/voice-library or your cloned voice
  ELEVENLABS_API_KEY="sk_..."
  ELEVENLABS_VOICE_ID="your-voice-id-here"
  ```

- [ ] **12.3 — Run full type-check**

  ```bash
  cd D:/RestoreAssist
  npx tsc --noEmit
  ```

  Expected: zero type errors across the entire project.

- [ ] **12.4 — Run all new tests together**

  ```bash
  cd D:/RestoreAssist
  npx vitest run lib/rag/__tests__/ lib/vision/__tests__/ "app/api/vision/extract-reading/__tests__/" "app/api/voice/transcribe/__tests__/" "app/api/voice/respond/__tests__/"
  ```

  Expected output:

  ```
  ✓ lib/rag/__tests__/prisma-iicrc-chunk.test.ts (1)
  ✓ lib/rag/__tests__/embed.test.ts (3)
  ✓ lib/rag/__tests__/retrieve.test.ts (3)
  ✓ lib/vision/__tests__/meter-prompts.test.ts (10)
  ✓ app/api/vision/extract-reading/__tests__/route.test.ts (4)
  ✓ app/api/voice/transcribe/__tests__/route.test.ts (4)
  ✓ app/api/voice/respond/__tests__/route.test.ts (6)

  Test Files  7 passed (7)
  Tests       31 passed (31)
  ```

- [ ] **12.5 — Commit**

  ```bash
  cd D:/RestoreAssist
  git add .env.example
  git commit -m "chore: add ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID to .env.example"
  ```

---

## Summary: New Files Created

| File                                                                 | Purpose                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `prisma/schema.prisma`                                               | Modified — added pgvector extension + `IicrcChunk` model |
| `prisma/migrations/<timestamp>_add_iicrc_rag_pgvector/migration.sql` | DB migration                                             |
| `lib/rag/embed.ts`                                                   | OpenAI `text-embedding-3-small` wrapper                  |
| `lib/rag/retrieve.ts`                                                | pgvector cosine similarity search                        |
| `lib/rag/__tests__/prisma-iicrc-chunk.test.ts`                       | Migration smoke test                                     |
| `lib/rag/__tests__/embed.test.ts`                                    | Embed unit tests                                         |
| `lib/rag/__tests__/retrieve.test.ts`                                 | Retrieve unit tests                                      |
| `scripts/ingest-iicrc.ts`                                            | Idempotent IICRC PDF ingestion script                    |
| `lib/standards-retrieval.ts`                                         | Modified — vector store fast path added                  |
| `lib/vision/meter-prompts.ts`                                        | Brand-specific Claude Vision prompts + JSON parser       |
| `lib/vision/__tests__/meter-prompts.test.ts`                         | Prompt + parser unit tests                               |
| `app/api/vision/extract-reading/route.ts`                            | Claude Vision meter reading endpoint                     |
| `app/api/vision/extract-reading/__tests__/route.test.ts`             | Vision route unit tests                                  |
| `lib/voice/recorder.ts`                                              | `useRecorder` hook (MediaRecorder PTT)                   |
| `app/api/voice/transcribe/route.ts`                                  | Whisper-1 transcription endpoint                         |
| `app/api/voice/transcribe/__tests__/route.test.ts`                   | Transcription route unit tests                           |
| `app/api/voice/respond/route.ts`                                     | RAG + Claude + ElevenLabs TTS endpoint                   |
| `app/api/voice/respond/__tests__/route.test.ts`                      | Respond route unit tests                                 |
| `components/voice/VoiceCopilot.tsx`                                  | PTT UI component                                         |
| `.env.example`                                                       | Modified — added ElevenLabs variables                    |

## Summary: Environment Variables Required

| Variable                 | Where to get it             | Required?                    |
| ------------------------ | --------------------------- | ---------------------------- |
| `OPENAI_API_KEY`         | platform.openai.com         | Yes (embeddings + Whisper)   |
| `ANTHROPIC_API_KEY`      | console.anthropic.com       | Yes (Vision + respond)       |
| `ELEVENLABS_API_KEY`     | elevenlabs.io/app/profile   | No (TTS gracefully degrades) |
| `ELEVENLABS_VOICE_ID`    | elevenlabs.io/voice-library | No (TTS gracefully degrades) |
| `DATABASE_URL`           | Already configured          | Yes (pgvector queries)       |
| Google Drive credentials | Already configured          | Yes (ingestion script)       |

## VERIFICATION CHECKLIST

Before marking this plan complete, verify each item:

1. **Where to check:** DB row count
   **How:** Run `SELECT COUNT(*) FROM "IicrcChunk" WHERE embedding IS NOT NULL;` via Prisma Studio or psql
   **What to see:** Row count matches the `Inserted` number from `scripts/ingest-iicrc.ts`
   **What NOT to see:** `0 rows` or `relation "IicrcChunk" does not exist`

2. **Where to check:** `/api/voice/transcribe`
   **How:** Open any inspection form, hold VoiceCopilot PTT button in Dictate mode, speak a sentence
   **What to see:** Form field populated with transcribed text within ~3 seconds
   **What NOT to see:** No text, browser console errors, 401/400 responses

3. **Where to check:** `/api/voice/respond`
   **How:** Switch to "Ask IICRC" mode, hold button, ask "What equipment do I need for a Class 2 water loss?"
   **What to see:** Audio plays with IICRC-cited answer; text answer includes "S500" and a section number
   **What NOT to see:** Generic answer without citations, silent response with no text displayed

4. **Where to check:** `/api/vision/extract-reading`
   **How:** POST a base64 JPEG of a Delmhorst meter showing "22.5" to the endpoint with `brandHint: "delmhorst"`
   **What to see:** `{ data: { brand: "Delmhorst", value: 22.5, unit: "%", confidence: > 0.7 } }`
   **What NOT to see:** `{ data: { value: null, confidence: 0 } }`

5. **Where to check:** `lib/standards-retrieval.ts` at runtime
   **How:** Generate any water damage report — check server logs for `[standards-retrieval]`
   **What to see:** No log line (vector store succeeded silently) OR `Retrieved N relevant IICRC sections from vector store`
   **What NOT to see:** `[standards-retrieval] Vector store unavailable` if vector store is populated
