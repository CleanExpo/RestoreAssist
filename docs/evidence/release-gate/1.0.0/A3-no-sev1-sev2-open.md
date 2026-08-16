---
criterion: A3-no-sev1-sev2-open
status: deferred
verified: 2026-05-18
tracking_ticket: RA-6999
---

# A3 - No open Sev1/Sev2 defects (5 pts)

**Status:** DEFERRED - **downgraded from PASS on 2026-08-16.** The previous PASS claimed "0 issues match". That is measurably false today (see below), so the file was scoring 5 points it had not earned.

## Why this was downgraded (read this first)

The prior version of this file was written 2026-05-18 and declared `status: pass` on the strength of a Linear query returning 0 results. A live re-run of that query on **2026-08-16** returns **20 open Urgent/High issues** on team RestoreAssist. Narrowing to the product projects only (excluding the `Pi-Dev-Ops` and `Margot` projects, which the original file explicitly ruled out of scope per the RA-2232 pattern) still leaves **12**.

Nothing about this criterion could be fixed by refreshing the file's timestamp. The underlying condition is false, and the honest state is fail-closed.

## Live measurement (2026-08-16)

Urgent (priority 1), state = started, team = RestoreAssist - **7 total**:

| Ticket | Project | Status |
|---|---|---|
| RA-6678 | (none) | Pi-Dev: Blocked - **P0, ABR_API_GUID missing in prod** |
| RA-7214 | RestoreAssist | In Progress |
| RA-6999 | RestoreAssist | In Progress |
| RA-2974 | RestoreAssist V2 | Pi-Dev: Blocked |
| RA-4190 | Pi-Dev-Ops | Pi-Dev: Blocked (out of product scope) |
| RA-1664 | Margot | In Review (out of product scope) |
| RA-1662 | Margot | In Review (out of product scope) |

High (priority 2), state = started, team = RestoreAssist - **13 total**, of which in product scope: RA-6955, RA-7094, RA-6909, RA-6948, RA-7091, RA-5624, RA-2954, RA-2970. Out of product scope: RA-7134, RA-7092, RA-1873, RA-1657 (Pi-Dev-Ops / Margot).

**In-scope open Urgent/High: 12.** Criterion requires 0.

## Founder close-out (about 10 minutes)

This item cannot be closed by editing this file. It closes when the in-scope list reaches zero, by one of two routes per ticket - and both are decisions only you can make.

### Step 1 - re-run the query (2 min)

Open this saved view: **https://linear.app/unite-group/team/RA/active**

Filter to: **Priority is Urgent or High**. The result is the candidate list.

### Step 2 - for each in-scope ticket, pick one (8 min)

| Route | When to use it | What to do |
|---|---|---|
| **Close it** | The work is genuinely done, or it is no longer wanted | Move to Done or Cancelled in Linear |
| **Downgrade it** | It is real work but is **not a Sev1/Sev2 customer-impacting defect** - e.g. an epic, a growth initiative, a research spike, a governance/ledger ticket | Change priority to Medium or Low |

Applying the file's own Sev1/Sev2 definitions (below), most of the 12 are **not defects at all** and belong on the downgrade route:

- **Epics / feature work, not defects:** RA-6948, RA-7091, RA-2954, RA-2970, RA-2974
- **Growth / governance / audit tickets, not defects:** RA-7214, RA-6999, RA-7094, RA-6909
- **Genuine customer-impacting defects that must actually be fixed:** **RA-6678** (every ABN lookup fails in prod, breaks onboarding), **RA-6955** (outbound email unverified, support inbox), **RA-5624** (sandbox env degraded, which also blocks the A1/B4 smoke criteria)

RA-6678 and RA-6955 both have paste-ready fixes in **`docs/evidence/release-gate/FOUNDER-ACTIONS.md`** - doing those two collapses most of this item.

### Step 3 - record the result here

<!-- PASTE EVIDENCE HERE: date of re-run, the filter URL used, the resulting count, and for each ticket that was downgraded rather than closed, one line saying why it is not a Sev1/Sev2 defect -->

## Definitions (unchanged)

- **Sev1** - customer-impacting prod outage requiring P1 response (1 h or less)
- **Sev2** - customer-impacting bug degrading a core flow

An epic, a spike, a growth initiative or an internal audit ticket is neither, regardless of its Linear priority. Priority is not severity - that mismatch is why this criterion drifted.

## To mark PASS

Set `status: pass` and `verified: <YYYY-MM-DD>` only when the in-scope count is genuinely 0 and the table above is filled in. Do not re-apply the previous PASS wording.

## Related

- [[ra-4956]] - release gate definition
- RA-6999 - live distance-to-launch tracker
- RA-2232 - Pi-Dev-Ops WorkOrder out-of-scope verdict
