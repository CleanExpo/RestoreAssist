---
type: concept
name: launch-copy-pack-2026-08-25
description: RestoreAssist launch copy — landing page, LinkedIn, email, RIA DM, objection handling, reply template
okf_version: "0.1"
updated: 2026-08-25
---

# RestoreAssist — Launch Copy Pack

**Version 3. v1 and v2 are superseded — do not send them.**
**Author:** Phill McGurk (Unite-Group)
**Status:** Landing-page copy is live in code. Channel copy below is ready to paste.

Edit names in `[brackets]` before sending.

---

## What v1 and v2 got wrong

- **v1** said "early access opens this week." The product is live and sells a trial today.
- **v2** said "$99 flat, whole team, no per-seat." **False** — Field Technician Seat is $11/month *per seat*.

The corrected framing is better than either, because it is the one that survives being checked.

---

## The real model — every figure verified against `lib/pricing.ts`

| | | Source |
| --- | --- | --- |
| Free trial | $0, 15 days, 50 report credits, no card | `free.trialDays: 15`, `trialReportCredits: 50` |
| Monthly | **$99 AUD/month**, 50 inspection reports | `pricing.monthly.amount: 99.0`, `reportLimit: 50` |
| First month bonus | +10 reports | `signupBonus: 10` |
| Effective rate | **$1.98 per report** | 99 ÷ 50 |
| Top-up packs | 8 for $20 · 25 for $50 · 60 for $100 ($1.67/report) | `addons.pack8/25/60` |
| Add-ons | 7 optional at $11/month each. **Field Technician Seat is $11 PER SEAT** | `lib/billing/*-addon.ts`; `technician-seats-addon.ts` is `perSeat: true` |
| AI generation | Your own Anthropic/OpenAI key. They bill you. **No margin taken** | `CostDisclosure.tsx` section 3 |

**GST-inclusivity of the $99 is confirmed.** `pricing.ts` alone does not settle it — the monthly plan block carries no GST marker — but `app/pricing/page.tsx:239` renders "AUD, incl. GST" and `components/pricing/CostDisclosure.tsx:282` states plan pricing includes GST. "incl GST" is safe to print.

---

## Do not say

- **"No per-seat"** — Field Technician Seat is $11 per seat, per month.
- **"Flat pricing for your whole team"** — same reason.
- **"Early access" / "waitlist"** — it is live and selling.
- **"Australia's first"** — removed from five live surfaces on 2026-08-25.
- **"IICRC certified"** — the config says *"Reports structured on IICRC S500:2021 sections"*. Aligned with, never certified.
- **Google Play availability** — the Android listing is not live (UNI-2617). The support FAQ says "coming soon" and points at the mobile browser.

## If asked about seats — answer straight

> "$99 covers the office system and 50 reports a month. Field technician seats are $11 each per month, and the seven integrations are $11 each if you want them. It's all itemised on the pricing page — nothing is buried behind signup."

Honesty here beats a slogan. Every competitor in that room hides their add-ons.

---

## The angle to lead with

The pricing page does something almost nobody does: **it lists costs it does not charge.**

`components/pricing/CostDisclosure.tsx` tells the buyer their AI provider bills them directly, that RestoreAssist takes no margin, and that it will not publish a per-report AI estimate it cannot stand behind — *"Rather than print a number we cannot stand behind, this component states what the cost is, who is paid, that Restore Assist takes no share of it, and where the buyer can read the current rates."* The plan config goes further and removes claims for features that were never built.

Against insurer-owned platforms that hide add-ons behind a sales call, that transparency **is** the differentiator. It is the same quality as the GPS honesty: a company that refuses to fabricate a number is a company whose reports hold up in a dispute.

---

## 1. LinkedIn

```text
Every restoration platform in this market was built to serve the insurer.

I've watched contractors pay for software that works against them. Scope
questioned by a tool you licensed. Documentation sitting in someone else's
database. Pricing set for a US market that looks nothing like ours.

So we built the other thing.

RestoreAssist has one customer: the restorer.

$99 a month. 50 inspection reports. That's $1.98 a report, in Australian
dollars, cancel any time.

And here's the part I'd rather be judged on.

Our pricing page lists every cost — including the ones we don't charge you.
Report generation runs on your own Anthropic or OpenAI key. They bill you
directly. We take no margin and no share. We say so on the page, and we don't
publish a fake per-report estimate because we can't give you an honest one.

That's the same reason the software is worth using.

Capture the site from your phone while you're standing in it — photos,
readings, scope. Reports build on IICRC S500:2021 section structure from what
you actually recorded. If a photo didn't capture a GPS location, we say so. We
don't fill the field with a number that looks like data.

Documentation that invents provenance is worthless the first time it's
challenged. Everyone reading this has been challenged.

Australian-designed. GST, NCC 2022, state WHS, AU and NZ.

RIA starts tomorrow. I'm not there — but a lot of you are, and a lot of you
have been asking me about this for months.

15-day free trial, 50 reports, no credit card.

restoreassist.app

#restoration #waterdamage #IICRC #RIA2026
```

---

## 2. Short — X, Facebook groups, WhatsApp

```text
Restoration software built for the contractor, not the insurer.

$99/month AUD — 50 inspection reports. $1.98 a report.

AI generation runs on your own API key. Your provider bills you direct, we take
zero margin, and we say so on the pricing page.

IICRC S500:2021 structure. Australian-designed. AU + NZ.

15-day free trial, no card: restoreassist.app
```

---

## 3. DM — people at RIA

```text
Hey [name] — saw you're at RIA. I'm not there this year, but RestoreAssist is
live.

$99/month, 50 reports, Australian dollars. AI runs on your own key so you pay
your provider at cost and we take no cut of it.

While you're comparing what's on the floor — ask every vendor what the software
costs you all-in, including anything billed by someone else. Ours is all on one
page.

restoreassist.app
```

---

## 4. "How is it different?" — four sentences

1. **Everyone else answers to the insurer. We answer to you.**
2. **$99/month, 50 reports, $1.98 each** — published, in AUD.
3. **We disclose costs we don't even charge** — AI runs on your key, at cost, zero margin, stated on the page.
4. **Evidence that's honest.** No GPS recorded? We say so. We don't invent data to fill a field.

---

## 5. Reply template — for the "yes" emails

```text
Hi [name],

Great — start here: restoreassist.app/signup

15 days free, 50 inspection report credits, no card required. You can run your
next job through it today.

After the trial it's $99/month AUD — 50 reports a month, which works out to
$1.98 a report. Cancel any time, no lock-in.

One thing worth knowing up front, because I'd rather you hear it from me: report
generation runs on your own Anthropic or OpenAI key. They bill you directly for
it, we take no margin. It keeps the subscription low and keeps your data on your
account. Takes two minutes to set up under Settings -> AI Providers.

On-site capture runs on your phone, in the browser or the iOS app. The desktop
app can't capture photos and video on site, so put it on the phone of whoever is
standing in the job.

If anything about it annoys you, tell me directly rather than quietly stopping.
You're one of the first in and I'd rather fix it than lose you.

Phill
```

---

## Landing page — what is live in code

| Section | Home |
| --- | --- |
| Hero headline / support | `components/landing/home/homeContent.ts` -> `HOME.hero` |
| Three-column stance strip | `HOME.stance` |
| Positioning block | `HOME.positioning` |
| Rendering | `components/landing/concepts/claim-folio/ClaimFolioLanding.tsx` |

Hero: *"Restoration software that works for you. Not the insurer."*
Positioning close: *"RestoreAssist has one customer: the restorer."*

`HOME` is shared by all three landing concepts, so hero copy lands on `/` and every `/landing/*` variant at once.

---

## Decision record

- **Waitlist vs live trial — decided: live trial.** The product sells a 15-day trial and a $99/month plan today.
- **"Australia's first" — decided: removed** from all five live surfaces. Absolute market-primacy claim, nothing to substantiate it, ACCC exposure.
- **Pricing claims — decided: follow the billing code, not the pitch.** Two drafts asserted flat/no-per-seat pricing that the code contradicts.

**Still open:** whether Field Technician Seat should become a flat $11 unlock (the stated intent that $11 "opens" field service) or stay per-seat as shipped. Six of seven add-ons match the intent; this one does not. Seat enforcement is deferred, so nothing currently blocks inviting technicians beyond purchased seats.
