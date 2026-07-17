# pilot-tester

A Senior-PM canary harness for RestoreAssist. Drives N synthetic
companies through M domain assessments against a sandbox deployment
and grades the output three ways so prompt regressions are caught
before they reach a real pilot.

> **Sandbox only.** The harness refuses to run if `BASE_URL` looks
> like the production hostname. See `src/client/safety.ts`.

## What it does

For every (company × job) pair:

1. Logs in as a pre-provisioned sandbox owner (one cookie per company)
2. Creates an inspection
3. Uploads cached water-damage / mould / fire / storm photos sourced from Unsplash
4. Seeds affected areas + moisture readings
5. Hits `POST /api/inspections/[id]/assessments/[type]/generate` with `enhanceWithAi: true`
6. Grades the result:
   - **Deterministic** — `lib/ai/scope-quality-evaluator.ts::evaluateScopeQuality` (offline, 0–100 composite)
   - **Adjuster persona** — `lib/ai/adjuster-agent.ts::runAdjusterAgent` (approve / query / escalate)
7. Writes `reports/<ts>-<runId>.{md,json}`

## Setup

```bash
cp .env.example .env
cp user-pool.example.json user-pool.json
# fill in real sandbox credentials in user-pool.json (gitignored)

# Optional: refresh the image cache from Unsplash (free tier)
UNSPLASH_ACCESS_KEY=your-key tsx src/images/source.ts refresh 4
```

## Run

```bash
# Single company × single job (smoke):
pnpm --filter pilot-tester run -- \
  --base-url https://restoreassist-sandbox.vercel.app \
  --company beyond-clean --job water-cat2

# Full swarm (all companies × all 7 domains):
pnpm --filter pilot-tester swarm -- \
  --base-url https://restoreassist-sandbox.vercel.app \
  --concurrency 3
```

## Hard rules

- **No prod.** Hostname / DB URL checks in `safety.ts`.
- **Image licence.** Unsplash free tier; manifest records photographer + URL.
- **No new auth code in `app/`.** Harness uses NextAuth credentials provider with a pre-provisioned user pool.
- **Cost gate.** Each synthetic workspace runs under the existing RA-1707 daily AI budget (`PILOT_TESTER_DAILY_BUDGET_USD`, default $5/day).
- **Vercel observability.** Every request carries `x-pilot-tester-run-id` so the operator can filter prod logs to one run.

## Layout

```
pilot-tester/
├── src/
│   ├── client/      safety, auth, api-client
│   ├── companies/   synthetic profiles
│   ├── jobs/        7 domain-anchored job templates
│   ├── images/      Unsplash sourcer + manifest
│   ├── personas/    senior-pm wrapper around runAdjusterAgent
│   ├── runner/      orchestrator + grader + reporter
│   ├── __tests__/   vitest specs for fixtures + safety
│   └── index.ts     CLI entry
├── reports/         (gitignored — per-run output)
├── images/cache/    (gitignored — JPEG cache)
└── manifest.json    photographer attribution (committed)
```

## Linear

- **RA-1726** — parent
- **RA-1727** — 5.B API client + safety + auth (this repo)
