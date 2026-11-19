# W5-1 — RA-8184 stall map (automated slice)

Journey audit stall theme: **jobs with gaps go unseen**.

## Automated metrics (now)

| Metric | Source |
|--------|--------|
| Stalled job count | `GET /api/operations/completeness-inbox` → `summary.totalStalled` |
| By blocker | `summary.byBlocker` |
| Age bands (fresh / ageing / stale) | `summary.byAge` |
| Integration stall | `GET /api/operations/program-status` → `integrationFailures` |

## UI

- **Completeness inbox** — stat cards + `ProgramStatusPanel`
- **Home dashboard** — Team gaps card uses server summary stale count
- **Phil** — `GET /api/operations/program-status` JSON (manager session or future Grafana)

## Manual remainder (full RA-8184)

Sign-off alerts, insurer portal gaps, and marketing 404s remain in `docs/audits/journey-audit-2026-11-05.md` — not all are automatable without product decisions.