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
# fill in each sandbox-only password and the exact READY workspace ID
# in user-pool.json (gitignored); the untouched example is deliberately invalid

# Optional: refresh the image cache from Unsplash (free tier)
cd packages/pilot-tester
UNSPLASH_ACCESS_KEY=your-key npx --no-install tsx src/images/source.ts refresh 4
```

## Run

```bash
# Single company × single job (smoke):
cd packages/pilot-tester
npm run run -- \
  --base-url https://restoreassist-sandbox.vercel.app \
  --company beyond-clean --job water-cat2

# Full swarm (all companies × all 7 domains):
npm run swarm -- \
  --base-url https://restoreassist-sandbox.vercel.app \
  --concurrency 3
```

## Hard rules

- **No prod.** Hostname / DB URL checks in `safety.ts`.
- **Image licence.** Unsplash free tier; manifest records photographer + URL.
- **No new auth code in `app/`.** Harness uses NextAuth credentials provider with a pre-provisioned user pool.
- **Cost gate.** The runner refuses a ceiling above $5, requires every exact sandbox workspace to persist an `aiDailyBudgetUsd` no higher than $5, checks current logged spend before every job, and rejects reports whose observed app + judge cost exceeds that ceiling. A local environment default is deliberately not accepted as proof of the remote app's limit.
- **Exact identities.** The user pool must contain exactly one canonical `pilot-<companyKey>@restoreassist.sandbox` account per discovered company plus its unique READY workspace ID. Login is accepted only when both the session email and `/api/workspace/status` workspace match.
- **Vercel observability.** Every request carries `x-pilot-tester-run-id` so the operator can filter prod logs to one run.
- **No empty evidence.** `npm run preflight` must find a fully graded committed sandbox baseline and every licensed cached photo required by the discovered job set. Missing fixtures fail the canary.
- **Live attribution binding.** Preflight decodes each source as a real JPEG and uses `UNSPLASH_ACCESS_KEY` to confirm the cached source URL, photo page and photographer still match the declared Unsplash photo ID.
- **Immutable evidence hydration.** CI downloads one HTTPS evidence bundle using `PILOT_TESTER_EVIDENCE_BUNDLE_URL`, verifies its exact `PILOT_TESTER_EVIDENCE_BUNDLE_SHA256`, rejects unsafe/unexpected archive members, then extracts only the baseline, its retained source report, manifest and JPEG cache. The baseline hash is checked against the exact retained report bytes and its revision must be a Git ancestor of the candidate.
- **Server-owned sandbox identity.** `/api/workspace/status` must return the canonical workspace name and `sandboxMarker: "RESTOREASSIST_PILOT_SANDBOX_V1"`. A secret-file label is not proof. Until the application exposes those server-owned fields, the live canary intentionally blocks.
- **Persisted photo evidence.** Uploads send the exact content SHA-256, require the server’s hash-bound photo receipt, then read the photo population back before generation.
- **Atomic spend evidence.** Each job requires a server-side `/api/pilot-tester/budget/reservations` reservation and reconciliation receipt covering generation, judge, adjuster and failed-attempt costs. Until that application contract exists, the canary intentionally blocks rather than treating a client-side usage read as a reservation.
- **Adjuster binding.** The adjuster result must identify the inspection, assessment generation and exact assessment SHA-256 and include complete cost evidence. The current application adjuster must add those receipt fields before its result can count as release evidence.

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
├── src/images/cache/    (gitignored — JPEG cache)
└── src/images/manifest.json    photographer attribution (committed)
```

## Linear

- **RA-1726** — parent
- **RA-1727** — 5.B API client + safety + auth (this repo)
