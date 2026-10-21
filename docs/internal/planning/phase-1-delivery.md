# Phase 1 delivery — alignment with founder plan (Oct 2026)

**Direction:** RestoreAssist as a **connected CRM** — each job on a **client record**, field data flowing back reliably.

**Process (non-negotiable):** All changes land via **pull request → CI → founder merge**. No direct pushes to `main` (merge deploys production). See `CLAUDE.md`.

---

## Priority map

| # | Founder priority | Engineering track | Verification |
| --- | --- | --- | --- |
| 1 | **Indooroopilly** — lost moisture, invented date, frontend | Attendance UI uses `inspectionDate` only; golden DB test; escaped-defect photo path | `docs/engineering/indooroopilly-trace-checklist.md` |
| 2 | **Firm isolation** — no cross-firm data (RA-8043) | RA-8043c platform/admin gates; RA-8043d Drive claims scope | `ra-8043c-platform-gates`, `ra-8043d-drive-gates`, dashboard scope tests |
| 3 | **Offline capture** on phone | Field dashboard cache + offline page + queue copy; Capacitor network | Manual airplane-mode script; `lib/offline/*` tests |

---

## PR packaging (recommended)

1. **`fix(tenancy): RA-8043 …`** — isolation only (review security first).
2. **`fix(phase1): attendance date display …`** — Indooroopilly frontend date fix + regression tests.
3. **`feat(phase1): field offline UX …`** — copy + `/offline` link (priority 3 UX).
4. **`docs(phase1): …`** — trace checklist + this file.

Incoming Mac Mini branches (claims intake, comms log, glossary, etc.) should be **diffed against these tracks** before starting overlapping API/UI work.

---

## Indooroopilly — definition of done

- [ ] Golden integration test green on CI DB (`indooroopilly.golden.integration.test.ts`).
- [ ] Dashboard never shows `createdAt` as attendance (regression test locked).
- [ ] Founder trace on sanitised prod/staging IDs OR signed-off synthetic replay only.
- [ ] iPhone photo attach re-verified per `escaped-defects.md` (2026-10-02).

---

## RA-8043 — definition of done

- [ ] RA-8043c + RA-8043d tests green.
- [ ] Contractor A cannot read contractor B governance/telemetry/claims Drive assets.
- [ ] `feat/claim-intake-core` on Mac Mini reconciled with merged GitHub gates (no duplicate tenancy logic).
