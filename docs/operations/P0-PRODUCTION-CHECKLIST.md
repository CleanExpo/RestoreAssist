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

## A3 — Email delivers

- Resend domain verified; SPF + DKIM aligned with sending domain.
- Send one real message (invite or report) and confirm inbox delivery (not spam).

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

## Not in repo-only scope

- Private evidence bucket policy on Supabase (schedule immediately after A-layer if still public).
- Stripe live webhook secret rotation (ops).
- W11 team invite happy-path E2E (track as known limitation until green).
