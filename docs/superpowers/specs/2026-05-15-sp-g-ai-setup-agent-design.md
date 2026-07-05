# SP-G — AI Setup Agent (design spec — DRAFT for Phill review)

> **Status:** Draft. Phill has NOT yet brainstormed this. Treat as a senior consultant's proposal grounded in existing code + SP-5 audit. Brainstorm cycle will refine.

---

## 0. Context

### 0.1 What the SP-5 audit said about SP-G

Section 6 of `2026-05-14-signin-jobclose-audit-design.md` defines SP-G (the AI Sidekick) as a **Live Teacher** surface that:
- Helps tradies research, do paperwork, analyse images, and ask for missing details during inspection
- Surfaces the 3 new missing tools (`lookup-iicrc`, `method-recommendation`, `analyse-photo`)
- Requires Prisma persistence (`TeacherSession` + `TeacherTurnRecord`), cost gating, audit logging, and a UI surface on the inspection detail page
- Is a 2-week build with multiple design brainstorm questions (UI shape, voice vs text trade-offs)

### 0.2 What's already built in `lib/live-teacher/`

**Existing scaffolding** (as of 2026-05-15):

| Component | Status | LOC |
|---|---|---|
| `types.ts` | ✅ Complete | ~66 |
| `router.ts` | ✅ Complete (routing logic: gemma_local vs claude_cloud) | ~65 |
| `context-engine.ts` | ✅ Complete (builds TeacherContext from RawInspectionState) | ~72 |
| `claude-cloud.ts` | ✅ Partial (Opus 4.7 client, cost calc, TODO: wire tool definitions) | ~276 |
| `tools/take-reading.ts` | ✅ Complete | — |
| `tools/capture-photo.ts` | ✅ Complete | — |
| `tools/start-lidar-scan.ts` | ✅ Complete | — |
| `tools/fill-scope-item.ts` | ✅ Complete | — |
| `tools/flag-whs-hazard.ts` | ✅ Complete | — |
| `tools/check-report-gaps.ts` | ✅ Complete | — |
| `app/api/live-teacher/session/route.ts` | ✅ Partial (POST create, GET list; idempotency, rate-limit) | ~80+ |
| `app/api/live-teacher/turn/route.ts` | ✅ Partial (POST turn dispatch, TODO: full tool registry) | ~60+ |
| **Unit tests** | ✅ Tests exist | `__tests__/*.test.ts` |

**Prisma models** (existing):
- `User.liveTeacherSession` relation missing → **to add**
- `Inspection.auditLogs` relation exists; AuditLog model at line 2799 ready to receive AI-action rows

### 0.3 What's missing (SP-G scope)

1. **Prisma persistence:** `TeacherSession` + `TeacherTurnRecord` models (append-only per CLAUDE.md rule 22)
2. **3 new tools:** `lookup-iicrc.ts`, `method-recommendation.ts`, `analyse-photo.ts` with input/output schemas
3. **Tool registry:** Wire tool definitions into `claude-cloud.ts` (currently TODOed at line 188)
4. **UI surface:** Bottom-sheet sidekick panel on `/dashboard/inspections/[id]/` with latest turn, suggested next action, push-to-talk, text composer
5. **Cost gating:** Wire `lib/live-teacher/_shared.ts` to subscription + credit (rules 8/9 from CLAUDE.md)
6. **Audit logging:** Every Sidekick action writes `AI_SIDEKICK_*` row to AuditLog
7. **Storage hook:** At job close (SP-A), mirror session transcripts to BYOK Drive per SP-E pattern
8. **Help Library integration:** Sidekick reads `/help-index.json` + `content/help/*.mdx` frontmatter (aiSummary, userIntents, successCriteria) to route user queries to setup actions and provide context-aware suggestions

---

## 1. Existing-code audit (files SP-G touches or extends)

| File | Role | SP-G dependency | Notes |
|---|---|---|---|
| `lib/live-teacher/types.ts` | Shared types | Core (no change) | `TeacherContext`, `TeacherStage`, `TeacherTurn`, `ToolName` already defined. SP-G extends toolset. |
| `lib/live-teacher/router.ts` | Routing logic | Core (no change) | `routeTurn(RoutingInput)` decides gemma_local vs claude_cloud. SP-G callers use this as-is. |
| `lib/live-teacher/context-engine.ts` | State snapshot | Core (no change) | `buildTeacherContext(RawInspectionState)` produces live context. SP-G hooks read this. |
| `lib/live-teacher/claude-cloud.ts` | Cloud client | Extend (wire tools) | Lines 188–189 TODO: currently `tools = []`. SP-G wires tool definitions here. |
| `lib/live-teacher/tools/index.ts` | Tool registry | Extend (add 3 new) | `TOOL_DEFINITIONS`, `TOOL_HANDLERS`. SP-G adds `lookup-iicrc`, `method-recommendation`, `analyse-photo`. |
| `lib/live-teacher/tools/*.ts` (existing 6) | Tool implementations | Extend (reference) | SP-G's new tools follow same pattern. |
| `app/api/live-teacher/session/route.ts` | Session lifecycle | Extend (add columns) | POST creates `liveTeacherSession` row; GET lists. SP-G adds `modelUsedLocal`, `totalLocalTokens` columns if Gemma path taken. |
| `app/api/live-teacher/turn/route.ts` | Turn dispatch | Extend (add tool call handler) | POST turns call `invokeClaudeCloud()`; SP-G adds post-response tool-call processing (fire, log, feed back to history). |
| `prisma/schema.prisma` | Data model | Add 2 models | `TeacherSession`, `TeacherTurnRecord` (append-only), migration needed. |
| `lib/help/types.ts` | Help schema | Read (no change) | `HelpFrontmatter` shape with `aiSummary`, `userIntents`, `successCriteria`. SP-G consumes these. |
| `lib/help/frontmatter-schema.ts` | Validation | Read (no change) | Zod schema validates frontmatter; SP-G calls parser on-demand. |
| `content/help/**/*.mdx` | Help content | Read (consume) | Frontmatter + body read as retrieval context for Sidekick queries. |
| `lib/audit/` | Audit trail | Extend | SP-G writes `AuditLog` rows with `action = "AI_SIDEKICK_*"`. Existing AuditLog at line 2799. |
| `app/dashboard/inspections/[id]/page.tsx` | Detail page | Extend (mount UI) | SP-G mounts `<SidekickPanel>` component. |

---

## 2. Goal in one sentence

**Shipped SP-G v1:** A tradie on an inspection detail page can text or speak to Claude Opus 4.7 (routed through on-device Gemma 3n for cheap turns), ask research questions (IICRC clauses, method recommendations, similar past jobs), request photo analysis, and receive IICRC-cited suggestions that are logged, cost-gated, and editable before commit.

---

## 3. Locked-in design constraints

1. **Editability invariant (from SP-5 Section 5.3):** Every AI output is a draft shown to the user before commit. No auto-action. Applies to all Sidekick suggestions.

2. **BYOK throughout (CLAUDE.md rule 18, SP-5 Section 10.2):** If `Organization.byokAiProvider` is set (OpenAI/Gemini/custom), route Sidekick turns through tenant's key, skip platform credits. BYOK flag must be configurable in setup wizard.

3. **Append-only session persistence (CLAUDE.md rule 22):** `TeacherTurnRecord` rows are inserted, never updated. Session history is immutable — survives audit, export, BYOK Drive mirror.

4. **Audit log per action (CLAUDE.md rule 22):** Every AI generation, tool call, and user-committed edit writes an `AuditLog` row with action like `AI_SIDEKICK_RESPONDED`, `AI_SIDEKICK_TOOL_LOOKUP_IICRC`, etc.

5. **Cost gating at invoke time (CLAUDE.md rules 8/9):** Subscription status (`TRIAL|ACTIVE|CANCELED`) checked before Claude cloud call. Atomic credit deduction. No post-hoc refunds. 402 on insufficient credits; render manual form fallback, never error.

6. **Text-first, voice deferred (SP-5 Section 6.3, CEO board Wave 2):** v1 ships text composer + push-to-talk UI affordance (text baseline). Actual voice mode (Web Speech API transcription + streaming) is Wave 3 candidate deferred with clear "Voice coming soon" UX.

7. **Help Library consumption (from SP-5 audit Section 6.4, SP-8 integration):** Sidekick reads `/help-index.json` (list of all published help articles with frontmatter) + loads full MDX content on demand. `userIntents` field in frontmatter is used to match user queries; `successCriteria` is returned as action items.

8. **Inspector-role only (CLAUDE.md rule 19):** Only users with role `TECHNICIAN` or `MANAGER` can initiate Sidekick sessions; `TECHNICIAN_JUNIOR` is hard-blocked (per existing role guard at User.isJuniorTechnician). Admin can view past sessions but not initiate new ones on behalf of tech.

---

## 4. Architecture

### 4.1 UI surface (bottom-sheet, justified)

**Recommendation:** Bottom-sheet panel anchored to the bottom of the inspection detail page, sliding up on "Ask Sidekick" tap, dismissible via swipe or X button.

**Justification:**
- On mobile (primary use case — tech on-site), a bottom-sheet preserves the inspection details above (photos, readings) for reference while the user chats.
- RA's existing patterns: `EngagementLicenceModal` (full-screen), `CapturePhotoFAB` (floating action), sign-off (`SignaturePad` — modal). Bottom-sheet is a new pattern but closest to "inspector + helper side-by-side."
- Desktop unfolds to a sidebar or right-panel.
- Minimal re-architecture of inspection detail page — mount `<SidekickPanel inspectionId={id} />` in a Suspense boundary.

**Components:**
- `components/sidekick/SidekickPanel.tsx` — main container, mounting logic
- `components/sidekick/TurnHistory.tsx` — scrollable turn list (user, assistant, editable drafts)
- `components/sidekick/TextComposer.tsx` — textarea + send button (always visible)
- `components/sidekick/VoiceAfford.tsx` — "microphone icon" (UI-only, no transcription yet; label "Voice coming in Wave 3")
- `components/sidekick/ToolResultsDisplay.tsx` — renders tool outputs (IICRC lookup results, photo analysis, method recommendations)

### 4.2 Text-only mode, voice deferred

**Wave 1 (v1):**
- TextComposer is the primary input.
- VoiceAfford is a disabled button with tooltip: "Voice support launching soon — for now, type or copy/paste your question."
- No Web Speech API, no streaming transcription.

**Wave 3:**
- Wire Web Speech API (getUserMedia → SpeechRecognition API on Chrome/Safari; Webkit fallback for Android).
- Push-to-talk UX: hold microphone button → red visual feedback → release to send transcript to turn endpoint.
- Handle offline gracefully (voice works offline; sends on reconnect).

### 4.3 Help Library integration

**How SP-G reads and uses help:**

1. **Load help index at session start:** When a Sidekick session is created (POST `/api/live-teacher/session`), fetch `/api/help/index.json` (or embed in session context) — a lightweight list of all published articles with `{ slug, title, aiSummary, userIntents, category }`.

2. **User query → intent match:** When the user asks "How do I take a photo with the camera?", use a fast semantic match (or simple keyword overlap) against `userIntents` across all help articles. Return top 3 matching articles.

3. **Article content + frontmatter:** For a matched article, load the full MDX + frontmatter. Extract `aiSummary` (1-sentence summary), `successCriteria` (action items the user should complete), and the body text.

4. **Sidekick context injection:** Inject the matched article into the Claude system prompt: 
   ```
   [Context: user asked about "taking photos"; matched help article "photo-cocoa" 
   says: [aiSummary]. If the user hasn't met the successCriteria yet, 
   suggest them as next steps.]
   ```

5. **Suggest actions from successCriteria:** If the article's successCriteria includes "GPS coordinates captured," and the latest photo in the inspection has no GPS, the Sidekick prompts: "I notice your last photo didn't have GPS — want me to help you re-capture with location enabled?"

**Example walk-through:**

- User: "I need to capture a moisture reading in the bedroom."
- Sidekick routes to `check_report_gaps` tool → identifies `moisture.bedroom` as missing.
- Simultaneously, help-index match finds `inspections/moisture-reading-guide.mdx` with `userIntents: ["how to take a moisture reading", "where to measure moisture", …]`.
- Sidekick returns: "I found a guide for you: [link to help article]. Let's capture that reading — which room exactly?"

### 4.4 Routing logic (no changes to existing router.ts)

The existing `routeTurn(RoutingInput)` at line 29 of `lib/live-teacher/router.ts` already implements the decision tree:

```
Offline → Gemma local (bypassCloud=true)
PII detected → Gemma local (bypassCloud=true)
<15 words → Gemma local (default; cloud allowed later)
Requires clause citation → Claude cloud
Default → Gemma local
```

SP-G does NOT change this logic. The router runs as-is; caller (turn route handler) respects the decision.

---

## 5. The Help Library integration (detailed example)

### 5.1 Sample turn: user query → matched intent → action plan

**User query:** "Is there a way to double-check my moisture readings? I'm worried I missed a spot."

**Routing decision:** ~20 words, no PII, no clause citation required → tries Gemma local first.

**Gemma response (local):** "Let me check my local knowledge… I'd suggest re-reading each room. Can you tell me which rooms you've already done?"

**Help index lookup (parallel):** Matches `inspections/moisture-reading-guide.mdx`:
- `userIntents: ["how to take a moisture reading", "where to measure moisture", "verify readings", "re-check readings"]`
- `aiSummary: "Explains how to take a moisture reading with the RestoAssist moisture meter, where to place the probe, and how to record each room systematically."`
- `successCriteria: ["Reading captured in every affected room", "Reading > 24h old re-measured", "Photo of meter reading saved"]`

**Sidekick next message (Claude cloud invoked, after Gemma):** "I found a guide that might help. According to our moisture-reading guide, you should re-measure any reading older than 24 hours. Let me check your inspection: [pulls context] You captured readings 8 hours ago — you're good there. But I notice you haven't been to the Lounge yet. Should we add that room?"

**Tool call:** `check_report_gaps` → returns `["moisture.lounge"]`

**Suggested action (from help successCriteria):** ✓ Reading captured in lounge (after user captures it)

---

## 6. Three new tools

Each tool is a Prisma transactional handler + Anthropic tool definition. Schemas are Zod.

### 6.1 Tool: `lookup-iicrc`

**Purpose:** Answer questions about IICRC S500:2021 clauses, cross-referenced with the SP-H knowledge substrate (once live).

**Input schema:**
```typescript
const LookupIircInputSchema = z.object({
  query: z.string().min(3).max(500).describe("Search phrase, e.g. 'Cat 3 on wood' or 'clause 7.1'"),
  section: z.enum(["S500", "AS/NZS", "NZBS"]).optional().describe("Standard to search in"),
  jurisdiction: z.enum(["AU", "NZ"]).optional().describe("Jurisdiction hint"),
});
```

**Output schema:**
```typescript
const LookupIircOutputSchema = z.object({
  clauseRef: z.string().describe("[S500:2021 §X.Y.Z]"),
  excerpt: z.string().describe("200-word extract from the clause"),
  fullCitation: z.string().describe("Full text of the clause (if <2KB)"),
  relatedClauses: z.array(z.string()).describe("List of other relevant clause refs"),
  jurisdiction: z.string().describe("AU or NZ"),
});
```

**Implementation:**
- Query the SP-H vector store (retrieval API `lib/knowledge/retrieve.ts`, to be built in SP-H) with the query string.
- Filter results by `standard:S500` or user-provided section.
- Return top result's clause ref, excerpt, full text if available, and related clauses.
- **Handler file:** `lib/live-teacher/tools/lookup-iicrc.ts`

**Tool definition (Anthropic format):**
```typescript
export const lookupIircDefinition = {
  name: "lookup_iicrc",
  description: "Look up an IICRC S500:2021 clause, standard, or related guidance. Use this when the user asks about compliance, standards, or best-practice requirements.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "…" },
      section: { type: "string", enum: ["S500", "AS/NZS", "NZBS"] },
      jurisdiction: { type: "string", enum: ["AU", "NZ"] },
    },
    required: ["query"],
  },
};
```

### 6.2 Tool: `method-recommendation`

**Purpose:** Given a damage class, category, and affected material, suggest restoration methods from the knowledge substrate.

**Input schema:**
```typescript
const MethodRecommendationInputSchema = z.object({
  damageClass: z.enum(["1", "2", "3", "4"]).describe("Water class (IICRC)"),
  damageCategory: z.enum(["1", "2", "3"]).describe("Water category (IICRC)"),
  affectedMaterial: z.string().describe("e.g. 'hardwood floor', 'plasterboard wall', 'carpet'"),
  jurisdiction: z.enum(["AU", "NZ"]).optional(),
});
```

**Output schema:**
```typescript
const MethodRecommendationOutputSchema = z.object({
  recommendedMethod: z.string().describe("Name of the restoration method"),
  reasoning: z.string().describe("Why this method applies (cite clause refs)"),
  steps: z.array(z.string()).describe("Step-by-step procedure"),
  precautions: z.array(z.string()).describe("Safety / quality checklist"),
  estimatedDays: z.number().describe("Typical duration"),
  clauseRefs: z.array(z.string()).describe("IICRC citations"),
});
```

**Implementation:**
- Query the knowledge store with filter: `damageClass:X AND damageCategory:Y AND material:Z` (or semantic search).
- Retrieve the top matching restoration procedure from the SP-H vault (e.g., "Hardwood Floor Restoration for Cat 3").
- Return structured method with steps + citations.
- **Handler file:** `lib/live-teacher/tools/method-recommendation.ts`

### 6.3 Tool: `analyse-photo`

**Purpose:** Vision-based photo analysis — identify damage type, material, severity, and applicable IICRC sections.

**Input schema:**
```typescript
const AnalysePhotoInputSchema = z.object({
  photoUrl: z.string().url().describe("Supabase public URL or signed URL of the photo"),
  context: z.string().optional().describe("e.g. 'bathroom, day 2 post-loss'"),
  jurisdiction: z.enum(["AU", "NZ"]).optional(),
});
```

**Output schema:**
```typescript
const AnalysePhotoOutputSchema = z.object({
  damageType: z.string().describe("e.g. 'water-stained plasterboard, visible mould'"),
  materialIdentified: z.string().describe("Type of affected surface"),
  estimatedSeverity: z.enum(["minor", "moderate", "severe"]).describe("Visual assessment"),
  suggestedMethods: z.array(z.string()).describe("Applicable restoration methods"),
  clauseRefs: z.array(z.string()).describe("IICRC clauses that apply"),
  recommendations: z.array(z.string()).describe("Next actions (capture readings, document drying, etc.)"),
});
```

**Implementation:**
- Call Claude's vision capability (Opus 4.7 supports vision in `content` array with `type: "image"`).
- Inject the image into a Claude turn with the system prompt: "You are an IICRC-certified damage assessor. Analyse this photo and identify: damage type, affected material, severity, and applicable IICRC clauses."
- Return structured assessment.
- **Handler file:** `lib/live-teacher/tools/analyse-photo.ts`

---

## 7. Prisma additions

### 7.1 New models: `TeacherSession` + `TeacherTurnRecord`

```prisma
/// RA-1132h — Sidekick session persistence (append-only).
/// One session per tradie per inspection. Tracks the entire conversation history,
/// costs, model routing decisions, and tool calls. Immutable for audit compliance.
model TeacherSession {
  id String @id @default(cuid())

  // Canonical anchor — every TeacherSession belongs to one Inspection
  inspectionId String
  inspection   Inspection @relation(fields: [inspectionId], references: [id], onDelete: Cascade)

  // Session metadata
  userId      String
  user        User   @relation("TeacherSessions", fields: [userId], references: [id], onDelete: Cascade)
  jurisdiction String // "AU" or "NZ"
  deviceOs    String // "ios", "android", "web"

  // Model routing decision (captured at session start)
  primaryModel String // "gemma_local" or "claude_cloud"

  // Cost tracking (atomic, append-only)
  totalInputTokens    Int @default(0)
  totalOutputTokens   Int @default(0)
  totalCostAudCents   Int @default(0)
  modelUsedCloud      String? // "claude-opus-4-7" if cloud was ever used
  modelUsedLocal      String? // "gemma-3n" if local was ever used
  totalLocalTokens    Int @default(0)

  // Session lifecycle
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  lastActivityAt DateTime @updatedAt

  // Append-only relations
  turns       TeacherTurnRecord[]
  auditLogs   AuditLog[]

  @@index([inspectionId])
  @@index([userId])
  @@index([startedAt])
  @@index([userId, inspectionId]) // Find active session for user+inspection
}

/// RA-1132h — Append-only turn record. Every turn (user message, assistant response,
/// tool call, tool result) is an immutable row. Never updated, never deleted.
/// Supports export, audit, and BYOK Drive mirroring per SP-E.
model TeacherTurnRecord {
  id String @id @default(cuid())

  // Foreign key to session
  sessionId      String
  teacherSession TeacherSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  // Turn type — one of: "user_message", "assistant_response", "tool_call", "tool_result", "system_prompt_injection"
  role          String
  content       String @db.Text

  // For tool calls: the tool name and arguments
  toolName      String?
  toolArgs      Json?
  toolId        String? // Unique ID from Claude for result matching

  // Tool result (if this turn is a tool result)
  toolResultStatus String? // "success" or "error"
  toolResultContent String? @db.Text

  // Citation tracking
  clauseRefs    String[] // e.g. ["S500:2021 §7.1", "AS/NZS 4360:2004 §4.3"]

  // Model routing metadata
  routedTo      String? // "gemma_local" or "claude_cloud"
  confidence    Float? // 0-1 if assistant response
  inputTokens   Int @default(0)
  outputTokens  Int @default(0)
  costAudCents  Int @default(0)

  // User edit tracking (for editability invariant)
  wasEdited     Boolean @default(false)
  editedContent String? @db.Text // Original draft if user edited before commit

  // Timestamp (immutable)
  createdAt DateTime @default(now())

  @@index([sessionId])
  @@index([role])
  @@index([toolName])
  @@index([createdAt])
  @@index([sessionId, createdAt]) // Ordered turn history
}
```

### 7.2 Schema updates to existing models

**User model:**
```prisma
// Add to User model (around line 240+):
liveTeacherSessions TeacherSession[] @relation("TeacherSessions")
```

**Organization model:**
```prisma
// Already has byokAiProvider field? Verify it exists or add:
byokAiProvider String? // "openai" | "gemini" | "custom" — if set, routes Sidekick through tenant's key
byokAiProviderKey String? @db.Text // AES-256-GCM encrypted
```

**Inspection model:**
```prisma
// Already has auditLogs relation. Verify it exists (line ~1899):
auditLogs AuditLog[] @relation(fields: [id], references: [inspectionId])
```

### 7.3 Migration file

**Path:** `prisma/migrations/<timestamp>-sp-g-teacher-session-persistence/migration.sql`

```sql
-- CreateTable TeacherSession
CREATE TABLE "TeacherSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inspectionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "deviceOs" TEXT NOT NULL,
  "primaryModel" TEXT NOT NULL,
  "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalCostAudCents" INTEGER NOT NULL DEFAULT 0,
  "modelUsedCloud" TEXT,
  "modelUsedLocal" TEXT,
  "totalLocalTokens" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherSession_inspectionId_fkey" 
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection" ("id") ON DELETE CASCADE,
  CONSTRAINT "TeacherSession_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX "TeacherSession_inspectionId_idx" ON "TeacherSession"("inspectionId");
CREATE INDEX "TeacherSession_userId_idx" ON "TeacherSession"("userId");
CREATE INDEX "TeacherSession_startedAt_idx" ON "TeacherSession"("startedAt");
CREATE INDEX "TeacherSession_userId_inspectionId_idx" ON "TeacherSession"("userId", "inspectionId");

-- CreateTable TeacherTurnRecord
CREATE TABLE "TeacherTurnRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "toolName" TEXT,
  "toolArgs" JSONB,
  "toolId" TEXT,
  "toolResultStatus" TEXT,
  "toolResultContent" TEXT,
  "clauseRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "routedTo" TEXT,
  "confidence" DOUBLE PRECISION,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costAudCents" INTEGER NOT NULL DEFAULT 0,
  "wasEdited" BOOLEAN NOT NULL DEFAULT false,
  "editedContent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherTurnRecord_sessionId_fkey" 
    FOREIGN KEY ("sessionId") REFERENCES "TeacherSession" ("id") ON DELETE CASCADE
);

CREATE INDEX "TeacherTurnRecord_sessionId_idx" ON "TeacherTurnRecord"("sessionId");
CREATE INDEX "TeacherTurnRecord_role_idx" ON "TeacherTurnRecord"("role");
CREATE INDEX "TeacherTurnRecord_toolName_idx" ON "TeacherTurnRecord"("toolName");
CREATE INDEX "TeacherTurnRecord_createdAt_idx" ON "TeacherTurnRecord"("createdAt");
CREATE INDEX "TeacherTurnRecord_sessionId_createdAt_idx" ON "TeacherTurnRecord"("sessionId", "createdAt");

-- Add to User model (if not present)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "byokAiProvider" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "byokAiProviderKey" TEXT;

-- Add to Organization model (if not present)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "byokAiProvider" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "byokAiProviderKey" TEXT;
```

---

## 8. Cost gating (CLAUDE.md rules 8/9)

### 8.1 Gate logic

**Flow:**

1. **POST /api/live-teacher/turn** receives user utterance.
2. **getServerSession** → check `user.subscriptionStatus`.
3. **If CANCELED:**
   - Return 402 Subscription expired.
   - Render a form: "Your subscription ended. Manual response:" + textarea (no AI).
   - Offer "Renew subscription" CTA.
4. **If TRIAL:**
   - Check `user.creditsRemaining > 0`.
   - If 0: same 402 flow.
   - If >0: proceed.
5. **If ACTIVE or LIFETIME:**
   - Check `creditsRemaining > 0`.
   - If 0: 402 flow.
   - If >0: proceed.

### 8.2 Atomic deduction

**Location:** `lib/live-teacher/_shared.ts` (create if missing).

```typescript
export async function deductCreditsAtomic(
  userId: string,
  inspectionId: string,
  costAudCents: number,
  action: string, // e.g. "AI_SIDEKICK_CLAUDE_RESPONSE"
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // Transactional: read current balance, check > cost, deduct, write AuditLog, return new balance.
  // If transaction fails, no deduction occurs (atomic).
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.creditsRemaining) {
      throw new Error("No credits");
    }
    if (user.creditsRemaining < costAudCents) {
      throw new Error("Insufficient credits");
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { creditsRemaining: { decrement: costAudCents } },
    });
    await tx.auditLog.create({
      data: {
        inspectionId,
        userId,
        action: `AI_SIDEKICK_${action}`,
        entityType: "Sidekick",
        entityId: null,
        device: "web",
        changes: JSON.stringify({ costAudCents }),
      },
    });
    return updated.creditsRemaining;
  });
  return { success: true, newBalance: result };
}
```

### 8.3 BYOK override

**Before deduction check (in turn route):**

```typescript
const byokProvider = user.byokAiProvider;
if (byokProvider && byokProvider !== "platform") {
  // Route through tenant's key; skip credit deduction, skip audit (handled by tenant's wrapper)
  return invokeClaudeCloudWithByokKey(input, user.byokAiProviderKey);
}
// Otherwise: deduct credits, proceed normally
```

---

## 9. Audit log

### 9.1 Actions logged

Every action listed in the SP-5 audit Section 6.2 ("Mapped to user-stated abilities"):

| Action | AuditLog action field | Trigger |
|---|---|---|
| User sends turn | `AI_SIDEKICK_USER_TURN` | Turn submitted |
| Claude responds | `AI_SIDEKICK_CLAUDE_RESPONSE` | Response received + cost deducted |
| Tool call made | `AI_SIDEKICK_TOOL_CALL` (toolName = `lookup_iicrc`, etc.) | Tool invoked |
| Tool result returned | `AI_SIDEKICK_TOOL_RESULT_SUCCESS` or `_ERROR` | Tool completed or failed |
| User edits draft | `AI_SIDEKICK_TURN_EDITED` | User commits edited version |
| Session ended | `AI_SIDEKICK_SESSION_ENDED` | Explicit "close" or 30min idle timeout |

### 9.2 AuditLog row structure

Existing AuditLog model (line 2799 of schema.prisma) already has these fields:

```prisma
action: String // "AI_SIDEKICK_RESPONDED"
entityType: String? // "Sidekick"
entityId: String? // TeacherTurnRecord.id or TeacherSession.id
userId: String // Tech user
changes: String? @db.Text // JSON: { costDeducted, toolName, etc. }
```

SP-G writes rows like:

```typescript
await prisma.auditLog.create({
  data: {
    inspectionId,
    userId,
    action: "AI_SIDEKICK_CLAUDE_RESPONSE",
    entityType: "TeacherTurnRecord",
    entityId: turnRecord.id,
    device: "web", // Or "ios" / "android" from request
    changes: JSON.stringify({
      costAudCents: 42,
      clauseRefs: ["S500:2021 §7.1"],
      confidence: 0.92,
    }),
    timestamp: new Date(),
  },
});
```

---

## 10. Storage hook (SP-E integration)

**When:** At job close (SP-A), after `inspection.status = COMPLETED`.

**What:** Fire-and-forget async task mirrors the session transcript to BYOK Drive.

**How:**

1. `exportClosedJobToBYOKStorage(inspectionId)` (SP-A calls this) enumerates all `TeacherSession` rows for the inspection.
2. For each session, construct a JSON export of all `TeacherTurnRecord` rows (turn history).
3. Call `getStorageProvider(orgId).write(path, jsonContent)` per SP-E pattern.
4. Path: `<storage>/<org-name>/<inspection-id>/sidekick-transcript.jsonl` (JSONL for streaming-friendly format).
5. Write one turn record per line for easy streaming consumption.

**Code location:** `lib/storage/export-sidekick-transcript.ts` (new file).

---

## 11. Out of scope (v1)

- **Voice mode:** Web Speech API, push-to-talk, streaming transcription → Wave 3.
- **BYOK Drive transcript mirror:** Deferred to SP-E completion (but scaffolding prepared).
- **Hardware integrations:** Bluetooth meter pairing, LiDAR scanning — handled by existing tools (start-lidar-scan, take-reading).
- **Multi-turn context limits:** v1 keeps full session history in memory (200 turns ~40KB typical); context window management (sliding window, summarization) → Wave 2.
- **Streaming responses:** v1 polls `invokeClaudeCloud` result; streaming (SSE or WebSocket) → Wave 2 if latency becomes issue.
- **Offline Gemma fallback UI:** v1 shows "offline" banner + manual text form; full offline mode (cached Gemma weights) → Wave 3.

---

## 12. Testing strategy

### 12.1 Unit (Vitest)

**Router tests (existing, extend):**
- `routeTurn({ utterance, online: false, … })` → expects `target: "gemma_local", bypassCloud: true`
- `routeTurn({ utterance, requiresClauseCitation: true, … })` → expects `target: "claude_cloud"`

**Context engine tests (existing, extend):**
- `buildTeacherContext` with missing moisture → expects `missingFields: ["moisture.bedroom"]`

**Cost gating tests (new):**
- `deductCreditsAtomic(userId, inspectionId, 100, "CLAUDE_RESPONSE")` with balance=200 → expects success, newBalance=100
- Same with balance=50 → expects error "Insufficient credits"
- Transactional atomicity: simulate failure halfway → verify no credits deducted

**Audit log tests (new):**
- Every `deductCreditsAtomic` call → asserts `AuditLog` row created with correct action, entityId, changes JSON

### 12.2 Integration (Vitest + Prisma)

**Session lifecycle:**
- POST `/api/live-teacher/session` (authenticated user) → creates `TeacherSession` row
- GET `/api/live-teacher/session?inspectionId=X` → returns active session (if exists)
- Turn dispatch happy path:
  - POST `/api/live-teacher/turn` with `{ sessionId, userUtterance, … }`
  - Routes to Gemma local (short utterance) → returns response, creates `TeacherTurnRecord` rows (user, assistant)
  - Routes to Claude cloud (clause citation required) → checks credits, deducts, creates rows, logs audit
  - Tool call: `check_report_gaps` invoked → tool result captured in turn record

**BYOK override:**
- User with `byokAiProvider = "openai"` + key set → turn route skips credit deduction, invokes custom provider
- Audit log reflects BYOK provider, not platform

**Help index integration:**
- Help article loaded at session start → frontmatter parsed
- User query matched to `userIntents` → matched article injected into Sidekick context
- Sidekick suggests action from `successCriteria`

### 12.3 E2E (Playwright)

**Happy path spec:**
1. Tradie signs in → navigates to inspection detail page.
2. Taps "Ask Sidekick" → bottom-sheet opens, text composer visible.
3. Types "How do I check if this is Cat 3?" (moisture photo showing 12% readings).
4. Sidekick responds: "Based on IICRC S500:2021 §10, Cat 3 requires readings >12% on wood — yours are exactly there, so yes, Cat 3. [Link to help article]"
5. User taps "Take another photo" (from Sidekick suggestion) → camera opens, captures photo.
6. Returns to Sidekick → Sidekick says "Got the photo; I'll analyse it" → calls `analyse-photo` tool → returns "Consistent with Cat 3 wood damage."
7. User taps "I agree" → turn committed, logged to `TeacherTurnRecord`.
8. Close inspection → job status → COMPLETED.
9. Verify: session transcript written to BYOK Drive (if enabled) at `<drive>/job-<id>/sidekick-transcript.jsonl`.

### 12.4 CI gates

```bash
pnpm type-check
pnpm lint
npx vitest run lib/live-teacher/__tests__/*.test.ts
npx vitest run app/api/live-teacher/__tests__/*.test.ts
npx playwright test e2e/sidekick-happy-path.spec.ts
npx prisma migrate diff = no drift
# Visual snapshot diff on SidekickPanel, TurnHistory components
```

### 12.5 Subscription regression

- **TRIAL user, 0 credits:** Sidekick turn route returns 402 "Subscription expired" + manual form affordance. Rest of app (inspect, sign-off, etc.) unaffected.
- **CANCELED user:** Same 402 path. "Renew" CTA visible.

---

## 13. Critical files (read-only reference) + new files to create

### 13.1 Critical files (read, no change)

| File | Purpose | Lines read |
|---|---|---|
| `lib/live-teacher/types.ts` | Shared types | ~66 |
| `lib/live-teacher/router.ts` | Routing logic | ~65 |
| `lib/live-teacher/context-engine.ts` | Context snapshot | ~72 |
| `lib/live-teacher/claude-cloud.ts` | Cloud client | ~276 |
| `lib/live-teacher/tools/*.ts` | Existing 6 tools | — |
| `app/api/live-teacher/session/route.ts` | Session POST/GET | ~80+ |
| `app/api/live-teacher/turn/route.ts` | Turn dispatch | ~60+ |
| `lib/help/types.ts` | Help schema | ~30 |
| `lib/help/frontmatter-schema.ts` | Validation | ~26 |
| `prisma/schema.prisma` | Data model | Lines 861–930 (Organization), 1822–1901 (Inspection), 2799–2829 (AuditLog) |

### 13.2 New files to create

| File path | Type | Responsibility | LOC (estimate) |
|---|---|---|---|
| `lib/live-teacher/tools/lookup-iicrc.ts` | Tool handler | Implement lookup_iicrc, schema, definition | ~80 |
| `lib/live-teacher/tools/method-recommendation.ts` | Tool handler | Implement method_recommendation, schema, definition | ~90 |
| `lib/live-teacher/tools/analyse-photo.ts` | Tool handler | Implement analyse_photo, schema, definition, vision call | ~120 |
| `lib/live-teacher/_shared.ts` | Utilities | Cost gating, BYOK override, deductCreditsAtomic | ~60 |
| `lib/storage/export-sidekick-transcript.ts` | Storage hook | BYOK Drive mirror at job close | ~80 |
| `components/sidekick/SidekickPanel.tsx` | UI component | Main container, mounting | ~120 |
| `components/sidekick/TurnHistory.tsx` | UI component | Scrollable turn list | ~100 |
| `components/sidekick/TextComposer.tsx` | UI component | Textarea + send button | ~60 |
| `components/sidekick/VoiceAfford.tsx` | UI component | Disabled "Voice coming soon" button | ~30 |
| `components/sidekick/ToolResultsDisplay.tsx` | UI component | Render tool outputs (lookup, method, photo analysis) | ~100 |
| `app/api/live-teacher/turn/route.ts` (modify) | API route | Wire tool definitions, implement tool call handler | +50 (extend existing) |
| `lib/live-teacher/tools/index.ts` (modify) | Tool registry | Add 3 new tool definitions + handlers to export | +20 (extend existing) |
| `lib/live-teacher/claude-cloud.ts` (modify) | Cloud client | Wire tools at line 188–189 | +5 (change TODO to import) |
| `prisma/migrations/<ts>-sp-g-teacher-session-persistence/migration.sql` | Migration | CreateTable TeacherSession, TeacherTurnRecord | ~80 |
| `app/dashboard/inspections/[id]/page.tsx` (modify) | Page | Mount <SidekickPanel /> in Suspense boundary | +10 (extend existing) |

**Total new LOC estimate:** ~1000 (excluding test files, component CSS, and modifications to existing files).

---

## 14. Verification (how Phill confirms v1 is shipped)

After SP-G merges and deploys to staging:

1. **Type safety:** `npx tsc --noEmit` — zero errors.
2. **Linting:** `pnpm lint` — all files clean.
3. **Unit + integration tests:** `npx vitest run` — ≥95% pass rate on live-teacher tests.
4. **E2E happy path:** `npx playwright test e2e/sidekick-happy-path.spec.ts` on staging — green on Chrome + Safari.
5. **Manual inspection detail page:** Navigate to `/dashboard/inspections/[id]` → "Ask Sidekick" button visible, bottom-sheet opens on tap.
6. **Send a text query:** Type "What's IICRC Cat 3?" → Sidekick responds with clause citation `[S500:2021 §10.X]` within 3 seconds.
7. **Tool invocation:** Ask "Analyse this photo" (point to a captured photo URL) → `analyse-photo` tool called, result renders with damage type + severity + clauses.
8. **Cost deduction:** Send 3 turns, each costing 50 AUD cents → verify `User.creditsRemaining` decremented by 150.
9. **Audit trail:** Inspect `AuditLog` rows for `action LIKE 'AI_SIDEKICK_%'` — all 3 turns + 1 tool call logged.
10. **Transcript export:** Close the inspection (SP-A) → verify `TeacherSession` transcript mirrored to BYOK Drive (if configured) at `<drive>/job-<id>/sidekick-transcript.jsonl`.
11. **Help integration:** Search for "moisture reading" in help index → matched article injected into Sidekick context → Sidekick references article in response.
12. **Subscription gate:** Switch user to CANCELED subscription → send Sidekick turn → route returns 402 "Subscription expired" + manual form.
13. **No regressions:** Re-run E2E for SP-1 (onboarding), SP-5 (capture), SP-7 (sign-off) — all still green.

---

## 15. Open questions for Phill's brainstorm cycle

1. **UI shape on desktop:** When inspecting on a 24" monitor, should the Sidekick panel be (a) bottom-sheet that unfolds to right-sidebar, (b) always-visible right-panel (consumes screen real estate), or (c) modal that overlays the inspection detail? Recommending (a) — preserves mobile UX consistency.

2. **Voice mode timeline:** Wave 3 is deferred, but should v1 disable the microphone button entirely (no UI stub) or show it as a disabled "Coming soon" hint? Recommending hint — sets expectation.

3. **Context window length:** How many turns should a session keep in memory before using summarization or sliding window? v1 assumes <200 turns; if users chat for 30+ minutes, should we auto-summarize? Recommending no summarization in v1; warn on UI at 150 turns: "Your session is getting long — consider starting a new one."

4. **Help article versioning:** If a help article is updated (frontmatter + body), should old Sidekick sessions (exported to BYOK Drive) reference the updated version or the version they saw at session time? Recommending: capture `helpArticleVersion` in `TeacherTurnRecord` at injection time; export includes versioned reference.

5. **BYOK default:** Should new signups default to `Organization.byokAiProvider = "platform"` or should setup wizard require an explicit choice? Recommending: default to platform (simplest path), make setup wizard optional BYOK picker for advanced users.

6. **Offline handling:** Should Sidekick sessions gracefully degrade to local-only (cached Gemma) when offline, or should the UI say "Sidekick is unavailable — you're offline"? Recommending v1: "Offline — Sidekick unavailable" + manual form. Offline mode (cached Gemma weights) → Wave 3.

---

**END OF SPEC**
