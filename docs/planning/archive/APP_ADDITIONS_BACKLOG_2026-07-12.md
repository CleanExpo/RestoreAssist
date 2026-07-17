# RestoreAssist App Additions Backlog

Date: 2026-07-12
Scope: current Next.js application, dashboard routes, locked specs, production-readiness plans, and active product surfaces.

## Current surface

RestoreAssist already has a broad application footprint: reports, inspections, client records, invoices, restoration documents, pricing, integrations, field mode, analytics, claims analysis, interviews, media, team management, subscription/add-ons, onboarding, help, tutorials, support, admin, pilot, and content-gate surfaces.

The strongest additions are therefore not generic new modules. They should connect existing surfaces, close proof gaps, and turn already-built but underused systems into pilot-safe workflows.

## Build first

### 1. Pilot Readiness Command Centre

Priority: P0
Surface: `/dashboard/admin/pilot`, `/dashboard/admin`, `/status`, production gate docs

Why this fits now:

- Production exists, but go-live evidence is fragmented across docs, CI, admin pages, and handoff reports.
- The master plan and NIR consolidation docs both show the dominant problem as "built but unverified."
- A command centre gives Phill one live gate for pilot readiness, rather than another static checklist.

First slice:

- Add a dashboard panel showing type-check, route-safety audit, AI audit, RLS/advisor status, smoke status, latest deploy source, and pilot blockers.
- Link each failed gate to its runbook or owning route.
- Add a "last verified at" timestamp per gate.

Acceptance:

- A human can answer "can we pilot today?" from one screen in under 60 seconds.
- Each red/yellow gate has a named source and next action.

### 2. Inspection Sidekick v1

Priority: P0
Surface: `/dashboard/inspections/[id]`, `app/api/live-teacher/*`, help library

Why this fits now:

- `lib/live-teacher` and API scaffolding already exist.
- The app already has interviews, guided field mode, inspections, evidence gates, and help content.
- The highest value version is text-first, inspection-context-aware, and audit logged. Voice can wait.

First slice:

- Mount a bottom-sheet Sidekick on inspection detail.
- Support text turns only.
- Add tools for report gaps, IICRC lookup through existing standards mappings, and method recommendation.
- Save session and turn records append-only.
- Every generated suggestion remains editable before commit.

Acceptance:

- A technician can ask what is missing on an inspection and get a cited, editable checklist.
- All AI turns are gated by subscription/BYOK rules and logged.

### 3. Claims Integration JSON Contract

Priority: P0
Surface: report export, insurer/adjuster handoff, `/api/inspections/[id]/guidewire`, `/dashboard/reports/[id]`

Why this fits now:

- Multi-format output and integration work are blocked by the lack of a versioned claims JSON schema.
- The app already generates PDF, Guidewire-style payloads, Excel/bulk exports, and structured report data, but contracts can drift.

First slice:

- Add `docs/contracts/claims-integration-v1.schema.json`.
- Add a serializer that emits the same canonical payload used for PDF/export.
- Add a self-validation test around one generated report fixture.

Acceptance:

- A report can export PDF and JSON from the same canonical source.
- JSON validates against the checked-in schema.
- Unsupported insurer-specific fields are explicit omissions, not silent gaps.

### 4. Customer Portal Explainer Hub v1

Priority: P1
Surface: `/portal/[token]`, `/dashboard/clients/[id]`, `/dashboard/inspections/[id]`

Why this fits now:

- The approved customer-portal spec identifies this as the wedge feature against Encircle, DocuSketch, ServiceM8, and Ascora.
- Portal routes and components already exist, including client uploads, authorities, status, and videos.
- v1 can stay static-content-first and branded without adding customer AI.

First slice:

- Add a branded portal home with job status, "what happens next", process explainer videos/articles, glossary, practitioner/business profile, and report/download access.
- Add "send customer link" from inspection and client detail.
- Enforce expiry: job closed + 90 days, with admin extension.

Acceptance:

- A homeowner can open one link and understand the current restoration stage, next step, key documents, and who to contact.
- No RA branding is shown except a tiny legal/provider footer where required.

### 5. Offline Field Capture Integration

Priority: P1
Surface: `/dashboard/field`, inspection capture components, mobile shell

Why this fits now:

- Prior review found the offline sync engine built but not mounted in production flows.
- Field capture is the core technician workflow and the highest-risk place for poor connectivity.

First slice:

- Introduce a visible offline/sync status bar in Field Mode.
- Queue photos, moisture readings, notes, and capture events with idempotency keys.
- Replay on reconnect and show failed items with retry.

Acceptance:

- A technician can capture evidence while offline, close the app, reopen, reconnect, and replay without duplicate records.

### 6. Standards Currency Registry

Priority: P1
Surface: compliance library, report generation, admin/content gate

Why this fits now:

- NIR/report defensibility depends on standards currency, citation edition, and staleness blocking.
- The code already contains standards helpers, copyright guards, and S500 citation tests.

First slice:

- Add a versioned registry for S500/S520/S700/NCC/state-code references.
- Block report generation when a required standard is stale or unverified.
- Surface status in admin/content gate.

Acceptance:

- Every generated citation carries edition + section.
- Stale or unverified standards fail closed before AI generation.

### 7. Floorplan Underlay and Homeowner Capture Add-on

Priority: P1
Surface: sketch editor, property lookup, `/portal/[token]`, add-ons

Why this fits now:

- Mapping V2 is already an ANZ-native scoping moat.
- The spec already separates measured geometry from underlay-reference geometry, which reduces IP and accuracy risk.

First slice:

- Package underlay import as a gated add-on.
- Let the client/homeowner submit a rough floorplan through a portal token.
- Keep imported geometry watermarked and excluded from measured quantities.

Acceptance:

- A technician can use an imported plan as orientation only, then create operator-measured geometry for scope calculations.

### 8. Technician Dispatch and Seat Enforcement

Priority: P2
Surface: `/dashboard/team`, `/dashboard/inspections/schedule`, mobile/field mode, subscription/add-ons

Why this fits now:

- BYOK monetisation has queued technician-seat and entitlement phases.
- The dashboard already has team, inspections, scheduling, and subscription surfaces, but the commercial bridge is incomplete.

First slice:

- Add assignment/schedule model for technician jobs.
- Enforce mobile-seat entitlement at assignment and Field Mode access.
- Show no-seat grace countdown and admin remediation path.

Acceptance:

- An admin can assign jobs to technicians, and unpaid mobile seats are blocked after the documented grace period.

### 9. Integration Health Action Queue

Priority: P2
Surface: `/dashboard/integrations/health`, `/dashboard/integrations/sync-errors`, `/dashboard/analytics/revenue-leakage`

Why this fits now:

- Xero, QuickBooks, MYOB, ServiceM8, Ascora, DR/NRPG, and revenue-leakage analysis already exist.
- The missing user value is turning sync failures and leakage findings into ordered actions.

First slice:

- Add an action queue with severity, source integration, affected jobs/invoices, retry state, and owner.
- Link revenue leakage findings to the relevant Ascora/job/invoice record.

Acceptance:

- An operator can work integration problems from a queue rather than hunting through logs and analytics pages.

### 10. Trust and Compliance Centre

Priority: P2
Surface: `/dashboard/security`, `/dashboard/governance`, admin

Why this fits now:

- Security, privacy, RLS, BYOK, data residency, route auth, and audit evidence are recurring blockers.
- A customer-facing B2B compliance platform benefits from visible trust posture, but it must be backed by real gates.

First slice:

- Show configured BYOK providers, storage/email/AI key status, token revocation status, audit-log export, and tenant data controls.
- Add an internal-only admin view for route audit, RLS/advisor, and public-token route status.

Acceptance:

- A paying org can see its own data/control posture without exposing internal infrastructure details.
- Admin can see real security gates without relying on ad hoc docs.

## Defer

- Full voice Sidekick: defer until text Sidekick is useful, persisted, and audited.
- Customer-mode AI: defer until static portal content is live and measurable.
- Separate per-tradie customer apps: incompatible with the approved single-binary/PWA direction.
- Broad visual redesign: production risk and proof gaps should stay ahead of aesthetic expansion.

## Source basis

- `.claude/aggregation/MASTER_PLAN.md`
- `.claude/ARCHITECTURE.md`
- `.planning/SENIOR_PM_REVIEW_2026-06-16.md`
- `docs/production-grade-implementation/EXECUTION_BACKLOG.md`
- `docs/specs/byok-monetisation-spec.md`
- `docs/superpowers/specs/2026-05-15-sp-g-ai-setup-agent-design.md`
- `docs/superpowers/specs/2026-05-15-customer-portal-multi-seat-design.md`
- `docs/superpowers/specs/2026-05-15-sp-6-email-provider-byok-design.md`
- `docs/superpowers/specs/2026-05-15-sp-h-knowledge-substrate-design.md`
- `docs/mapping-v2/spec.md`
- `app/dashboard/layout.tsx`
- `app/dashboard/nav-config.ts`
- `app/dashboard/page.tsx`
- route inventory under `app/**`
