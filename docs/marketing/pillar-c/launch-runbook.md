# RestoreAssist — Pillar C Launch Runbook (T-7 → T+30)

**Date:** 2026-05-13
**T-day target:** 2026-05-20 (Wednesday) — kickoff at 09:00 AEST
**Owner:** Phill McGurk (solo founder — every row below is owned by Phill)
**Scope:** Marketing launch of the gated setup wizard, tutorials hub, and Workspace Health page (PR #955, already merged to main)
**Hard constraint:** Doc + organic-content only. No code changes. No paid social ads.

---

## Gate checks

| Gate | When | Pass criteria | If fail |
|---|---|---|---|
| **T-3 go/no-go** | 2026-05-17, 09:00 AEST | (1) `/setup` returns 200 on staging + prod with seed account; (2) all 6 Pillar B videos resolve and embed in `/dashboard/learn`; (3) Workspace Health card shows all green on a fresh test tenant; (4) ABR sandbox + production keys both healthy in the last 24h; (5) copy pack reviewed against banned-words list with zero hits | Push T-day to next clear weekday morning. Reassess gate the day before. |
| **T-day kickoff** | 2026-05-20, 09:00 AEST | All T-3 checks still green; staging smoke test re-run that morning | Halt the email send; LinkedIn + Facebook posts still go ahead (low-risk) |
| **T+7 retro** | 2026-05-27, 09:00 AEST | Review KPI dashboard; decide week-2 cadence | If signups <50% of forecast, run a debrief on funnel drop-offs before doubling down |

---

## Day-by-day timeline

### T-7 → Wednesday 2026-05-13 (today)
- **09:00–12:00** — Open this PR. Author positioning, ICP, channel plan, copy pack, runbook. Self-review for banned words.
- **14:00–16:00** — Verify the six Pillar B YouTube videos are public, unlisted vs public state correct, end-cards point to `/setup`.
- **16:00–17:00** — Pull free-tier user list query (`Organization.setupCompletedAt IS NULL AND createdAt < '2026-05-12'`). Confirm row count. Verify backfill migration already moved them onto the new wizard route.
- **End-of-day commit:** copy frozen.

### T-6 → Thursday 2026-05-14
- **08:00–10:00** — Record the four new long-tail YouTube videos (writing an IICRC S500 report, Xero push, photo chain-of-custody on iPad, ABN setup). These ship across the first 30 days, not T-day.
- **10:00–12:00** — Draft thumbnails for the 6 launch explainers + the new long-tails. Brand colours from `BrandConfig.colour` (primary `#E55A2B`, accent `#C5E063`).
- **15:00–17:00** — Email send infrastructure check. Send one test email to a personal inbox + a Gmail + an Outlook. Verify DKIM, SPF, DMARC all aligned. Verify the From address `phill@restoreassist.com.au` is whitelisted.

### T-5 → Friday 2026-05-15
- **08:00–10:00** — RIA Australia newsletter — submit the 200-word column to editorial. Confirm placement for the June newsletter (closest to launch).
- **10:00–12:00** — Cross-check Facebook group rules. List of 5 target groups; read each group's pinned post or rules document. Confirm whether self-promo is allowed in any thread or only in a designated "show and tell" thread.
- **15:00–17:00** — Draft LinkedIn post for T-day. Final voice review.

### T-4 → Saturday 2026-05-16
- Light day. Buffer for slippage from T-5 RIA editorial back-and-forth, video re-cuts, or copy edits.
- **18:00–19:00** — Quick check of analytics infrastructure. Verify UTM parameters resolve to the campaign tag `pillar-c-launch` in whatever analytics surface is live.

### T-3 → Sunday 2026-05-17 — GO/NO-GO GATE
- **09:00–10:00** — Run the T-3 gate criteria above. Document the pass/fail in this file.
- **10:00–12:00** — If pass: schedule the email send (Customer.io / Resend / whichever transport is live) for T-day 09:30 AEST. Schedule the LinkedIn post for T-day 09:00 AEST. Schedule the X posts.
- **15:00–17:00** — Final read of every Facebook group post. Customise the opener per group — never paste the same launch copy twice.

### T-2 → Monday 2026-05-18
- **08:00–10:00** — Run the full setup wizard end-to-end on a fresh test account, screen-recording it. This is the artifact you reference if the launch post gets challenged on "does it actually work?"
- **10:00–12:00** — DM 3–5 trusted operators in the ICP and offer them an early preview. Ask for honest feedback; nothing to share publicly yet.
- **15:00–17:00** — Pre-stage the in-app announcement banner copy in whatever CMS / settings table drives `/dashboard` banner. Confirm it shows on a test account.

### T-1 → Tuesday 2026-05-19
- **08:00–10:00** — Final check on every scheduled asset. Email queue, LinkedIn post, X posts, Facebook drafts, RIA column placement.
- **10:00–12:00** — Final smoke test of `/setup` on production with a fresh test ABN. Capture screenshots of every section in "ready" state. Save to `/tmp/launch-smoke-2026-05-19/`.
- **15:00–17:00** — Quiet block — no more changes. Lock the runbook.
- **17:00** — Early dinner. Phone off.

### T-day → Wednesday 2026-05-20 — LAUNCH

| Time (AEST) | Action |
|---|---|
| 08:00 | Coffee. Re-run smoke test on `/setup`. Screenshot Workspace Health all-green on a fresh tenant. |
| 09:00 | LinkedIn post goes live (founder profile). Pin it for the week. |
| 09:30 | Email send to free-tier user list. A/B/C subject-line split 33/33/34. |
| 10:00 | First X post (problem framing). |
| 10:30 | Facebook group post — "Australian Water Damage Restoration". |
| 12:00 | X post 2 (social proof tease). |
| 14:00 | Facebook group post — "IICRC Australia". |
| 16:00 | X post 3 (feature reveal). |
| 17:00 | Reply to every LinkedIn comment from the day. Triage email replies. |
| 19:00 | Close laptop. Tomorrow is for follow-up, not for piling more launch artefacts onto a fatigued audience. |

### T+1 → Thursday 2026-05-21
- **08:00–10:00** — Reply to overnight LinkedIn comments. Read every email reply from the launch email; respond personally to the first 20.
- **10:00–12:00** — Facebook group post — "Restoration Industry Professionals AU". Tone: report on yesterday's launch, ask for genuine feedback.
- **14:00–16:00** — X post 4 (compliance specificity).
- **17:00** — KPI dashboard first read.

### T+2 → Friday 2026-05-22
- **09:00–12:00** — Facebook group post — "ServiceM8 Users Australia". Frame: a parallel option for users frustrated with ServiceM8's lack of restoration-specific report templates.
- **14:00** — X post 5 (soft CTA).
- **End-of-day** — Update KPI dashboard. Note any signups, completion rates, attribution.

### T+3 → Saturday 2026-05-23, T+4 → Sunday 2026-05-24
- Quiet weekend. Reply to inbound. No new launch content.
- Sunday evening: draft second LinkedIn post (Wednesday 2026-05-27 schedule).

### T+5 → Monday 2026-05-26
- **09:00** — Second LinkedIn post — operator story or behind-the-scenes of the launch week.
- **14:00** — Facebook group post — "Ascora Users".
- **End-of-day** — KPI dashboard read.

### T+6 → Tuesday 2026-05-27
- Quiet. Prepare for T+7 retro.

### T+7 → Wednesday 2026-05-27 — RETROSPECTIVE GATE
- **09:00–11:00** — Run the KPI dashboard. Compare to forecast.
- **11:00–12:00** — Decide week-2 cadence. If signups >= 50% of forecast, continue as planned. If <50%, run the contingency checklist below.
- **14:00** — Send T+7 follow-up email to free-tier users who clicked but did not complete setup.
- **End-of-day** — Update this runbook with retro notes inline.

### T+8 → T+14 (Days 9–15)
- Daily Facebook group presence (answer questions, do not pitch).
- 2 LinkedIn posts (Wednesday + Friday).
- 1 YouTube short uploaded (cut from the 6 explainers).
- 1 new long-form YouTube video uploaded (target: IICRC S500 report walkthrough).
- 5 X posts.

### T+15 → T+21 (Days 16–22)
- Same cadence as T+8–T+14.
- 1 RIA Australia newsletter column publishes (if June placement confirmed).
- Begin first SEO long-form article — "Water damage report template Australia". Draft + publish to `/learn/articles/` (if that route exists; otherwise hold for the route to ship).

### T+22 → T+30 (Days 23–31)
- Same cadence as T+8–T+14.
- 1 new long-form YouTube video uploaded (target: Xero push without re-keying).
- Day 30 retro: KPI dashboard review. Decide whether to continue at 3 LinkedIn posts/week or drop to 2.

---

## KPI dashboard structure

Tracked daily. Owner: Phill. Surface: a single page in the analytics tool (or a Google Sheet if no analytics surface is live).

### Primary KPIs

| Metric | Definition | Forecast (30 days) | Source |
|---|---|---|---|
| Signups | New `Organization` rows created via `/signup` | 200 | Prisma query |
| Setup wizard starts | `Organization.setupStartedAt IS NOT NULL` rows created in window | 180 (90% of signups) | Prisma query |
| Setup wizard completions | `Organization.setupCompletedAt IS NOT NULL` rows created in window | 130 (65% of signups, 72% of starts) | Prisma query |
| Sample-report opens | First open of seeded sample report on dashboard | 100 (50% of signups) | App event |
| Time-to-first-report | Median seconds between `setupCompletedAt` and first user-authored report | 45 minutes | App event |

### Channel attribution

| Channel | UTM source | Forecast signups | Forecast completion rate |
|---|---|---|---|
| LinkedIn | `linkedin-organic` | 60 | 70% |
| YouTube | `youtube-organic` | 40 | 75% |
| Facebook groups | `facebook-{group-slug}` | 30 | 65% |
| Email (launch) | `email-launch` | 25 | 80% |
| Direct / brand | `direct` | 35 | 60% |
| Google organic | `google-organic` | 10 | 65% |

### Funnel health

- Wizard section drop-off rates (ABN → Branding → Pricing → Storage → Integrations → Health → Activate). Target: no single transition drops more than 15% of users.
- Hydration job error rate. Target: <5% per job (ABR, website scrape, pricing).
- Workspace Health "red" rate at first view. Target: <10%.

### Qualitative signals

- LinkedIn post engagement (comments by ICP-matching profiles, DMs)
- Email replies (personal responses)
- Facebook group thread sentiment
- YouTube comment sentiment + watch retention curves

---

## Contingencies

### Contingency 1 — Setup wizard regression

**Trigger:** `/setup` returns 500 OR Workspace Health page shows a red row for a capability that should be green on a fresh tenant.

**Response:**
1. Pause all outbound (email, scheduled posts).
2. Open a Linear incident — `RA-XXXX setup-wizard-regression-{date}`.
3. Reproduce on staging. Bisect against the last green commit.
4. If the regression is in a hydration job (ABR / website / pricing): the wizard falls back to `manual` mode automatically — launch can continue, but the LinkedIn post must be edited to remove the "90 seconds" claim and replace with "under 5 minutes".
5. If the regression is in Activate or middleware gating: stop the launch. Reschedule T-day for the next clear weekday after green CI.

### Contingency 2 — Hydration job failures (ABR / website / pricing)

**Trigger:** >20% of new users in the first hour land on a `manual` fallback for any section.

**Response:**
1. Check ABR API status (registered consumer key health — see `lib/integrations/abr/`).
2. Check website scrape Playwright budget (3s per scrape on Vercel Node runtime).
3. If ABR is broken: the wizard's daily auto-retry job picks up overnight — no immediate action, but post a transparent LinkedIn comment thread acknowledging the dependency on a public API.
4. Update the in-app banner: "ABR is currently slow — your business details will populate within 24 hours."

### Contingency 3 — ABR outage during peak signup window

**Trigger:** ABR returns 5xx or times out for >5 consecutive minutes.

**Response:**
1. Verify on https://abr.business.gov.au/Tools/AbnLookup that the public service is down (not just our credentials).
2. The wizard already falls back to `manual` — the user can continue.
3. Post a single transparent X update: "ABR is down nationally. Your setup will still complete — business details are entered manually for now and auto-fill the moment ABR is back."
4. Do not panic-edit any other copy. The fallback is the product working as designed.

### Contingency 4 — Negative feedback in an industry Facebook group

**Trigger:** a thread starts where an operator publicly criticises RestoreAssist.

**Response:**
1. Read the thread carefully. Reply once, on substance, never on tone.
2. Acknowledge what the operator said. If it is a real product gap, say so clearly: "You're right. We're not there yet on X. I'm tracking it as Y."
3. Never escalate. Never delete. Never argue.
4. Take the feedback into a Linear ticket if it is actionable.
5. If the thread is brigaded or in bad faith, do not engage past the first reply. Other operators in the group will read the substance and form their own view.

### Contingency 5 — Email deliverability issue

**Trigger:** Open rate <15% in the first 2 hours.

**Response:**
1. Check that From: `phill@restoreassist.com.au` is not being filtered to spam.
2. Check DKIM/SPF/DMARC alignment via a tool like `mxtoolbox`.
3. If deliverability is genuinely broken, pause the send for the remaining recipients. Investigate before resuming.
4. If deliverability is fine and opens are just slow, hold — the second wave typically opens 6–18 hours after send.

### Contingency 6 — Workspace Health shows a red row in production for the first 20 users

**Trigger:** Welcome-email check or AI generation check reports red for any user in the first hour.

**Response:**
1. The Activate button is correctly gated — users *cannot* complete setup with a red check. They will email Phill.
2. Diagnose: is it a transient transport error (Resend / SES blip) or a systemic capability failure?
3. If transient: retry server-side and email the affected users a personal note within 30 minutes.
4. If systemic: roll back to the last known-green deploy. Reschedule launch +2 days.

---

## Out of scope for this runbook

- Sub-project #2 (technician onboarding) — not part of launch messaging
- Sub-project #3 (BYOK upgrade paths) — referenced in copy as "optional", not promoted
- Sub-project #5 ("sign-in → job close" flow audit) — separate cycle
- Paid social ads — not in v1
- Podcast sponsorships — earliest review point is day 90

---

## Retro notes (filled in at T+7 and T+30)

### T+7 retro — filled in 2026-05-27
(empty — to be completed live)

### T+30 retro — filled in 2026-06-19
(empty — to be completed live)
