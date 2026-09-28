# Invited-Technician Onboarding — E2E Test Prerequisites

The 8 specs in this directory exercise the full invited-technician flow plus the licence modal. Before they can pass in CI:

## 1. Test-only seed-helper routes

These routes exist under `app/api/test/`. Each spec calls one or more of:

- `POST /api/test/seed-org-with-manager` — creates an `Organization`, a manager `User` and, by default, a `UserInvite`. Returns `{ token, inviteeEmail, managerEmail, organizationId }`; `token` and `inviteeEmail` are `null` when no invite is created.
- `POST /api/test/sign-in-google-as` — issues a NextAuth session cookie as if Google OAuth completed. Body: `{ email }`.
- `POST /api/test/sign-in-as` — issues a NextAuth session cookie as a given role. Body: `{ role: "USER" | "ADMIN" | "MANAGER" }`.
- `POST /api/test/seed-authorisation` — inserts an Authorisation row for the current session user. Body: `{ subjectLicenceNumber, whsCardNumber, ... }`.

### `seed-org-with-manager` body

A JSON object; every key is optional. An unparseable body, a non-object body, an unknown key or a value of the wrong type answers `400 { error, field }` before anything is written.

| Key | Type | Effect |
|---|---|---|
| `managerEmail` | non-empty string | Manager's email. Defaults to a unique value. An email that already exists answers `500` with `code: "P2002"`: the seed never grants seats to an existing account. |
| `expiresInDays` | finite number | Invite lifetime. Use `-1` for the expired-invite branch. Default 7. |
| `markUsed` | boolean | Marks the invite used, for the already-used branch. |
| `technicianSeats` | integer 0–50 | Also creates a READY `Workspace` owned by the manager plus an active `TECHNICIAN_SEATS` entitlement with that many seats. |
| `createInvite` | boolean | `false` skips the invite. |

Seats, in practice:

- `technicianSeats: 0` gives a READY workspace with 0 seats. Leaving the key out gives no workspace at all. These are different states.
- The default seeded invite is a live USER invite, so it uses one seat. Before an owner sends a second invite through the UI, seed `technicianSeats: 2`, or pass `createInvite: false`.
- An invite token for an owner with no free seat answers `402` when it is accepted.
- With `technicianSeats: 1` and the default invite, the only seat is used, so a Team page invite answers `402 PAYMENT_REQUIRED`.
- The seeded entitlement has no Stripe price, so it has the shape of a paid seat, not a Founding Trial grant.
- All writes run in one transaction. A failure answers `500 { error, code }` (the Prisma error code, or `"UNKNOWN"`) and leaves nothing behind.
- An empty `managerEmail` is now a `400`, not a fallback to the default.

Timeouts: the server may wait up to 20 s for a database connection, then 30 s for the transaction. Give the seed request a timeout of at least 55 s and check `seed.ok()` before reading the body.

Cleanup: delete the `Workspace` before its owner `User`. `Workspace.owner` is `onDelete: Restrict`, so deleting the user first fails. Deleting the workspace removes its entitlement (cascade). Seeded workspaces have a slug starting `e2e-`.

### `seed-inspection` body

`POST /api/test/seed-inspection` upserts an Inspection owned by the signed-in user. An unparseable or non-object body answers `400`. Unknown keys are accepted and ignored, unlike `seed-org-with-manager`, so existing callers keep working; a key such as `submittable` has no effect. Pass your own `inspectionId`: the default `"test-inspection"` is shared by several specs.

### Guards

`seed-org-with-manager`, `seed-inspection`, `sign-in-as` and `sign-in-google-as` answer `404` while `testHelpersBlocked()` (`app/api/test/_helpers.ts`) is true: they need `ALLOW_TEST_HELPERS=true`, plus `ALLOW_TEST_HELPERS_IN_PROD_ENV=true` on a `VERCEL_ENV=production` deploy. The real production app sets neither. `seed-authorisation` and `seed-trial-user` still check `ALLOW_TEST_HELPERS` alone; moving them to `testHelpersBlocked()` is a follow-up.

## 2. `InspectionSignOff.tsx` must be mounted into a page (currently orphaned)

The `tech-signoff-modal-fresh.spec.ts` and `tech-signoff-modal-cancel.spec.ts` rely on a "Sign Inspection" button on the inspection detail page. Today, `components/inspection/InspectionSignOff.tsx` is not rendered anywhere. Mount it under `app/dashboard/inspections/[id]/page.tsx` (likely behind a `status === "COMPLETED"` branch) and the specs will resolve.

## 3. Chain-of-custody confirm UI does not exist

There's no separate trigger #4 yet. If you decide the auto-generated capture-time CoC manifest (rule 21) satisfies the requirement, remove the placeholder test. If a distinct user-driven confirm step is needed, design and ship it, then add an E2E spec.

## 4. Banner role-branching live data

`tech-banner-auto-dismiss.spec.ts` relies on `/api/onboarding/first-run` returning tech-step IDs for USER role (T10 — already shipped). The banner UI component (`FirstRunChecklist`) must be visible on the dashboard for USER role; confirm the parent layout doesn't hide it for that role.

## Running

Once 1–4 above are addressed:

```bash
npx playwright test e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts
```

Expect 8 specs green.
