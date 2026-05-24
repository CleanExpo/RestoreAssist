# Phase 2: AI and Workflow Upgrades

Date: 2026-05-24  
Goal: make RestoreAssist faster and smarter after production safety foundations are in place.

## Scope

Included backlog tasks:

- AI-001: Introduce Provider-Neutral AI Gateway
- AI-002: Define Task Policy and Model Allowlist
- AI-003: Add AI Redaction and Data Classification
- AI-004: Prompt Registry and Eval IDs
- RAG-001: Validate IICRC Chunk Metadata and Retrieval
- RAG-002: Add False-Citation Eval Gate
- RAG-003: Add AU/NZ Jurisdictional Retrieval Filters
- MOB-002: Offline Media Cache
- MOB-003: Progress Transition Queue
- VOI-002: Persist Voice Observations and Confirmation State
- VOI-003: Voice Cost and Runtime Guards
- PRISMA-003: Add RoomGraph and EvidencePin Models
- SKETCH-002: RoomGraph V1 from Existing Sketch JSON
- SKETCH-003: Floorplan Underlay and Calibration Flow
- EVD-002: Media Hashing, Deduplication, and Retention Class
- EVD-003: Photo Quality and Evidence Tagging
- EVD-004: Document OCR Pipeline
- REPORT-001: Source-Linked Report Draft Pipeline
- REPORT-002: Continuous Completeness Preview
- UX-002: Technician Capture Cockpit

## Guardrails

- Do not start broad visual redesign until Phase 1 acceptance criteria pass.
- Every AI output remains draft-first and auditable.
- Deterministic checks run before model calls.
- Premium AI calls require budget/subscription gates.
- Competitor research informs outcomes only; no copied UI, wording, colours, layouts, or proprietary workflow.

## Execution Order

1. Validate RAG chunk metadata and false-citation evals.
2. Introduce provider-neutral AI gateway as a wrapper around existing services.
3. Define task policy and model allowlist.
4. Add redaction/data classification.
5. Migrate low-risk AI tasks first:
   - support draft
   - note structuring
   - photo labels
   - voice transcription metadata
6. Add media hash/dedup/retention.
7. Add offline media cache and progress transition queue.
8. Persist voice observations and confirmation state.
9. Add RoomGraph and EvidencePin models.
10. Convert existing sketch JSON into RoomGraph V1.
11. Add floorplan underlay/calibration flow.
12. Add photo quality/evidence tagging.
13. Build source-linked report draft pipeline.
14. Add continuous completeness preview.
15. Build the technician capture cockpit once data foundations are usable.

## Test Requirements

- AI gateway:
  - budget block
  - provider fallback
  - schema validation
  - redaction/data-class policy
  - usage logging
- RAG:
  - known S500/S520/S700 clause retrieval
  - zero false citations in eval set
  - AU/NZ jurisdiction filters
- Offline:
  - media capture offline and later sync
  - progress transition replay
  - duplicate collapse
- Voice:
  - observation parse
  - confirmation state
  - max runtime/cost guard
- Sketch/floorplan:
  - RoomGraph conversion
  - calibration
  - moisture/photo pins
  - mobile viewport checks
- Report:
  - source-linked section draft
  - completeness blockers
  - evidence/citation links

## Acceptance Criteria

Phase 2 is complete when:

- All paid AI calls in migrated task groups go through the gateway.
- AI task policy blocks unsafe/unknown provider use.
- False-citation eval gate exists and is used by report workflows.
- Offline media and progress transitions can sync safely.
- Voice observations persist with confirmation state.
- Existing sketch data can produce a RoomGraph.
- Photos can carry quality/evidence tags as suggestions.
- Report draft sections link back to evidence and citations.
- Capture cockpit can show room, capture controls, completeness, offline status, and next item using real data.

## Rollback

- Migrate task-by-task and keep legacy AI service paths behind flags.
- Keep existing sketch JSON canonical until RoomGraph is proven.
- Keep photo AI tags as non-blocking suggestions.
- Keep report generation legacy path available until source-linked pipeline is accepted.
- Disable realtime voice independently from transcription.

## Out of Scope

- Full generic FSM rebuild.
- Xactimate replacement.
- Mandatory 3D scanning.
- Paid early access launch.

