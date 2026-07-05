# RestoreAssist — Channel Plan (Launch + First 90 Days)

**Date:** 2026-05-13
**Constraint:** No paid social ads in v1. Organic and community-led only.
**Owner:** Phill McGurk (solo founder — every row is owned by Phill unless noted).
**Default channel (BrandConfig):** LinkedIn

---

## Channel mix overview

| Tier | Channels | Role |
|---|---|---|
| Lead | LinkedIn (founder voice), YouTube (Pillar B explainers), industry Facebook groups | Reach the owner-operator where they already are |
| Support | RIA Australia member newsletter, Google Search (long-tail SEO), email to free-tier users | Convert intent already in motion |
| Hold | X/Twitter, podcasts, paid ads | Not in v1 — track but don't invest |

---

## 1. LinkedIn (founder voice)

**Why:** Restoration owner-operators follow IICRC instructors, insurers, and equipment suppliers on LinkedIn. The founder voice — direct, grounded, technical — earns trust here in a way an ad cannot.

| Item | Spec |
|---|---|
| Post type | Founder-voice text post; occasionally a 9:16 vertical 60-second clip from the Pillar B explainers |
| Frequency | 3 posts per week (Mon / Wed / Fri, 06:30 AEST) for first 30 days; drop to 2/week thereafter |
| Who posts | Phill, from his personal profile (not the brand page) |
| Topics | (1) one-field-to-workspace setup story; (2) IICRC report quality stories; (3) photo chain-of-custody explainer; (4) Australian compliance edge cases; (5) honest behind-the-scenes of building solo |
| Success metric | Profile views, comments by ICP-matching operators, DMs requesting a demo. Target: 3 demo requests per week by week 4. |
| Anti-pattern | No "we are excited to announce" openers. No CTA pushing to a brand destination — direct the reader to act in their own interest. |

## 2. YouTube (Pillar B explainers + new shorts)

**Why:** Owner-operators search "how to" before they search a product name. The Pillar B explainers are the conversion engine when they land.

| Item | Spec |
|---|---|
| Channel | YouTube — RestoreAssist (existing) |
| Six published explainers (Pillar B) | `setup-wizard-signup`, `setup-wizard-signin`, `setup-wizard-setup`, `setup-wizard-dashboard`, `setup-wizard-integrations`, `setup-wizard-health` (full URLs and titles in `copy-pack.md`) |
| New uploads in first 30 days | 4 long-tail walkthroughs: "Writing an IICRC S500-compliant water damage report", "Pushing a restoration job into Xero without re-keying", "Photo chain-of-custody on an iPad — what insurers check", "ABN setup for a new water-damage business" |
| Frequency | 1 long-form (3–6 min) every 10 days; 2 shorts (under 60s, vertical) per week cut from the same source footage |
| Who posts | Phill — narration via the brand voice (ElevenLabs "Sarah" voice, locale en-AU per BrandConfig) for shorts; Phill's own voice for long-form |
| Success metric | Watch-time on the setup wizard explainer (target >50% retention to 90s mark); subscribers gained; click-through from end-card to `/setup`. Target: 200 subscribers and 2,000 watch hours over 90 days. |
| Cross-post | Embed in `/dashboard/learn` (already live); embed in LinkedIn and Facebook posts where relevant. |

## 3. Industry Facebook groups

**Why:** Highest-trust signal in the ICP. One operator vouching is worth ten ads. Equally, one badly-worded promotional post will get the founder banned from the group.

| Item | Spec |
|---|---|
| Target groups | "Australian Water Damage Restoration", "IICRC Australia", "Restoration Industry Professionals AU", "ServiceM8 Users Australia", "Ascora Users" |
| Post type | (1) Genuine question seeking input; (2) Useful answer in someone else's thread linking to a YouTube explainer; (3) Periodic "I built this — would value honest feedback" thread (max once per 30 days per group) |
| Frequency | Daily presence (answer 1–2 threads per day across all groups); 1 launch-announcement thread per group, spaced 3 days apart |
| Who posts | Phill, personal profile, with full transparency that he runs RestoreAssist |
| Rules of engagement | Read each group's rules first. Never paste the same launch copy into multiple groups on the same day. Disclose ownership in every promotional reply. |
| Success metric | Comments, profile clicks, group-attributed signups. Target: 30 attributed signups in first 60 days. |
| Failure mode | A negative thread takes off. Contingency in `launch-runbook.md` — Phill replies once, on substance, never escalates. |

## 4. RIA Australia member newsletter

**Why:** The closest thing to a trade publication in this market. Reaches owner-operators who already pay for membership — high intent, high trust.

| Item | Spec |
|---|---|
| Post type | Sponsored 200-word column in the monthly newsletter; one-time launch announcement plus quarterly thereafter |
| Frequency | Launch month + months 3, 6, 9 |
| Who posts | Phill, signed off by RIA editorial |
| Topic angles | "What changed in S500:2021 §7.1 and what it means for your reports"; "ABN-anchored CRM setup — a teardown"; case study from an early-access operator (with permission) |
| Success metric | UTM-tagged click-throughs to `/setup`; survey response rate from existing customers asking "did you see the column?" Target: 50 attributable clicks per placement. |
| Cost | A$300–A$600 per placement (RIA standard rates). Tracked but not categorised as "paid ads" — it's industry sponsorship, not Meta. |

## 5. Google Search (long-tail SEO)

**Why:** Owner-operators search for templates, calculators, and how-tos before they search for a product. Capture the intent at the verb stage.

| Item | Spec |
|---|---|
| Target keywords (first 90 days) | "water damage report template Australia", "IICRC S500 scope of works template", "psychrometric calculator Australia", "ABN setup water damage business", "Xero integration for restoration business", "GST on insurance jobs Australia" |
| Content type | Long-form (1,500–2,500 word) articles with downloadable templates and inline calculators. Sit at `/learn/articles/{slug}`. |
| Frequency | 1 article per fortnight |
| Who writes | Phill (drafted with Claude, edited by Phill for voice and accuracy) |
| Success metric | Organic impressions, top-3 ranking on at least 3 keywords by day 90, click-through to `/setup` |
| Anti-pattern | No keyword stuffing. No AI-generated marketing fluff. Every article ends with a verifiable artefact (template, calculator, checklist) — never with a pitch. |
| Note | This is not in scope for the launch runbook below (T-7 to T+30). It runs in parallel from T+14. |

## 6. Email — beta invite to free-tier users

**Why:** Existing free-tier users are the warmest segment for a product launch. They already created an account, hit the old onboarding, and may have stalled.

| Item | Spec |
|---|---|
| Recipients | All existing users with `Organization.setupCompletedAt = null` (grandfathered to the new wizard via the `scripts/backfill-setup-wizard.ts` migration) |
| Frequency | One launch email at T-day; one follow-up at T+7 if they haven't completed setup |
| Who sends | Phill, From: `phill@restoreassist.com.au` (founder address, not no-reply) |
| Subject lines | 3 variants in `copy-pack.md`; A/B test 1/3 split |
| Success metric | Open rate >40%, click-through to `/setup` >12%, setup-wizard completion within 48 hours >25% of clickers |
| Anti-pattern | No "we are excited" openers. No urgency manufacturing ("offer ends Friday"). |

## 7. X/Twitter — track only

Restoration owner-operators are rarely on X. We post light content (one thread per week, 1–3 standalone posts per week) to seed search and keep the handle warm, but no investment goes here in v1. Copy is in `copy-pack.md` for completeness.

---

## Per-channel cadence at a glance

| Channel | Days 1–30 | Days 31–60 | Days 61–90 |
|---|---|---|---|
| LinkedIn | 3 posts/week | 2 posts/week | 2 posts/week |
| YouTube | 6 explainers live + 2 shorts/week | 1 long-form, 2 shorts/week | 1 long-form, 2 shorts/week |
| Facebook groups | Daily presence + 1 launch thread per group | Daily presence | Daily presence |
| RIA newsletter | Launch column | — | — |
| Google SEO | Setup landing-page indexing | 4 articles | 4 articles |
| Email | Launch + 7-day follow-up | Monthly product note | Monthly product note |
| X/Twitter | 5 launch posts | 1 thread/week | 1 thread/week |

---

## What we explicitly do not do in v1

- No Meta or Google paid ads. The ICP is too small and too word-of-mouth-driven for paid social to be efficient.
- No cold outbound to RIA member directories. The trust model collapses.
- No influencer partnerships. The trade does not have meaningful "influencers" in the LinkedIn sense.
- No podcast sponsorships until at least day 90, when we have customer stories worth telling.

---

## Tracking and attribution

All outbound links carry UTM parameters: `utm_source={channel}&utm_medium={post_type}&utm_campaign=pillar-c-launch`. Conversion event: `setupCompletedAt` set on `Organization`. Attribution dashboard scaffolded by `marketing-analytics-attribution` skill in a follow-up session — out of scope for this doc.
