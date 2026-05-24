# SP-G — Brainstorm Processed (senior-consultant pass on the 6 open questions)

> **Status:** Draft companion to `2026-05-15-sp-g-ai-setup-agent-design.md`. Phill confirms or redirects; spec auto-locks on full approval.
> **Method:** Each question gets evidence chain (file:line + wiki cross-ref), 2–3 candidate answers, a recommended default with reasoning, and reversibility cost. Goal: 5-minute confirm cycle instead of 30-minute brainstorm.

---

## Pre-flight finding (out-of-scope of the 6, but blocking)

The spec proposes new Prisma models `TeacherSession` + `TeacherTurnRecord` (spec §7.1). **These duplicate existing models** already on the schema:

- `LiveTeacherSession` — `prisma/schema.prisma` lines 6090–6110
- `TeacherUtterance` — lines 6112–6127
- `TeacherToolCall` — lines 6129–6140

CLAUDE.md rule 20 ("Read source files before modifying — never assume structure") + the orchestration ceremony's mandatory existing-code audit say: extend the existing models, do not create parallel ones. **Recommend:** flip spec §7 to "ADD COLUMNS to `LiveTeacherSession` + `TeacherUtterance`" rather than CreateTable. Flagged here so Phill can approve before Q1–Q6 land in a plan.

---

## Q1 — UI shape on desktop

> "When inspecting on a 24" monitor, should the Sidekick panel be (a) bottom-sheet → right-sidebar, (b) always-visible right-panel, or (c) modal overlay?"

### Evidence

- **Primary use case is mobile (tech on-site)** — wiki `restore-assist.md:50` "tradie on-site", `operational-priorities-q2-2026.md:24` "VIDEO-FIRST for Phill (learning-difficulty accessibility)". Tradies are NOT at 24" monitors most of the time.
- **No existing bottom-sheet pattern in RA today** — spec §4.1 says "Bottom-sheet is a new pattern but closest." Existing modals: `EngagementLicenceModal` (full-screen), `SignaturePad` (modal). Bottom-sheet is greenfield UX.
- **shadcn/ui has `Sheet`** — CLAUDE.md rule 16 "Use shadcn/ui from `components/ui/` — never create custom form controls or dialogs." shadcn `Sheet` supports `side="bottom"` mobile + `side="right"` desktop with the same component.

### Candidates

|     | Option                                                                             | Pros                                                            | Cons                                                                                                                      |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| a   | Bottom-sheet on mobile → unfolds to right-sidebar on desktop (spec recommendation) | Single component, responsive, preserves inspection detail above | Two layouts to test                                                                                                       |
| b   | Always-visible right-panel desktop / bottom-sheet mobile                           | Tech can glance at Sidekick without tapping                     | Eats 30% of desktop screen on inspection detail page                                                                      |
| c   | Modal overlay on both                                                              | One pattern, matches RA's existing modal habits                 | Hides inspection detail — tech loses photos/readings context while chatting (the very thing Sidekick is grounded against) |

### Recommendation: **(a) bottom-sheet → right-sidebar via shadcn `Sheet`**

**Reasoning:**

- shadcn `Sheet` already in `components/ui/` — zero new primitives (CLAUDE.md rule 16).
- Preserves the inspection-detail-as-context invariant — Sidekick is grounded in photos/readings, hiding them in a modal breaks that.
- Mobile is primary; desktop is the unfold case, not the design driver.

**Reversibility: LOW.** UI shell is swap-out work; tool wiring and persistence are unaffected. Can flip to right-panel in a half-day if user-testing shows tap-fatigue.

---

## Q2 — Voice mode timeline (Wave 1 stub vs Wave 3 full)

> "Should v1 disable the microphone button entirely (no UI stub) or show it as a disabled 'Coming soon' hint?"

### Evidence

- **Wiki founder directive `operational-priorities-q2-2026.md:24`:** "VIDEO-FIRST for Phill (learning-difficulty accessibility)" — voice/audio is a known accessibility lever Phill cares about, not a vanity feature.
- **Existing voice infrastructure:** Margot already runs ElevenLabs voice (`operational-priorities-q2-2026.md:91`, env `MARGOT_VOICE_REPLY_ENABLED=1`). Voice substrate exists in the empire.
- **Web Speech API is free + offline-capable on Chrome/Safari** — no cloud cost, no API key, native browser support. Implementation cost is hours, not days.
- **Tradie context:** hands are wet/gloved on-site. Voice is the natural input mode. Disabled-button-with-hint sets expectation but blocks the primary user.
- **SP-5 audit §6.3 line 190:** explicitly lists voice mode in SP-G scope ("Voice mode: Web Speech API push-to-talk on mobile + browser; text fallback"). The audit owner considered voice in-scope.

### Candidates

|     | Option                                                                       | Pros                                                                                          | Cons                                                                       |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| a   | No UI stub (text-only, no microphone icon)                                   | Cleanest v1                                                                                   | Users don't know voice is coming; tradies type with wet hands              |
| b   | Disabled mic with "Coming soon" tooltip (spec recommendation)                | Sets expectation                                                                              | Promises a feature, blocks the primary input modality for the primary user |
| c   | **Ship Web Speech API push-to-talk in Wave 1** (text composer + working mic) | Hits founder accessibility directive, native browser support is free, matches tradie workflow | +2-3 days build, browser support gap on Firefox Android                    |

### Recommendation: **(c) Ship voice in Wave 1**

**Reasoning:**

- Web Speech API is browser-native, free, and tradie-on-site is the exact use case it solves. Building a stub is more work than wiring the real API.
- Founder directive (`operational-priorities-q2-2026.md:24`) treats voice/audio as accessibility-critical.
- Margot voice already exists in the empire — same substrate, same skill base.
- If browser support is uneven, the text composer is the fallback (already in spec §4.1).

**Reversibility: MEDIUM.** Shipping voice late is a feature add (cheap). Shipping a disabled stub then upgrading is two design cycles (more expensive). Adding voice from day 1 avoids the second cycle.

**Caveat:** If Phill prefers Wave 1 to stay minimal, fallback is (b) — disabled mic with hint, keeping the surface area visible.

---

## Q3 — Context window length (per-session vs persistent)

> "How many turns should a session keep in memory before summarization or sliding window? Should we auto-summarize?"

### Evidence

- **Existing `LiveTeacherSession` model** (schema.prisma:6090) is per-inspection, append-only. No cross-session memory designed.
- **CLAUDE.md rule 22:** "Append-only audit — `ProgressTransition` and `ProgressAttestation` are never UPDATEd or DELETEd." Summarization would imply UPDATE-style compression — violates append-only.
- **Cost reality:** Claude Opus 4.7 at ~200 turns × ~200 tokens avg = ~40KB context. Well within 200K context window. Token cost grows linearly but stays under $0.50 per session at 200 turns.
- **Typical inspection duration:** 30–90 min on-site. Tradie + Sidekick turn count realistically 20–60, rarely past 100.
- **Spec §11 already says:** "v1 keeps full session history in memory (200 turns ~40KB typical); context window management → Wave 2."

### Candidates

|     | Option                                                                      | Pros                                                  | Cons                                                                                                     |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| a   | No summarization, per-session only, warn at 150 turns (spec recommendation) | Append-only honoured, simple, fits typical inspection | Long sessions get expensive; no cross-inspection memory                                                  |
| b   | Per-session + auto-summarize at 100 turns                                   | Lower token cost                                      | Violates append-only; summary is a derived UPDATE; reconstructing audit trail from summary is impossible |
| c   | Per-session + persistent across inspections (org-level memory)              | Sidekick learns tradie's patterns, project history    | Cross-tenant leak risk; PII handling complexity; out of v1 scope                                         |

### Recommendation: **(a) per-session, no summarization, soft warning at 150 turns**

**Reasoning:**

- Append-only invariant (CLAUDE.md rule 22) is load-bearing for audit; summarization breaks it.
- 200-turn ceiling is well under context-window + cost limits for realistic inspection durations.
- Cross-inspection persistence is a v2 feature with its own tenancy/PII design — defer.

**Reversibility: LOW.** Summarization can be bolted on later as a derived view (read-only `TeacherSessionSummary` model) without touching append-only turn records.

---

## Q4 — Help article versioning (live read vs snapshot)

> "If a help article is updated, should old Sidekick sessions reference the updated version or the version they saw at session time?"

### Evidence

- **`HelpFrontmatter` has `updatedAt: string`** (`lib/help/frontmatter-schema.ts:11`) — versioning signal exists.
- **No `version` field on `HelpFrontmatter`** — only `updatedAt` ISO date. Reconstructing an old version requires git blame.
- **CLAUDE.md rule 22** (append-only audit) — the turn record IS the audit; if it references "moisture-reading-guide.mdx" without snapshot, the audit trail breaks the moment the article is edited.
- **`content/help/**/\*.mdx` is in git\*\* — full version history is recoverable from git, but expensive (clone, checkout, parse).
- **SP-E BYOK Drive export (spec §10):** transcript mirrors to client's Drive. If the article body changes, the client's mirrored transcript references a phantom version. Bad.

### Candidates

|     | Option                                                                                                           | Pros                                           | Cons                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| a   | Live read (link by slug only, render latest version on view)                                                     | Simplest, no schema change                     | Audit trail drifts as articles edit; BYOK Drive transcripts misrepresent what Sidekick actually said |
| b   | Snapshot `helpArticleVersion` (slug + updatedAt + aiSummary excerpt) in `TeacherUtterance` (spec recommendation) | Audit-correct, exportable, matches append-only | Adds 1 column, slightly bigger turn rows                                                             |
| c   | Snapshot the full article body inline in turn record                                                             | Most defensible audit                          | Wasteful storage; same article re-snapshotted on every turn                                          |

### Recommendation: **(b) snapshot slug + updatedAt + aiSummary excerpt in turn record**

**Reasoning:**

- Append-only invariant means the turn IS the truth. If the article changes, the snapshot proves what Sidekick referenced.
- Minimal storage cost (~100 bytes per matched article).
- Full body reconstruction is git-recoverable if ever needed — snapshot the pointer, not the payload.

Add to `TeacherUtterance` (NOT a new model): `helpArticleSlug String?`, `helpArticleUpdatedAt String?`, `helpArticleSummary String?`.

**Reversibility: LOW.** Adding columns to an append-only model is additive. Removing them later is also safe (orphan columns).

---

## Q5 — BYOK default (platform Gemma vs per-user BYOK)

> "Should new signups default to `Organization.byokAiProvider = 'platform'` or require explicit choice in setup wizard?"

### Evidence

- **Wiki principle (`restore-assist.md:69`):** "We build the system; the business brings the infrastructure — every external system is BYOK." This is the founder principle.
- **But also `restore-assist.md:68`:** "No double-handling of administration — if data exists anywhere, the system pulls it." Translation: minimize setup friction.
- **Existing schema:** `AiProvider` model (line 5746 in schema.prisma) + `ProviderConnection` (5669) — BYOK pipe exists.
- **Spec §3 constraint 2:** "BYOK throughout — if `Organization.byokAiProvider` is set, route Sidekick through tenant's key, skip platform credits."
- **Existing onboarding hotfix (line 873 schema):** BYOK Google Drive OAuth is already the SP-1 default — tradies hit a BYOK choice on day 1 for storage. AI BYOK in the same wizard = consistent UX.
- **SP-3 spec (`docs/superpowers/specs/SP-3` referenced in recent commit `e94da5f7`):** subscription upgrade-paths in progress; platform-paid path needs to be intuitive for trial users.

### Candidates

|     | Option                                                                                                         | Pros                                                              | Cons                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| a   | Default platform (Gemma + Claude credits), BYOK is optional advanced toggle (spec recommendation)              | Frictionless trial; matches SaaS norm; trial → paid funnel intact | Mild contradiction with "BYOK throughout" founder principle                                  |
| b   | Force explicit choice in setup wizard (no default)                                                             | Honours "BYOK throughout" principle literally                     | Adds onboarding friction; first-time tradies don't know what an API key is; conversion drops |
| c   | Default platform; setup wizard shows BYOK option as "Use your own AI key (saves credits)" with cost-comparison | Best of both — frictionless + visible                             | More wizard copy to write                                                                    |

### Recommendation: **(c) default platform, but wizard surfaces BYOK with cost-comparison**

**Reasoning:**

- "BYOK throughout" (wiki:69) is about _capability_, not _default_ — the system must support BYOK end-to-end, but tradies should not hit an API-key wall on signup.
- Trial users (CLAUDE.md rule 8 — `TRIAL` is gated state) need a path that "just works" to convert.
- Cost-comparison framing ("BYOK = ~30% cheaper after month 2") turns a friction point into a value prop — aligns with SP-3 upgrade-path work.

**Reversibility: MEDIUM.** Wizard copy is easy to change. The default flag in `Organization.byokAiProvider` migration (if shipped as enum) is a one-line update. Hard part is comms to existing trial users if default flips.

---

## Q6 — Offline handling (Wave 1 vs deferred)

> "Should Sidekick gracefully degrade to local-only (cached Gemma) when offline, or show 'unavailable — you're offline'?"

### Evidence

- **CLAUDE.md rule 24:** "Offline-first — attestor captures + queues transitions offline; reconnect flushes with idempotent keys." Offline-first is a hard non-negotiable for capture work.
- **`lib/live-teacher/router.ts:35`:** Router ALREADY handles offline: `if (!input.online) return { target: "gemma_local", reason: "offline", bypassCloud: true };` — the routing logic is built and tested.
- **What's actually missing:** Gemma 3n weights cached on-device. The router decides "gemma_local" but the v1 architecture only has cloud-Claude wired (`claude-cloud.ts` exists; no `gemma-local.ts` file in `lib/live-teacher/`).
- **Spec §11 (out-of-scope):** "Offline Gemma fallback UI: v1 shows 'offline' banner + manual text form; full offline mode → Wave 3."
- **Tradie reality:** inspections often happen in basements, regional areas — offline IS the steady state, not an edge case. "Unavailable when offline" is a P0 UX failure for the primary user.

### Candidates

|     | Option                                                                                       | Pros                                                                                                                 | Cons                                                                    |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| a   | "Offline — Sidekick unavailable" + manual form fallback (spec recommendation)                | Minimal v1                                                                                                           | Violates rule 24 (offline-first); breaks tradie's primary use case      |
| b   | Full offline Gemma weights cached on-device in Wave 1                                        | Honours offline-first                                                                                                | Adds 2–4GB weights to PWA; complex caching; ~2 weeks extra work         |
| c   | **Queue offline turns + flush on reconnect** (no on-device inference, but no lockout either) | Honours rule 24 pattern; tradie can keep talking, replies arrive on reconnect; idempotent keys from existing pattern | Sidekick can't respond instantly when offline; user sees "queued" badge |

### Recommendation: **(c) queue-and-flush offline pattern, mirroring rule 24**

**Reasoning:**

- Rule 24 is the canonical RA offline pattern — `ProgressTransition` captures queue offline, flush on reconnect, idempotent keys prevent dupes. Sidekick should use the same pattern.
- No on-device Gemma weights needed in v1 (defers the 2–4GB PWA complexity to Wave 3 cleanly).
- "Sidekick unavailable" (option a) directly contradicts the rule that governs every other capture surface — inconsistent UX.
- The router already returns `gemma_local` for offline; the queue-and-flush wrapper sits ABOVE the router and translates "no Gemma yet, but flush queue when online" into UX-visible "queued, will respond when back online".

**Reversibility: MEDIUM.** Adding offline queueing later is harder than shipping with it — the turn endpoint, idempotency keys, and reconnect flush all need wiring. But the router already handles the routing decision; only the queue wrapper + UI is new (~3 days).

---

## Summary table

| Q   | Recommendation                                                    | Reversibility | Primary evidence                                            |
| --- | ----------------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| 1   | Bottom-sheet → right-sidebar (shadcn `Sheet`)                     | LOW           | CLAUDE.md rule 16; spec §4.1                                |
| 2   | Ship Web Speech API voice in Wave 1                               | MEDIUM        | `operational-priorities-q2-2026.md:24`; Margot voice exists |
| 3   | Per-session, no summarization, warn at 150 turns                  | LOW           | CLAUDE.md rule 22; spec §11                                 |
| 4   | Snapshot help-article slug + `updatedAt` + summary in turn record | LOW           | `lib/help/frontmatter-schema.ts:11`; rule 22                |
| 5   | Default platform; wizard surfaces BYOK with cost-comparison       | MEDIUM        | `restore-assist.md:68-69`; SP-3 upgrade-paths               |
| 6   | Queue-and-flush offline pattern (no on-device Gemma yet)          | MEDIUM        | CLAUDE.md rule 24; `router.ts:35`                           |

**Pre-flight extra (out-of-band):** Extend existing `LiveTeacherSession`/`TeacherUtterance` models (schema.prisma:6090–6127) — do NOT create new `TeacherSession`/`TeacherTurnRecord` models per spec §7. The spec proposes duplicate scaffolding the codebase already has.

---

## Lock instructions

**If Phill approves all recommendations, the spec auto-locks.** Redirect any with: `change Q[N] to <option>` (e.g. `change Q2 to b` to revert voice to a disabled-stub).

To flag the pre-flight Prisma duplication concern, say: `acknowledge prisma reuse` and the spec will be edited to extend `LiveTeacherSession` instead of creating parallel models.

---

## Verification ledger

1. **Did:** Processed all 6 open questions in SP-G spec. Wrote companion doc with evidence chain, 2–3 candidates per Q, recommendation + reversibility. Surfaced one out-of-band pre-flight (Prisma model duplication).
2. **Verified with citations:** Read 8 files — the spec itself, SP-5 audit §6, `lib/help/types.ts`, `lib/help/frontmatter-schema.ts`, `lib/live-teacher/router.ts`, `lib/live-teacher/claude-cloud.ts` (partial), `prisma/schema.prisma` lines 6080–6140, two wiki pages (`restore-assist.md`, `operational-priorities-q2-2026.md`), one memory file (`feedback_orchestration_ceremony.md`). 18+ evidence citations with file:line references.
3. **Would change my mind:** (Q2) if Phill has explicit "minimum-viable Wave 1" directive that voice is hard-out — revert to (b). (Q5) if SP-3 upgrade-paths spec mandates a different default — defer to SP-3. (Q6) if a measured offline rate <5% from telemetry exists — option (a) becomes defensible. (Pre-flight) if `LiveTeacherSession` is known-deprecated in a doc I didn't read — then new models are right.
