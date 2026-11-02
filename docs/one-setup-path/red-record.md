# Red run, unfixed code at 609444480 with no-op stubs for new modules

## lib/__tests__/middleware-setup-gate.test.ts: 3 failed, 89 passed
- FAIL USER staff skip the owner wizard :: AssertionError: expected 'http://test/setup' not to contain '/setup'
- FAIL MANAGER staff skip the owner wizard :: AssertionError: expected 'http://test/setup' not to contain '/setup'
- FAIL the terms POST passes the gate, so the page can save :: AssertionError: expected 'http://test/setup' not to contain '/setup'
- pass sends the shell from / to /login
- pass sends the shell from /signup to /login
- pass leaves / alone for a browser
- pass leaves /signup alone for a browser
- pass still sends the shell's invite link to the invite route
- pass still refuses a wrong Host on / before the shell redirect
- pass still refuses a wrong Host on /signup before the shell redirect
- pass matches "/" so the launch page reaches this check
- pass redirects one valid legacy invitation token to the canonical invite route
- pass fails closed on short token without returning to account creation
- pass fails closed on empty token without returning to account creation
- pass fails closed on duplicate tokens without returning to account creation
- pass is inert when SETUP_WIZARD_ENABLED is not true
- pass redirects any authenticated user with null setupCompletedAt to /setup
- pass role undefined is still gated, with the location pinned
- pass role "" is still gated, with the location pinned
- pass role "ADMIN" is still gated, with the location pinned
- pass the terms route's GET stays gated: only the POST is allowed through
- pass no redirect cycle: every gate target is itself past the gate
- pass ADMIN with null setupCompletedAt is redirected to /setup (C1 regression)
- pass does NOT redirect when setupCompletedAt is set
- pass allows /setup itself even when flag is on + user not completed
- pass allows /api/setup/* even when flag is on
- pass allows the Integrations step's OAuth connect POST through
- pass allows the provider's OAuth callback back through
- pass allows /dashboard/subscription — the destination of IntegrationsCard "View add-ons" / "View plans"
- pass allows /dashboard/addons — the destination of IntegrationsCard "View add-ons" checkout destination
- pass allows /dashboard/success — the destination of Stripe checkout fulfillment return
- pass allows /dashboard/integrations — the destination of IntegrationsCard "Set up Ascora"
- pass allows /dashboard/settings/ai-providers — the destination of IntegrationsCard "Manage AI keys"
- pass allows wizard dependency /api/subscription through on GET
- pass allows wizard dependency /api/subscription/portal through on POST
- pass allows wizard dependency /api/create-checkout-session through on POST
- pass allows wizard dependency /api/addons/catalog through on GET
- pass allows wizard dependency /api/addons/checkout through on POST
- pass allows wizard dependency /api/addons/verify through on POST
- pass allows wizard dependency /api/verify-subscription through on POST
- pass allows wizard dependency /api/check-active-subscription through on POST
- pass allows wizard dependency /api/integrations through on GET
- pass allows wizard dependency /api/ascora/connect through on POST
- pass allows wizard dependency /api/workspace/provider-connections through on GET
- pass allows wizard dependency /api/workspace/provider-connections/validate through on POST
- pass allows wizard dependency /api/user/cloud-mirror through on GET
- pass allows the Storage step dependency /api/oauth/google-drive/status through on GET
- pass allows the Storage step dependency /api/oauth/google-drive/start through on GET
- pass allows the Storage step dependency /api/oauth/google-drive/callback through on GET
- pass allows the Storage step dependency /api/oauth/microsoft-onedrive/status through on GET
- pass allows the Storage step dependency /api/oauth/microsoft-onedrive/start through on GET
- pass allows the Storage step dependency /api/oauth/microsoft-onedrive/callback through on GET
- pass does not let onboarding redirect block a wizard destination
- pass keeps the legacy onboarding gate at /dashboard when the setup wizard flag is off
- pass keeps the legacy onboarding gate at /dashboard/ when the setup wizard flag is off
- pass keeps the legacy onboarding gate at /dashboard/reports when the setup wizard flag is off
- pass keeps the legacy onboarding gate at /dashboard/integrations when the setup wizard flag is off
- pass matches wizard destinations exactly, not descendants or bare prefixes
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/disconnect POST gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/sync POST gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/jobs GET gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/clients POST gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/ascora/connect POST gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/connect GET gated
- pass keeps non-wizard OAuth/API operation /api/integrations/oauth/xero/callback POST gated
- pass keeps non-wizard OAuth/API operation /api/addons/checkout DELETE gated
- pass keeps non-wizard OAuth/API operation /api/oauth/google-drive/disconnect POST gated
- pass keeps non-wizard OAuth/API operation /api/oauth/microsoft-onedrive/status POST gated
- pass still gates the rest of /dashboard — the bypass is not a blanket one
- pass does not 307 when setup is complete (setup gate path)
- pass redirects unauthenticated /dashboard/* requests to /login with callbackUrl
- pass preserves search params in the callbackUrl
- pass redirects /reports/* and /compliance/* similarly
- pass does NOT redirect /invite/[token] — uses its own token-based auth
- pass does NOT redirect /sign/[token] — uses its own token-based auth
- pass does NOT redirect /reports/[id]/view?token=... — the token is the credential
- pass still gates the view route with no token at all
- pass still gates the view route with an empty token
- pass still gates a report page that is not /view
- pass still gates a nested route under the id
- pass still gates the reports index
- pass still gates a deeper path below /view
- pass still gates a multi-segment id
- pass still gates a deeper multi-segment id
- pass still gates a path that merely ENDS with the view route
- pass still gates an uppercase VIEW segment
- pass still gates an empty id segment
- pass still gates a views (plural) segment
- pass pins the exemption pattern itself, so any edit to it fails here
- pass does NOT send a tokened report view to the paywall when the owner's subscription lapsed
- pass still paywalls an ordinary /reports path for that same lapsed token
- pass does NOT redirect authenticated users
## app/setup/__tests__/page.test.tsx: 9 failed, 0 passed
- FAIL an owner with no organisation gets one and sees the wizard :: Error: REDIRECT:/
- FAIL terms come first: needsOnboarding goes to terms before any write :: Error: expected [Function] to throw error including 'REDIRECT:/onboarding/account-type' but got 'REDIRECT:/'
- FAIL technician goes to /dashboard and gets no organisation :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL manager goes to /dashboard and gets no organisation :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL invited identity goes to /dashboard and gets no organisation :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL invited identity still flagged for terms goes to /dashboard and gets no organisation :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL a completed organisation goes to /dashboard :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL an ADMIN in someone else's organisation goes to /dashboard, never / :: Error: expected [Function] to throw error including 'REDIRECT:/dashboard' but got 'REDIRECT:/'
- FAIL never sends anyone to the home page :: Error: expected [Function] to throw error including 'REDIRECT:/login' but got 'REDIRECT:/'
## lib/billing/__tests__/checkout-return.test.ts: 19 failed, 2 passed
- FAIL accepts the one known target :: AssertionError: expected { ok: true } to deeply equal { ok: true, target: 'team-invite' }
- FAIL refuses "https://evil.test" :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses "//evil.test" :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses "/dashboard" :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses "" :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses 1 :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses null :: AssertionError: expected true to be false // Object.is equality
- FAIL refuses {} :: AssertionError: expected true to be false // Object.is equality
- FAIL sends a seat return through the success page with a fixed next target :: AssertionError: expected '' to be 'https://app.test/dashboard/success?ad…' // Object.is equality
- FAIL sends a plan return through the success page with a fixed next target :: AssertionError: expected '' to be 'https://app.test/dashboard/success?ne…' // Object.is equality
- FAIL keeps today's URLs when no target is set :: AssertionError: expected { successUrl: '', cancelUrl: '' } to deeply equal { …(2) }
- FAIL redirect :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'redirect', …(1) }
- FAIL updated in place :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'updated', seats: 3 }
- FAIL needs the plan first, from the flat string envelope :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'needsPlan' }
- FAIL unpaid invoice is its own state, from the nested envelope :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'unpaidInvoice', …(1) }
- FAIL portal required keeps a null url :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'portalRequired', …(2) }
- FAIL refused 403 shows the server's message :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'refused', …(1) }
- FAIL refused 409 shows the server's message :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'refused', …(1) }
- FAIL refused 404 shows the server's message :: AssertionError: expected { kind: 'refused', message: '' } to deeply equal { kind: 'refused', …(1) }
- pass treats an absent value as no target
- pass a 200 with no usable url is refused, never a redirect to undefined
## lib/cron/__tests__/reconcile-stripe-seats.test.ts: 4 failed, 0 passed
- FAIL a clean run reports zero mismatches :: AssertionError: expected { Object (candidates, downgraded, ...) } to match object { seatMismatches: +0, …(2) }
- FAIL a planted quantity mismatch fails the run :: Error: promise resolved "{ itemsProcessed: +0, …(1) }" instead of rejecting
- FAIL a paid seat subscription with no row fails the run :: Error: promise resolved "{ itemsProcessed: +0, …(1) }" instead of rejecting
- FAIL owners with no organisation are counted, older than 24 hours, and do not fail the run :: AssertionError: expected undefined to be 4 // Object.is equality
## lib/organization/__tests__/ensure-owner-organization.test.ts: 11 failed, 0 passed
- FAIL creates one organisation for an ADMIN with none and ensures the workspace :: Error: expected '' to be 'org1' // Object.is equality
- FAIL uses the business name it is given :: TypeError: Cannot read properties of undefined (reading '0')
- FAIL writes the user data in the same transaction as the claim :: AssertionError: expected "vi.fn()" to be called with arguments: [ { where: { id: 'u1' }, …(1) } ]
- FAIL refuses a technician and creates nothing :: Error: promise resolved "''" instead of rejecting
- FAIL refuses a manager and creates nothing :: Error: promise resolved "''" instead of rejecting
- FAIL refuses a removed technician and creates nothing :: Error: promise resolved "''" instead of rejecting
- FAIL refuses an empty role and creates nothing :: Error: promise resolved "''" instead of rejecting
- FAIL refuses a pending invited identity and creates nothing :: Error: promise resolved "''" instead of rejecting
- FAIL returns the existing organisation without creating :: Error: expected '' to be 'org9' // Object.is equality
- FAIL attaches the oldest owned organisation instead of creating a second :: Error: expected '' to be 'org-owned' // Object.is equality
- FAIL a lost claim rolls back and returns the winner's organisation, never throws :: Error: expected '' to be 'org-winner' // Object.is equality
## lib/team/__tests__/invite-draft.test.ts: 2 failed, 6 passed
- FAIL survives a reload: what was saved is read back :: AssertionError: expected null to deeply equal { email: 'tech@example.com', …(1) }
- FAIL stores only the email, the role and the expiry, never a key :: AssertionError: the given combination of arguments (null and string) is invalid for this assertion. You can use an array, a map, a
- pass is scoped per user
- pass expires after 24 hours and removes itself
- pass clears
- pass treats corrupt storage as no draft
- pass refuses an unknown role from storage
- pass does not throw when storage is unavailable
## app/api/verify-subscription/__tests__/seat-session.test.ts: 1 failed, 1 passed
- FAIL a seat session can never activate the $99 plan :: AssertionError: expected 200 to be 400 // Object.is equality
- pass a plan session still activates: the positive control
## app/dashboard/team/__tests__/seat-panel.test.tsx: 17 failed, 1 passed
- FAIL keeps the entry and shows the price and a buy button to an owner :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL saves the draft on a 402 :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL tells a manager to ask the owner, with no price and no button :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL shows no price or purchase in the iOS shell, on the first paint :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL detects the limit by status, not by words in the message :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL an in-place purchase re-enables Send, and Send is a fresh key and a real send :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL drops the key on a refusal, so a corrected email is not a 409 :: Error: Unable to find role="region" and name `/technician seat/i`
- FAIL a first purchase saves the draft and redirects to Stripe :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL a trial owner's refusal leads to the plan, then back :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL an unpaid seat invoice shows the message and no buy button :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL portal required resyncs once and retries before offering the portal :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL a server refusal shows its message :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL Back from Stripe resets the buy button :: Error: Unable to find role="button" and name `/buy a seat/i`
- FAIL invite=1 opens the form with the draft restored and focus on the email :: Error: Unable to find an element with the placeholder text of: colleague@example.com
- FAIL cancelled checkout says nothing was charged and keeps the entry :: Error: Unable to find an element with the text: /nothing was charged/i. This could be because the text is broken up by multiple el
- FAIL a partial send clears the draft: the invite already exists :: Error: Unable to find an element with the placeholder text of: colleague@example.com
- FAIL a 5xx does not clear the draft :: Error: Unable to find an element with the placeholder text of: colleague@example.com
- pass keeps the key across a lost response
## app/dashboard/success/__tests__/team-invite-return.test.tsx: 5 failed, 0 passed
- FAIL seat: verifies the add-on, refreshes the session, then opens the invite :: TestingLibraryElementError: Unable to find an element with the text: /confirming/i. This could be because the text is broken up by
- FAIL plan: verifies the subscription instead :: AssertionError: expected "vi.fn()" to be called with arguments: [ '/dashboard/team?invite=1' ]
- FAIL a verify failure shows retry, reports it, and never redirects :: Error: Unable to find role="button" and name `/try again/i`
- FAIL a thrown network failure also shows retry :: Error: Unable to find role="button" and name `/try again/i`
- FAIL no session id is a failure, not a success :: Error: Unable to find role="button" and name `/try again/i`
## app/api/addons/checkout/__tests__/technician-seats-checkout.test.ts: 12 failed, 20 passed
- FAIL a no-organisation technician is refused seat purchase from the database role :: AssertionError: expected 200 to be 403 // Object.is equality
- FAIL stamps the workspace the seat count reads and never uses a membership :: AssertionError: expected "vi.fn()" to be called with arguments: [ 'u1' ]
- FAIL a paid subscription the row missed takes the in-place path, not a second Checkout :: AssertionError: expected { sessionId: 'cs_seats_1', …(1) } to deeply equal { updated: true, seats: 2 }
- FAIL a failed Stripe sync stops the purchase, so nothing can double-bill blind :: AssertionError: expected 200 to be greater than or equal to 500
- FAIL expires only this customer's open seat sessions before minting a new one :: AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
- FAIL a Stripe raise followed by a local write failure returns success with the seat count :: AssertionError: expected 500 to be 200 // Object.is equality
- FAIL an in-place raise records seat_granted :: AssertionError: expected "vi.fn()" to be called with arguments: [ 'u1', 'seat_granted', Anything ]
- FAIL returnTo team-invite maps to the fixed paths and records the start :: AssertionError: expected 'https://restoreassist.app/dashboard/s…' to contain '/dashboard/success?addon=TECHNICIAN_S…'
- FAIL returnTo "https://evil.test" is refused with 400 and no Stripe call :: AssertionError: expected 200 to be 400 // Object.is equality
- FAIL returnTo "//evil.test" is refused with 400 and no Stripe call :: AssertionError: expected 200 to be 400 // Object.is equality
- FAIL returnTo "/dashboard" is refused with 400 and no Stripe call :: AssertionError: expected 200 to be 400 // Object.is equality
- FAIL returnTo "" is refused with 400 and no Stripe call :: AssertionError: expected 200 to be 400 // Object.is equality
- pass passes the buyer-supplied seat count through as the line-item quantity
- pass defaults to 1 seat when no quantity is supplied
- pass rejects an out-of-range seat quantity (0) with 400 and no Stripe call
- pass rejects an out-of-range seat quantity (-3) with 400 and no Stripe call
- pass rejects an out-of-range seat quantity (2.5) with 400 and no Stripe call
- pass rejects an out-of-range seat quantity (101) with 400 and no Stripe call
- pass ignores quantity for a flat add-on — FLOORPLAN_UNDERLAY stays at 1
- pass J-09: with seats already active, adds to the existing subscription instead of a second checkout
- pass J-09: a cancelled seat pack starts a fresh checkout
- pass J-09: a seat row still marked active over a cancelled Stripe subscription starts a fresh checkout
- pass J-09: a past_due seat subscription that can still bill is neither replaced nor extended
- pass J-09: a unpaid seat subscription that can still bill is neither replaced nor extended
- pass J-09: a paused seat subscription that can still bill is neither replaced nor extended
- pass J-09: a incomplete seat subscription that can still bill is neither replaced nor extended
- pass a TRIAL owner stays refused: 403 upgradeRequired, no Stripe or entitlement call
- pass a EXPIRED owner stays refused: 403 upgradeRequired, no Stripe or entitlement call
- pass a CANCELED owner stays refused: 403 upgradeRequired, no Stripe or entitlement call
- pass a PAST_DUE owner stays refused: 403 upgradeRequired, no Stripe or entitlement call
- pass a null owner stays refused: 403 upgradeRequired, no Stripe or entitlement call
- pass an unset returnTo keeps today's URLs
## app/api/onboarding/account-type/__tests__/route.test.ts: 6 failed, 4 passed
- FAIL gives a Google owner an organisation named for the business, with terms and the flip in the same call :: AssertionError: expected 400 to be 200 // Object.is equality
- FAIL a New Zealand owner passes with no ABN and no state, and neither field is overwritten :: AssertionError: expected 400 to be 200 // Object.is equality
- FAIL a cached bundle's full form still saves its details :: TypeError: Cannot read properties of undefined (reading '1')
- FAIL an invited identity accepts terms but gets no organisation :: AssertionError: expected 400 to be 200 // Object.is equality
- FAIL a removed technician accepts terms but gets no organisation :: AssertionError: expected 400 to be 200 // Object.is equality
- FAIL a manager accepts terms but gets no organisation :: AssertionError: expected 400 to be 200 // Object.is equality
- pass refuses no terms and creates nothing
- pass refuses no name and creates nothing
- pass refuses a bad ABN and creates nothing
- pass refuses a bad state and creates nothing

## Free trial seat (added 02/11/2026, founder ruling)

`lib/billing/__tests__/trial-seat.test.ts` written before the code. Run against the unfixed `lib/billing/technician-seats.ts`: 9 of 13 tests failed, for example `expected undefined to be 1` on day 14's free seat and `expected undefined to be +0` on day 15's. The four that passed were refusals the old rule already gave; they guard against the new allowance widening too far.

## Found by the browser walk: two tabs racing workspace creation

`lib/organization/__tests__/ensure-owner-organization.test.ts`, "two tabs racing the workspace". Red before the fix: rejected with PrismaClientKnownRequestError P2002 "slug taken". The walk showed the same defect as `[200, 409]` from two racing POSTs to `/api/onboarding/account-type`.

## Mocked webhook: a declined checkout lifted the lock

`lib/billing/__tests__/trial-seat-unlock-webhook.test.ts`, "an unpaid checkout event leaves the technician locked". Red before the fix: `expected false to be true` at the lock check, because the event overwrote the marker row with an inactive paid price.

## Mutation control: lock switched off

With the check in `proxy.ts` and the claim in `lib/auth.ts` disabled, then restored:

```
       × locks and unlocks a technician on a routine read, without a new sign-in 4ms
       × a database blip keeps the last answer 0ms
     × answers a write with 402 and tells offline queues to hold it 4ms
     × sends the dashboard to the seat page 0ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 9 passed (13)
```
