# W5-5 — SLO load harness

Lightweight, read-only concurrency probe against `GET /api/health`. No auth required.

## Run (staging / local)

```bash
export SLO_BASE_URL="https://staging.restoreassist.example"
# Optional overrides (defaults in lib/operations/slo-targets.ts):
# OPS_SLO_P95_MS=1200
# OPS_SLO_ERROR_RATE_MAX=0.02
# OPS_LOAD_CONCURRENCY=5
# OPS_LOAD_REQUESTS=25

pnpm exec tsx scripts/slo-load-harness.ts
```

Exit `0` = pass, `1` = fail. Writes `docs/internal/metrics/slo-last-run.json` for `GET /api/operations/program-status`.

## Production

Set `SLO_ALLOW_PROD=1` only for deliberate owner runs. Default refuses when `VERCEL_ENV=production`.

## Owner gate

Tune `OPS_SLO_P95_MS` to match Senior PM Wave 5.8 / pilot SLO before calling Wave 5 “signed off” in production.