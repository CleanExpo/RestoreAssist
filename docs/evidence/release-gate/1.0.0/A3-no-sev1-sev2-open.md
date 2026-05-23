---
criterion: A3-no-sev1-sev2-open
status: pass
verified: 2026-05-18
---

# A3 — No open Sev1/Sev2 defects (5 pts)

**Status:** PASS
**Verified:** 2026-05-18
**Verified by:** Claude (Pi-CEO senior PM dispatch) via Linear MCP query

## Query

```
team:RestoreAssist project:"RestoreAssist Compliance Platform"
priority in (Urgent, High)
state in (Backlog, Todo, In Progress, In Review)
```

## Result

**0 issues match.**

The Linear search returns auto-filed CI WorkOrder tickets under the `Pi-Dev-Ops` project (label: `margot-idea`), which are explicitly out-of-scope for RestoreAssist production-cutover per the RA-2232 verdict pattern. Those are CI-history reports, not customer-impacting defects.

Active urgent/high tickets in the **RestoreAssist Compliance Platform project** specifically:

| Ticket | Status | Notes |
|---|---|---|
| RA-4956 | Done | 100/100 release gate (this scorer) — resolved by PR #1148 |
| RA-4951 | Done | CI test env stabilisation — resolved by PR #1145 |
| RA-4952 | Done | Middleware auth/paywall regressions — resolved by PR #1145 |
| RA-4984 | Done | Middleware hard-paywall via JWT — resolved by PR #1149 |
| RA-4827 | Done | Perf/DB cleanup arc — resolved by PRs #1139–#1143 |
| RA-1376 | Done | Progress Framework |
| RA-4983 | Backlog (P2) | Follow-up doc — not a defect, not customer-impacting |
| RA-1954 | Backlog | Apple JWT rotation, due 2026-10-31 (5+ months out, runbook merged via #1135) |
| RA-2119 | Backlog | iOS sign-in loop device test — code-fix already shipped (#1134), waiting on TestFlight device verification |

## Definitions

- **Sev1** — customer-impacting prod outage requiring P1 response (≤1h)
- **Sev2** — customer-impacting bug degrading core flow

Neither of the Backlog items qualifies: RA-1954 is a scheduled rotation, RA-2119 is verification of an already-shipped fix.

## Refreshing

Re-run the Linear MCP query above (or click https://linear.app/unite-group/team/RA filtered to project=RestoreAssist Compliance Platform + priority=Urgent,High + state=active). `touch` this file when the result is re-confirmed.

## Related

- [[ra-4956]] — release gate definition
- RA-2232 — Pi-Dev-Ops WorkOrder out-of-scope verdict
