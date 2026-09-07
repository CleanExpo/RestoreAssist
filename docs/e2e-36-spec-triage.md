# The 36 wired e2e specs — what each failure actually was

First execution 2026-09-07: 118 tests, 76 passed, 31 failed, 11 skipped.
This file records the cause of each failure, verified against the run log and
the source, not inferred from a class.

## Why the first classification was wrong

The initial triage sorted the 31 failures into three classes by grepping the
run log for error strings and counting the hits. That produced
"18 Cloudinary, 18 headers, rest UI". Those are counts of SERVER LOG LINES,
not of failing tests — "Cloudinary cloud name missing" appears 39 times in a
3130-line log because one page re-rendered repeatedly.

A positive control settled it: re-running the help suite with a dummy
CLOUDINARY_URL turned exactly ONE spec green, not eighteen.

The lesson is the cheap one: a count taken from a log is a count of log lines.

## Cause per failing spec

### Fixed — defects in the SPECS, verified red then green

| Spec | Failures | Real cause |
|---|---|---|
| security.spec.ts | 9 -> 2 | `getSessionCookie` posted to NextAuth's credentials route with `csrfToken: "__skip__"`. CSRF *is* checked, no cookie was issued, the helper returned `null`, and `{ Cookie: null }` surfaced as `headers[0].value: expected string, got object` — because `typeof null === "object"`. The error named the header, so it read as a type bug for a whole session. |
| security.spec.ts §6 | (of above) | Signed in as `E2E_USER_EMAIL`, which is seeded **ADMIN**, while asserting "403 for a NON-admin user". It asserted the opposite of its own setup and could never have held. |
| security.spec.ts §6 | (of above) | `/api/admin/seed-demo` was in the GET list; the route exports POST only, so Next.js answers 405 *before* auth. Method routing, not missing enforcement. |
| navigation.spec.ts | 1 -> 0 | `getByRole("navigation")` matched two visible landmarks at 1280px ("Primary" `lg:flex`, "Page sections" `xl:flex`) — strict-mode violation, not a missing nav. |
| procurement.spec.ts | 1 -> 0 | Asserted 401 on `/api/contractors`, which is **public by design**. Failed as "expected 401, received 200" — reads exactly like an auth hole, is not one. Also `/api/team` has no `route.ts` and answered 404; the real endpoint is `/api/team/members`. |
| help/article-detail, dropdown-open, search-cmd-k | 3 -> 2 | Signed in on `request` then navigated with `page` — separate cookie jars, so every navigation landed on `/login` and assertions failed as "element(s) not found". The same defect `billing/webhook-race.spec.ts` already documents. They also omitted the `role` the helper route requires. |

### Not spec defects — left red on purpose

| Spec | Failures | What it found |
|---|---|---|
| security.spec.ts (reviews) | 2 | **Confirmed product defect.** `POST /api/contractors/reviews` returns 500 for *every* authenticated caller. `prisma.clientUser.findUnique({ where: { userId } })` names a field `ClientUser` does not have — it is keyed by `email`/`clientId`, and client users authenticate through `lib/portal/require-client-auth.ts`, a separate identity system. The route mixes two identity models. Not a rating-validation problem; the validation is never reached. |
| help/dropdown-open | 1 | The How To dropdown IS mounted (`app/dashboard/DashboardShell.tsx:760`) but role-gated: `isTechnician = session?.user?.role === "USER"` and it renders as `{!isTechnician && <HowToDropdown />}`. `seed-trial-user` creates a USER, so the button is deliberately absent. Asking `sign-in-as` for MANAGER on that same email returns 409 (role mismatch), so the role cannot just be raised — it needs a non-technician seed. |
| help/search-cmd-k | 1 | Same seeded-role problem. `HelpSearchModal` (Cmd-K bound, `components/help/HelpSearchModal.tsx:26`) is mounted unconditionally at `DashboardShell.tsx:845`, and `GlobalSearch` at :746 binds Cmd-K too. The feature exists. |

Both need a non-technician seeded account. That is a fixture change, not a
feature build.

## A correction I have to make about my own claim

I first wrote that these two specs "assert UI that does not exist" — that
`HelpButton` was mounted nowhere and no global Cmd-K listener existed. **That
was wrong, and it is in commit 42fbdcebe.**

I searched for `cmdk`, `CommandDialog` and `HelpButton`. The real components
are `HowToDropdown`, `HelpSearchModal` and `GlobalSearch`, and two of them
bind Cmd-K explicitly. `HelpButton` genuinely is unmounted, but it was never
the component these specs target — so a true fact about the wrong file became
a false conclusion about the product.

A search aimed at the wrong name returns exactly what genuine absence returns.
The only thing that caught it was running a positive control: proving the same
grep could find a component that IS mounted before trusting it to report one
that is not.


### Environment — the pipeline lacks the credential

The dev server named these at boot, and the workflow does not set them either:

    CREDENTIAL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID, STRIPE_WEBHOOK_SECRET

CLOUDINARY_URL is NOT in that list but is required by the `Screenshot`
component; `help/public-mirror.spec.ts` passes as soon as it is set and fails
without it. That is proven, not assumed.

| Spec | Needs |
|---|---|
| help/public-mirror.spec.ts | `CLOUDINARY_URL` — proven: passes with a dummy value, fails without |
| help/article-detail.spec.ts | `CLOUDINARY_URL` — same; it passes the cookie fix but still needs the image host |
| invite-tech-google-oauth.spec.ts | `GOOGLE_CLIENT_ID` / `_SECRET` — server logged `error=OAuthSignin`, `client_id is required` |
| stripe-payment-intent-webhook.spec.ts | `STRIPE_WEBHOOK_SECRET` — and note it answers **500**, not 400, when unsigned. Rejecting an unsigned webhook cleanly is the endpoint's job even with no secret configured. That part is a defect, not an env gap. |

### Still to triage individually

billing.spec.ts (405 and 404 where 400/401 expected), health.spec.ts (503),
invite-tech-happy-path, ios-billing-gates (2 — "Sign up for free" visible on
iOS when the gate should hide it, possibly a real gate defect),
job-close-preconditions (403 where 409 expected), setup-abr-unreachable,
setup-resume, setup-website-failure (the ABN field never appears),
tech-banner-auto-dismiss, tech-evidence-capture-no-modal,
tech-second-signoff-prefilled (seeded fixtures absent).

## Correction to the previous handoff

It reported that `security.spec.ts`'s cross-tenant isolation tests passed.
They did not run. Both are gated on `E2E_USER_B_EMAIL`, which is unset, so
they **skipped** — 8 of this file's tests skip for that and similar gates.
Cross-tenant isolation on this multi-tenant product is UNPROVEN, not green.

It also listed `storage-restore.spec.ts` and `dr-nrpg-inbound-job.spec.ts` as
credential-blocked. Neither appears in the failure list; they are not failing.
