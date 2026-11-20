# Wave program — pilot runbooks (W1–W6)

Internal runbooks for staging, connector pilots, and ops sign-off. Paths below match the wave IDs in `RESTOREASSIST-FULL-FUNCTIONALITY-PROGRAM.md`.

---

## W1-5 — Staging five-stage journey (RA-7228)

Run on a **non-production** database only.

### Quick smoke

```bash
bash scripts/w1-5-staging-journey.sh
```

### Seed

```bash
npx prisma db seed   # if org seed configured
npx tsx prisma/seed-demo.ts
npx tsx prisma/seed-demo-inspection.ts
npx tsx e2e/seed-full-access-account.ts
```

### Retest checklist (from RA-8184)

1. Purchase / trial signup (no production writes)
2. Admin setup + integrations health (expect unverified when zero connectors)
3. Manager completeness inbox + send gate (technician cannot email report)
4. Field capture + submit (`processingComplete` in JSON)
5. Client report send (manager) with field-evidence gate

### Playwright (optional)

```bash
npx --no-install playwright test e2e/walkthrough --project=chromium
```

---

## W3-1 — Xero golden path (pilot receipt)

**Goal:** One pilot org can connect Xero, map accounts, push an invoice, and prove sync via UI + health checks.

### Prerequisites

- `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` on the environment
- Pilot owner has **Online Bookkeeping** add-on + matching ABN (see help article `connect-xero`)
- Redirect URI: `${NEXTAUTH_URL}/api/integrations/oauth/xero/callback`

### Golden path (30 minutes)

1. **Connect** — `/dashboard/integrations` → Xero → complete OAuth → **Connected** badge.
2. **Defaults** — `/dashboard/settings/xero-mapping` → default sales account + GST tax rate saved.
3. **Smoke invoice** — create a draft invoice on a test job → **Sync to Xero** (or wait for hourly cron `sync-xero-payments`).
4. **Receipt A — sync status** — `GET /api/integrations/xero/sync-status` (or Integrations → sync history) shows `SUCCESS` for the outbound sync within 24h.
5. **Receipt B — health** — `/dashboard/integrations/health`:
   - Token Validity: **pass** (or unverified if no other connectors)
   - Sync Success Rate: **pass** after at least one `IntegrationSyncLog` SUCCESS
   - OAuth Live Reachability: **pass** for Xero (`/connections` probe)

### Pilot sign-off template

| Field | Value |
|-------|--------|
| Org / workspace | |
| Xero tenant name | |
| Invoice # pushed | |
| `XeroSyncStatus` id | |
| Health screenshot (integrations/health) | attached |
| Date | |

### Rollback

Disconnect Xero from `/dashboard/integrations` → revoke. Pilot data stays in RestoreAssist; Xero org unaffected.

### References

- User help: `data/content/help/integrations/connect-xero.mdx`
- Outbound sync: `lib/integrations/xero/nir-sync.ts`, `app/api/cron/sync-xero-payments/route.ts`

---

## W3-2 — Ascora migration runbook (honest scope)

**What Ascora is in RestoreAssist today:** a **historical import + labour sync** connector, **not** a live two-way CRM.

Customers keep running jobs in RestoreAssist; Ascora data is pulled in for pricing reference, labour rates, and legacy job fields — not continuous job state mirroring.

### Sales one-pager (say this)

- ✅ Import historical Ascora jobs/clients (cron + manual sync)
- ✅ Labour rate sync for estimating (`sync-ascora-labour`)
- ✅ Webhook ingestion where configured
- ❌ **Not** “replace Ascora on site” — technicians work in RestoreAssist capture/submit
- ❌ **Not** guaranteed real-time bidirectional job status

### Technical connect path

1. Pilot provides Ascora API key → `/api/ascora/connect` (entitlement-gated).
2. Initial backfill: `POST /api/ascora/sync` or cron `sync-ascora-historical`.
3. Ongoing labour: GitHub workflow `trigger-ascora-sync.yml` / cron `sync-ascora-labour`.

### Verification

| Check | Where |
|-------|--------|
| Integration active | `AscoraIntegration.isActive` |
| Fresh sync | Integrations health → **Ascora Liveness** |
| Receipt | `/api/ascora/sync` response + `IntegrationSyncLog` rows |

### Migration checklist (ops)

1. Export pilot’s Ascora job list (CSV) for spot-check counts.
2. Run historical sync; compare job count ±10% (duplicates deduped by external id).
3. Confirm Integrations page shows **canonical Ascora sync receipt** (not generic clients/jobs stub).
4. Document known gaps (e.g. fields not mapped) in pilot Slack thread — do not oversell CRM parity.

### References

- Connect: `app/api/ascora/connect/route.ts`
- Resource copy: `data/content/resources/ascora-job-import.json`

---

## W3-3 — Pilot: enable one secondary connector

After Xero golden path (W3-1), enable **exactly one** of ServiceM8 or QuickBooks for the pilot environment.

### Environment (Vercel / DO)

```bash
# Pick ONE for pilot — not both until each has a signed receipt
NEXT_PUBLIC_SERVICEM8_ENABLED=1
# NEXT_PUBLIC_QUICKBOOKS_ENABLED=1

SERVICEM8_CLIENT_ID=...
SERVICEM8_CLIENT_SECRET=...
# or QuickBooks equivalents
```

### UI surfaces

- Integrations cards hidden unless `NEXT_PUBLIC_*_ENABLED=1` (`lib/flags/one-crm-flags.ts`)
- **Sync receipt:** provider-specific routes (`/api/ascora/sync` pattern); Xero uses `sync-status` + sync history page
- **Health:** `/dashboard/integrations/health` — Sync Success Rate + OAuth Live Reachability must be **pass** after first successful sync

### Pilot exit criteria

1. Connect OAuth from `/dashboard/integrations`
2. At least one `IntegrationSyncLog` with `status: SUCCESS` in 24h
3. Health dashboard green on Token + Sync + OAuth probe for that provider
4. Screenshot archived in pilot folder (SDA optional for integrations page only)

### Rollback

Unset `NEXT_PUBLIC_*_ENABLED` and redeploy — cards disappear; tokens remain until user disconnects.

---

## W4-3 — Xactimate / ESX (partner-only)

**Status:** Not shipped in-product. RestoreAssist does **not** emit ESX or Xactimate import files.

### What we ship instead

- Machine-readable **claims** export: `lib/export/claims-contract.ts` + `GET /api/inspections/[id]/guidewire`
- **Scope JSON** contract: `lib/export/scope-contract.ts` via sketch scope export
- **Adjuster scope CSV** (Wave 4): `GET /api/reports/[id]/export-scope-csv`

### Partner path

1. Signed partner agreement (Verisk / Cotality ANZ channel).
2. Map `ScopeItem` + `CostEstimate` rows to partner SKU catalog (separate project).
3. List on partner marketplace only after legal + field validation.

### Sales line

> “We deliver insurer-ready JSON, Guidewire-shaped payloads, and adjuster CSV today. Xactimate/ESX is a partner integration — not a self-serve checkbox.”

---

## W4-4 — Zapier / automation v1

Custom Zapier app (polling) against RestoreAssist **automation v1** REST routes.

### Auth

**Option A — session (dashboard testing)**  
Manager/admin logged into the dashboard; Zapier is not suitable for cookie auth in production.

**Option B — service key (recommended for pilot)**  

```bash
ZAPIER_API_KEY=<random secret>
ZAPIER_ACT_AS_USER_ID=<manager user id in org>
```

Request header: `Authorization: Bearer <ZAPIER_API_KEY>`

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/automation/v1/inspections` | Poll jobs; optional `?since=ISO8601` |
| GET | `/api/automation/v1/clients` | Poll clients directory |

#### Sample job payload

```json
{
  "schemaVersion": "1.0",
  "data": [
    {
      "id": "clxxx",
      "jobNumber": "INS-2026-0042",
      "status": "SCOPED",
      "claimType": "WATER",
      "address": "12 Example St",
      "clientId": "cl_yyy",
      "updatedAt": "2026-11-19T00:00:00.000Z"
    }
  ]
}
```

### Zapier setup (custom integration)

1. Trigger: **Polling** → GET inspections with `since` from Zap storage.
2. Action examples: Slack notify on `status` change, Google Sheet append, CRM update.
3. Directory listing: follow [Zapier Developer Platform](https://developer.zapier.com) after 30-day pilot on custom app.

### Security

- Rotate `ZAPIER_API_KEY` if leaked.
- `ZAPIER_ACT_AS_USER_ID` must be MANAGER/ADMIN with `organizationId` set.
- No write endpoints in v1 — read-only poll surface.

---

## W5-1 — RA-8184 stall map (automated slice)

Journey audit stall theme: **jobs with gaps go unseen**.

### Automated metrics (now)

| Metric | Source |
|--------|--------|
| Stalled job count | `GET /api/operations/completeness-inbox` → `summary.totalStalled` |
| By blocker | `summary.byBlocker` |
| Age bands (fresh / ageing / stale) | `summary.byAge` |
| Integration stall | `GET /api/operations/program-status` → `integrationFailures` |

### UI

- **Completeness inbox** — stat cards + `ProgramStatusPanel`
- **Home dashboard** — Team gaps card uses server summary stale count
- **Phil** — `GET /api/operations/program-status` JSON (manager session or future Grafana)

### Manual remainder (full RA-8184)

Sign-off alerts, insurer portal gaps, and marketing 404s remain in `docs/audits/journey-audit-2026-11-05.md` — not all are automatable without product decisions.

---

## W5-5 — SLO load harness

Lightweight, read-only concurrency probe against `GET /api/health`. No auth required.

### Run (staging / local)

```bash
export SLO_BASE_URL="https://staging.restoreassist.example"
# Optional overrides (defaults in lib/operations/slo-targets.ts):
# OPS_SLO_P95_MS=1200
# OPS_SLO_ERROR_RATE_MAX=0.02
# OPS_LOAD_CONCURRENCY=5
# OPS_LOAD_REQUESTS=25

npx --no-install tsx scripts/slo-load-harness.ts
```

Exit `0` = pass, `1` = fail. Writes `docs/internal/metrics/slo-last-run.json` for `GET /api/operations/program-status`.

### Production

Set `SLO_ALLOW_PROD=1` only for deliberate owner runs. Default refuses when `VERCEL_ENV=production`.

### Owner gate

Tune `OPS_SLO_P95_MS` to match Senior PM Wave 5.8 / pilot SLO before calling Wave 5 “signed off” in production.

---

## W6 — Production readiness

### Shipped in-repo

- **W6-1** — Managers download last 500 org-scoped `AuditLog` rows: `GET /api/operations/audit-export?since=ISO8601` (optional).
- **W6-2** — Program status exposes `slo.targets` and harness `slo.lastRun`; completeness inbox panel links audit CSV.
- **W6-3** — Invoice email send capped at 15/min per user (`invoice-send` rate limit bucket).

### Hardening (in-repo)

- Invalid `?since=` on audit export and automation v1 → `400` (`lib/api/parse-iso-query.ts`).
- Zapier service key: wrong bearer no longer falls through to cookie session.
- Ops integration failure counts scoped by `organizationId` when present.
- Rate limits: audit export, program status, automation v1, invoice send.
- `scripts/wave-program-verify.sh` — unit gate for waves 0–6 deliverables.

### Still roadmap (W6-4)

Align with `IMPLEMENTATION_ROADMAP.md` phase 6: Supabase RLS hardening, CI build strictness, signed audit archive retention.