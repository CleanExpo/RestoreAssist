# Pilot Readiness Command Centre v1

Date: 2026-07-12
Route: `/dashboard/admin/pilot`
Status: Approved for implementation from the accepted RestoreAssist additions backlog

## Goal

Give an authorised RestoreAssist administrator one screen that answers "can we pilot today?" in under 60 seconds. The screen must distinguish verified evidence from missing or stale evidence and provide a source, owner, timestamp, and next action for every gate that is not green.

## Scope

The first release adds an operational readiness section above the existing NIR evidence-validation dashboard. It covers:

- TypeScript/type-check evidence.
- API route-safety evidence.
- AI guardrail audit evidence.
- Production RLS coverage and Supabase security-advisor evidence.
- Production smoke evidence.
- Pilot canary evidence.
- Release-gate evidence.
- The deployed environment, branch, commit, and source link.
- A derived blocker list and a single `GO`, `CONDITIONAL`, or `NO-GO` decision.

The existing NIR pilot claim-measurement workflow remains intact below the new operational section. NIR claim promotion is research evidence, not a production launch gate, so it does not determine the operational go/no-go decision.

## Chosen Approach

Extend `GET /api/pilot/readiness` and the existing `/dashboard/admin/pilot` page rather than creating a second readiness route.

The API composes a snapshot from three read-only sources:

1. GitHub Actions REST data for CI, smoke, canary, advisor, and release workflows.
2. Vercel-provided deployment metadata for the deployed branch, commit, environment, and URL.
3. A read-only PostgreSQL catalogue query for current public-table RLS coverage.

The GitHub repository is public, so the server can read workflow results without a credential. A token may be supplied later to increase rate limits, but v1 must not require one. GitHub responses use a five-minute server cache. Database and deployment checks are evaluated on each admin request.

This approach is preferred over a manually maintained checklist because a checked box can become stale without detection. It is preferred over a new readiness database model because v1 has authoritative external sources already and does not need an editable status store.

## Gate Contract

Each gate returns:

- Stable id and human-readable title.
- Status: `pass`, `warning`, `fail`, or `unknown`.
- Whether the gate blocks pilot launch.
- Plain-language evidence summary.
- Evidence source label and URL.
- `verifiedAt` timestamp, or `null` when no evidence exists.
- Named owner.
- Concrete next action.

Workflow conclusions map as follows:

- `success` -> `pass` while the evidence is fresh.
- `failure`, `timed_out`, `startup_failure`, or `action_required` -> `fail`.
- `queued`, `requested`, `waiting`, `pending`, or `in_progress` -> `warning`.
- `cancelled`, `skipped`, missing evidence, stale evidence, or an unavailable source -> `unknown`.

Freshness windows reflect workflow cadence:

- Production smoke: 45 minutes.
- Pilot canary: 36 hours.
- Supabase advisor gate: 8 days.
- Type-check, AI audit, route safety, and release gate: 7 days.

The type-check and AI audit gates use the same successful `PR Quality Gates` run because both are enforcing steps in that workflow. The UI identifies the specific step represented by each gate even when the source run is shared.

## Decision Rules

- `GO`: every blocking gate is `pass`.
- `NO-GO`: any blocking gate is `fail`, `unknown`, or stale.
- `CONDITIONAL`: all blocking gates pass but a non-blocking gate is `warning` or `unknown`.

Unknown evidence fails closed for pilot launch. A network failure must never retain or fabricate a green status.

## UI

The operational section appears first on `/dashboard/admin/pilot` and contains:

1. A compact decision banner with the current decision, a one-sentence reason, and refresh control.
2. A deployment strip showing environment, branch, short commit, and deployment/source links.
3. Three summary counts: verified, needs evidence, and blockers.
4. A dense gate list optimised for scanning. Each row shows status, gate, evidence, last verification, owner, and an evidence/action link.
5. A blocker section derived from non-passing blocking gates.
6. The existing NIR evidence-validation dashboard under a clearly separated heading.

Rows collapse into stacked content on mobile. Status is conveyed by icon and text, not colour alone. The implementation uses existing shadcn/ui components and RestoreAssist semantic tokens; it adds no new dependency or design token.

## Data Flow

1. The page authenticates through the existing dashboard session boundary.
2. The page requests `GET /api/pilot/readiness` on load, manual refresh, and the existing five-minute interval.
3. The API re-validates the admin against the database with `verifyAdminFromDb()`.
4. Existing NIR observations and derived cycle-time evidence are loaded with bounded, explicit Prisma selects.
5. The command-centre service reads cached GitHub workflow results, deployment metadata, and live RLS coverage.
6. The API returns NIR report data and `commandCentre` in one response.
7. The client renders the decision directly from the server-derived snapshot; it does not recompute launch policy.

## Security And Failure Behaviour

- Admin authentication remains server-enforced; client role checks are navigation convenience only.
- No GitHub token, database URL, Vercel identifier, or raw provider error is returned to the browser.
- GitHub and RLS failures are isolated to their gates and produce `unknown` evidence instead of failing the full NIR response.
- Raw SQL uses `Prisma.sql` and contains no user input.
- The endpoint remains read-only and performs no production mutation.
- External source links point only to the public RestoreAssist repository, workflow runs, commits, or the configured deployment URL.

## Testing

- Unit tests cover workflow-status mapping, freshness expiry, blocker derivation, and decision outcomes.
- API route tests cover DB-verified admin enforcement and inclusion of the command-centre snapshot.
- Component tests cover decision rendering, evidence timestamps, owner/action visibility, and blocker output.
- Focused Vitest, authoritative `pnpm type-check`, and browser verification at desktop and mobile widths are required before completion.

## Non-Goals

- Editing or overriding gate status from the UI.
- Triggering workflows from RestoreAssist.
- Persisting readiness history in the application database.
- Replacing GitHub, Vercel, Supabase, or release-gate runbooks.
- Changing the NIR claim promotion algorithm.
- Broad visual redesign of the admin area.

## Acceptance

- An admin can identify the pilot decision and all blockers from the first viewport.
- Every non-green gate has an owner, source, last-verification state, and next action.
- Missing, stale, skipped, or unavailable evidence cannot appear green.
- The deployed branch and commit are visible and link to their source.
- Existing NIR pilot collection and claim drill-through links continue to work.
