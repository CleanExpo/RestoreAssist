# Senior PM Walkthrough — Round 1 — 2026-04-21
## Round rubric: does every flow complete without errors?

**Method:** pure static analysis of `/tmp/pi-ceo-workspaces/ra-1494-directurl/` (main after 29 PRs merged tonight). No runtime. 264 mutation endpoints surveyed, 69 use rate limiting, 20 use audit logging, 339 reference auth. Five 5-bucket slices follow, plus a Top 20.

## Verticals

### 1. Signup → first report
- Working: `app/api/auth/register/route.ts` is strong — timing-equalised bcrypt (RA-1340), Turnstile, CSRF, 5/hr rate limit, ToS enforcement, transactional org creation, `Promise.allSettled` fanout (RA-1309), no-orphan fallback (RA-1305). `seedDemoDataForNewUser` ensures non-empty first dashboard. Signup page `app/signup/page.tsx` is 547 LoC — wide surface but not blocking.
- Missing: no explicit "email verification" step surfaced — registration goes straight to ADMIN + TRIAL without confirming email ownership. If email is wrong the welcome email goes to the wrong address with no recovery loop visible.
- Broken: `register/route.ts:94-99` still returns `"User with this email already exists"` 400 — the timing oracle was closed but the text oracle remains. Low risk but a known pattern per RA-1340's spirit.
- Forgotten: `register/route.ts:102-157` the `canCreateOrganization = Boolean(prisma.organization?.create)` fallback path is dead in production (Prisma client is always generated in Vercel). 55 lines of dead branch + a misleading "warning" message.
- UX-UI: onboarding wizard directory only has `account-type/` — no step indicator / progress / skip flow visible.

### 2. Trial → paid
- Working: `app/api/create-checkout-session/route.ts` lines 114-173 correctly enable `automatic_tax` + GST-inclusive prices (RA-1351). Cron `trial-reminders` exists.
- Missing: only one trial reminder cron; no 7-day / 3-day / final-day sequence referenced in code.
- Broken: none found.
- Forgotten: `app/api/reactivate-subscription/route.ts` exists alongside `cancel-subscription` — confirm both guard against race when re-activating a cancelled sub mid-period.
- UX-UI: trial countdown pill in header not verified (no shared header file examined); worth confirming in Round 2.

### 3. Inspection lifecycle
- Working: `app/api/inspections/[id]/` has ~45 sub-routes covering classify, photos, moisture, scope, generate-invoice, swms, evidence, submit — one of the deepest verticals. Bulk delete, export, checklists all present.
- Missing: no route `/inspections/[id]/xero-push` — invoice sync lives under `/api/invoices/[id]/sync` which is correct, but the inspection→invoice glue is only via `/inspections/[id]/generate-invoice`. Confirm idempotency on that handler.
- Broken: none confirmed without deeper read.
- Forgotten: `audit/` and `activity/` sub-routes both exist — potential duplication.
- UX-UI: 45+ sub-routes suggests cognitive overload; Round 2 should audit navigation.

### 4. Progress framework (15-state)
- Working: `app/api/progress/[reportId]/transition/route.ts` is exemplary — CSRF, auth, rate limit 60/min, idempotency (RA-1266), optimistic lock (`expectedVersion`), Junior Tech ring-fence reads `isJuniorTechnician` per-user (RA-1443), full error taxonomy (404/403/409/400/500).
- Missing: nothing spotted.
- Broken: none.
- Forgotten: `app/api/cron/backfill-progress/` exists — confirm it's been run and retired if one-shot.
- UX-UI: n/a at API layer.

### 5. Admin support loop
- Working: `app/api/admin/impersonate/route.ts` requires reason ≥8 chars, refuses self-impersonation, audits to DB, structured log with jti. `app/api/admin/users/[id]/route.ts` has same-org guard + single-field whitelist (RA-1338 mass-assignment defence).
- Missing: impersonate route has **no CSRF validation** and **no rate limit**. Every other admin-mutation route examined has at least one. `admin/impersonate/stop/route.ts` needs same check.
- Broken: `app/api/admin/migrate-v2/route.ts:32` gates only on `ADMIN_MIGRATE_V2_ENABLED` env var — **no `getServerSession` / role check**. When the env flag is on, any unauthenticated request can invoke a migration. Data-integrity risk.
- Forgotten: 14 admin directories; confirm all have admin-role guard (spot checks showed `business-metrics`, `stats`, `users` do).
- UX-UI: no visible admin-list page for impersonation audit trail surfaced in code search.

### 6. Data compliance
- Working: `app/api/account/delete/route.ts` has CSRF, auth, rate limit 3/hr, idempotency (RA-1266), literal confirmation phrase, Stripe cancel, audit log, cascade delete — a near-textbook APP-11 implementation. `app/api/user/export/route.ts` exists.
- Missing: no "retention" settings surface found in `app/dashboard/settings/*` — compliance mentions retention in config only. The self-serve delete UI isn't linked from `settings/page.tsx` based on grep (only subscription/page and settings/page reference `account/delete` — confirm link is visible).
- Broken: none.
- Forgotten: n/a.
- UX-UI: consolidate "Export my data", "Delete account", "Privacy policy" into a single Privacy panel.

### 7. PWA / mobile
- Working: `public/sw.js` implements cache-first for static, network-first for app, network-only stub for `/api/*`, background-sync for `nir-inspection-sync` + `evidence-upload-sync` (RA-1462), offline HTML fallback. Offline queue wired.
- Missing: no visible "install prompt" component (search for `beforeinstallprompt` not done — flag for Round 2). No iOS add-to-home-screen hint.
- Broken: `sw.js` caches ALL successful HTML via `networkFirstWithOfflineFallback` — cache grows unbounded, no size/quota eviction.
- Forgotten: `sw.js:27` PRECACHE_URLS only contains `/`, `/portal/inspections`, `/offline` — dashboard home not precached, so first offline hit on `/dashboard` falls through to root shell.
- UX-UI: no visible "You are offline" banner when sync queue has pending items.

## Horizontals

### Auth + RBAC
- Working: `getServerSession` + role guards in ~339 files; `verifyAdminFromDb` helper standardises admin checks.
- Broken: `admin/migrate-v2/route.ts` lacks role check (vertical 5).
- Missing: 4/17 cron routes have auth check (`CRON_SECRET`). Public cron endpoints (`cleanup`, `dead-letter-review`, `advance-workflows`, `winback`, etc.) can be invoked by anyone who guesses the path.
- UX-UI: n/a.

### Session + 2FA
- Working: `/api/auth/2fa/enable|disable` exist with audit logs and rate limits.
- Missing: no visible 2FA-required enforcement pathway for ADMIN role — 2FA appears opt-in only.

### Error boundaries + observability
- Working: `app/error.tsx` + `app/global-error.tsx` call `reportClientError` (RA-1349). `/api/observability/client-error` sink exists.
- Broken: `app/dashboard/error.tsx` (the dashboard boundary for 90 % of authed traffic) does **not** call `reportClientError` — runtime errors in dashboard silently console-log and never reach Vercel Observability. Same for `app/portal/error.tsx` (28 LoC). Silent data loss on the most-visited boundaries.
- Missing: no `app/api/error.tsx` or structured API error wrapper; handlers catch-and-500 ad hoc.

### AU English consistency
- Broken: `app/features/page.tsx:52` "water, fire, mold, and storm". `components/forms/guided-interview/IICRCClassificationVisualizer.tsx:87` "Mold growth potential". `compliance-library/page.tsx:47,52` uses "Mold" but those are IICRC S520 proper-noun titles and should stay. Six API files (`ai/auto-classify-photo`, `voice-note-transcribe`, `reports/upload`, `reports/generate-enhanced`, `interviews/validate`, `interviews/suggest-next`, `integrations/nir-sync`, `ascora/sync`) reference `mold` in prompt strings — check whether prompt is user-visible.

### Responsive / Accessibility / Dark mode / Keyboard / Contrast
- Not deeply sampled this round — flagged for Round 2 UI walkthrough.

### Rate-limiting + DoS
- Broken: only **69 of 264** POST/PATCH/PUT/DELETE endpoints call `applyRateLimit`. 195 unprotected mutation endpoints. Specific high-value gaps: `admin/impersonate`, all `invoices/[id]/*` sub-routes besides send, all admin/* POSTs besides register.

### Input validation
- Mixed: register, transition, delete all validate well. `admin/users/[id]` uses single-field whitelist (RA-1338). Survey shows many endpoints grep for `sanitizeString` usage — worth a full sweep Round 2.

### Audit logging
- Broken: only **20 of 264** mutation endpoints call `logSecurityEvent` / `auditLog`. Admin mutations, integration sync routes, and most invoice/estimate mutations do not audit. APP-12 risk.

## Touchpoints

### Email templates (signup/trial/receipt/invoice/ticket/deletion)
- Working: `sendWelcomeEmail`, `notifyWelcome` called from register. `lib/email-templates.ts` exists.
- Missing: no visible "deletion confirmation" email in `account/delete/route.ts` (per APP-11 good-practice, confirm deletion to the ex-user's email even though account is gone).

### SMS
- Not sampled — flag Round 2.

### Webhooks
- Working: 9 providers with signature verification (Stripe, Xero, ServiceM8, QuickBooks, MYOB, GitHub, Dr-NRPG, Ascora).
- Broken: `app/api/webhooks/github/route.ts:14` uses `crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))` without a prior length guard — if attacker sends a signature of mismatched length, Node's `timingSafeEqual` **throws** (RangeError). Unhandled, returns a 500 instead of a 401. Same anti-pattern may exist in other webhook routes.

### API callers (MCP / mobile / public)
- Not sampled.

### File exports (PDF / Excel / ZIP)
- Present: `reports/[id]/pdf`, `reports/[id]/generate-forensic-pdf`, `analytics/export`, `claims-export`, `excel-export.ts` etc. Not deeply audited.

## Top 20 findings ranked by user impact

| # | Finding | Bucket | Size | Autonomous? | Notes |
|---|---------|--------|------|-------------|-------|
| 1 | `admin/migrate-v2` has no admin role check (only env flag) | Broken | S | yes | Data-integrity risk when flag on |
| 2 | 195/264 mutation endpoints lack `applyRateLimit` | Missing | L | scaffold | Ship helper + codemod |
| 3 | 244/264 mutation endpoints lack audit logging | Missing | L | scaffold | APP-12 gap |
| 4 | 13/17 cron endpoints missing `CRON_SECRET` check | Broken | M | yes | Anyone can trigger cron |
| 5 | `app/dashboard/error.tsx` does not call `reportClientError` | Broken | S | yes | Observability silent loss |
| 6 | `app/portal/error.tsx` does not call `reportClientError` | Broken | S | yes | Same as #5 |
| 7 | `admin/impersonate` has no CSRF + no rate limit | Broken | S | yes | Security |
| 8 | `webhooks/github` `timingSafeEqual` can throw RangeError | Broken | S | yes | Add length guard before compare |
| 9 | AU English: `features/page.tsx:52` "mold"→"mould" | Broken | S | yes | Brand consistency |
| 10 | AU English: `IICRCClassificationVisualizer.tsx:87` "Mold growth potential" | Broken | S | yes | Same |
| 11 | Dead code path in `register/route.ts` (55 LoC `canCreateOrganization` fallback) | Forgotten | S | yes | Never triggers in prod |
| 12 | `register` duplicate-email response still leaks existence via message | UX-UI | S | yes | Harmonise 400 text |
| 13 | No email-verification step in signup flow | Missing | M | scaffold | APP/onboarding correctness |
| 14 | No 2FA-required enforcement for ADMIN role | Missing | M | scaffold | Security posture |
| 15 | `sw.js` unbounded HTML cache growth | Broken | S | yes | Add LRU or quota check |
| 16 | `sw.js` precache missing `/dashboard` — first offline hit falls back to `/` | Missing | S | yes | Add to PRECACHE_URLS |
| 17 | No deletion-confirmation email in `account/delete` | Missing | S | yes | APP-11 best practice |
| 18 | Admin `impersonate/stop` not confirmed to have CSRF + rate limit | Broken | S | yes | Mirror #7 |
| 19 | Six AI prompt strings reference "mold" — verify user-visible surfaces | UX-UI | S | scaffold | Prompt audit |
| 20 | `app/api/admin/impersonate/log` — verify admin role check on log-read | Broken | S | yes | Privacy if unscoped |

End of round.
