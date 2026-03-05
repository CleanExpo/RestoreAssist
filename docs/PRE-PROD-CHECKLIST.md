# RestoreAssist -- Master Pre-Production Checklist

> Version 1.1 | Last updated: 2026-03-05
>
> Work through every section before cutting a production release.
> Mark each item `[x]` when verified.

---

## 1. Environment & Configuration

- [ ] `.env.example` is up to date with every variable the app reads
- [ ] All **required** env vars are set in the production environment:
  - `DATABASE_URL` (pooled Supabase connection, port 6543)
  - `DIRECT_URL` (direct Supabase connection, port 5432 -- used by Prisma migrations)
  - `NEXTAUTH_SECRET` (min 32 random chars)
  - `NEXTAUTH_URL` (production URL, e.g. `https://restoreassist.com.au`)
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth provider)
  - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_APP_URL` (must match the production domain)
- [ ] `NODE_ENV=production` is set
- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` set (stable across deploys -- prevents "Failed to find Server Action" errors)
- [ ] `CRON_SECRET` set and matches Vercel Cron config
- [ ] No test/dev placeholder values remain (grep for `sk_test_`, `pk_test_`, `localhost`)
- [ ] `.env` / `.env.local` are **not** committed to git

## 2. Database (Prisma + Supabase)

- [ ] All Prisma migrations applied: `npx prisma migrate status` shows no pending
- [ ] `prisma migrate deploy` runs cleanly in the build script (see `package.json` build step)
- [ ] Connection pooling configured (PgBouncer on port 6543, `?pgbouncer=true&connection_limit=1`)
- [ ] Direct connection (`DIRECT_URL`) used only for migrations, not runtime queries
- [ ] Database backup strategy in place (Supabase daily backups enabled, or manual pg_dump cron)
- [ ] Seeder run if required (form templates, restoration documents, cost libraries)
- [ ] Row-level security (RLS) policies reviewed on any publicly-accessible Supabase tables
- [ ] No orphaned `workflow-schema.sql` or `init-db.sql` scripts applied outside of Prisma migrate

## 3. Authentication (NextAuth v4)

- [ ] `NEXTAUTH_SECRET` is a cryptographically random string (>= 32 chars)
- [ ] `NEXTAUTH_URL` matches the exact production origin (no trailing slash)
- [ ] Google OAuth provider configured with correct redirect URI (`/api/auth/callback/google`)
- [ ] Middleware matcher protects all private routes: `/dashboard/*`, `/reports/*`, `/clients/*`, `/settings/*`, `/analytics/*`, `/integrations/*`, `/cost-libraries/*`, `/help/*`
- [ ] Public routes remain accessible without a session: `/`, `/login`, `/signup`, `/api/auth/*`, `/_next/*`
- [ ] Session expiry configured (check `authOptions` in `lib/auth.ts`)
- [ ] CSRF token validation is active (built-in to NextAuth)
- [ ] Password change flow works end-to-end (`/api/auth/change-password`, `/api/auth/forgot-password`, `/api/auth/reset-password`)

## 4. API & Routes

- [ ] Health endpoint responds at `GET /api/health` with `{ status: "ok" }` and 200
- [ ] Health endpoint returns 503 when the database is unreachable
- [ ] All protected API routes return 401 when called without a valid session:
  - `/api/clients`
  - `/api/invoices`
  - `/api/reports`
  - `/api/analytics`
  - `/api/inspections`
  - `/api/team/members`
- [ ] Rate limiting active on critical endpoints (health, webhooks, auth) via `lib/rate-limiter`
- [ ] Error responses do not leak stack traces or internal paths (check 500 responses in production mode)
- [ ] Cron endpoints (`/api/cron/*`) are protected by `CRON_SECRET` via `verifyCronAuth`
- [ ] Cron jobs registered in Vercel dashboard:
  - `/api/cron/cleanup` (daily)
  - `/api/cron/cleanup-expired-files`
  - `/api/cron/process-emails`
  - `/api/cron/sync-invoices`
  - `/api/cron/advance-workflows`
  - `/api/cron/dead-letter-review`

## 5. Payments (Stripe)

- [ ] **Live** Stripe keys set (`sk_live_*`, `pk_live_*`) -- not test keys
- [ ] `STRIPE_WEBHOOK_SECRET` is from the **live** webhook endpoint (not test/CLI)
- [ ] Webhook endpoint registered in Stripe dashboard: `https://<domain>/api/webhooks/stripe`
- [ ] Webhook listens for all required events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `payment_intent.succeeded`
- [ ] Idempotency: duplicate webhook events are safely skipped (`StripeWebhookEvent` table)
- [ ] Subscription lifecycle tested: create -> upgrade -> cancel -> reactivate
- [ ] Invoice online payment flow tested end-to-end (checkout session -> payment -> status update)
- [ ] Lifetime payment ($22 one-time) flow tested
- [ ] Add-on purchase flow tested (credits increment)
- [ ] Dunning emails fire on `invoice.payment_failed`
- [ ] Cancellation emails fire on `customer.subscription.deleted`
- [ ] Stripe billing portal URL (`/api/subscription/portal`) resolves correctly

## 6. Email

- [ ] `RESEND_API_KEY` set (Resend transactional email provider)
- [ ] Sender domain verified in Resend dashboard
- [ ] Transactional email templates tested:
  - Password reset email
  - Payment failed (dunning) email
  - Subscription cancelled email
  - Portal invitation email
  - Authority form signature request email
  - Invoice send email
- [ ] Email delivery confirmed (check Resend logs for bounces/failures)

## 7. File Storage

- [ ] Cloudinary credentials set: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- [ ] Upload endpoint (`/api/upload`, `/api/upload/logo`) works in production
- [ ] Signed URLs are used for private assets
- [ ] Automatic cleanup via tags/TTL configured for temporary uploads
- [ ] Image optimization enabled (Next.js `remotePatterns` includes `res.cloudinary.com`)

## 8. AI Providers

- [ ] At least one AI provider key set:
  - `ANTHROPIC_API_KEY` (Claude -- primary)
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `OPENAI_API_KEY`
  - `DEEPSEEK_API_KEY`
- [ ] AI-powered features tested: report generation, chatbot, claims analysis, cost estimation
- [ ] Rate limits / spending caps configured on AI provider accounts
- [ ] Graceful fallback when AI provider is unavailable (no unhandled 500s)

## 9. Build & Performance

- [ ] `next build` passes with zero errors (note: `ignoreBuildErrors: true` is set for TS -- consider tightening)
- [ ] `output: 'standalone'` confirmed in `next.config.mjs`
- [ ] Bundle size analysed (`ANALYZE=true pnpm build`) -- no unexpectedly large chunks
- [ ] `optimizePackageImports` configured for heavy dependencies (already set in next.config.mjs)
- [ ] Images optimised: WebP/AVIF auto-conversion enabled, responsive `deviceSizes` configured
- [ ] Static assets cached (Vercel/CDN handles `/_next/static/*` automatically)
- [ ] `maxDuration` set on long-running API routes (cron jobs, PDF generation, AI calls)

## 10. Security

- [ ] Security headers configured in `next.config.mjs`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 1; mode=block`
  - `Permissions-Policy` (camera, microphone, geolocation disabled)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy` (restrictive, allows only known origins)
- [ ] HTTPS enforced (HSTS header active)
- [ ] Prisma client is not imported in any client-side (`"use client"`) component
- [ ] `INTEGRATION_ENCRYPTION_KEY` set (32 bytes hex) for OAuth token encryption
- [ ] No secrets in `NEXT_PUBLIC_*` env vars (only public keys)
- [ ] Input sanitization active (`lib/sanitize.ts` used on user-facing inputs)
- [ ] Zod validation on critical POST endpoints (e.g. `/api/calculate`)
- [ ] Webhook signature verification active on all webhook routes (Stripe, Xero, QuickBooks, MYOB)

## 11. Integrations (if enabled)

- [ ] Xero: `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` set, OAuth callback registered
- [ ] QuickBooks: `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` set, OAuth callback registered
- [ ] MYOB: `MYOB_CLIENT_ID` / `MYOB_CLIENT_SECRET` set, OAuth callback registered
- [ ] ServiceM8: `SERVICEM8_CLIENT_ID` / `SERVICEM8_CLIENT_SECRET` set (if used)
- [ ] Integration health endpoint responds: `GET /api/integrations/health`
- [ ] Sync error handling: `/api/integrations/sync-errors` returns meaningful data
- [ ] `INTEGRATION_DEV_MODE` is **not** set to `"true"` in production

## 12. Monitoring & Observability

- [ ] Vercel Analytics enabled (`@vercel/analytics` is in dependencies)
- [ ] Error tracking configured (Vercel error logs, or external service like Sentry)
- [ ] Health endpoint monitored by uptime service (e.g. UptimeRobot, Better Uptime)
- [ ] Stripe webhook delivery dashboard reviewed -- no persistent failures
- [ ] Cron job execution verified in Vercel dashboard logs
- [ ] Database connection pool metrics monitored (Supabase dashboard)

## 13. Testing

- [ ] Unit tests pass: `pnpm test` (vitest)
- [ ] E2E tests pass: `pnpm test:e2e` (Playwright)
- [ ] Manual smoke test against staging/preview (see `scripts/smoke-test.sh`)
- [ ] Key user flows manually verified:
  - Sign up -> subscribe -> create report -> generate PDF -> download
  - Create client -> create invoice -> send -> online payment
  - Inspection creation -> photo upload -> report generation
  - Team invite -> accept -> member access

## 14. Deployment

- [ ] Git tag created for the release (`v1.1.0`)
- [ ] Preview deployment tested on Vercel (or staging environment)
- [ ] Database migration ran successfully on production DB
- [ ] Rollback plan documented (previous deployment, database backup)
- [ ] DNS / domain verified (restoreassist.com.au points to Vercel)
- [ ] SSL certificate valid and auto-renewing

---

**Sign-off**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |
