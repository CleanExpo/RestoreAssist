# RestoreAssist customer journey audit, 5 November 2026 (RA-8184, report only)

**Bottom line:** a claim slows down because a report can leave the business with no
evidence check, no manager review, no signature and no proof it was opened. Every gap
comes back later as an insurer query, and the job then waits on a person to chase it.

## Scope and method

- **Run type:** report only. Nothing in the app, database, Linear backlog or builder queue
  was changed. No child issues were filed.
- **Code read:** `CleanExpo/RestoreAssist` `main` at `5b00c64ebae8e5cc28673fedb0dd48ba90df29f0`.
  The live site reported the same SHA at the time of the walk:
  `GET https://restoreassist.app/api/health` returned
  `"deploymentSha":"5b00c64ebae8e5cc28673fedb0dd48ba90df29f0"`, database `ok` (04/11/2026
  16:12 UTC). The code described below is the code running in production.
- **Live walk:** https://restoreassist.app only (never restoreassist.com.au). 25 routes
  were probed with `curl -L`. Nine public pages were rendered in headless Chromium
  (`agent-browser`) and their accessibility trees were read.
- **Test accounts:** none were used. RA-7228 records that an agent must not enter
  credentials, and no shared test session or seeded demo tenant exists for an agent to
  use. Creating a fresh trial account on the live site would write to the production
  database, which this run is barred from doing. All signed-in stages were therefore
  audited from code, and their live walk is marked **UNCHECKED** below.
- **Code audit:** three read-only reviewers each covered given stages. Every finding they
  returned was then checked against the cited file and line by the lead before it went
  into this report. The **Verified** column shows that check. Where a step in a five-whys
  chain rests on reasoning rather than a line of code, it is marked *INFERRED*.
- **Previous audit:** `docs/audits/2026-10-06-role-walkthroughs.md`, at `bc6acd2`. Its
  findings are not repeated here. The [Status of the 6 October findings](#status-of-the-6-october-findings)
  section lists which are now fixed and which are still open at `5b00c64`.

**Severity scale**

| Severity | Meaning |
| --- | --- |
| Critical | Money, evidence or claim outcome is wrong, and nobody is told. |
| High | Stalls a claim or misleads a user on a core path. |
| Medium | Adds friction or rework, or is a weak control. |
| Low | Polish. |

**Review flag:** **REVIEW** means the fix touches the live database or a customer-facing
page. Under RA-8184, such a fix must pass review before shipping and must never change
silently.

## Why claims take so long: the stall map

A claim moves from field capture to the insurer through these points. None of them has a
clock, an owner or an alert.

1. **Capture time is wrong.**
   - Photo and reading times record the moment of tapping Save or syncing, not the moment
     of capture (S4-2, S4-3).
   - The insurer cannot trust the order of events.
2. **The evidence check looks at the wrong table.**
   - The evidence-gap check reads only `EvidenceItem`, but field photos and readings are
     saved to other tables (S4-4).
   - A job can read 100% complete while the check looked at nothing.
3. **Submit can fail without the technician knowing.**
   - Submit reports success even when the AI pipeline failed (S4-6).
   - The job stays stuck in `PROCESSING`, and sign-off is blocked.
4. **No manager reviews the report.**
   - The technician can author, approve and send their own report (S3-2).
5. **Reports go out without an evidence check.**
   - A report is marked `COMPLETED` the moment it is created (S5-1).
   - The send action never checks completeness.
6. **The PDF certifies a claim above a blank signature line.**
   - It carries no claim number and no version (S5-6).
7. **There is no proof the report was received.**
   - The delivery panel shows "sent" and "delivered" for any `COMPLETED` report (S5-2).
   - No "viewed" or "acknowledged" event is ever written (S5-3).
8. **Nobody sees which jobs are stuck.**
   - There is no ageing or SLA view, and no cron that alerts a manager (S3-3).
   - Dashboard read failures show as real zeros (S3-1).

The shortest route to faster claims:

| Order | Fix | Findings |
| --- | --- | --- |
| 1 | Block the send action on missing evidence | S5-1 |
| 2 | Make the evidence check read the stores the technician actually writes to | S4-4 |
| 3 | Record true capture times | S4-2, S4-3 |
| 4 | Add a manager review step and an ageing panel | S3-2, S3-3 |

## Findings summary

| ID | Stage | Severity | Finding | Verified | Flag |
| --- | --- | --- | --- | --- | --- |
| S1-1 | 1 Purchase | High | A paid checkout with missing or mismatched metadata is marked COMPLETED and activates nobody | yes | - |
| L-1 | 1 Purchase | High | `/subscribe` is still a 404 on the live site, while the payment gate redirects users to it | live + code | REVIEW |
| S1-2 | 1 Purchase | Medium | The post-payment page spins forever if activation is slow | yes | REVIEW |
| S1-3 | 1 Purchase | Medium | Email-and-password signup gets a trial with no email verification | partly (login side UNPROVEN) | REVIEW |
| S1-4 | 1 Purchase | Medium | Workspace setup at signup is best-effort, and absent on the Google and checkout paths | agent-reported | REVIEW |
| L-2 | 1 Purchase | Medium | The pricing page itself says paid-only features are "not yet enforced on the server" | live + code | REVIEW |
| S1-5 | 1 Purchase | Medium | The "Seat required" page is a dead end for the blocked technician | agent-reported | REVIEW |
| S1-6 | 1 Purchase | Low | Duplicate-email message reveals which emails are registered; no notice of an immediate charge; pack GST not stated | agent-reported + live | REVIEW |
| S2-1 | 2 Admin | High | The setup pricing check goes green on a $0 rate card | yes | REVIEW |
| S2-2 | 2 Admin | High | Business name, ABN and logo cannot be edited after setup; the error message points to a page that does not exist | yes | REVIEW |
| S2-3 | 2 Admin | Medium | "Skip setup" activates with red checks, and the skip is only written to `console.log` | yes | REVIEW |
| S2-4 | 2 Admin | Medium | Integration health reads stored rows, not the provider; zero integrations reads as `pass` | agent-reported | REVIEW |
| S2-5 | 2 Admin | Medium | When an invite email fails, the invite link is returned but never shown; there is no reminder | yes | REVIEW |
| S2-6 | 2 Admin | Medium | Removing a staff member strands their open jobs | partly INFERRED | REVIEW |
| S3-1 | 3 Manager | High | A failed dashboard read renders as real zeros | yes | REVIEW |
| S3-2 | 3 Manager | High | No manager review before a report goes to the client or insurer | yes (send gate) | REVIEW |
| S3-3 | 3 Manager | High | No ageing, SLA or stuck-job visibility, and managers are never notified | agent-reported | REVIEW |
| S3-4 | 3 Manager | Medium | The sample report is counted in real analytics; "Avg drying days" is really job lifetime | yes | REVIEW |
| S3-5 | 3 Manager | High | No consistent record of who changed what for reports, approvals and roles | agent-reported | REVIEW |
| S3-6 | 3 Manager | Medium | Analytics defaults to the manager's own jobs, not the team's | agent-reported | REVIEW |
| S4-1 | 4 Field | High | The capture screen cannot be reached on an offline cold start | yes | REVIEW |
| S4-2 | 4 Field | High | Photos lose their true capture time; GPS can be missing without warning | yes | REVIEW |
| S4-3 | 4 Field | High | Moisture readings are stamped with sync time; unit and meter details are dropped | yes | REVIEW |
| S4-4 | 4 Field | Critical | The evidence-gap check reads the wrong table and reports 100% when nothing was checked | yes | REVIEW |
| S4-5 | 4 Field | High | The submit gate needs only one photo and one reading; equipment is never checked | agent-reported | REVIEW |
| S4-6 | 4 Field | High | Submit says "successful" when processing failed, leaving the job stuck | yes | REVIEW |
| S4-7 | 4 Field | Medium | The drying goal can be certified from one reading; monitoring points are matched by free text | agent-reported | REVIEW |
| S4-8 | 4 Field | Medium | Scope generation feeds baseline and invalidated readings to the model | yes | REVIEW |
| S4-9 | 4 Field | Medium | The assigned technician cannot sign off or run the completeness check | yes (sign) | REVIEW |
| S4-10 | 4 Field | Medium | Room data is entered twice and joined by name; a mismatch blocks submit at the last step | agent-reported | REVIEW |
| S4-11 | 4 Field | Low | Sign-off is a typed name only, with no drawn signature and no offline queue | agent-reported | REVIEW |
| S5-1 | 5 Customer | Critical | A report can be created, finalised and emailed with no evidence check | yes | REVIEW |
| S5-2 | 5 Customer | High | The delivery panel claims "sent" and "delivered" for any COMPLETED report | yes | REVIEW |
| S5-3 | 5 Customer | High | No delivery confirmation, no "viewed" signal, and nothing records acknowledgement | yes | REVIEW |
| S5-4 | 5 Customer | Medium | The emailed link cannot be revoked; the expired page offers no self-service | agent-reported | REVIEW |
| S5-5 | 5 Customer | High | The insurer web portal omits photos, floor plan, signatures and claim number | agent-reported | REVIEW |
| S5-6 | 5 Customer | High | The PDF certifies the report above a blank signature line, with no claim number or version; AI drafts can be sent | partly | REVIEW |
| S5-7 | 5 Customer | Medium | Versioning is manual and invisible to the people receiving the report | agent-reported | REVIEW |
| S5-8 | 5 Customer | Medium | A signature request is marked "sent" before the email goes; the link never expires; no reminder | yes | - |

**Totals:** 2 Critical, 17 High, 18 Medium and 2 Low, 39 findings in all. 37 carry a
review flag.

---

## Stage 1: Business owner purchasing

**Live walk: PARTLY CHECKED.** The pricing page, signup form, login page and the
`/billing/upgrade` auth wall were rendered or probed. The Stripe payment step was **not
reached**. The trial needs no card, so the only route to checkout is `/billing/upgrade`
after signing in (it redirects to `/login?callbackUrl=/billing/upgrade`). The run stopped
there: no account was created and no payment was attempted.

**What works (live):**
- The pricing page states "AUD, incl. GST. Tax invoices issued monthly. Cancel any time."
- The signup form has a terms consent checkbox that disables "Create Account" until it is
  ticked.
- Google signup is offered.
- The checkout and webhook code checks the Stripe signature, records each event and
  ignores replays.

### L-1 (High, REVIEW): `/subscribe` is a 404 on the live site, but the payment gate sends users there

**Evidence:**
- `curl https://restoreassist.app/subscribe` returned `404` on 05/11/2026.
- `lib/workspace/payment-gate.ts:146` returns `redirectUrl: "/subscribe"` with `402` when
  no workspace exists.
- `lib/entitlements/require-addon.ts:92` sends `NO_WORKSPACE` to `/subscribe`.
- `app/subscribe` does not exist.
- This is finding #8 of the 6 October audit, still open.

**Five whys:**
1. Why does an owner hit a 404? The 402 response names `/subscribe`.
2. Why is it missing? The page was never built, or it was renamed to `/billing/upgrade`
   (*INFERRED*).
3. Why can an owner have no workspace? Workspace setup is best-effort (S1-4).
4. Why wasn't this caught? No e2e test follows the `NO_WORKSPACE` redirect.
5. Why does it matter? It hits exactly the users who are ready to pay.

**Fix:** point both redirects at `/billing/upgrade`, or add a `/subscribe` redirect. Add a
test that follows the redirect.

### S1-1 (High): a paid checkout with bad metadata returns 200, activates nobody and is marked COMPLETED

**Evidence:** `app/api/webhooks/stripe/route.ts`:
- Lines 541-547: `if (!metadataUserId) { console.error(...); return; }`
- Lines 591-596: `if (!ownerAllows(subscription, metadataUserId)) { console.error(...); return; }`
- Lines 430-434: every normal return then writes `status: "COMPLETED"` on the
  `stripeWebhookEvent` row.

**Five whys:**
1. Why does a payer stay on TRIAL? The handler returns early without throwing.
2. Why is that silent? The outer handler treats any non-throw as success.
3. Why doesn't a retry catch it? Stripe got a 200, and the retry cron looks for FAILED rows
   (*INFERRED*: the cron body was not read).
4. Why does nobody notice? There is no "paid but not provisioned" state and no alert.
5. Why does it matter? Only the customer notices, after paying.

**Fix:**
- In these branches, write a `NEEDS_REVIEW` status and raise an alert.
- Make the Stripe reconcile job list paid sessions whose user is not ACTIVE.
- Internal only, no flag needed.

### S1-2 (Medium, REVIEW): the post-payment page spins forever

**Evidence:** `app/billing/success/page.tsx`:
- Line 72 tells the payer: "This usually takes a few seconds."
- Line 89: `var max = 15;`, polling every 2 seconds.
- Lines 98-99: when `attempts >= max` it calls `clearInterval(t)` and nothing else. No
  message and no button appear.

**Five whys:**
1. Why is the payer stuck on "Activating…"? Polling stops silently after about 30 seconds.
2. Why is there no fallback? Only the webhook activates the account.
3. Why only the webhook? RA-6962 removed browser-side activation, which is correct for
   security.
4. Why does that hurt? A late or dropped webhook (S1-1) leaves the page with nothing to show.
5. Why is nobody told? Neither the page nor the server records a stuck activation.

**Fix:** after polling ends, show "Payment received, finishing setup", a support
reference and a Retry button that runs a server-side reconcile.

### S1-3 (Medium, REVIEW): email-and-password signup gets a live trial without email verification

**Evidence:**
- `app/api/auth/register/route.ts` creates the user with `subscriptionStatus: "TRIAL"`. It
  sets no `emailVerified` and sends no verification link.
- `emailVerified` exists on `User` (`prisma/schema.prisma:49`), but only the Google paths
  set it.
- Whether login enforces it is **UNPROVEN**: `lib/auth.ts` was not read.

**Five whys:**
1. Why can an unowned address hold a trial? Register sends no verification.
2. Why? Signup was tuned for speed (RA-4990, RA-7423).
3. Why does it matter later? Welcome, trial and report emails go to that address.
4. Why is that a risk? Report emails carry client and claim data.
5. Why isn't it caught? Nothing ties sending a report or paying to a verified address.

**Fix:** send a verification link at register. Require a verified address before paying
or sending a report by email.

### S1-4 (Medium, REVIEW): workspace setup is best-effort at signup, and absent for Google and checkout

**Evidence** (agent-reported):
- `register/route.ts:248-253` wraps `ensureWorkspaceForUser` in a `try` whose `catch` only
  logs.
- No such call exists in `app/api/auth/google-signin/route.ts` or in the checkout webhook
  handler.

**Five whys:**
1. Why can a paying owner have no workspace? Failure at signup is swallowed.
2. Why are some owners never covered? Google signups skip the call.
3. Why isn't it repaired? Repair runs only when the user opens `/setup` or the status
   endpoint.
4. Why not at payment? The webhook does not provision.
5. Why does it matter? It leads to L-1: a 402 and a 404.

**Fix:** call the idempotent `ensureWorkspaceForUser` from the Google signup path and the
checkout webhook.

### L-2 (Medium, REVIEW): the pricing page says paid-only features are not enforced

**Evidence:**
- On the live `/pricing` page, `components/pricing/TierComparison.tsx:176` reads: "we are
  still wiring that up, so during the trial you can reach them as well."
- Line 200 reads: "also not yet enforced on the server."

**Five whys:**
1. Why can't a buyer see what $99 adds? The trial already reaches Enhanced and Optimised
   reports and PDF upload.
2. Why? Entitlements for those features are not checked on the server.
3. Why say so on the page? An honest disclosure was chosen over a false limit. That was the
   right call.
4. Why does it still cost sales? The upgrade case leans on Quick Fill and volume alone.
5. Why does it persist? There is no ticket or date on the page for finishing the wiring
   (*INFERRED*).

**Fix:** enforce the paid-only features on the server, then change the copy. This is a
price and entitlement change, so it needs the owner's decision.

### S1-5 (Medium, REVIEW): "Seat required" is a dead end

**Evidence:**
- `app/seat-required/page.tsx` offers only "Check again" and "Sign out".
- The copy (`lib/billing/trial-seat-copy.ts`) says "Ask your business owner to pay for
  your seat."

**Five whys:**
1. Why can't the technician progress? The page has no action that does anything.
2. Why? Buying seats is owner-only.
3. Why isn't the owner told? No notify-owner endpoint exists (a search of `app/api/billing`
   and `lib/billing` found none; the search was not exhaustive).
4. Why does it matter? The technician is idle on site.
5. Why is nobody accountable? The hand-off is a sentence, not a workflow.

**Fix:** add an "Email my owner" button with a deep link to buy the seat.

### S1-6 (Low, REVIEW): smaller purchase items

- A duplicate email at register returns "User with this email already exists", which
  reveals which emails are registered.
- A trial ending within 48 hours is charged at once, and the payer is not told.
- On the live pricing page, the report packs ($20, $50, $100) show no buy button and no
  GST wording.

**Five whys (shared):**
1. Why is the buyer surprised? Copy lags behind the billing rules.
2. Why? Billing edge rules live in code constants.
3. Why aren't they shown? No UI reads them.
4. Why isn't it tested? No test checks copy against the billing rules.
5. Why does it matter? Surprises lead to refund requests.

**Fix:** use a generic duplicate-email message, show a "charged today" line, and add GST
wording and a buy path to the packs.

---

## Stage 2: Admin setup

**Live walk: UNCHECKED.** `/setup` and `/onboarding` redirect to `/login` when signed out.
No test login was available (RA-7228). All findings in this stage come from code.

### S2-1 (High, REVIEW): the pricing check goes green on a $0 rate card

**Evidence:**
- `lib/setup/checks.ts:142-145` sets `ready = p != null && p.masterQualifiedNormalHours != null && p.administrationFee != null`.
  It never tests for a value above zero.
- `app/api/setup/pricing/route.ts:36-57` creates missing rates as `0`.

**Five whys:**
1. Why does $0 pass? The check tests for a value being present, not above zero.
2. Why is a value always present? The upsert fills required columns with 0.
3. Why 0? The columns are non-nullable with no default.
4. Why does it matter? Estimates come out at or near $0 (*INFERRED*: the code that uses
   these rates was not read).
5. Why does that slow claims? The estimate is reworked after the insurer queries it.

**Fix:** require rates above zero to pass. Leave missing rates unset instead of 0.

### S2-2 (High, REVIEW): business details cannot be edited after setup

**Evidence:**
- `app/api/setup/state/route.ts:152-157` returns 409 "Setup already complete; edit in
  Settings instead".
- A grep of `app/dashboard/settings` for `legalName` and `logoUrl` found nothing.
- The report PDF uses the organisation's branding, so the value frozen at setup goes out on
  every report.

**Five whys:**
1. Why is a typo permanent? The setup save locks once setup is complete.
2. Why lock it? Setup is a one-time wizard.
3. Why is there no editor? The Settings page the error message names was never built.
4. Why was that missed? *INFERRED*: the wizard and Settings were built as separate tracks.
5. Why does it matter? A wrong ABN or logo reaches insurers and can get a report rejected.

**Fix:** add Settings, Business details, reusing the setup validators.

### S2-3 (Medium, REVIEW): "Skip setup" activates with red checks, and nothing records the skip

**Evidence:**
- `app/api/setup/activate/route.ts:63-72`: `skip = body?.skip === true; ... const reds = skip ? [] : ...`
- The skipped items go only to `console.log`. A TODO in the code says "wire to existing
  analytics".

**Five whys:**
1. Why is the business live half set up? Skip clears the red list.
2. Why was skip added? RA-7427: the wizard used to lock users out.
3. Why can't anyone see who skipped? Nothing is saved.
4. Why does it matter? Nobody can follow up.
5. Why does it slow claims? The first report hits empty pricing.

**Fix:** save the skipped items, and show managers a persistent "setup incomplete" banner.

### S2-4 (Medium, REVIEW): integration health does not ask the provider

**Evidence** (agent-reported):
- `app/api/integrations/health/route.ts:35-63` checks only database rows.
- With no integrations it reports "All 0 integrations have valid tokens", `pass`.
- `lib/setup/checks.ts` (around line 280) says ServiceM8 and Ascora "still fall through to
  yellow".

**Five whys:**
1. Why can a dead connection read as healthy? The route never calls the provider.
2. Why? Live checks exist for some providers, but only in the setup checks.
3. Why weren't they reused? There is no shared `probe()` interface.
4. Why does it matter? Jobs and invoices stop syncing with no warning.
5. Why is it caught late? Only a 48-hour freshness cron notices.

**Fix:**
- Give every provider a `probe()` and have the health route call it.
- Treat zero integrations as `unverified`, not `pass`.

### S2-5 (Medium, REVIEW): a failed invite email returns the link but never shows it

**Evidence:**
- `app/api/team/invites/route.ts:465` returns `inviteLink, // surface for manual share`
  with `partial: true`.
- `app/dashboard/team/page.tsx` never reads `inviteLink` from that response. It shows a
  toast only.
- Invites expire after 7 days. There is no reminder cron.

**Five whys:**
1. Why is the invitee never onboarded? The email failed.
2. Why doesn't the admin know? A toast disappears.
3. Why can't they share the link by hand? The link is never shown.
4. Why is there no chase? No reminder job exists.
5. Why does it slow claims? Staff who should be capturing evidence are not in the system.

**Fix:** show the link in the failure state, show delivery status next to each pending
invite, and add an expiry reminder.

### S2-6 (Medium, REVIEW): removing a staff member strands their open jobs

**Evidence:**
- `app/api/team/members/[id]/route.ts` (around lines 239-251) clears the user's
  `organizationId` and touches none of their jobs.
- Who-can-see-what rules use the creator's current organisation
  (`lib/auth/assert-tenancy.ts:437-443`).
- The 6 October audit (#2) reported the same root cause; it is still open.

**Five whys:**
1. Why do jobs vanish? Their owner no longer has an organisation.
2. Why? Removal updates only the user record.
3. Why? Removal was built as seat housekeeping.
4. Why isn't it noticed? There is no stuck-job view (S3-3).
5. Why does it matter? The evidence for an open claim becomes unreachable.

**Fix:** require reassigning open jobs before removal.

---

## Stage 3: Manager oversight

**Live walk: UNCHECKED.** `/dashboard` and `/reports` redirect to `/login`. All findings in
this stage come from code.

### S3-1 (High, REVIEW): a failed dashboard read shows real-looking zeros

**Evidence:**
- `components/dashboard/KpiPanel.tsx:64-88`: on a non-OK response, and again in the
  `catch`, the panel calls
  `setStats({ activeJobs: 0, avgDryingDays: 0, revenueMtdAud: 0, completionRatePct: 0 })`.
- It shows no error state.

**Five whys:**
1. Why does an outage look like a quiet day? Errors are replaced with zeros.
2. Why? To avoid an empty render.
3. Why is that possible? The stats type has no "unavailable" value.
4. Why does it spread? Empty and failed share one display path.
5. Why does it matter? The manager screen gives a false "all clear", which is the exact
   case oversight exists to catch.

**Fix:** make the stats nullable and render "Unavailable, retry" when a read fails.

### S3-2 (High, REVIEW): no manager review before a report is sent

**Evidence:**
- `app/api/reports/[id]/send/route.ts:90` checks only `report.status !== "COMPLETED"`. It
  checks no role and no approval.
- `ReportApproval` (`prisma/schema.prisma:500-515`) records client sign-off on scope and
  cost, with no approver.
- The approval-respond route finds the approval by `report: { userId }`, so the report
  owner answers on the client's behalf (agent-reported).

**Five whys:**
1. Why can a report go out unreviewed? Send requires only COMPLETED.
2. Why? Status was designed as a lifecycle marker, not a review gate.
3. Why isn't the approver recorded? The status values carry no approver.
4. Why does it matter more here? The technician is both author and approver.
5. Why does it cost days? Errors reach the insurer and come back as queries
   (*INFERRED*).

**Fix:** add a role-checked "manager approved" step that records who approved and when,
and make it required for sending when an organisation turns review on.

### S3-3 (High, REVIEW): no ageing, SLA or stuck-job view, and managers are never alerted

**Evidence** (agent-reported):
- A grep of the schema for an SLA or due-date field found none.
- `vercel.json` lists 27 crons, none of them a stuck-job sweep.
- Status-change notifications go only to the job owner and technician
  (`lib/lifecycle/subscribers/next-action.ts`, around lines 147-155).
- `createNotification` swallows write failures (`lib/notifications.ts`, around lines
  35-38).

**Five whys:**
1. Why does a stalled job go unseen? No screen sorts jobs by time in their current state.
2. Why? No time-in-state value is stored or derived.
3. Why is nobody alerted? No cron exists, and managers are never recipients.
4. Why? Notifications were built as prompts for the technician.
5. Why does it matter? Waiting states (client approval, insurer reply, missing evidence)
   have no clock, so claims drift. This is the main reason claims run long.

**Fix:**
- Derive time-in-state from the existing transition log.
- Add an ageing panel for managers.
- Run a nightly cron that alerts the manager when a job passes a set threshold.

### S3-4 (Medium, REVIEW): sample data is counted in real metrics, and "drying days" measures job lifetime

**Evidence:**
- `app/api/setup/activate/route.ts:104-135` creates a sample client and report with
  `isSample: true`.
- A grep of `app` and `lib` for `isSample` shows it is filtered only in
  `lib/clients/match-client-for-report.ts:37`. Analytics never filters it.
- "Avg drying days" is `completedAt - createdAt` (`dashboard-stats`, agent-reported).

**Five whys:**
1. Why is the first month's data wrong? The sample report counts as real.
2. Why? No query excludes `isSample`.
3. Why? The "clear in one click" feature (`lib/demo-data.ts:6`) was never built
   (*INFERRED*).
4. Why is drying time wrong? It uses job lifetime because no drying start and end are
   stored.
5. Why does it matter? Managers stop trusting the numbers.

**Fix:** filter `isSample: false` in analytics and list queries, add the clear action, and
rename the metric or compute real drying days.

### S3-5 (High, REVIEW): no consistent record of who changed what

**Evidence** (agent-reported):
- `AuditLog` requires an `inspectionId` (`prisma/schema.prisma:3235-3262`), so reports and
  roles are not covered.
- A role change through the members route writes no audit record.
- The team activity feed ends two of its queries in `.catch(() => [])`, so failed reads
  show as nothing (`app/api/team/activity/route.ts:181`, `:199`).

**Five whys:**
1. Why can't a dispute be settled from the data? Each feature keeps its own record, or
   none.
2. Why? There is no shared audit writer that every change must use.
3. Why do failed reads hide? The feed swaps failure for an empty list.
4. Why isn't it enforced? No test or lint rule requires an audit write.
5. Why does it matter? Who authorised a scope, a send or a role cannot be proved.

**Fix:** add one audit writer scoped to the organisation and call it from every role,
status, approval and send change. This touches the database and roles, so it is Tier 1.

### S3-6 (Medium, REVIEW): analytics defaults to "my jobs"

**Evidence** (agent-reported):
- `app/api/analytics/route.ts` (around line 109) sets `let targetUserId = session.user.id`.
- `dashboard-stats` widens to the whole organisation through `resolveTotalsReach`, so the
  two screens disagree.

**Five whys:**
1. Why does the manager see one person's jobs? The query filters on one user ID.
2. Why? The page predates organisation-wide access rules (*INFERRED*).
3. Why wasn't it updated? Only `dashboard-stats` was migrated.
4. Why does that matter? Two screens give two different totals.
5. Why does it hurt? Throughput decisions are made on the wrong group of jobs.

**Fix:** use `resolveTotalsReach` and default to "All team".

---

## Stage 4: Technician in the field

**Live walk: PARTLY CHECKED.** `/dashboard/field` redirects to `/login`. The public capture
link was checked with an invalid token: `/capture/test-invalid-token` rendered "This
capture link isn't valid. The link may have expired or been revoked. Please ask your
assessor for a new capture link." That is a clear, correct dead-end message. Readings,
photos, sketches and sign-off were audited from code only. The native iOS and Android
projects and the sketch tool UI were **not** reviewed.

**What works (code):** the offline queues for photos and readings have retry caps,
idempotency keys and a status bar that shows failed entries.

### S4-4 (Critical, REVIEW): the evidence-gap check reads the wrong table and passes on nothing

**Evidence:**
- `lib/evidence/submission-gate.ts:73` reads only `prisma.evidenceItem.findMany`.
- Line 154 returns `totalRequired > 0 ? ... : 100`, so 100% when nothing is required.
- `app/api/inspections/[id]/comms-readiness/route.ts:108` sets
  `completenessBlockerCount = 0` inside its `catch`.
- The field photo and moisture routes never write `EvidenceItem` (agent grep).

**Five whys:**
1. Why can completeness read 100% on a thin job? The gate reads a table the field flow
   does not write to.
2. Why two tables? Two evidence designs grew side by side.
3. Why no bridge? Nothing copies photo or reading saves into `EvidenceItem`.
4. Why does empty read as complete? "Nothing required" defaults to 100%, and a failed read
   defaults to 0 blockers.
5. Why does it slow claims? The gap is found by the insurer, not by the system. This is
   the RA-8002 capability, and today it can report green on missing evidence.

**Fix:**
- Read every evidence store.
- Return "unavailable" instead of 100% or 0 when a read fails or there is nothing to
  check.
- Show the result at submit.

### S4-2 (High, REVIEW): photos lose their true capture time; GPS can be silently missing

**Evidence:**
- `components/inspection/CapturePhotoTagModal.tsx:65` sets
  `capturedAtUtc: new Date().toISOString()`, the time Save is tapped.
- `app/api/inspections/[id]/photos/route.ts:385` sets `timestamp: new Date()`, the upload
  time.
- Client compression to WebP drops EXIF (agent-reported:
  `lib/image-compression.ts` and the queue header "EXIF-free").
- GPS lookup resolves `null` on error with no warning (`lib/capture/cocoa-client.ts:41`,
  agent-reported).

**Five whys:**
1. Why is a photo's time wrong? The time of tapping Save or uploading is recorded instead.
2. Why not the file's own time? Compression strips EXIF first.
3. Why compress first? To keep the client bundle and upload small.
4. Why can't the server recover it? The chain-of-custody hash is taken after compression
   (RA-6997), so the original bytes never reach the server.
5. Why does it matter? Insurers rely on when and where a photo was taken, and photos synced
   hours later carry the wrong time.

**Fix:**
- Read `file.lastModified` and the EXIF time and GPS before compressing, and send them as
  separate fields.
- Show "no location" visibly when GPS is missing.

### S4-3 (High, REVIEW): moisture readings are stamped with sync time

**Evidence:**
- A grep for `recordedAt|deviceModel|unit` in `app/api/inspections/[id]/moisture/route.ts`
  returns 0 matches.
- `recordedAt` defaults to `now()` in the schema.
- The latest-reading logic orders by `recordedAt` (agent-reported:
  `lib/moisture/latest-monitoring-readings.ts:44`).

**Five whys:**
1. Why is a 10:00 reading stored as 14:00? The server default applies on sync.
2. Why? Neither the client nor the route sends a measurement time.
3. Why are meter details lost? Only the live-teacher tool writes them.
4. Why does it matter? The sync order decides which reading counts as "latest".
5. Why does it hurt the claim? Drying-trend and "dry goal reached" dates shift, and a
   relative-humidity reading cannot be told apart from material moisture.

**Fix:** send `measuredAt`, unit, and meter make and model, and have the route validate
and store them. No schema change is needed.

### S4-6 (High, REVIEW): submit reports success when processing failed

**Evidence:**
- `app/api/inspections/[id]/submit/route.ts:419-422`:
  `catch (error) { console.error(...); // Don't fail the submission ... // In production, would retry via queue }`
- The status was already set to `PROCESSING`, and no retry queue exists.
- Sign-off needs ESTIMATED, COMPLETED or SUBMITTED (`sign/route.ts:84-92`).

**Five whys:**
1. Why does the technician think it worked? The route returns a 200 with a success
   message.
2. Why? The processing `catch` only logs.
3. Why? The retry queue named in the comment was never built.
4. Why is the job stuck? Status is never rolled back.
5. Why does it stall the claim? Sign-off is blocked and nobody is alerted (see S3-3).

**Fix:** return a "processing failed" result, mark the job as needing attention, and put
the step on a retry queue.

### S4-1 (High, REVIEW): the capture screen cannot be reached on an offline cold start

**Evidence:**
- `public/sw.js:146` sends private pages to network-only.
- `capacitor.config.ts:22` sets `url: "https://restoreassist.app"`, so the native app has
  no bundled screens.
- The 6 October finding #4 (missing `/offline`) is fixed: `app/offline/page.tsx` exists.
  The capture screen itself still needs a network connection.

**Five whys:**
1. Why can't the technician capture after the app is killed? The job page is network-only.
2. Why? Private HTML is no longer cached, to stop one account's pages showing to another.
   That is the right security call.
3. Why is there no safe replacement? There is no offline app shell tied to the signed-in
   account.
4. Why not? The native app loads the live site.
5. Why does it matter? The visit gets documented later from memory (*INFERRED*).

**Fix:** add an account-keyed offline shell for the capture routes, or bundle a minimal
capture screen into the native app.

### S4-5 (High, REVIEW): the submit gate needs one photo and one reading; equipment is never checked

**Evidence** (agent-reported):
- `lib/services/inspection/validate-submission.ts:38-46` requires at least one area, one
  reading and one photo.
- `equipmentSerialNumbers` is declared in `lib/nir-tiered-completion.ts:124` but never
  checked.
- No gate checks for a baseline reading, though the schema comment promises one.

**Five whys:**
1. Why do thin jobs pass? Each requirement is a count of one.
2. Why so low? A partial record in emergency conditions was judged better than none.
3. Why do the stronger checks only warn? There is no stricter level for jobs that are
   closing.
4. Why is equipment never checked? Equipment is modelled on `Report`, not on the
   inspection.
5. Why does it slow claims? The insurer asks for the baseline, equipment time and before
   and after photos.

**Fix:** keep the loose gate for draft submit, and add a strict gate before close or
report that requires before and after photos, one reading per area, a baseline and an
equipment log.

### S4-7 (Medium, REVIEW): the drying goal can be certified from one reading

**Evidence** (agent-reported):
- `drying-goal/route.ts:354` handles only the zero-readings case.
- Monitoring points are keyed by free-text `location|surfaceType`
  (`latest-monitoring-readings.ts:26-28`).

**Five whys:**
1. Why can drying certify early? Only the readings that exist are checked.
2. Why? A missing monitoring point is not treated as a gap.
3. Why can't points be tracked? They are identified by typed text.
4. Why? No monitoring-point record exists in the schema.
5. Why does it matter? A typo keeps an old wet reading open, or certification comes too
   early, and either way the drying record is disputed.

**Fix:** give each monitoring point a stable ID and require coverage of every affected
area.

### S4-8 (Medium, REVIEW): scope generation uses baseline and invalidated readings

**Evidence:**
- A grep for `isBaseline|invalidatedAt` in `app/api/inspections/[id]/generate-scope/route.ts`
  returns no matches.
- The readings it selects are all passed to the model (agent-reported, around lines 154-246).

**Five whys:**
1. Why can scope cite a dry reference area as wet? Nothing filters reference readings out.
2. Why? The scope code predates the baseline and invalidation fields.
3. Why wasn't it caught? There is no shared "valid current readings" helper.
4. Why are photos ignored? Scope is built from numbers only.
5. Why does it matter? Scope items without visible evidence are queried by the insurer.

**Fix:** reuse the latest-monitoring helper and pass photo counts per room.

### S4-9 (Medium, REVIEW): the assigned technician cannot sign off or check completeness

**Evidence:**
- `app/api/inspections/[id]/sign/route.ts:80-85` limits sign-off to the creator with
  `where: { id: inspectionId, userId: userId, ... }`.
- `generate-scope/route.ts:154` uses `userId: session.user.id`.
- Submit allows the assignee (RA-7721).
- The 6 October finding #3 is partly fixed: the environmental, affected-areas and
  scope-items routes now use the capturable-write guard. The sign and generate-scope
  routes do not.

**Five whys:**
1. Why does the assignee get "not found"? These queries predate job assignment.
2. Why weren't they updated? RA-7721 covered submit and drying-goal only.
3. Why is there no central check? Each route builds its own query.
4. Why does it look like a missing record? Being refused and a missing record return the
   same 404.
5. Why does it slow claims? The owner must sign off work the technician already finished.

**Fix:** use the shared assigned-write guard and return 403 when access is refused.

### S4-10 (Medium, REVIEW): room data is entered twice, and a name mismatch blocks submit

**Evidence** (agent-reported):
- `lib/moisture/reading-room-join.ts:9` notes "AffectedArea has no sketchRoomId".
- Submit returns 422 when names differ.

**Five whys:**
1. Why is room data typed twice? Affected areas and sketch rooms are separate records.
2. Why? The affected-area table came first.
3. Why are they joined by name? There is no foreign key between them.
4. Why is submit blocked? The scope maths needs the two to match.
5. Why does it hurt? The technician finds out at the last step.

**Fix:** link affected area to sketch room by ID, and pre-fill the area from the drawn
room.

### S4-11 (Low, REVIEW): sign-off is a typed name, online only

**Evidence** (agent-reported):
- `components/inspection/InspectionSignOff.tsx:130-140` posts only the name and role.
- A network error shows "Network error — please try again".

**Five whys:**
1. Why is there no drawn signature? The UI collects only a typed name.
2. Why does the API accept a URL? It was designed for an uploaded image that nothing
   uploads.
3. Why is there no offline queue? Sign-off is treated as an online-only step.
4. Why is there no proof of the signer? Only `signedAt` is recorded.
5. Why does it matter? A return trip may be needed, and the sign-off is easy to dispute.

**Fix:** capture a drawn signature and queue it offline.

---

## Stage 5: Customer receiving the report

**Live walk: PARTLY CHECKED.**
- `/portal` redirects to `/portal/login`. The page clearly explains the two ways in (job
  link, or portal account), with "request a new invite" links and a help page at
  `/portal/help`. This works.
- No report link was opened. That needs a real token from a test job.
- `/sign` and `/invoices` with no token return 404, which is expected.

### S5-1 (Critical, REVIEW): reports can be created, finalised and emailed with no evidence check

**Evidence:**
- `app/api/reports/route.ts:373` sets
  `status: "COMPLETED", // Set status as COMPLETED when report is created`.
- `app/api/reports/[id]/send/route.ts` gates only on COMPLETED (line 90), an inspection
  link (line 110), a client email and email config.
- A grep of the send route for `completeness` or `isAiDraftPending` returns no matches.
- The existing completeness scorer is used only by the advisory `completeness-check` route
  and an admin metrics route.

**Five whys:**
1. Why do insurers get reports missing readings, photos or signatures? Send never checks.
2. Why? COMPLETED means "a row exists", not "ready for an insurer".
3. Why? Completeness was built as a coaching score, not a gate (RA-7053).
4. Why has nobody joined the two? No one owns the rule for what must be in a report before
   it leaves the building.
5. Why does it slow claims? Every gap becomes an insurer request and a manual chase. This
   is the core loop behind slow claims.

**Fix:**
- In send and insurer-link, call the existing scorer.
- Block on missing moisture, photo, sketch or signature sections, or allow an override with
  a reason recorded in the audit log.
- Set COMPLETED only after the check passes.

### S5-2 (High, REVIEW): the delivery panel claims "sent" and "delivered" without evidence

**Evidence:** `lib/reports/six-fact-delivery.ts:46-49`:
- `const sent = actions.has("REPORT_SENT") || report.status === "COMPLETED";`
- The same fallback applies to `delivered`.

**Five whys:**
1. Why does the panel say "sent" for an unsent report? The status counts as evidence.
2. Why? The fallback was likely added for older rows with no send log (*INFERRED*).
3. Why does it now apply to everything? Every new report starts as COMPLETED (S5-1).
4. Why isn't there a trusted send time? No separate field exists.
5. Why does it matter? The close-job record can say a report went out when it did not.

**Fix:** derive sent and delivered from audit entries only, at least for reports created
after the send log was introduced.

### S5-3 (High, REVIEW): no delivery confirmation, no "viewed" signal, and no acknowledgement

**Evidence:**
- A grep for `REPORT_ACKNOWLEDGED` finds only the reader
  (`six-fact-delivery.ts:50`) and a test. Nothing writes it.
- Send emails a stateless HMAC link (`generateInsurerToken`) instead of the database-backed
  `ReportShareAccess`, which can track access (agent-reported).

**Five whys:**
1. Why doesn't the owner know if the insurer opened the report? A view is never recorded.
2. Why? The emailed token has no server-side record.
3. Why? Send (RA-7632) was built apart from `ReportShareAccess`.
4. Why is "acknowledged" always false? Nothing writes it.
5. Why does it slow claims? The owner has to phone to find out whether the report was seen.

**Fix:**
- Mint the emailed link with `mintReportShareAccess`.
- Log `REPORT_VIEWED` when the link is opened.
- Add an "Acknowledge receipt" button that writes `REPORT_ACKNOWLEDGED`.

### S5-5 (High, REVIEW): the insurer web portal is thinner than the PDF

**Evidence** (agent-reported):
- `app/portal/insurer/[token]/page.tsx` renders five sections.
- It shows no photos, sketch, authority forms, `claimReferenceNumber` or version.
- It reads the legacy JSON reading columns.
- It contains three unguarded `JSON.parse` calls.

**Five whys:**
1. Why does the insurer ask for more? The portal page lacks evidence.
2. Why? It was built on early report columns (RA-429).
3. Why wasn't it updated? Evidence was added to the PDF only.
4. Why do the two drift? The PDF and the portal do not share a renderer.
5. Why isn't it caught? No test checks the two views match.

**Fix:** add photos, floor plan, signed forms and the claim reference to the portal, read
readings from the relational table, and guard the JSON parsing.

### S5-6 (High, REVIEW): an unsigned PDF certification with no claim number or version; AI drafts can be sent

**Evidence:**
- The send route has zero references to `isAiDraftPending` (grep verified above).
- The PDF signature block in `lib/generate-iicrc-report-pdf.ts` (around lines 855-900) has
  blank "Technician Signature" and "Date" lines, and no claim, insurer or version field
  (agent-reported).

**Five whys:**
1. Why is the report queried? It is unsigned, and the claim cannot be identified.
2. Why? The template was designed to be printed and signed by hand.
3. Why aren't captured signatures used? They live in authority forms, which the PDF does
   not read.
4. Why can an AI draft go out? Only the PDF watermark checks draft status. Send does not.
5. Why does it matter? The watermark acts after the report has already left the business.

**Fix:**
- Add the claim reference, insurer, version and generated date to the PDF header.
- Embed the captured signature.
- Block send while `isAiDraftPending` is true.

### S5-4 (Medium, REVIEW): emailed links cannot be revoked, and the expired page is a dead end

**Evidence** (agent-reported):
- Each send mints a new 30-day HMAC token, and the old ones stay valid.
- The insurer expired page says "contact the restoration company" and offers no
  self-service.

**Five whys:**
1. Why can't a mis-sent link be killed? The token has no server state.
2. Why? The legacy HMAC token format is still accepted.
3. Why? Send was never moved to the newer opaque tokens.
4. Why is the expired page a dead end? It has no "request a new link" action.
5. Why does it matter? Every expired link becomes a phone call.

**Fix:** move send to `mintReportShareAccess`, and add a "request a new link" button.

### S5-7 (Medium, REVIEW): versioning is manual and invisible

**Evidence** (agent-reported):
- The version-history POST appends free text to a JSON column, with no lock and no content
  snapshot.
- `reportVersion` is not used in send, the portal or the PDF.

**Five whys:**
1. Why can't the insurer tell versions apart? No version is shown.
2. Why? Bumping the version is a manual API call.
3. Why can't a change be proved? History is a free-text blob with no content hash.
4. Why isn't an old link marked as superseded? Nothing writes `REPORT_SUPERSEDED`.
5. Why does it matter? Corrections and disputes cannot be traced.

**Fix:** bump the version automatically when a sent report changes, store a content hash,
and show "Version N, issued <date>" in the email, portal and PDF.

### S5-8 (Medium): a signature request is marked "sent" before the email is sent

**Evidence:**
- `app/api/authority-forms/[id]/send-signature-request/route.ts:132-133` writes
  `signatureRequestSent: true`.
- The `isEmailServiceConfigured()` check comes later, at line 157.
- The token has no expiry.
- No reminder cron exists (agent-reported).

**Five whys:**
1. Why do forms sit pending forever? The flag is set even when the email failed.
2. Why? The database write comes before the send.
3. Why isn't it undone? A failure does not roll the flag back.
4. Why is there no nudge? No reminder or expiry job exists.
5. Why does it stall the claim? Without signed authority, the insurer cannot proceed.

**Fix:** send the email first, or reset the flag on failure. Add a 48-hour reminder and a
token expiry.

---

## Status of the 6 October findings

Re-checked at `5b00c64` in this run. Only the items checked are listed.

| 6 Oct # | Finding | Status at `5b00c64` | Evidence |
| --- | --- | --- | --- |
| 1 | Internal invoice notes on the public invoice link | Fixed | A grep of `app/api/invoices/public/[token]/route.ts` for `notes` finds no matches |
| 3 | Assigned technician cannot write most of the job | Partly fixed | environmental, affected-areas and scope-items now have the capturable-write guard; sign and generate-scope are still creator-only (S4-9) |
| 4 | `/offline` missing | Fixed | `app/offline/page.tsx` exists. The capture screen is still unreachable offline (S4-1) |
| 7 | Recurring invoices never generate | Still open | `nextInvoiceDate` is referenced only by its own page and CRUD route |
| 8 | `/subscribe` does not exist | Still open | Live 404 (L-1) |

## Checked and unchecked

**Checked live (05/11/2026, 02:10-02:30 AEST)**

- `curl` probe:
  - 200: `/`, `/pricing`, `/signup`, `/login`, `/how-it-works`, `/features`, `/contact`,
    `/privacy`, `/terms`, `/status`, `/api/health`, `/evidence-score`, `/job-file-audit`.
  - Redirect to sign-in: `/portal` (to `/portal/login`) and `/capture/<invalid>` (renders
    the invalid-link page).
  - 404: `/sign`, `/invoices`, `/pilot`, `/subscribe`.
  - Auth wall: `/billing/upgrade`, `/dashboard`, `/dashboard/field`, `/reports`, `/setup`
    and `/onboarding`, each redirecting to `/login`.
- Rendered in headless Chromium: signup (including the "What you'll need after signup"
  panel), `/portal/login`, `/portal/help`, `/setup` (redirects to login),
  `/capture/test-invalid-token`, `/evidence-score`, `/job-file-audit`, `/status` and
  `/how-it-works`.
- `/pricing` content read through a fetch.

**Checked in code** (`5b00c64`, the same SHA that is live)

- Stripe checkout webhook, billing success page, register, seat-required.
- Setup checks, activate, state and pricing.
- Team invites and members; integrations health; Ascora connect.
- Report send, bulk-status and approvals.
- Analytics and dashboard stats, KpiPanel.
- Notifications and next-action.
- Service worker and Capacitor config.
- Photo, moisture, submit, sign, drying-goal and generate-scope routes.
- Evidence submission gate and comms-readiness.
- Six-fact delivery, portal insurer page, report share tokens, version history.
- Authority-form signature request.

**UNCHECKED, with reasons**

| Area | Reason |
| --- | --- |
| Live checkout and payment step (Stripe) | Needs a signed-in account; stopped at the auth wall by design. No payment attempted. |
| Live admin setup, team, integrations, settings | No agent test login (RA-7228); creating one writes to the production DB. |
| Live manager dashboards, analytics, approvals | Same. |
| Live field capture: readings, photos, floor plans, sign-off | Same. The native iOS and Android apps were not run. |
| Live report delivery: email, portal job link, insurer link, PDF | Needs a real token from a test job. No email was sent. |
| `lib/auth.ts` (login-time email-verification enforcement) | Blocked by the local credentials read gate; S1-3 is partly UNPROVEN. |
| Sketch tool UI (multi-floor, measurement accuracy, RA-8111) | Not reached in this run. |
| Meter-photo OCR (`/api/vision/extract-reading`), voice notes | Not reached. |
| Xero, ServiceM8 and insurer connector clients | Not reached. |
| Invite acceptance (`app/api/invites/[token]`), workspace provisioning internals, Stripe reconcile and retry crons | Not reached. |
| Homeowner portal body `app/portal/[token]`, `app/sign/[token]` client body | Not reached. |
| Runtime behaviour of any finding | Nothing was executed; findings come from code, verified by reading. |

## What unblocks the live walk next time

**Recommendation:** use option 2 from RA-7228. Seed a demo organisation on a
non-production database, either a staging or preview deploy (owner, manager and
technician users plus one job with a portal token), and give the agent a magic-link or
token login for it. That lets the next run walk all five stages live without touching
customer data or entering credentials.

The seed scripts are already in the repo, listed here by path only:
- `prisma/seed-demo.ts`
- `prisma/seed-demo-inspection.ts`
- `e2e/seed-e2e-user.ts`
- `e2e/seed-full-access-account.ts`

## Changes made during this run

None to the product. This report file is the only change, committed on branch
`phillmcgurk/ra-8184-journey-audit-report` (draft PR, Refs RA-8184). No Linear child issues
were filed and no builder hand-offs were made. Both wait on owner approval of the
find-fix-verify loop.
