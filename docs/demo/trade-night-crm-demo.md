---
type: runbook
name: trade-night-crm-demo
description: The 8-minute cold demo for Trade Night (27 Nov 2026) — one restoration claim becomes a full-service client (RA-8220)
updated: 2026-11-21
---

# Trade Night demo: from one claim to a full-service client

**Story.** A restoration business also cleans carpets, upholstery and tiles. A
single water claim makes the homeowner a client for all of it. Running time is
about 8 minutes.

## Before you go on stage (5 minutes, once)

1. Sign in as the **workspace owner** (role ADMIN). Use the same account for the whole demo.
2. Press `POST /api/admin/seed-demo` (see `meter-photo-and-demo-claim.md` §1). This creates
   Sarah Thompson's completed water claim at 42 Harbourside Drive, Manly. The claim is linked
   to her client record and carries two update emails recorded as sent. **Nothing is emailed.**
3. Open **Dashboard → Contractors → Profile**. Fill in the description, tick **Publicly
   visible**, and leave the services unticked. Ticking them is a live step in the demo.

## The walk

| # | Show | Where | Say |
| --- | --- | --- | --- |
| 1 | The restoration job | Dashboard → Inspections → the `NIR-2026-04-DEMO-…` claim | "A washing-machine hose. Drying log, scope and report, all on one job." |
| 2 | Training for the job | The **CARSI training for this job** box on the same page | "The matching CARSI courses, one tap away." |
| 3 | The service catalogue | Contractors → Profile → **Services you offer**: tick Water damage, Carpet cleaning, Upholstery cleaning, Tile and grout cleaning, then Save | "This business does more than restoration." |
| 4 | The Business Card | `/contractors/<your slug>`: the **Services** section | "This is the link your client keeps." |
| 5 | The client timeline | Clients → Sarah Thompson → **Timeline** | "Every job and every update she received, in one place." |
| 6 | The next service | Back on the job: **Next service for this client** → **Copy draft** | "RestoreAssist suggests her next booking from what you offer, with your card link. You send it, from your own email." |

## What is real and what is seeded

- **Real.** The catalogue save, the public card, the next-service match and the draft, and the timeline query.
- **Seeded.** The claim, its readings and scope, and the two update emails. Those emails are
  rows recorded as sent; no email was delivered.
- **Not built yet.** The lead pipeline (RA-8011). The demo therefore opens on the job rather
  than on a lead. Say so if you're asked.

## Reset

Delete your demo inspection and re-press the seed. Untick the services if you want to repeat step 3.
