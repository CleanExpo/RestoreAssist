# Wave 2 Implementation Prep — Artifact Grep Consolidated (SP-G + SP-6 + SP-H)

**Date:** 2026-05-15
**Status:** Pre-implementation reference. Reduces re-scaffolding work when Phill greenlights Wave 2 implementation by mapping every spec-promised artifact to its existing precedent (if any) or clean-slate status.

**Generated via:** 3 parallel Explore-agent artifact greps per memory rule `[[pre-dispatch-artifact-grep]]`. Each was tasked with: read the spec + brainstorm-processed pack, then grep the codebase for promised primitives BEFORE implementation kicks off.

---

## Why this doc exists

Wave 2 specs (SP-G AI Setup Agent + SP-6 Email Provider BYOK + SP-H Knowledge Substrate) all propose new Prisma models, library modules, and API routes. Without this prep, the implementation agents would re-scaffold primitives that already exist — costing tokens and creating duplicate code. The memory rule `pre-dispatch-artifact-grep` came from the lived experience of SP-G's brainstorm-processing flagging `LiveTeacherSession`/`TeacherUtterance`/`TeacherToolCall` at `prisma/schema.prisma:6090-6140` — a near-miss that would have created duplicate models.

When Phill approves the brainstorm-processed packs, implementation kicks off with this doc as the "extend, not replace" map.

---

## SP-G AI Setup Agent

**Spec:** `docs/superpowers/specs/2026-05-15-sp-g-ai-setup-agent-design.md`
**Brainstorm-processed:** `docs/superpowers/specs/2026-05-15-sp-g-brainstorm-processed.md`

### ALREADY EXISTS (do NOT re-scaffold)

| Spec-promised primitive                                     | Existing precedent                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `TeacherSession` Prisma model                               | `LiveTeacherSession` @ `prisma/schema.prisma:6090-6110`                                            |
| `TeacherTurnRecord` Prisma model                            | `TeacherUtterance` @ `prisma/schema.prisma:6112-6127`                                              |
| Tool-call tracking model                                    | `TeacherToolCall` @ `prisma/schema.prisma:6129-6143`                                               |
| `User.liveTeacherSessions` relation                         | `prisma/schema.prisma:1963`                                                                        |
| BYOK storage export (Sidekick → BYOK)                       | `exportClosedJobToBYOKStorage()` @ `lib/queue/exportClosedJobToBYOKStorage.ts`                     |
| Storage dispatcher                                          | `getStorageProvider()` @ `lib/storage/index.ts`                                                    |
| Help types/schema                                           | `lib/help/types.ts` + `lib/help/frontmatter-schema.ts`                                             |
| Help MDX loader                                             | `lib/help/load-article.ts`                                                                         |
| Offline job cache                                           | `lib/offline/job-cache.ts`                                                                         |
| Offline inspection store                                    | `lib/offline/inspection-store.ts`                                                                  |
| Lifecycle hook framework (credit deduction + BYOK override) | `lib/ai/lifecycle/_shared.ts:58-137`                                                               |
| AuditLog model                                              | `prisma/schema.prisma:2799-2829` (ready for `AI_SIDEKICK_*` actions)                               |
| Shadcn Sheet component                                      | `components/ui/sheet.tsx` (139 lines)                                                              |
| Live-teacher router                                         | `lib/live-teacher/router.ts`                                                                       |
| Live-teacher context engine                                 | `lib/live-teacher/context-engine.ts`                                                               |
| Claude cloud client                                         | `lib/live-teacher/claude-cloud.ts` (TODO at :188 — ready for tool definitions)                     |
| Tool registry                                               | `lib/live-teacher/tools/index.ts`                                                                  |
| 6 existing tools                                            | take-reading, capture-photo, start-lidar-scan, fill-scope-item, flag-whs-hazard, check-report-gaps |

### TO CREATE (clean slate)

1. `lookup-iicrc.ts` — IICRC clause search tool (**depends on SP-H vector store**)
2. `method-recommendation.ts` — Method suggestion tool (depends on SP-H knowledge base)
3. `analyse-photo.ts` — Vision-based photo analysis tool
4. `SidekickPanel.tsx` — Bottom-sheet container component
5. `TurnHistory.tsx` — Scrollable turn list UI
6. `TextComposer.tsx` — Textarea + send button
7. `VoiceAfford.tsx` — "Voice coming soon" placeholder (until Wave 1 Web Speech ships, brainstorm Q2)
8. `ToolResultsDisplay.tsx` — Renders lookup/method/photo results

### EXTEND, NOT REPLACE

- `lib/live-teacher/claude-cloud.ts:188` — wire 3 new tool definitions into `tools` array
- `lib/live-teacher/tools/index.ts` — add 3 new handlers to export
- `app/api/live-teacher/turn/route.ts` — wire tool-call post-response handler + result capture
- `app/dashboard/inspections/[id]/page.tsx` — mount `<SidekickPanel>` in Suspense boundary
- `prisma/schema.prisma` Organization model — add `byokAiProvider` + `byokAiProviderKey` (if not yet present)

### SCHEMA NOTES

**No duplication risk.** Brainstorm-processed already flagged the LiveTeacher\* models; this confirms safe to extend.

---

## SP-6 Email Provider BYOK

**Spec:** `docs/superpowers/specs/2026-05-15-sp-6-email-provider-byok-design.md`
**Brainstorm-processed:** `docs/superpowers/specs/2026-05-15-sp-6-brainstorm-processed.md`

### ALREADY EXISTS (do NOT re-scaffold)

| Spec-promised primitive                                | Existing precedent                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend SDK integration (singleton + 10 send functions) | `lib/email.ts:1-15` (all 10 hardcoded to `getResendClient()`)                                                                                                              |
| AES-256-GCM credential encryption                      | `lib/credential-vault.ts` (90 LOC) — `encrypt()` / `decrypt()` with multi-key fallback                                                                                     |
| Provider abstraction pattern (mirror this)             | `lib/storage/types.ts` (StorageProvider interface) + `lib/storage/index.ts` (factory) + 3 providers (`supabase-provider.ts`, `s3-provider.ts`, `google-drive-provider.ts`) |
| Async queue + retry pattern (mirror this)              | `lib/queue/storage-mirror.ts` (StorageMirrorJob model + cron + retry logic)                                                                                                |
| Email HTML sanitization (CLAUDE.md rule 12)            | `lib/email.ts:36-43` (`escapeHtml()` + `sanitiseEmailField()`)                                                                                                             |
| Organization model BYOK field pattern                  | `Organization.storageProvider` + `storageProviderRefreshToken` + `storageProviderAccessToken`                                                                              |

### TO CREATE (clean slate)

1. `lib/email/types.ts` — `EmailProvider` interface, `EmailPayload`, `EmailClass` enum
2. `lib/email/resend-provider.ts` — wraps existing Resend SDK as provider class
3. `lib/email/sendgrid-provider.ts` — `@sendgrid/mail` package (NOT in package.json yet — add)
4. `lib/email/index.ts` — `getEmailProvider(orgId, emailClass)` factory; replaces hardcoded Resend calls
5. `lib/queue/email-send.ts` — EmailSendJob queue + processNextBatch + 5-attempt exponential backoff
6. `app/api/cron/email-send/route.ts` — Vercel cron handler
7. `app/api/email/validate/route.ts` — POST validation endpoint
8. `app/api/email/test-send/route.ts` — POST test-send endpoint
9. `app/dashboard/settings/email/page.tsx` — settings UI

### EXTEND, NOT REPLACE

- **All 10 email send functions in `lib/email.ts`** — refactor to call `getEmailProvider(orgId, emailClass)` instead of hardcoded Resend; add `emailClass` parameter; enqueue EmailSendJob for audit
- **Organization model** (Prisma) — add 5 fields:
  - `emailProvider EmailProviderType @default(PLATFORM_RESEND)`
  - `emailProviderEncryptedCredentials String?` (AES-256-GCM via credential-vault)
  - `emailProviderDomain String?`
  - `emailProviderDomainVerified Boolean @default(false)`
  - `emailProviderLastValidatedAt DateTime?`
  - `emailProviderValidationError String?`
  - `replyToEmail String?` (per-org override; brainstorm Q6)
- **New Prisma enums:**
  - `EmailProviderType { PLATFORM_RESEND | RESEND | SENDGRID }` (SES deferred per brainstorm)
  - `EmailProviderState { ACTIVE | PAUSED_DKIM_PENDING | DISABLED }`
  - `EmailClass { TRANSACTIONAL | BUSINESS }`

### SCHEMA NOTES

**No duplication risk.** No existing `EmailIntegration`, `EmailSendJob`, or `EmailProviderType` enum. Clean slate for Prisma additions.

### CRITICAL DEPENDENCY

`lib/email.ts` 10 send functions need `orgId` parameter on every call site. Trace via grep — particularly:

- `app/api/team/invites/route.ts` (sendInviteEmail)
- `app/api/authority-forms/[id]/send-completed/route.ts` (sendSignedFormEmail)
- Stripe webhook routes (sendPaymentFailedEmail, etc.)

This refactor is the riskiest part of SP-6 implementation. Consider it the long pole.

---

## SP-H Knowledge Substrate

**Spec:** `docs/superpowers/specs/2026-05-15-sp-h-knowledge-substrate-design.md`
**Brainstorm-processed:** `docs/superpowers/specs/2026-05-15-sp-h-brainstorm-processed.md` (all 7 defaults approved)

### ALREADY EXISTS (do NOT re-scaffold)

| Spec-promised primitive                | Existing precedent                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI `text-embedding-3-small` wiring | `lib/rag/embed.ts:1-38` — `embedText()`, `embedBatch()`, `EMBEDDING_MODEL = "text-embedding-3-small"`, 1536 dims                               |
| pgvector extension                     | `prisma/schema.prisma:18` — `extensions = [pgvector(map: "vector")]`                                                                           |
| `IicrcChunk` model precedent           | `prisma/schema.prisma:5777-5793` — separate table with embedding, section, heading, contentHash, pgvector HNSW index pattern (Q1+Q3 precedent) |
| `StandardsChunk` model precedent       | `prisma/schema.prisma:6145-6157` — embedding column planned at :6153, not yet migrated; parallel domain                                        |
| IICRC retrieval API                    | `lib/rag/retrieve.ts:24-52` — `retrieveChunks(query, k=5, standard?)` with cosine `<=>` SQL + `formatChunksAsContext()`                        |
| IICRC ingester template                | `scripts/ingest-iicrc.ts:1-135+` — chunking, `embedBatch()`, contentHash upsert by SHA-256, raw SQL INSERT                                     |
| AI usage logging                       | `lib/usage/log-usage.ts:1-124` — `logAiUsage()`, fire-and-forget, embedding cost trackable                                                     |
| Similar-jobs retrieval pattern         | `lib/ai/rag-context.ts:116+` — `retrieveSimilarJobs()`, pgvector cosine search + threshold filtering                                           |

### TO CREATE (clean slate)

1. `WikiChunk` Prisma model — per spec §4.2: FK to WikiPage, chunkIndex, heading, content, embedding vector(1536), contentHash, supersededAt, tags
2. `WikiPage` Prisma model — source vault file metadata + lastEmbeddedAt
3. `lib/knowledge/retrieve.ts` — generic `retrieve(query, filters?, topK?, threshold?)` API (consumed by SP-G's `lookup-iicrc` tool + future tools)
4. Wiki ingester extension — extends `~/Pi-CEO/Pi-Dev-Ops/scripts/sync_wiki_to_supabase.py` with chunk-by-H2 + OpenAI embed calls (Python, **outside RA repo** — Hermes cron host per brainstorm Q4)
5. Embedding-on-edit hook — per-page SHA-256 detection in the Python ingester

### EXTEND, NOT REPLACE

- `lib/rag/embed.ts` — no changes needed; current `embedText()` + `embedBatch()` are sufficient
- `lib/usage/log-usage.ts` — optional v1: add `taskType="wiki_embed_batch"` + `wiki_retrieval"` to `MODEL_PRICING` for finer cost tracking

### SCHEMA NOTES

**Verified no duplication.** `IicrcChunk` (PDF-domain) and `StandardsChunk` (standards-domain) are parallel — not duplicate — to the proposed `WikiChunk` (Obsidian-vault-domain). Each has domain-specific columns that would be NULLable bloat in a unified table. Brainstorm Q3 recommended separate-table; this artifact grep validates.

---

## Wave 2 implementation order recommendation

Given dependencies:

1. **SP-H first** (knowledge substrate) — SP-G's `lookup-iicrc` and `method-recommendation` tools both depend on the SP-H `retrieve()` API
2. **SP-G second** (AI Sidekick) — consumes SP-H
3. **SP-6 third** (email BYOK) — independent of SP-G + SP-H; ship in parallel if capacity allows, but its scope (10-function refactor) is the long pole

If running 3 implementation tracks in parallel, dispatch order:

- Track A: SP-H (~1 week — Prisma model + retrieve API + Python ingester extension)
- Track B: SP-G (~2 weeks — 8 new components + 3 new tools + tool-registry wiring; **gated on Track A's `retrieve()` API**)
- Track C: SP-6 (~2 weeks — 9 new files + 10-function refactor; independent)

---

## Verification Ledger

1. **What I did:** Consolidated 3 Explore-agent artifact greps (one per Wave 2 spec) into a single pre-implementation reference. Maps every spec-promised primitive to either an existing file:line precedent OR clean-slate status. Identifies "extend, not replace" cases. Documents Wave 2 dependencies.
2. **What I verified:** Each section sourced from a fresh Explore-agent grep run earlier in this session. Each row cites file:line. Cross-checked against brainstorm-processed packs' own findings (LiveTeacher, IicrcChunk) — consistent. Independence limit: same-vendor Sonnet self-review; no opus-adversary triggered (read-only doc, tier-1 stake).
3. **What would change my mind:** if a subsequent grep finds a primitive I missed (e.g., an existing `lib/email/providers/` directory) — that would invalidate the SP-6 "clean slate" claims. Mitigation: implementation agents should re-grep before scaffolding (the rule that produced this doc).

---

## Cross-references

- `[[pre-dispatch-artifact-grep]]` memory — the rule that drove this doc
- `[[orchestration-ceremony]]` memory — board-grade discipline
- SP-G design + brainstorm-processed
- SP-6 design + brainstorm-processed
- SP-H design + brainstorm-processed
- `docs/superpowers/specs/2026-05-15-customer-portal-multi-seat-design.md` — Wave 3 (depends on Wave 2)
