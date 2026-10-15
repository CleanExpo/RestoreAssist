# P0 production checklist (Layer A)

Operational steps for **restoreassist.app**. Code deploy alone does not satisfy P0 until these are green.

## A1 — Database matches released code

1. SSH or use DigitalOcean console for the app + database.
2. From the release tag on production:
   ```bash
   npx prisma migrate deploy
   ```
3. Verify as an authenticated user in the browser:
   - `GET /api/inspections?limit=20&sort=recent` → **200** (not 500 / missing column).

## A2 — Migrations on every release

- CI/CD or deploy runbook must run `prisma migrate deploy` before traffic shifts.
- Developers: `npm run db:migrate:local` when P3009 blocks local deploy (see `scripts/dev-local-migrate.sh`).

## A3 — Email delivers (Mailtrap Sending API)

- Set `MAILTRAP_API_KEY` + `SENDER_EMAIL` on the app; verify sending domain in Mailtrap (SPF/DKIM).
- Run `npm run email:test -- you@example.com` or send one real invite/report.
- Confirm delivery in Mailtrap activity + recipient inbox (not spam).
- See `docs/operations/MAILTRAP-EMAIL.md`.

## A4 — Auth / session stable

- Login → dashboard → Network tab: core list APIs return **200** with session cookies.
- No empty dashboard after successful login (profile + inspections load).

## A5 — Server Actions encryption key

- Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on DigitalOcean (stable across instances).
- After deploy, logs should not show bursts of `failed-to-find-server-action` from legitimate use.

## A6 — Structured errors in ops logs

- Any **500** on inspections/reports/invoices list routes logs `[error]` with `stage` + `eventId`.
- Triage new 500s within 24h of deploy.

## Health gate

- `GET /api/health` → env + DB OK before announcing “operational”.

## Phill sign-off (Layer B)

Run the eight-step browser script in the P0 spec (signup → inspection → report → invoice → re-login). Pass = product truth for this phase.

## Deploy runbooks

- DigitalOcean migrate + Server Actions key: `docs/operations/DIGITALOCEAN-DEPLOY.md`
- Phill browser script: `docs/operations/PHILL-P0-SMOKE-SCRIPT.md`
- P0-1 private Supabase buckets: `docs/operations/P0-1-PRIVATE-BUCKETS.md`

## W11 — Team invite

- E2E: `e2e/invite-tech-happy-path.spec.ts` (requires `ALLOW_TEST_HELPERS=true` locally).
- CI: enable test helpers on staging only; do not enable on production.

## Other ops (not automated in repo)

- Stripe live webhook secret rotation.
- Apply `docs/ops/supabase-migrations-archive/20260717000000_p0_1_private_evidence_sketch_buckets.sql` on prod Supabase after A1.
