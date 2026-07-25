# Spec — Lifetime customers are locked out of paid AI features (night-run task #21)

Stage: DEFINE complete. Written 2026-07-26. **Reclassified from "reconcile a divergence"
to a P1 access defect** once the code was actually read.

## The defect, in one sentence

`requireActiveSubscription()` never reads `lifetimeAccess`, so a paying lifetime customer
is refused with HTTP 402 on ten production AI routes.

## Verified evidence

1. `lib/billing/subscription-gate.ts:22-25` selects **only** `subscriptionStatus`.
   `lifetimeAccess` is never queried and never considered.
2. `ALLOWED_SUBSCRIPTION_STATUSES` includes `"LIFETIME"` — but `enum SubscriptionStatus`
   in `prisma/schema.prisma:1368-1374` is `TRIAL | ACTIVE | CANCELED | EXPIRED | PAST_DUE`.
   **There is no `LIFETIME` member.** That allowlist entry is dead code and can never match.
3. `lifetimeAccess` is a real, separate `Boolean? @default(false)` column
   (`prisma/schema.prisma:124`), and the rest of the codebase treats it as authoritative —
   `lib/organization-credits.ts:75-77` maps `lifetimeAccess` to status `ACTIVE`, plan
   "Lifetime", 999,999 credits.
4. Consequence: a lifetime customer whose `subscriptionStatus` is `CANCELED`, `EXPIRED` or
   null (the normal state for someone who bought lifetime rather than subscribing) is
   refused on all ten consumers of the helper.

## Blast radius — ten routes

`app/api/ai/auto-classify-photo/[photoId]`, `app/api/ai/voice-note-transcribe`,
`app/api/elevenlabs/sfx`, `app/api/elevenlabs/voice`, `app/api/heygen`,
`app/api/inspections/[id]/similar-jobs`, `app/api/inspections/[id]/vectorise-jobs`,
`app/api/inspections/[id]/assessments/[type]/generate`,
`app/api/inspections/[id]/sketches/import-from-image`,
`app/api/reports/[id]/weakness-check`.

## This bug class already cost an App Store rejection

`components/TrialBanner.tsx` carries this comment verbatim: *"Was the cause of an Apple App
Review rejection: reviewer's demo account had lifetimeAccess=true but the banner showed
because we only checked subscriptionStatus."* The identical mistake — checking status and
ignoring the lifetime flag — is still live in the billing gate.

## Correct behaviour, and which side is right

The Live Teacher turn route (`app/api/live-teacher/turn/route.ts:109-114`) checks
`["TRIAL","ACTIVE"]` **plus** `lifetimeAccess === true`. That route is **correct**; the
shared helper is wrong. The earlier review note framed this as "the turn route diverges from
the helper and should conform" — that was backwards, and conforming to the helper would have
propagated the defect into an eleventh route.

## Acceptance criteria — each machine-falsifiable

1. `requireActiveSubscription` returns `null` (allow) for `{ subscriptionStatus: "CANCELED",
   lifetimeAccess: true }`. This test fails against current `main`.
2. It returns `null` for `{ subscriptionStatus: null, lifetimeAccess: true }`.
3. It still returns 402 for `{ subscriptionStatus: "CANCELED", lifetimeAccess: false }`.
4. It still returns 402 for `{ subscriptionStatus: "PAST_DUE", lifetimeAccess: false }`.
5. It still returns `null` for `TRIAL` and for `ACTIVE` with `lifetimeAccess: false`.
6. It returns 402 when the user does not exist.
7. The dead `"LIFETIME"` allowlist entry is removed, and a test asserts every member of
   `ALLOWED_SUBSCRIPTION_STATUSES` is a real `SubscriptionStatus` enum member — so the class
   of "allowlisted value the database can never produce" cannot silently return.
8. The 402 body shape is unchanged (`{ error, upgradeRequired: true }`) — the Sidekick and
   other clients branch on `upgradeRequired`, so changing it would break their gate routing.
9. `pnpm type-check` exits 0; the ten routes' existing tests still pass.

## Positive control

Criterion 1 must be **observed failing** against the unfixed helper before the fix lands.
A test that only ever passed proves nothing about a bug it claims to catch.

## Risk

Low and one-directional: the change only ever *grants* access to users holding
`lifetimeAccess: true`. It cannot loosen access for anyone else, because every other branch
is untouched. The reverse risk — leaving it — is that paying customers keep hitting a paywall
they already bought their way past.
