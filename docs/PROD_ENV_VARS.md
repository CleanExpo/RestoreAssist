# Production env vars — RestoreAssist

Living document of every env var the prod deploy expects, and what
each one unblocks. Updated 2026-05-02 alongside the RA-1842 health
audit.

## Currently missing (flagged by `/api/health` env-degraded check)

### `CLOUDINARY_URL`

**Format:** `cloudinary://<api_key>:<api_secret>@<cloud_name>`

**What it unlocks:** image uploads via the Cloudinary SDK. Specifically:
inspection photo capture, scope-of-works image attachments, marketing
hero images. Without it, image-upload routes fall back to a basic
fetch handler that may work but skips the optimisation pipeline
(WebP/AVIF conversion, responsive variants, CDN edge caching).

**Where to set:** Vercel project → Settings → Environment Variables
→ Add new (Production + Preview).

**How to get the value:**
1. Sign in at https://cloudinary.com/console
2. Account Details → Environment variable → copy the `CLOUDINARY_URL`
   line verbatim (already in the right format)

**Smoke after setting:** redeploy with build cache OFF
(`feedback_vercel_env_redeploy.md`); then `curl
https://restoreassist.app/api/health` should return
`"checks":{"env":{"status":"ok"}}`.

### `XERO_WEBHOOK_KEY`

**Format:** 44-char base64 string (Xero generates it)

**What it unlocks:** Xero invoice sync webhook signature verification.
Without it, the `/api/webhooks/xero` route returns 503 on every
inbound webhook. Your Xero account → Pi-CEO inbox + invoice trail
breaks silently.

**Where to set:** same as above. Production + Preview.

**How to get the value:**
1. Sign in at https://developer.xero.com/myapps
2. Pick the RestoreAssist app → Webhooks tab
3. The webhook key is shown there. If a key was generated previously,
   use it. If not, click "Generate key" — note that doing so
   invalidates the old key and Xero will start sending the new one
   immediately, so update Vercel before re-saving.

**Smoke after setting:** trigger a test event from the Xero webhooks
page → Vercel logs should show the route returning 200 for the
test payload.

## Already set (don't touch)

These are documented here so the next operator doesn't accidentally
remove them.

| Var | What it does |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (Prisma) |
| `DIRECT_URL` | Supabase direct connection (migrations) |
| `NEXTAUTH_URL` | NextAuth canonical URL (https://restoreassist.app) |
| `NEXTAUTH_SECRET` | NextAuth session/JWT signing secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth provider |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe billing |
| `ANTHROPIC_API_KEY` | Claude API for AI-assisted reports |
| `GITHUB_TOKEN` | GitHub releases / artefact uploads |

## Pending (RA-1842 follow-up — not yet wired)

These are referenced by code that's merged but inert until envs ship.

### `APPLE_TEAM_ID` (PR #867)

The 10-character Apple Developer team ID. Drives the AASA file at
`/.well-known/apple-app-site-association`. Without it the file ships
with a bare bundle ID and Apple's CDN refuses to associate it with
any installed iOS app. Runbook: `docs/IOS_UNIVERSAL_LINKS.md`.

### `APPLE_CLIENT_ID` + `APPLE_CLIENT_SECRET` + `NEXT_PUBLIC_APPLE_SIGNIN_ENABLED` (PR #868)

Sign-in-with-Apple (Apple guideline 4.8). `APPLE_CLIENT_SECRET` is
a 180-day JWT signed with a `.p8` key — rotate before expiry.
Runbook: `docs/IOS_SIGN_IN_WITH_APPLE.md`.

## Removing the env-degraded warning entirely

Once `CLOUDINARY_URL` and `XERO_WEBHOOK_KEY` are set on Vercel,
`/api/health` returns:

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latencyMs": <ms> },
    "env": { "status": "ok" }
  }
}
```

Combine this with the migration-drift recovery (`scripts/_drift-recovery.sql`)
and the iOS PR merges, and `/api/health/*` returns 100% green across both
endpoints.
