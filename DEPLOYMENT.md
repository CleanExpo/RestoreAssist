# Deployment — Environment Variable Matrix

Reference for all variables required by the deployment parity checker and CI workflows.

## Deployment Parity Checker (`scripts/verify_deploy.py`)

Run locally or in CI to detect drift between git HEAD and deployed SHAs.

```bash
python3 scripts/verify_deploy.py
```

### Required Variables

| Variable            | Where to get it                                    | Notes                        |
| ------------------- | -------------------------------------------------- | ---------------------------- |
| `VERCEL_TOKEN`      | Vercel → Account Settings → Tokens → Create        | Scope: read-only deployments |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → General → Project ID | e.g. `prj_xxxxxxxxxxxx`      |

### Optional Variables

| Variable         | Purpose                               | Default                  |
| ---------------- | ------------------------------------- | ------------------------ |
| `VERCEL_TEAM_ID` | Required for team/org Vercel projects | Empty (personal account) |
| `GIT_HEAD_SHA`   | Override local git HEAD in CI         | `git rev-parse HEAD`     |

### Where to Set These

**Local development:** Add to `.env.local` (never committed).

**GitHub Actions:** Repository → Settings → Secrets and variables → Actions.

---

## CI — Deployment Parity Job

The `deploy-check` workflow runs `verify_deploy.py` after every merge to `main`.
It requires these GitHub Actions secrets:

| Secret              | Description                    |
| ------------------- | ------------------------------ |
| `VERCEL_TOKEN`      | Vercel API token               |
| `VERCEL_PROJECT_ID` | Vercel project ID              |
| `VERCEL_TEAM_ID`    | Vercel team ID (if applicable) |

Workflow file: `.github/workflows/deploy-check.yml`

---

## Vercel Deployment (Next.js App)

The main RestoreAssist app is deployed to Vercel on every push to `main`.

Vercel project: `dashboard-unite-group.vercel.app`

All application secrets (Supabase, Stripe, Anthropic, etc.) are managed in the
Vercel dashboard → Project → Settings → Environment Variables.
Do not add them here — `.env.example` is the authoritative list of required variables.

---

### NZ tenant setup

1. Set `Organization.country = "NZ"` for NZ-based tenants via Prisma Studio or a migration script.
2. Run `npx tsx prisma/seed-insurer-profiles-nz.ts` after migrating to seed the 7 NZ insurer profiles.
3. Users in NZ organisations will automatically see NZD currency and en-NZ date formatting once the locale helper (`lib/locale/format.ts`) is wired into the session context.
