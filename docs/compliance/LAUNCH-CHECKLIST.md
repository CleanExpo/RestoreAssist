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

- [ ] **Company env vars** — set `NEXT_PUBLIC_COMPANY_ABN`,
      `NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL`,
      `NEXT_PUBLIC_SECURITY_EMAIL` in Vercel project settings. Footer
      reads them at build time (RA-1582). Without these, the footer
      falls back to defaults.
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
