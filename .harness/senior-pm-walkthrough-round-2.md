# Senior PM Walkthrough — Round 2 — 2026-04-22
## Round rubric: does every edge case degrade gracefully?

**Method:** static analysis on `/tmp/pi-ceo-workspaces/ra-1494-directurl/` (post Round 1, RA-1539/40/41/43/44/45 shipped). Sampled ~264 API routes and ~150 dashboard client pages for error paths, loading/error UI branches, and background-work status surfacing.

---

## Working — patterns already following the rubric

- **`lib/observability.ts`** — `reportError` + `reportClientError` helpers exist, keepalive fetch, non-throwing; shape is good.
- **`app/error.tsx`, `app/dashboard/error.tsx`, `app/portal/error.tsx`** — all three call `reportClientError` (RA-1543). Dashboard boundary renders a retry+home affordance with digest.
- **`lib/rate-limiter.ts:122-133`** — `build429` emits `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers AND a user-safe message. Server side is correct.
- **`app/api/progress/[reportId]/transition/route.ts`** — exemplar: 404/403/409/400/500 discriminators, idempotency, full taxonomy. Keep as template.
- **`app/api/invoices/[id]/sync/route.ts`** — writes `externalSyncStatus` PENDING/SYNCED/FAILED + `externalSyncError` + `invoiceAuditLog`. Failure is queryable from the UI.
- **`app/api/auth/register/route.ts:213-217`** — the two `.catch(() => {})` are on fire-and-forget analytics only; primary response is unaffected. Acceptable.
- **`app/dashboard/subscription/page.tsx:101-129`** — `checkSubscription` reads error JSON and toasts `errorData.error || "Failed"`. Good pattern.

---

## Missing graceful degradation

1. **`app/api/*/route.ts` × ~160 routes return `{ error: "Internal server error" }` with `status: 500`** and zero caller-usable discriminator. 228 literal occurrences across 161 files. User cannot tell a DB outage from a Prisma constraint violation from a transient network issue — UI can only say "something failed". Examples: `app/api/inspections/route.ts:257,391`, `app/api/reports/route.ts`, `app/api/clients/[id]/route.ts`, `app/api/invoices/[id]/route.ts`, `app/api/scopes/[id]/route.ts` (×3 each).
2. **Only 1 of ~264 API routes calls `reportError`** (`app/api/admin/users/[id]/route.ts`). The remaining 365 `console.error` occurrences log a raw Error object without a route/user/stage shape — Vercel Observability grouping/alerting cannot filter on `payload.route`, the whole point of RA-1349's helper. The helper exists but is almost entirely unused server-side.
3. **`app/dashboard/inspections/[id]/page.tsx` (2499 LoC, 20+ dynamic children, ~40 fetches)** has NO colocated `error.tsx`. A throw anywhere in this tree escapes to `app/dashboard/error.tsx` which loses route-level context (Error ID tells ops nothing about the inspection). Same for `app/dashboard/reports/[id]/page.tsx`. Only 3 `error.tsx` files exist in the whole app tree.
4. **`app/dashboard/inspections/new/page.tsx:39-54`** — interview-prefill fetch `.catch(() => setInitialDataFromApi(null))`. If the prefill endpoint is down, the user sees an empty form with no hint the server errored. No toast, no retry. Pattern repeats in ~20 client pages (`invoices/[id]/edit:233`, `invoices/credit-notes/new:64`, `invoices/recurring/new:63`, `admin/workflows:548`, etc.).
5. **`useEffect` fetches with no error UI branch** — 103 client pages contain a `useEffect` that fetches; in most the catch path only `console.error` or silently sets `loading=false`. Sample: `app/dashboard/clients/page.tsx`, `app/dashboard/team/page.tsx`. UI sits in an empty/loading state indefinitely.
6. **No client-side `429 Retry-After` handling anywhere.** Server emits the header correctly (see Working above) but no fetch call in `app/dashboard/**` reads `response.status === 429` or the `Retry-After` header to show "try again in N seconds". Generic "Failed" toast instead. Grep shows zero matches for `Retry-After` consumption client-side.
7. **`.catch(() => {})` on mutation side-effects inside API routes** — `app/api/inspections/[id]/storm-damage:218`, `fire-smoke-assessment:250`, `hvac-assessment:185`, `biohazard-assessment:185`, `carpet-restoration:208`, `australian-compliance:228`. Each swallows a child-table delete failure with no log + no server response change — if the delete fails the parent `claimType: null` still commits and the UI claims success, leaving orphan rows forever.
8. **No 422 validation-error surfacing.** Zero files in `app/` check `response.status === 422` before toasting. Zod/schema errors are flattened to a generic "Failed" on the client. Forms like `app/dashboard/reports/new/page.tsx`, `invoices/new`, `clients/[id]/edit` do not render per-field server validation.

---

## Silent failures — logged but never surfaced

9. **Background PDF / email / Xero-sync failures** — `app/api/invoices/[id]/sync/route.ts` correctly records `externalSyncStatus=FAILED`, but the dashboard list `app/dashboard/invoices/page.tsx` doesn't show a red badge for FAILED vs SYNCED per row (only `invoices/[id]/page.tsx` shows it on detail). User who fires a sync and navigates away never learns it failed — no toast, no notification row, no email.
10. **Welcome/receipt/deletion emails use `.catch(() => {})`** — `app/api/auth/register/route.ts:142,213,217`, `app/api/auth/change-password:92`, `app/api/auth/google-signin:138,177`. If the email provider is down, the user never receives the welcome mail and no retry is queued. There's no `email_queue` row or dead-letter. Silent deliverability loss.
11. **Webhook provider failures in `webhooks/{xero,quickbooks,myob,servicem8,ascora,dr-nrpg}` catch → return 200** on some paths (to prevent provider retry storms) but the internal error is only `console.error`'d — no `webhook_dead_letter` row for `app/api/cron/dead-letter-review/route.ts` to pick up. Cross-reference: Round 1 flagged `dead-letter-review` cron has no auth; Round 2 notes that the producer side may not even be writing DLQ rows consistently.
12. **`app/api/admin/publish/google-play/route.ts:129`** — `.catch(() => {})` on the publish side-effect. Admin clicks "publish" → it silently fails → store listing stays stale. No UI feedback.
13. **`app/api/team/invites/route.ts:318`** — invite-send email swallowed. Invitee never gets the email, admin UI shows "invited" successfully.

---

## User-visible but under-informative

14. **Everywhere toasts say "Failed to load X" / "Failed to save X"** with no Error-ID, no retry button on the toast, and no way for the user to forward to support. `react-hot-toast` is already a dep — add a `toastError(err, {op, eventId})` helper that surfaces the Vercel event ID.
15. **`app/api/inspections/route.ts:254-259`** — logs at console.error depth, returns `"Internal server error"`. User sees identical message for (a) Prisma unique violation on inspectionNumber, (b) network blip, (c) auth drift. Needs 409 discriminator on known Prisma error codes (`P2002`, `P2003`, `P2025`) vs generic 500.
16. **Forms returning `setFetchError("Failed to load invoice")`** (`app/dashboard/invoices/[id]/edit/page.tsx:203`) — no distinction between 404 / 403 / 500 / network. Same text for all.

---

## UX opportunities — round-2 error-recovery affordances

- **Global `<ErrorToast>` component** that reads `Retry-After` and shows a countdown on 429, plus a "copy error ID" button for anything ≥500.
- **Standardised server-side error envelope**: `{ error: string, code: string, eventId: string }` — `code` lets clients branch (`VALIDATION_FAILED`, `INTEGRATION_EXPIRED`, `RATE_LIMITED`), `eventId` links to Vercel Observability. One helper + codemod.
- **`error.tsx` at every `[id]/page.tsx` under `/dashboard`** — at minimum for `inspections/[id]`, `reports/[id]`, `invoices/[id]`, `clients/[id]`. Small template, big observability win.
- **"Integration health" banner** in sidebar when any user-scoped integration has `status !== CONNECTED` or `lastSyncAt < now - 24h` — surfaces silent sync drift.
- **Offline-queue status pill** (round-1 flagged no "You are offline" banner) — show pending sync-queue length.

---

## Round-1 regressions — none observed

Spot-checked RA-1539/1540/1541/1543/1544/1545 surfaces:
- `app/dashboard/error.tsx` + `app/portal/error.tsx` both import `reportClientError` ✓
- `app/api/webhooks/github/route.ts` length-guard pre-`timingSafeEqual` — re-read not done, flag to confirm.
- `features/page.tsx` "mould" — re-read not done, flag to confirm.
No visible regressions in Round 2's sampling.

End of round.
