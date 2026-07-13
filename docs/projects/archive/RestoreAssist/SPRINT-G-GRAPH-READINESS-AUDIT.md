# Sprint G Graph-Readiness Audit

**Issue:** RA-625
**Source:** CEO Board LightRAG memo (RA-623) — Action 3
**Date:** 2026-04-12
**Audited schema:** `prisma/schema.prisma` (4,740 lines, 127 models)
**Recommendation:** **Adjust-in-place** — 60% graph-ready today; Phase-2 refinements required before LightRAG swap

---

## Overall Scorecard

| Dimension                                           | Score       | Notes                                                                     |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| Entity identity (stable UUID + type discriminator)  | 3/5         | UUIDs present everywhere; type discriminator fields absent                |
| Explicit join tables (no embedded JSON)             | 4/5         | Workflow/Evidence well-structured; Photo↔Material embedded                |
| Edge type labels (`relationType` field)             | 2/5         | Absent; enum-based classification only                                    |
| Temporal fields on edges                            | 4/5         | `createdAt`/`updatedAt` pervasive; `observedAt` missing on edge tables    |
| Provenance (`source`/`confidence` on derived edges) | 3/5         | `capturedById`/`verifiedById` excellent on EvidenceItem; sparse elsewhere |
| Multi-tenant isolation (`workspaceId`)              | 3/5         | Present on major models; not universal                                    |
| Vector/embedding support                            | 3/5         | IicrcChunk has pgvector; HistoricalJob embeddings absent                  |
| **Overall**                                         | **3.1 / 5** | **Adjust-in-place: 1–2 sprint cycles**                                    |

---

## Model-by-Model Audit

### Sprint G Core Models

| Model                  | Stable UUID | Type discriminator                 | Explicit joins       | `relationType` | `createdAt` on edges         | Provenance                                                 | Graph-ready   |
| ---------------------- | ----------- | ---------------------------------- | -------------------- | -------------- | ---------------------------- | ---------------------------------------------------------- | ------------- |
| **Inspection**         | ✅ cuid()   | ❌ no                              | N/A (root node)      | —              | —                            | —                                                          | 🟡 Partial    |
| **InspectionPhoto**    | ✅ cuid()   | ❌ no                              | ❌ embedded JSON     | —              | —                            | —                                                          | 🔴 Weak       |
| **InspectionWorkflow** | ✅ cuid()   | ✅ `jobType`                       | ✅ `steps[]`         | —              | `startedAt`, `completedAt`   | —                                                          | 🟢 Good       |
| **WorkflowStep**       | ✅ cuid()   | ✅ `stepKey`                       | ✅ `evidenceItems[]` | —              | `startedAt`, `completedAt`   | —                                                          | 🟢 Good       |
| **EvidenceItem**       | ✅ cuid()   | ✅ `evidenceClass` enum (17 types) | ✅ WorkflowStep FK   | ❌ missing     | `capturedAt`, `createdAt`    | `capturedById`, `verifiedById`, `verifiedAt`, `hashSha256` | 🟢 **Strong** |
| **ExceptionReason**    | ✅ cuid()   | ❌ `reasonCode` only               | ✅ 1:1 EvidenceItem  | ❌ missing     | `createdAt`                  | `approvedById`, `approvedAt`                               | 🟡 Partial    |
| **MediaAsset**         | ✅ cuid()   | ❌ no                              | ✅ `MediaAssetTag[]` | —              | `capturedAt`, `uploadedAt`   | —                                                          | 🟢 Good       |
| **MediaAssetTag**      | ✅ cuid()   | ✅ `category`+`value` pattern      | ✅ explicit bridge   | —              | `createdAt`                  | —                                                          | 🟢 **Strong** |
| **HistoricalJob**      | ✅ cuid()   | ❌ no explicit type                | —                    | —              | `createdAt`, `completedDate` | `source` ("ascora","manual")                               | 🟡 Partial    |
| **IicrcChunk**         | ✅ cuid()   | ✅ `standard`+`section`            | —                    | —              | `createdAt`                  | —                                                          | 🟢 Good       |

---

## Implicit JSON Anti-Patterns (Critical)

These patterns block clean graph migration — they must become explicit join tables.

### Pattern 1 — Multi-valued arrays in InspectionPhoto

```prisma
// CURRENT (anti-pattern)
model InspectionPhoto {
  affectedMaterial          String[]   // Array of material name strings
  secondaryDamageIndicators String[]   // Array of indicator codes
  damageCategory            String?    // Magic string e.g. "CAT_1"
  damageClass               String?    // Magic string e.g. "CLASS_2"
  roomType                  String?    // Magic string e.g. "KITCHEN"
  moistureSource            String?    // Magic string e.g. "FLEXI_HOSE"
}
```

**Impact:** Cannot traverse `Photo → Material` as a graph edge without full denormalization.

**Graph-ready target:**

```prisma
model InspectionPhotoMaterial {
  id           String          @id @default(cuid())
  photoId      String
  photo        InspectionPhoto @relation(fields: [photoId], references: [id], onDelete: Cascade)
  materialType String          // "drywall", "carpet", etc.
  relationType String          @default("affectedMaterial")
  createdAt    DateTime        @default(now())
  @@unique([photoId, materialType])
}
```

### Pattern 2 — Soft foreign key in EvidenceItem

```prisma
// CURRENT (anti-pattern)
moistureReadingLink String? // Untyped string pointing to MoistureReading.id — no enforced constraint
```

**Impact:** Graph backends require explicit edge models; no bidirectional traversal possible.

### Pattern 3 — Missing category entities

ContaminationCategory, MaterialCategory, RoomCategory, and ClassificationLevel do not exist as first-class models. All categorical lookups are magic strings. Graph node lookup by category type is impossible.

---

## Gaps Blocking `lib/knowledge/index.ts`

| Gap                                                                         | Blocks knowledge layer?                                                                                       | Migration required?                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| No `type` discriminator on `Inspection`, `InspectionPhoto`, `HistoricalJob` | **No** — can add `@default("Inspection")` programmatically                                                    | Optional; `@default` handles new rows |
| Embedded JSON in `InspectionPhoto.affectedMaterial[]`                       | **Partial** — `findRelated` can still query on EvidenceItem/WorkflowStep; Photo→Material traversal is blocked | Yes — new join table required         |
| No `relationType` on edges                                                  | **No** — can hard-code edge labels in TS; schema label is for LightRAG swap only                              | Phase-2 only                          |
| Missing `HistoricalJob` embeddings                                          | **No** — `expandContext` can fall back to pgvector on IicrcChunk only                                         | Phase-2                               |
| Missing category entities                                                   | **No** — lookup tables can be seeded in-memory; schema cleanup is Phase-2                                     | Phase-2                               |

**Conclusion: `lib/knowledge/index.ts` can be built on the current schema today**, targeting EvidenceItem → WorkflowStep → Inspection traversal chains. Photo→Material graph queries are deferred to Phase-2 migration.

---

## Required Migrations

### Blocking (must ship before LightRAG swap)

```sql
-- 1. Type discriminators (additive, no data loss)
ALTER TABLE "Inspection"      ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'Inspection';
ALTER TABLE "InspectionPhoto" ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'Photo';
ALTER TABLE "HistoricalJob"   ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'HistoricalJob';

-- 2. Photo → Material join table (replaces embedded String[])
CREATE TABLE "InspectionPhotoMaterial" (
  id           TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "photoId"    TEXT      NOT NULL REFERENCES "InspectionPhoto"(id) ON DELETE CASCADE,
  "materialType" TEXT    NOT NULL,
  "relationType" TEXT    NOT NULL DEFAULT 'affectedMaterial',
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("photoId", "materialType")
);
-- Backfill: one row per element in InspectionPhoto.affectedMaterial[]

-- 3. Category lookup tables
CREATE TABLE "DamageCategory" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code        TEXT UNIQUE NOT NULL,  -- 'CAT_1', 'CAT_2', 'CAT_3'
  label       TEXT NOT NULL,
  s500Section TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Non-blocking (Phase-2 hardening)

- Add `relationType TEXT DEFAULT 'evidenceCapture'` to `EvidenceItem`
- Add `confidence FLOAT` and `provenance TEXT` to AI-inferred edge rows
- Add `HistoricalJobEmbedding` model (pgvector 1536) mirroring `IicrcChunk` pattern
- Replace `EvidenceItem.moistureReadingLink String?` with enforced FK

---

## Recommendation per Issue

| Linear issue | Sprint G model area      | Verdict                                                                                   |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| RA-397       | Inspection core          | **Ship-as-is** — UUID/temporal present; add `nodeType` in Phase-2                         |
| RA-398       | InspectionWorkflow       | **Ship-as-is** — `jobType` + explicit steps[] = graph-ready                               |
| RA-399       | WorkflowStep             | **Ship-as-is** — `stepKey` + evidenceItems[] = graph-ready                                |
| RA-400       | EvidenceItem             | **Ship-as-is** — strongest graph-ready model in schema                                    |
| RA-401       | InspectionPhoto          | **Adjust-in-place** — embedded JSON arrays block Photo→Material graph; Phase-2 migration  |
| RA-402       | ExceptionReason          | **Ship-as-is** — minor missing `relationType`; non-blocking                               |
| RA-406       | MediaAsset/Tag           | **Ship-as-is** — category+value tag bridge is graph-ready                                 |
| RA-411       | MoistureReading          | **Adjust-in-place** — soft FK in EvidenceItem should become enforced; Phase-2             |
| RA-437       | HistoricalJob embeddings | **Block on Phase-2** — `HistoricalJobEmbedding` model missing; needed for `expandContext` |

---

## Phase-2 Work Items (Raise as Linear Issues)

| Description                                                                       | Priority | Blocks                                               |
| --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| Create `InspectionPhotoMaterial` join table + migration                           | High     | Photo→Material graph traversal                       |
| Create `DamageCategory`, `RoomType`, `MoistureSource` lookup tables               | Medium   | Category node queries                                |
| Add `nodeType` discriminators to `Inspection`, `InspectionPhoto`, `HistoricalJob` | Medium   | Generic graph node type queries                      |
| Add `HistoricalJobEmbedding` model (pgvector)                                     | Medium   | `expandContext` similarity for historical jobs       |
| Replace `EvidenceItem.moistureReadingLink` soft FK with enforced relation         | Low      | MoistureReading↔EvidenceItem bidirectional traversal |

_This audit was conducted 2026-04-12 against the main branch of RestoreAssist (commit 23198d01). Raise Phase-2 items as separate Linear issues before committing to LightRAG as a production backend._
