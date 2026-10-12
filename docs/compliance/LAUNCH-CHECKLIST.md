# RestoreAssist Launch Checklist

Items that require user / human action before public GA. Autonomous
engineering work for each is either shipped or scheduled in Linear
(see `docs/compliance/PRODUCTION-READINESS-2026-04-22.md`).

## External services / account setup

- [ ] **Stripe Tax** — activate Australia tax calculation in Stripe
      dashboard so checkout line items compute GST at source. Code
      already emits Tax Invoice wording (RA-1559) and the pricing page
      promises "Tax invoices issued monthly" (RA-1580).
- [ ] **Statuspage / Instatus** — provision hosted incident page and
      either embed into `/status` or redirect. Current `/status` is a
      live heartbeat surface (RA-1581) but lacks an incident history +
      RSS feed.
- [ ] **Domain** — point apex + `www` to Vercel, add `status.` subdomain
      if using a hosted status provider.
- [ ] **DNS for email** — SPF, DKIM, DMARC on `restoreassist.app` so
      Resend-sent transactional email (welcome, password reset, invite)
      doesn't hit Gmail spam. Required before RA-1552 retry behaviour
      is observable.
- [ ] **Uptime monitoring** — hook an external pinger (UptimeRobot /
      Better Uptime) at `https://restoreassist.app/api/health` with a
      60s cadence so SLA claims are defensible.

## Configuration / environment

- [ ] **Company env vars** — `NEXT_PUBLIC_COMPANY_ABN`,
      `NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL`,
      `NEXT_PUBLIC_SECURITY_EMAIL`. This previously said "in Vercel project
      settings", which does not work: Vercel serves only the sandbox, and
      production is the DigitalOcean app in `.do/app.yaml`. Nor is setting
      them in DigitalOcean enough — the footer reads them at **build time**
      (RA-1582), and the image is built in GitHub Actions before DigitalOcean
      sees it. They must travel the same three-piece path as
      `NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID`: an `ARG`/`ENV` pair in
      `Dockerfile`, a `--build-arg` in `build-production-image.yml`, and an
      `envs` entry in `.do/app.yaml`. None of the four has any of the three
      yet, so this box needs a code change before it needs a value. Without
      them the ABN and address render as nothing; support and security email
      fall back to defaults in `lib/brand.ts`.
- [ ] **Pricing config review** — walk `lib/pricing.ts` with the
      business owner and confirm every plan row matches the price on
      the public pricing page. RA-1585 tracks a CI guard to prevent
      drift post-launch.

## Compliance

- [ ] **Privacy Policy review** — legal counsel signs off on
      `/privacy` content matching the data retention + deletion
      endpoints that actually ship.
- [ ] **Terms of Service review** — ditto for `/terms`.
- [ ] **ATO record-keeping statement** — `docs/compliance/AU-GST-TAX.md`
      documents the tax-invoice approach; confirm public-facing copy
      in the pricing + invoice emails aligns.

## Hardware / field

- [ ] **Bluetooth moisture meter pairing** — physical device +
      technician training. Not a code-side blocker.
- [ ] **Mobile PWA installation** — test iOS Safari Add to Home
      Screen + Android Chrome Install; RA-1586 flagged copy drift
      between FAQ and reality.

## Go/no-go gate

Do not flip the public launch switch until **every Urgent ticket in
Linear project "RestoreAssist Compliance Platform" is Done**. Current
Urgent blockers cleared as of 2026-04-22: RA-1580, RA-1581, RA-1582.
High / Medium sellability items (RA-1583, 1584, 1585, 1586) can ship
post-GA with a phased rollout to design-partner customers.
