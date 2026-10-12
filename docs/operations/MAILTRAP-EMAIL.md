# Transactional email — Mailtrap Sending API

RestoreAssist sends outbound mail **only** through [Mailtrap Sending](https://mailtrap.io/) (`lib/email/send-transactional.ts`). Resend/org BYOK keys are not used for platform mail.

## Required env (all environments that send mail)

| Variable | Purpose |
|----------|---------|
| `MAILTRAP_API_KEY` | **Sending API** token ([API tokens](https://mailtrap.io/api-tokens)) — not the SMTP sandbox inbox token |
| `SENDER_EMAIL` | Verified sender domain/address in Mailtrap (e.g. `support@restoreassist.app`) |

Optional: `EMAIL_REPLY_TO` for reply-to on re-engagement mail.

## Local / staging

1. Copy from `.env.example`:
   ```bash
   MAILTRAP_API_KEY="..."
   SENDER_EMAIL="support@restoreassist.app"
   ```
2. Verify sender in Mailtrap → Sending Domains.
3. Smoke send:
   ```bash
   npm run email:test -- you@example.com
   ```

## Production (restoreassist.app)

1. Add the same vars on DigitalOcean App Platform (or your host).
2. Complete domain verification in Mailtrap (DNS records Mailtrap provides — SPF/DKIM).
3. After deploy, run Phill step: invite or “send report” once; confirm delivery in Mailtrap activity + recipient inbox.
4. `/api/health` reports `MAILTRAP_API_KEY+SENDER_EMAIL` under `checks.env.missing` when unset (degraded, not hard-down).

## Ops triage

- Logs: `[email-send]` and `stage: email-send` / `email-send-config` in observability.
- Missing config: `MAILTRAP_API_KEY is not configured — email NOT sent` (no throw; callers continue).
