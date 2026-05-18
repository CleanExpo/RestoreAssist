# F2 — Runbooks + P1 SLA + customer comms template (5 pts)

**Status:** PASS
**Verified:** 2026-05-18
**Verified by:** Claude (Pi-CEO senior PM dispatch)

## Criterion (from RELEASE_GATE.md F2)

> Runbooks + support SLAs (P1 response ≤1h, customer comms template ready) — Files exist: `docs/MOBILE_RELEASE_RUNBOOK.md` + `docs/PILOT_CUTOVER_CHECKLIST.md` + support template

## Evidence

All three required artifacts now exist in the repo. The first two pre-existed; the SLA + comms template were authored as part of this evidence batch (commit 59eca712 + this PR).

### 1. `docs/MOBILE_RELEASE_RUNBOOK.md`

```
-rw-r--r--  27579 bytes  2026-05-18  docs/MOBILE_RELEASE_RUNBOOK.md
```

Covers iOS/Android release sequencing, TestFlight + Play Console upload steps, App Review submission checklist, post-release smoke procedure.

### 2. `docs/PILOT_CUTOVER_CHECKLIST.md`

```
-rw-r--r--   9198 bytes  2026-05-07  docs/PILOT_CUTOVER_CHECKLIST.md
```

A/B/C/D/M/R-step pilot cutover sequence, hourly monitoring checks, rollback decision tree (P0/P1/P2 signal → action), Day-7 retro template.

### 3. `docs/SUPPORT_SLA.md` (new, this batch)

P0/P1/P2/P3 severity definitions + response-time commitments:

| Severity | First human response | Resolution target |
|---|---|---|
| P0 | ≤30 min (24/7) | Same business day |
| P1 | ≤1 h (business hours); ≤2 h after-hours | ≤24 h |
| P2 | ≤4 h (business hours) | ≤5 business days |
| P3 | ≤1 business day | Best-effort, backlog |

Includes escalation policy (2× SLA → founder CC; compliance issues escalate immediately regardless of severity).

### 4. `docs/CUSTOMER_COMMS_TEMPLATE.md` (new, this batch)

Five paste-and-adapt templates:

- **Template A** — Initial P0/P1 acknowledgement
- **Template B** — Mid-incident progress update
- **Template C** — Resolution notice
- **Template D** — Post-mortem (≤5 business days)
- **Template E** — Compliance / data-handling incident (special-cased)

Includes anti-pattern guidance ("don't say 'experiencing degradation', say what's broken in customer terms").

## Cross-reference with RA-4956 acceptance

| Required item | File | Verified |
|---|---|---|
| Release runbook | `docs/MOBILE_RELEASE_RUNBOOK.md` | YES |
| Rollback plan | `docs/PILOT_CUTOVER_CHECKLIST.md` §"Rollback decision tree" | YES |
| P1 SLA (≤1h response) | `docs/SUPPORT_SLA.md` | YES — P1 = ≤1h business-hours, ≤2h after-hours |
| Customer comms template | `docs/CUSTOMER_COMMS_TEMPLATE.md` | YES — 5 templates incl. compliance variant |

## Refresh

These docs review quarterly per their frontmatter `review_cadence`. If response-time commitments change, bump `version` in `SUPPORT_SLA.md` and `touch` this evidence file. Compliance escalation rule is locked — needs founder approval to relax.

## Related

- [[ra-4956]] — release gate definition (F2 = 5 pts)
- `feedback_quality_first_autonomy.md` — bug-class-matched protocol that informs the SLA tiers
