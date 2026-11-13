# DigitalOcean production deploy — Layer A

Runbook for **restoreassist.app** (App Platform + managed Postgres). Adjust names to your DO resources.

## A1 — `prisma migrate deploy`

Before or during each release (before traffic shift):

```bash
# From a machine with DATABASE_URL pointing at production (or DO console → App → Console)
export DATABASE_URL="postgresql://..."
npx prisma migrate deploy
```

Verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Cookie: …" \
  "https://restoreassist.app/api/inspections?limit=20&sort=recent"
# Expect 200 for authenticated session
```

Local dev blocked by P3009: `npm run db:migrate:local`.

## A3 — Mailtrap (not Resend for platform mail)

See `docs/operations/MAILTRAP-EMAIL.md`. Set `MAILTRAP_API_KEY` + `SENDER_EMAIL` on the app; verify sending domain in Mailtrap.

## A5 — Server Actions encryption key

1. Generate once (32+ bytes, base64 or hex — keep stable forever per deployment lineage):
   ```bash
   openssl rand -base64 32
   ```
2. DO App Platform → **restoreassist** → Settings → App-Level Environment Variables:
   - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` = (value above)
3. Redeploy all components so every instance shares the same key.
4. After deploy: logs should not show bursts of `failed-to-find-server-action` from normal UI use.

Reference: `docs/ops/digitalocean/archive/SERVER-ACTIONS-FIX.md`

## A6 — 24h log clean

After deploy, monitor error feed for 24h. Triage any **500** on inspections/reports/invoices lists with `stage` + `eventId`.

## Health gate

```bash
curl -sS "https://restoreassist.app/api/health" | jq .
```

Do not announce “operational” until DB check is ok and Phill script (`PHILL-P0-SMOKE-SCRIPT.md`) passes.
