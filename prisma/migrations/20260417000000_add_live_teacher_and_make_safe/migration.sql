-- RA-1132a: AI Live Teacher + RA-1136a: Make-Safe compliance
-- Generated: 2026-04-17
-- --create-only: this migration is NOT applied. Review before `prisma migrate deploy`.
-- Safe migration: only adds new tables + pgvector column. No destructive changes.

-- ============================================================
-- pgvector extension (idempotent — shared with IicrcChunk embeddings)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- LiveTeacherSession: per-inspection hybrid (on-device + cloud) AI session
-- ============================================================
CREATE TABLE IF NOT EXISTS "LiveTeacherSession" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "modelUsedLocal" TEXT,
    "modelUsedCloud" TEXT,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostAudCents" INTEGER NOT NULL DEFAULT 0,
    "jurisdiction" TEXT NOT NULL,
    "deviceOs" TEXT NOT NULL,
    "hadLidar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LiveTeacherSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LiveTeacherSession_inspectionId_idx"
    ON "LiveTeacherSession"("inspectionId");

CREATE INDEX IF NOT EXISTS "LiveTeacherSession_userId_startedAt_idx"
    ON "LiveTeacherSession"("userId", "startedAt");

ALTER TABLE "LiveTeacherSession"
    ADD CONSTRAINT "LiveTeacherSession_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- TeacherUtterance: individual turn in a teacher session
-- ============================================================
CREATE TABLE IF NOT EXISTS "TeacherUtterance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "clauseRefs" TEXT[],
    "confidence" DOUBLE PRECISION,
    "userOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "ranOnDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherUtterance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeacherUtterance_sessionId_turnIndex_idx"
    ON "TeacherUtterance"("sessionId", "turnIndex");

ALTER TABLE "TeacherUtterance"
    ADD CONSTRAINT "TeacherUtterance_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- TeacherToolCall: tool invocations made during a teacher session
-- ============================================================
CREATE TABLE IF NOT EXISTS "TeacherToolCall" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "utteranceId" TEXT,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherToolCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeacherToolCall_sessionId_idx"
    ON "TeacherToolCall"("sessionId");

CREATE INDEX IF NOT EXISTS "TeacherToolCall_toolName_idx"
    ON "TeacherToolCall"("toolName");

ALTER TABLE "TeacherToolCall"
    ADD CONSTRAINT "TeacherToolCall_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- StandardsChunk: RAG corpus for IICRC S500, AS/NZS 4849.1 / 4360, NZBS E2/E3
-- embedding column is pgvector and not modelled in Prisma (see below).
-- ============================================================
CREATE TABLE IF NOT EXISTS "StandardsChunk" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,

    CONSTRAINT "StandardsChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StandardsChunk_standard_edition_clause_key"
    ON "StandardsChunk"("standard", "edition", "clause");

CREATE INDEX IF NOT EXISTS "StandardsChunk_standard_jurisdiction_idx"
    ON "StandardsChunk"("standard", "jurisdiction");

-- pgvector column (not modelled in Prisma — accessed via $queryRaw)
ALTER TABLE "StandardsChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW approximate nearest-neighbour index for cosine similarity search
CREATE INDEX IF NOT EXISTS standards_chunk_embedding_idx
    ON "StandardsChunk" USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- RA-1136a: MakeSafeAction — P0 hazard-control gate per inspection
-- Unique (inspectionId, action) enforces idempotent upsert semantics.
-- ============================================================
CREATE TABLE IF NOT EXISTS "MakeSafeAction" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakeSafeAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MakeSafeAction_inspectionId_action_key"
    ON "MakeSafeAction"("inspectionId", "action");

CREATE INDEX IF NOT EXISTS "MakeSafeAction_inspectionId_idx"
    ON "MakeSafeAction"("inspectionId");

ALTER TABLE "MakeSafeAction"
    ADD CONSTRAINT "MakeSafeAction_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
