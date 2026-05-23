# Invited-Technician Onboarding — E2E Test Prerequisites

The 8 specs in this directory exercise the full invited-technician flow plus the licence modal. Before they can pass in CI:

## 1. Test-only seed-helper routes (NOT YET BUILT)

Each spec calls one or more of:

- `POST /api/test/seed-org-with-manager` — creates an Organization + manager User + UserInvite. Body: `{ managerEmail?, expiresInDays?, markUsed? }`. Returns `{ token, inviteeEmail }`.
- `POST /api/test/sign-in-google-as` — issues a NextAuth session cookie as if Google OAuth completed. Body: `{ email }`.
- `POST /api/test/sign-in-as` — issues a NextAuth session cookie as a given role. Body: `{ role: "USER" | "ADMIN" | "MANAGER" }`.
- `POST /api/test/seed-authorisation` — inserts an Authorisation row for the current session user. Body: `{ subjectLicenceNumber, whsCardNumber, ... }`.

All four must be created under `app/api/test/` and guarded by `process.env.NODE_ENV !== "production"`. Pattern:

```ts
if (process.env.NODE_ENV === "production") {
  return NextResponse.json({ error: "Not available in production" }, { status: 404 });
}
```

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
