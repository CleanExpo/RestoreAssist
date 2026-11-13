# Phill P0 smoke script (browser only)

Pass = Layer B product truth for this phase. Run on **staging or production** after A-layer is green (`docs/operations/P0-PRODUCTION-CHECKLIST.md`).

## Before you start

- [ ] `GET /api/health` → `status: ok` (or `degraded` only for non-blocking recommended vars).
- [ ] `GET /api/inspections?limit=20&sort=recent` → **200** while logged in.
- [ ] Mailtrap vars set; one test send succeeded (`npm run email:test` or real invite).

## Eight steps

1. **Home** — Open `/`. In ~30s you understand product + trial. **Start free** → `/signup`.
2. **Signup** — Fresh email; see trial + **no credit card** copy. Land **dashboard** with no red Network errors on core APIs.
3. **Inspection** — Create inspection, save. Row appears on `/dashboard/inspections`.
4. **Report (first win)** — Create/save report from job. Visible on `/dashboard/reports`.
5. **Invoice** — Create invoice; GST/totals sane.
6. **Session** — Log out, log in same org; data still there.
7. **Billing (optional)** — `/billing/upgrade` or subscription page loads; test card checkout if enabled.
8. **Next day** — No new `[error]` on inspections list in ops logs; spot-check Admin → Business if available.

## Fail criteria

- Any core list API **500** during the session.
- Empty “create your first …” while a red error banner shows (should not happen after P0 list UX).
- Email invite/report never arrives when Mailtrap is configured.

Record pass/fail + date in your ops channel when marking P0 done.
