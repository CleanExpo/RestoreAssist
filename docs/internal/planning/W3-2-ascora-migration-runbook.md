# W3-2 — Ascora migration runbook (honest scope)

**What Ascora is in RestoreAssist today:** a **historical import + labour sync** connector, **not** a live two-way CRM.

Customers keep running jobs in RestoreAssist; Ascora data is pulled in for pricing reference, labour rates, and legacy job fields — not continuous job state mirroring.

## Sales one-pager (say this)

- ✅ Import historical Ascora jobs/clients (cron + manual sync)
- ✅ Labour rate sync for estimating (`sync-ascora-labour`)
- ✅ Webhook ingestion where configured
- ❌ **Not** “replace Ascora on site” — technicians work in RestoreAssist capture/submit
- ❌ **Not** guaranteed real-time bidirectional job status

## Technical connect path

1. Pilot provides Ascora API key → `/api/ascora/connect` (entitlement-gated).
2. Initial backfill: `POST /api/ascora/sync` or cron `sync-ascora-historical`.
3. Ongoing labour: GitHub workflow `trigger-ascora-sync.yml` / cron `sync-ascora-labour`.

## Verification

| Check | Where |
|-------|--------|
| Integration active | `AscoraIntegration.isActive` |
| Fresh sync | Integrations health → **Ascora Liveness** |
| Receipt | `/api/ascora/sync` response + `IntegrationSyncLog` rows |

## Migration checklist (ops)

1. Export pilot’s Ascora job list (CSV) for spot-check counts.
2. Run historical sync; compare job count ±10% (duplicates deduped by external id).
3. Confirm Integrations page shows **canonical Ascora sync receipt** (not generic clients/jobs stub).
4. Document known gaps (e.g. fields not mapped) in pilot Slack thread — do not oversell CRM parity.

## References

- Connect: `app/api/ascora/connect/route.ts`
- Resource copy: `data/content/resources/ascora-job-import.json`