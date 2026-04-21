# Observability Setup — Vercel-native stack

**Ticket:** RA-1349 (launch-blocker — no error monitoring)

RestoreAssist uses **Vercel's native observability stack** — no third-party error-tracking SaaS. This matches the platform the app already runs on, keeps data inside one vendor boundary, and avoids a second DSN / SDK / billing surface.

## What we use

| Layer | Vercel product | What it captures | Where to see it |
|-------|----------------|-------------------|-----------------|
| Runtime logs (Functions + Edge) | **Vercel Observability** (built-in) | `console.log/warn/error`, uncaught exceptions, function duration, memory | Project → Observability → Logs |
| Request traces | **Vercel Observability — Spans** | HTTP spans, external fetches, DB call timing | Project → Observability → Spans |
| Client errors + Web Vitals | **Vercel Analytics** (enabled via `@vercel/analytics`) | Unhandled browser errors, LCP / CLS / INP, route-level performance | Project → Analytics |
| Incident investigation | **Vercel Agent** (public beta) | AI-powered root-cause analysis on anomalies | Project → Agent |
| Bot detection | **Vercel BotID** | Auto-rejected abusive traffic | Project → Observability → BotID |
| Log drains (optional) | **Vercel Log Drain** → Datadog / S3 / HTTP sink | Long-term log retention beyond 30-day default | Project → Settings → Log Drains |

## What this PR ships

1. **`instrumentation.ts`** — enables Node runtime instrumentation (required for Vercel Spans) and adds `onRequestError` to forward RSC request errors to structured logging.
2. **`@vercel/analytics`** (already in `package.json` ^1.3.1) — confirmed present; this PR verifies the `<Analytics />` component is mounted in `app/layout.tsx`. If it wasn't, it's added.
3. **`lib/observability.ts`** — small helper `reportError(error, ctx)` that structured-logs with an `[error]` prefix + request-id + user-id. Vercel Observability indexes these automatically.
4. **Global error boundaries** — `app/error.tsx` + `app/global-error.tsx` already exist (Next.js App Router convention); this PR ensures they call `reportError()` so client-side exceptions land in the Function logs rather than only browser console.
5. **`/api/observability/client-error`** — tiny endpoint that the client error boundary POSTs to so unhandled browser exceptions end up in Vercel Function logs (where they're queryable/alertable).

## What the user still needs to do (≈ 5 min in Vercel dashboard)

1. **Enable Vercel Observability** for the project: Project → Observability → enable if not already
2. **Enable Vercel Agent** (public beta): Project → Agent → enable
3. **Enable BotID** on rate-limited endpoints: Project → Observability → BotID → select `/api/auth/*`, `/api/upload/*`, etc.
4. **Set up an alert policy**: Project → Observability → Alerts → "new error spike" → route to email or Slack webhook. Recommended threshold: 10 errors/min for 5 min.
5. **Optional — log drain** to Datadog/S3 if retention >30d is needed for compliance. Not required for launch.

## Why Vercel vs Sentry/Datadog

- **Zero cost to start** — included in the Vercel plan you're already paying for. Sentry free tier caps at 5k errors/mo; we'd hit that during incident spikes.
- **One vendor boundary** — no second DPA, no second DSN to rotate, no second PII scrubbing config.
- **Source-map resolution is automatic** — Vercel knows the build's source maps because it built the artefact. Sentry requires `SENTRY_AUTH_TOKEN` + build-time upload plugin.
- **Vercel Agent for root-cause** — analyzes spikes against recent deploys automatically. Sentry has a similar feature (Vercel Agent-equivalent) but is extra.

## What we're NOT getting from Vercel that Sentry would give

- Session Replay — if the team decides this is worth a separate vendor ($40/mo Sentry Team), revisit
- Release-health regression detection — manual in Vercel (compare error rate by commit SHA in the dashboard); Sentry auto-flags it
- Cross-project error grouping — only matters if we bolt other services on later

Accept these gaps for launch. Revisit post-100-paying-customers.

## Follow-up tickets

- RA-xxx: Write an alert-response runbook (`docs/compliance/INCIDENT-RESPONSE.md`) — 10 errors/min → triage → deploy revert path
- RA-xxx: Custom dashboards via Vercel Observability API (if the defaults aren't enough once we have signal volume)
- RA-xxx: Integrate with Vercel Chat SDK so ops gets Slack/Telegram notifications on alert fire (instead of email)
