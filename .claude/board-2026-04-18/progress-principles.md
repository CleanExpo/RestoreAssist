# Progress Framework — 8 Engineering Principles

**Motion:** M-4 · **Epic:** RA-1376 · **Board:** 2026-04-18

Source: board minutes §6 (pending — PC2 to push `.claude/board-2026-04-18/00-board-minutes.md`).

These are the non-negotiable engineering constraints on the Progress framework. Every M-1..M-21 deliverable must satisfy all eight. Reviews reject PRs that regress any.

## 1. Cryptographic chain-of-custody

Every photo, document, and sensor reading attached to a `ProgressAttestation` carries a C2PA-style manifest: SHA-256 of the file bytes, UTC capture timestamp, GPS coordinates (when available), device identifier, and a hash of the attesting user. Manifest is generated at capture time (mobile Capacitor) and verified at read time by the server before export.

**Enforcement:** M-10 (`lib/evidence/c2pa-manifest.ts`) plus Cloudinary upload-flow integration. CLAUDE.md rule 21.

## 2. Append-only audit

`ProgressTransition` and `ProgressAttestation` rows are never updated or deleted. Corrections require a new row that references the prior one via `supersedesId`. Database triggers (M-5) reject `UPDATE` and `DELETE` on these tables outside of cascade-delete from a parent `ClaimProgress` being withdrawn.

**Enforcement:** M-5 schema + Prisma middleware. CLAUDE.md rule 22.

## 3. Evidence-gated promotion

A transition only succeeds when every `required=true` entry in the Stage × Required Evidence matrix (M-2) for the target state has an attached `ProgressAttestation`. Guard functions in `lib/progress/state-machine.ts` return `{ ok: false, missing: string[] }` otherwise; `transition()` bubbles that to the API response so the UI can display what's needed.

**Enforcement:** M-2 matrix + M-21 Sprint 1 `state-machine.ts`. CLAUDE.md rule 23.

## 4. Offline-first

The mobile attestor can capture evidence and queue transitions while offline. Queue flushes to `/api/progress/[id]/transition` on reconnect with idempotent keys so double-submits are collapsed. Offline duration is bounded only by local storage, not by a session timeout.

**Enforcement:** Capacitor SQLite local queue + `progress.offline.queued` / `.synced` telemetry (M-17). CLAUDE.md rule 24.

## 5. Role-based disclosure

UI surfaces only render transitions the current role is authorised to perform (M-3 RACI). `canPerformTransition(role, state, transitionKey)` is called both server-side (enforcement) and client-side (`<TransitionButton>` disables/hides). Junior Technician (M-16) is ring-fenced to evidence capture only — never stage promotion.

**Enforcement:** `lib/progress/permissions.ts` (M-3) + `<TransitionButton>` progressive disclosure (M-16). CLAUDE.md rule 25.

## 6. Immutable attestation

Once a `ProgressAttestation` is written, its `body`, `signature`, and attached evidence hashes are final. Corrections go through the append-only pathway (principle 2). Deletions are logical-only (set `withdrawnAt`), never physical.

**Enforcement:** M-5 schema constraints. CLAUDE.md rule 26.

## 7. Deterministic integration fan-out

Stage transitions fire at most one event per downstream integration (Xero, Guidewire, DocuSign, Shopify) per transition. Event dispatch is idempotent-keyed by `transitionId` + `integrationKey`. A replay produces the same outbound calls; a retry never double-fires.

**Enforcement:** `lib/progress/integrations/*.ts` with per-integration idempotency table (M-11). CLAUDE.md rule 27.

## 8. Engagement-time licence verification

Before a technician, subcontractor, or labour-hire worker is attached to a `ProgressAttestation`, their IICRC / WHS / state licence status is verified against the `Authorisation` model (M-7) at the moment of engagement — not at login time. A licence that was valid at sign-in but expired before the site visit must block the attestation.

**Enforcement:** M-7 Authorisation model + pre-attestation guard in `lib/progress/service.ts`. CLAUDE.md rule 28.

## Cross-cutting

Principles 1, 2, 6 together form the **forensic evidence bundle** exported on any dispute (principle 13-state `DISPUTED`). Downstream carrier/regulator consumers rely on this bundle being tamper-evident end-to-end.

Principles 3, 5 together are the **promotion contract**: no role bypasses evidence, no evidence bypasses role. Both must hold simultaneously.

Principles 4, 7 together are the **reliability contract**: offline durability at the edge, exactly-once semantics at the integration boundary.

Principle 8 is the **engagement contract**: verify at the moment the stakes exist, not earlier.
