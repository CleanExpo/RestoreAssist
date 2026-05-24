# System Architecture

Date: 2026-05-24

## Target Architecture

RestoreAssist should remain a modular monolith until scale forces service extraction. The production architecture should be offline-first at the edge, server-authoritative for compliance, queue-backed for expensive work, and database-enforced for tenant isolation.

```
Mobile/Web Capture
  -> Local queue and media cache
  -> Authenticated API routes
  -> Service layer
  -> Prisma/Postgres with RLS
  -> Async jobs for AI/OCR/reporting/integrations
  -> Observability, audit, billing, exports
```

## Principles

- Mobile capture works without network.
- Server owns authorization, compliance gates, and final writes.
- Database enforces tenant boundaries with RLS.
- All mutating field actions are idempotent.
- AI outputs are draft-first and auditable.
- Expensive work runs async unless the technician is blocked.
- Every claim artifact links back to source evidence.

## Modules

### 1. Identity and Tenant Boundary

Current:

- NextAuth with Google, Apple, credentials, 2FA, remember-me.
- Workspace, WorkspaceMember, WorkspaceRole, and role binding models exist.
- Admin verification helper exists.

Target:

- `session.user.id` remains the identifier.
- All route ownership checks should resolve `workspaceId`.
- Admin routes must call `verifyAdminFromDb`.
- RLS policies enforce user/workspace isolation for browser-accessible tables.
- Public token access is separate from authenticated access and always audited.

### 2. Offline Capture Layer

Client:

- Local SQLite/OPFS/IndexedDB event queue.
- Local media cache for photos/audio/sketch snapshots.
- Deterministic mutation IDs.
- Sync status UI.

Server:

- Idempotency table keyed by `workspaceId + mutationId`.
- Replays return previous result.
- Conflict responses include current server version and merge hints.

Capture event types:

- `PHOTO_CAPTURED`
- `VOICE_NOTE_CAPTURED`
- `MOISTURE_READING_CAPTURED`
- `PSYCHROMETRIC_READING_CAPTURED`
- `SKETCH_UPDATED`
- `PROGRESS_TRANSITION_REQUESTED`
- `EQUIPMENT_PLACED`
- `SIGNOFF_CAPTURED`

### 3. AI Gateway

Target:

- Single gateway for all providers.
- Task policy by cost, latency, data sensitivity, and capability.
- Redaction before model calls.
- Structured outputs and schema validation.
- AI usage logging and audit events.
- Evals before model swaps.

Provider adapters:

- OpenAI.
- Anthropic.
- Gemini.
- Approved BYOK providers.
- Local/edge inference bridge.

### 4. RAG and Standards Knowledge

Current:

- `pgvector` is enabled.
- `IicrcChunk` model exists.
- Ingestion scripts exist.

Target:

- Store standards chunks with edition, section, jurisdiction, source hash, and license metadata.
- Retrieval is deterministic and returns only stored citations.
- Report drafting can summarize citations but never invent them.
- Add NZ standards and insurer profile requirements.

### 5. Voice Pipeline

Target pipeline:

1. Push-to-talk starts local recorder.
2. Local STT attempts transcript.
3. If online and allowed, cloud STT/realtime improves transcript.
4. Parser extracts structured observation.
5. Confidence determines draft/confirm flow.
6. Append-only session and observations persist.
7. Relevant writes are idempotently applied.

Realtime mode:

- Use OpenAI Realtime with WebRTC for low-latency active capture when online.
- Use chained STT -> text model -> TTS fallback for cheaper/older devices.
- Store transcript and action records, not hidden model state.

### 6. Image/OCR Pipeline

Stages:

1. Upload validation: size, magic bytes, EXIF policy, malware scan if available.
2. Media storage: original plus derived thumbnail, with retention policy.
3. Image quality checks: blur, darkness, duplicate, orientation.
4. OCR: meter displays, labels, documents, invoices.
5. Vision labels: room, stage, damage type, source/equipment/final/signoff.
6. Human confirmation for low confidence.
7. Evidence graph write.

### 7. Sketch/Floorplan Pipeline

Inputs:

- Property-data underlay.
- Uploaded/fetched floorplan.
- Hand sketch photo.
- Manual tablet drawing.
- Future LiDAR/360 scan.

Normalized output:

- `RoomGraph`: rooms, walls, openings, labels, scale, floor, adjacency.
- `EvidencePins`: photos, readings, equipment, scope items.
- `Exports`: PDF, PNG, SVG, JSON. Future ESX/FML adapters.

### 8. Reporting Pipeline

Stages:

1. Evidence completeness.
2. Deterministic report outline.
3. RAG citation retrieval.
4. AI draft per section.
5. Source-evidence linking.
6. Human review and edits.
7. PDF/export package generation.
8. Handoff package publication.
9. Integration sync.

### 9. Integration Pipeline

Pattern:

- User-facing route writes internal state.
- Fire-and-forget sync event enqueued.
- Worker processes sync.
- `IntegrationSyncLog` and dead-letter queue capture failures.
- UI shows retry CTA and last sync state.

Integrations:

- Xero.
- QuickBooks.
- MYOB.
- ServiceM8.
- Simpro or generic FSM API.
- Ascora.
- Google Drive/OneDrive storage mirror.
- DR/NRPG/Guidewire-style claim exports.

### 10. Observability

Required dashboards:

- API error rate by route.
- Route latency p50/p95/p99.
- AI cost by workspace/task/provider/model.
- Upload volume and Cloudinary cost.
- Sync queue depth and failure age.
- Offline queue sync failures.
- Report generation failures.
- RLS/security events.
- User activation funnel.

Telemetry events:

- `capture.photo.created`
- `capture.voice.transcribed`
- `capture.sketch.saved`
- `offline.queue.enqueued`
- `offline.queue.synced`
- `ai.call.completed`
- `ai.call.blocked_budget`
- `report.generated`
- `handoff.sent`
- `integration.sync.failed`

## Data Model Additions

Add or verify:

- `ClientMutation`
- `FieldCaptureEvent`
- `VoiceCopilotSession`
- `VoiceCopilotObservation`
- `RoomGraph`
- `RoomGraphNode`
- `EvidencePin`
- `MediaQualitySignal`
- `ReportSectionDraft`
- `HandoffPackage`
- `IntegrationRetry`
- `SecurityPolicyAudit`

## Deployment Architecture

Short-term:

- Vercel Next.js app.
- Supabase Postgres with RLS.
- Cloudinary media.
- Background jobs via Vercel Cron plus queue provider.
- Sentry plus Vercel analytics/logs.

Medium-term:

- Dedicated queue: Upstash/QStash, Inngest, Trigger.dev, or Vercel Queues if adopted.
- Redis/KV for realtime ephemeral state.
- Regional media retention and lifecycle policies.
- Separate AI worker runtime for long-running report/OCR tasks.

## Non-Goals

- Do not split into microservices yet.
- Do not build a full generic FSM suite.
- Do not require 3D scanning for every claim.
- Do not replace Xactimate immediately.

