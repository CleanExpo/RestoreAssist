# Invited-technician onboarding — design

> **Scope:** Sub-project #2 of the onboarding redesign. Companion to the gated AI-driven setup wizard that shipped in sub-project #1 (`docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md`). Owners go through the AI-hydrated `/setup` wizard; technicians invited by an owner come in through this flow instead.

> **Persona:** Junior Technician (`USER` role per existing `Role` enum). Per CLAUDE.md rule 25 this role is **evidence-only** — they capture photos, moisture readings, sketches, but never sign attestations on their own. The lighter weight of this flow vs `/setup` reflects that scope.

---

## Context

When the setup-wizard sub-project shipped, the middleware was made role-agnostic (the C1+C3 fix) — it now gates on `Organization.setupCompletedAt` instead of trying to branch by role. This was the right call because the codebase has `Role = USER | ADMIN | MANAGER` (no `TECHNICIAN`), and the old `OWNER`/`ADMIN`/`TECHNICIAN` branches in middleware referenced strings that didn't exist in the schema.

The side-effect is a gap: an invited technician whose `Organization.setupCompletedAt` is **already set** (because their owner ran `/setup`) passes the gate naturally, but lands on `/invite/[token]` — the existing RA-1249 acceptance page that captures only name + password + terms. The technician then arrives at the dashboard with:

- No personal mobile number (for SMS reminders / 2FA in future).
- No headshot, which CLAUDE.md rule 21 (chain-of-custody) treats as a required input to the `user_hash` on every evidence file they capture.
- No licence metadata for IICRC / WHS / state — but per rule 28 this is **engagement-time verification**, not login-time, so the gap is intentional and managed by the same flow.

This sub-project closes that gap with the minimum sufficient code: one page rewrite, one schema column, one new model field, two new API endpoints, two new components, and reuse of the existing `FirstRunChecklist` banner, `Authorisation` model, Cloudinary upload primitive, and NextAuth Google provider.

**Locked-in design constraints (decided during brainstorming, 2026-05-13):**

1. **Extend `/invite/[token]` in place** — single URL, mobile-first, two visible steps. The existing RA-1249 minimal flow becomes the new compliance-aware flow. Outstanding invite emails continue to work.
2. **Auth matches owners** — email+password + Google OAuth. Same providers, no new auth surface.
3. **Identity-only at acceptance, licences deferred** — capture name, password (or Google), phone, headshot at the invite step; capture IICRC / WHS / state licence at the moment the technician hits an attestation-touching action, per rule 28.
4. **Mobile-first** — designed against iPhone 14 Pro viewport (393×852); desktop is responsive.
5. **`/dashboard` + first-run banner** — no separate `/onboarding/technician` route; the role-aware `<FirstRunChecklist>` does the welcome work.
6. **Inline modal + low-key ambient banner** — modal at action-moment, banner on `/dashboard` until first Authorisation row exists.

---

## Approach (chosen)

**Identity-first, defer compliance.** Capture the minimum needed to satisfy chain-of-custody (rule 21) at acceptance — name, password or Google session, phone, headshot. Surface licence capture only when the technician actually needs to sign off evidence or escalate an inspection. Pre-fill the licence modal from the technician's most recent `Authorisation` row so they re-enter only what's changed.

Two alternatives were ruled out:

- **Compliance-first:** capture everything upfront. Rejected because it blocks technicians who haven't received their physical IICRC card or White Card yet; per rule 28 we don't need licence at login.
- **Conversational chat-style flow:** chat-bubble stepped onboarding. Rejected because it's a novel pattern with no precedent in the app and yields no compliance benefit; the bubble cost belongs to a richer surface like the future job-close audit (sub-project #5).

---

## Architecture & routing

### Single page rewrite

- `app/invite/[token]/page.tsx` — rewrite of the existing RA-1249 page. Two-step card on a single URL. Step 1 captures identity; Step 2 confirms terms + chain-of-custody consent; submission posts the full payload.
- The page remains a Client Component (existing pattern) but is refactored so steps live in two sub-components: `<InviteIdentityStep>` and `<InviteTermsStep>`. The page shell holds form state and chooses which step to render.

### Extended API

- `POST /api/invites/[token]` — extended body. Adds **required** `phone: string`, `headshotDataUrl: string`, `acceptedChainOfCustody: true`, and **optional** `provider: 'google'` to signal that auth already completed via OAuth (in which case `password` is omitted). Existing name + password + acceptedTerms validation untouched.
- `POST /api/invites/oauth-complete` — **new**. The Google OAuth path can't post a password — the user has a Google session and an invite token, and we need to join them. Step 1 sets a signed cookie `invite_token=<token>` before calling `signIn('google', { callbackUrl: '/api/invites/oauth-complete' })`. The new route reads the cookie + the active session, attaches the new user to `invite.organizationId`, sets `UserInvite.usedAt`, and redirects to `/invite/[token]?step=2` to capture phone + headshot (Step 1's other fields are skipped because Google supplies name + email).
- `POST /api/authorisations` — **extend** the existing route to accept `whsCardNumber` and to allow `subjectUserId = session.user.id` (self-attestation by the technician). Returns `{ ok: true, authorisationId }`.
- `GET /api/authorisations/most-recent` — **new**. Returns the most recent Authorisation by `subjectUserId = session.user.id` for pre-fill. 5-minute in-memory cache per userId, plus a per-request memo via React.cache.

### Schema delta

```prisma
model User {
  // existing fields untouched
  image     String?   // already exists (NextAuth standard) — reused for headshot
  phone     String?   // NEW — personal mobile
}

model Authorisation {
  // existing fields untouched
  whsCardNumber   String?   // NEW — White Card / WHS RIIWHS204D-...
  whsCardExpiry   DateTime? // NEW — optional

  @@index([subjectUserId, verifiedAt(sort: Desc)]) // NEW — pre-fill lookup
}
```

No new tables. The existing `Authorisation` model (CLAUDE.md M-7) already stores `subjectUserId`, `subjectLicenceNumber`, `subjectLicenceState`, `subjectLicenceClass`, public liability insurer/policy/cover, and `verifiedAt` — every field the modal needs except WHS, which this sub-project adds.

Two-step migration safety (rule 16):

1. **Migration A** (additive): add `User.phone`, `Authorisation.whsCardNumber`, `Authorisation.whsCardExpiry`, the new compound index. All nullable. Safe to deploy on prod.
2. No Migration B needed — there are no deprecated columns to drop.

### Middleware behaviour

- No middleware changes are part of this sub-project. The role-agnostic gate already handles invited technicians correctly: their `organizationId` points to an organization with a non-null `setupCompletedAt`, so the JWT carries `setupCompletedAt` and the gate passes them through.
- One **verification task** in the implementation plan: confirm that the JWT callback in `lib/auth.ts` reads `Organization.setupCompletedAt` for the user's org and hydrates it onto the token. If it does not, that single change is the only middleware-adjacent fix — but evidence from the C1+C3 fix and the existing `(token as any).setupCompletedAt` check suggests it already does.

### Banner reuse

- `<FirstRunChecklist>` — the existing dismissible-banner component, already wired to `/api/onboarding/first-run`. We role-branch the GET handler so a USER session receives technician-specific steps:
  1. "Add your IICRC certificate"
  2. "Add your WHS card"
  3. "Add your state licence (if applicable)"

Each step links to the licence modal as a deep link from settings. The banner auto-dismisses once an `Authorisation` row exists for the user (its presence proves all three were captured at least once).

### Auth provider strategy

- The codebase has both NextAuth's `[...nextauth]` route and a custom `/api/auth/google-signin` route. The latter exists for Capacitor native sign-in. **The invite-acceptance Google path uses NextAuth (`signIn('google', ...)`)**, not the custom route, because we need the callback to fire `events.createUser` so the new user is created with `organizationId` already set via the `invite_token` cookie. The custom native-token route is for the iOS app and stays untouched.

---

## Page flow detail — `/invite/[token]`

### Step 1 — Identity

Single-column card sized for one-thumb interaction on a phone. Above the fold:

- Org name + inviter name + role label (read from `GET /api/invites/[token]`).
- "Continue with Google" button (primary action for users who already have a Google account on their phone).
- Divider "— or —".
- Name input (`autoComplete="name"`).
- Mobile input (`type="tel"`, `inputMode="numeric"`, `autoComplete="tel"`).
- Password input (`type="password"`, `autoComplete="new-password"`, min 12 chars per existing rule).
- Headshot capture (`<input type="file" accept="image/jpeg,image/png" capture="user">` on mobile, falls back to file picker on desktop). Client-side square crop via `canvas`. Stored as a base64 data URL in form state until submit.
- "Continue →" button. Disabled until name, phone, password (≥ 12), headshot are all valid.

### Step 2 — Terms & chain-of-custody consent

- Summary of what they're joining: Org name, role label ("Technician (evidence capture)"), manager name.
- Checkbox 1: "I agree to the Terms of Service and Privacy Policy."
- Checkbox 2 (new): "I consent to chain-of-custody hashing of my evidence captures." Required by rule 21 — without this consent the user can't capture compliant photos, so blocking acceptance is correct.
- "Join {OrgName}" button. Disabled until both checked.
- Footnote: "No licence info needed now — we'll ask when you sign off your first job."

### Submit → auto sign-in → dashboard

**Email + password path:**

1. POST the full form to `/api/invites/[token]`.
2. Server creates the User row (`passwordHash`, `organizationId`, `role`, `phone`, `image` from headshot), sets `UserInvite.usedAt = now()`, and uploads the headshot data URL to Cloudinary (URL stored on `User.image`).
3. Client calls `signIn('credentials', { email, password, redirect: false })`.
4. On success, `router.push('/dashboard?firstRun=tech')`.

**Google OAuth path:**

1. Step 1 button click: set signed cookie `invite_token=<token>` (HttpOnly, SameSite=Lax, 10-minute expiry, signed with `NEXTAUTH_SECRET`), then `signIn('google', { callbackUrl: '/api/invites/oauth-complete' })`.
2. NextAuth Google callback creates the User. The `events.createUser` callback fires; we read `invite_token` from cookies, look up the invite, and attach `User.organizationId = invite.organizationId`, `User.role = invite.role`. Also set `UserInvite.usedAt = now()`.
3. `oauth-complete` route redirects to `/invite/[token]?step=2` (the same page, but the form now skips name/email/password — Google supplies them — and asks only for phone + headshot, then terms).
4. Step 2 submit `PATCH /api/user/profile` with `{ phone, headshotDataUrl }` and then redirects to `/dashboard?firstRun=tech`.

### Field validation

| Field | Rule | Error |
|---|---|---|
| `name` | 1–200 chars, sanitised via `sanitizeString` | "Please enter your full name" |
| `password` (email path only) | ≥ 12 chars | "Password must be at least 12 characters" |
| `phone` | AU mobile after stripping spaces and a leading `+61`: `^04\d{8}$` | "Enter a 10-digit Australian mobile (04…)" |
| `headshotDataUrl` | `image/jpeg` or `image/png`, decoded byte length ≤ 5 MB, square-cropped client-side | "Photo must be a JPG or PNG under 5 MB" |
| `acceptedTerms` | `=== true` | "You must accept the Terms of Service" |
| `acceptedChainOfCustody` | `=== true` | "You must consent to evidence hashing" |

### Existing error states (no new code)

- **Invite not found:** 404 from GET → page shows "This invite link is invalid. Ask the inviter to resend."
- **Already used:** 410 → "This invite has already been used. Sign in instead." with a `<Link>` to `/login`.
- **Expired (>7 days):** 410 → "This invite has expired. Ask the inviter to resend it."
- **Email already exists in another org:** existing transfer protection in the POST handler stays in place. ADMIN cannot be transferred (403); USER / MANAGER produces an existing-user notification path that uses `isTransfer: true`.
- **Submit failed (network):** error toast + retry button; form state preserved client-side.

---

## Deferred-licence modal mechanics

### Trigger map

The modal opens **only** at the four escalation actions below. Junior Technicians (USER role) can capture photos, moisture readings, and sketches without ever seeing it — that's the rule 25 invariant.

| Action | Why it gates |
|---|---|
| Sign off final evidence on an inspection | Creates `ProgressAttestation` (rule 26) |
| Promote inspection to "Submitted for review" | Requires verified Authorisation (rule 23) |
| Generate an IICRC-cited report (e.g. "S500:2021 §7.1") | Compliance citation requires verified IICRC (rule 14) |
| Confirm chain-of-custody report on a completed job | Attestor identity hash requires licence (rule 21) |

Each gated action calls a single helper `requireEngagementAuthorisation(action)` which:

1. Calls `GET /api/authorisations/most-recent`.
2. If null OR `verifiedAt > 90 days old` (configurable constant) → opens the modal.
3. Otherwise → calls the underlying action directly with the cached authorisation ID attached.

### Modal — fresh state

Four field groups. Pre-existing label conventions from the workspace settings UI:

- IICRC certificate number (required for the gating action's compliance scope; the helper passes which scope is needed in case we ever differentiate IICRC_WRT vs IICRC_AMRT).
- WHS card / White Card number (required).
- State (select: QLD/NSW/VIC/WA/SA/NT/TAS/ACT) + state licence (optional unless the gating action needs it, e.g. QBCC for QLD restoration).
- Public liability insurer + policy number (required for paid attestations; optional for evidence-only sign-off).

Submit: `POST /api/authorisations` with the full payload. On 200, the original action resumes. On error, the modal stays open with the error toast.

### Modal — pre-filled state

If a prior Authorisation exists for `subjectUserId` and is < 90 days old, the modal shows a confirmation summary (each field with a green check) and two CTAs:

- **Yes — confirm and continue →** (primary). Creates a new Authorisation row with the same values + a fresh `verifiedAt`. (Append-only — rule 22. We never UPDATE an Authorisation row.)
- **Update something** (secondary). Expands to the fresh-state form, pre-filled with the prior values.

Pre-fill source query (CLAUDE.md rule 4 — explicit select + take):

```ts
prisma.authorisation.findFirst({
  where: { subjectUserId: session.user.id },
  orderBy: { verifiedAt: 'desc' },
  select: {
    subjectLicenceNumber: true,
    subjectLicenceState: true,
    subjectLicenceClass: true,
    whsCardNumber: true,
    publicLiabilityInsurer: true,
    publicLiabilityPolicyNumber: true,
    publicLiabilityCoverAmount: true,
    verifiedAt: true,
  },
})
```

5-minute in-memory LRU cache keyed by `userId`. Cache invalidates on every POST to `/api/authorisations` (write-through invalidation).

### Cancel behaviour

Cancel closes the modal and returns the user to the inspection in its previous state. The underlying action does **not** proceed. Any in-progress evidence captures are preserved — the modal does not destroy state.

### Dashboard ambient banner

The role-branched `<FirstRunChecklist>` shows three steps for USER role:

1. **Add your IICRC certificate** → deep link to `/dashboard/settings/credentials?focus=iicrc` (opens the modal pre-filled with empty IICRC).
2. **Add your WHS card** → `?focus=whs`.
3. **Add your state licence (optional)** → `?focus=state`.

A single Authorisation row that contains values for all three fields auto-dismisses the entire banner. The dismiss state is computed server-side, not stored as a per-user flag.

---

## Testing strategy

### Unit (Vitest) — 7 modules

- AU mobile regex: valid 04XXXXXXXX, with-spaces, +61 prefix, invalid (landline, intl, malformed).
- Headshot validator: valid jpeg/png, heic-rejected, over-5MB, non-image, square-crop helper.
- Chain-of-custody consent gate: only `=== true` accepted.
- `canPerformTransition()` matrix: USER + signOff is gated; USER + capturePhoto is ungated.
- Authorisation pre-fill helper: no-prior → null; single-prior → exact; multi-prior → most-recent.
- Authorisation cache: same-userId hits within 5 min; misses after expiry; invalidated on POST.
- Role-branched `/api/onboarding/first-run`: USER returns tech steps; MANAGER/ADMIN unchanged.

### Integration (Vitest + Prisma) — 6 paths

- `POST /api/invites/[token]` extended: happy paths, missing field 400s, invalid invite 410/404, transfer protection still fires.
- `POST /api/invites/oauth-complete`: cookie+session happy, missing-cookie 400, missing-session 401, used-invite 410, idempotent retry.
- `POST /api/authorisations` extended: creates row with whsCardNumber, scoped to session userId, two posts produce two rows (rule 22 append-only).
- `GET /api/authorisations/most-recent`: returns null/latest, strict tenant scoping.
- `GET /api/onboarding/first-run` role-branching.
- Middleware setup-gate: tech with org.setupCompletedAt passes; defensive case with null org.setupCompletedAt still redirects.

### E2E (Playwright) — 8 specs

- `invite-tech-happy-path.spec.ts` — email+password full flow.
- `invite-tech-google-oauth.spec.ts` — Google path through to /dashboard.
- `invite-tech-expired.spec.ts` — 410 page UX.
- `invite-tech-already-used.spec.ts` — redirect to /login.
- `tech-evidence-capture-no-modal.spec.ts` — rule 25 negative test.
- `tech-signoff-modal-fresh.spec.ts` — first sign-off triggers modal, second is pre-filled.
- `tech-signoff-modal-cancel.spec.ts` — cancel preserves evidence state.
- `tech-banner-auto-dismiss.spec.ts` — banner disappears after first Authorisation.

### Visual regression — 24 snapshots

8 surfaces × 3 viewports (iPhone 14 Pro 393×852 / iPad mini 768×1024 / desktop 1280×800):

- /invite/[token] Step 1 pristine, Step 1 all-errors, Step 2 terms, /invite/[token] expired, used, not-found.
- /dashboard with tech banner visible.
- Licence modal fresh, pre-filled, expanded "update something".

### CI gates (all must pass before merge)

- `pnpm type-check`
- `pnpm lint`
- `npx vitest run` (full suite — no regressions)
- `npx playwright test e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts`
- Snapshot diff = 0
- `npx prisma migrate diff` = no drift (the schema-drift smoke test from PR #954)
- DESIGN.md lint within baseline

### Subscription gate regression (rule 8)

USER with `creditsRemaining = 0` must still be able to accept an invite, capture evidence, open the licence modal, and POST an Authorisation. Existing model-router gate must still block any AI call (`/api/ai/generate-report` → 402). Integration test asserts both behaviours simultaneously.

### Verification Gate (`.claude/rules/verification-gate.md`)

Pre-merge manual checklist:

1. **Where to check:** `restoreassist-sandbox.vercel.app` after preview deploy.
2. **How to get there:** seed a fresh org via `/setup` happy path; invite a test technician via `/dashboard/team`; open the email link in a private window on a phone-sized viewport.
3. **What to see:**
   - Step 1 card with Google + name/phone/password/headshot fields.
   - Headshot capture invokes the native camera on mobile.
   - After accept, lands on `/dashboard` with the first-run banner naming inviter + manager.
   - Open an inspection → capture a photo → no modal fires.
   - Tap "Submit for review" → licence modal opens fresh.
   - Submit credentials → action completes; Authorisation row visible in Prisma Studio.
   - Sign in later → "Submit for review" → pre-filled modal with one-tap confirm.
   - Banner dismissed.
4. **What NOT to see:**
   - No redirect to `/setup` wizard.
   - No licence modal during pure evidence capture.
   - No licence modal during signup or first page load.
   - No cross-tenant data leak.
   - No duplicate Authorisation rows on retry/refresh.
5. **Confirmation prompt:** screenshot of activated dashboard with welcome banner + licence modal in pre-filled state.

---

## Critical files (read-only reference)

- `app/invite/[token]/page.tsx` — to be rewritten
- `app/api/invites/[token]/route.ts` — to be extended
- `app/api/invites/oauth-complete/route.ts` — new
- `app/api/authorisations/route.ts` — to be extended (or created if not yet present)
- `app/api/authorisations/most-recent/route.ts` — new
- `app/api/onboarding/first-run/route.ts` — to be extended for role-branching
- `lib/auth.ts` — verify JWT callback hydrates `setupCompletedAt` from Organization
- `lib/cloudinary.ts` — existing upload primitive (reuse)
- `lib/credential-vault.ts` — N/A (no new secrets stored)
- `components/FirstRunChecklist.tsx` — reused, role-branched downstream
- `prisma/schema.prisma` — `User`, `Authorisation` model edits
- `middleware.ts` — verify-only (no change expected)

## New files (to be created)

- `app/api/invites/oauth-complete/route.ts`
- `app/api/authorisations/most-recent/route.ts`
- `components/invite/InviteIdentityStep.tsx`
- `components/invite/InviteTermsStep.tsx`
- `components/attestation/EngagementLicenceModal.tsx`
- `lib/authorisations/most-recent.ts` (helper + cache)
- `lib/authorisations/require-engagement-authorisation.ts` (the gate helper)
- `prisma/migrations/20260514000000_invited_technician_onboarding/migration.sql` — adds `User.phone`, `Authorisation.whsCardNumber`, `Authorisation.whsCardExpiry`, the new compound index
- `e2e/invite-tech-happy-path.spec.ts`
- `e2e/invite-tech-google-oauth.spec.ts`
- `e2e/invite-tech-expired.spec.ts`
- `e2e/invite-tech-already-used.spec.ts`
- `e2e/tech-evidence-capture-no-modal.spec.ts`
- `e2e/tech-signoff-modal-fresh.spec.ts`
- `e2e/tech-signoff-modal-cancel.spec.ts`
- `e2e/tech-banner-auto-dismiss.spec.ts`

---

## Verification

1. **Unit + integration tests pass:** `pnpm type-check && npx vitest run`.
2. **E2E happy path passes against staging Postgres:** `npx playwright test e2e/invite-tech-happy-path.spec.ts`.
3. **All 8 E2E scenarios green:** `npx playwright test e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts`.
4. **Visual baselines unchanged:** snapshot diff = 0.
5. **Schema migration round-trips:** apply migration on staging snapshot; assert User and Authorisation rows are backward-compatible (NULL phone / whsCardNumber on existing rows); re-run migration; no-op.
6. **Manual verification (Verification Gate above) executed by a human on staging.**
7. **No regressions in existing onboarding paths during transition:** middleware whitelist correct; existing `/invite/[token]` emails sent before this PR still resolve; `/api/invites/[token]` GET preview shape unchanged.

---

## Out of scope (separate sub-projects)

- **Sub-project #3** — BYOK upgrade paths (post-setup "upgrade your AI" experience; platform-managed keys for paid plans).
- **Sub-project #5** — end-to-end "sign-in → job close" flow audit (the user's larger framing — beyond setup).
- **Sub-project #6** — email-provider BYOK (Resend / SendGrid / SES), surfaced during this brainstorming; sibling to the AI BYOK (RA-414) and scraping BYOK (RA-2966) patterns.

## Tools used during execution

- `git`, `pnpm`, `npx vitest`, `npx playwright`, `npx prisma migrate`.
- Chrome DevTools MCP for `/invite/[token]` UI verification at the three viewports.
- Cloudinary for headshot storage (matches existing `User.businessLogo` / `InvoiceTemplate.logoUrl` storage; no new asset provider).

---

## Post-approval handoff

After this design is approved:

1. Self-review the spec for placeholders / contradictions / ambiguity / scope creep.
2. User reviews the spec doc.
3. Invoke `superpowers:writing-plans` skill to produce the implementation plan.

No implementation actions are authorized before that handoff completes.
