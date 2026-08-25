---
type: concept
name: launch-copy-pack-2026-08-25
description: RestoreAssist launch copy — landing page, LinkedIn, email, RIA DM, objection handling, reply template
okf_version: "0.1"
updated: 2026-08-25
---

# RestoreAssist — Launch Copy Pack

**Version 2. Supersedes the first draft.**
**Author:** Phill McGurk (Unite-Group)
**Status:** Landing-page copy is live in code. Off-site channel copy below is ready to paste.

Edit names in `[brackets]` before sending.

---

## What changed from v1, and why

**v1 said "early access opens this week."** Wrong — the product is live and sells a 15-day trial today. The waitlist CTAs were never carried into the site.

**v1 had no price in it.** The pricing model is the strongest line available against insurer-owned platforms that bill per user, and it was missing from everything.

**v2's first pricing draft said "Not per seat. Not per user."** That is not accurate either, and it is corrected below. See **Pricing — say it exactly this way**.

**Do not mention Google Play as available.** The Android listing is not live (UNI-2617). It is "coming soon"; lead with iOS and the mobile browser, both of which work today.

---

## Pricing — say it exactly this way

RestoreAssist is the CRM — the connector the products plug into. The $99 buys
that hub for the whole workspace; each $11 add-on opens one of the products
that connects to it.

The model, from the code that actually bills:

| What | Price | Source |
| --- | --- | --- |
| Office / CRM — the base product, whole team | **$99/month AUD**, per workspace, not per user | `lib/pricing.ts` |
| Floor Plan Underlay, Service CRM, Bookkeeping, Payments, Client Comms, Voice | **$11/month each**, flat unlock | `lib/billing/*-addon.ts` |
| **Field Technician Seat** | **$11/month PER SEAT** — buyer picks the count, billed × quantity | `lib/billing/technician-seats-addon.ts` |

**Safe wording:**

> $99 a month for the office CRM — your whole team, not per user. The extra services are $11/month add-ons you turn on only if you want them; field technician seats are counted per technician.

**Do not say:** "flat", "not per seat", "not per user" without qualification, or "$99 and that's it". A five-technician business pays $99 + $55, not $99 + $11. `components/pricing/CostDisclosure.tsx` records that this exact claim was made once before and found to be false — the page "denied there was any per-seat fee. Both statements were false."

**Open question for the product, not the copy:** the intent described is that $11/month *opens* field service. The shipped code bills $11 *per technician*. Six of the seven add-ons match the intent; the field one does not. Either the code or the intent needs to move — until it does, the copy follows the code.

---

## Where the landing copy lives

| Section | Home |
| --- | --- |
| Hero headline / support | `components/landing/home/homeContent.ts` → `HOME.hero` |
| Three-column stance strip | `HOME.stance` |
| Positioning block | `HOME.positioning` |
| Rendering | `components/landing/concepts/claim-folio/ClaimFolioLanding.tsx` |

`HOME` is shared by all three landing concepts, so hero changes land on `/` and every `/landing/*` variant at once.

---

## 1. Landing page

### Hero

> **Restoration software that works for you. Not the insurer.**
>
> Every other platform in this industry was built to serve the carrier. RestoreAssist was built for the contractor doing the work — and the homeowner living through it.
>
> Australian-built. Australian-priced.

### Sub-hero strip

**Built for the job, not the claim file** — Capture the site on your phone while you're standing in it. The report builds from what you recorded, not from what you remembered later.

**Evidence you can stand behind** — Every photo carries its real capture data. If a location wasn't recorded, we say so. Your documentation holds up because it's honest.

**Priced for Australian businesses** — $99 a month runs the office CRM for your whole team. Extra services are $11/month add-ons you switch on only when you need them; field technician seats are counted per technician.

### Positioning block

> **Who your software works for tells you everything.**
>
> The established platforms are owned by, funded by, or sold to insurance interests. Their job is to make the claim cheaper. That's a legitimate business — it just isn't yours.
>
> RestoreAssist has one customer: the restorer.

---

## 2. LinkedIn

```text
Every restoration platform in this market was built to serve the insurer.

I've watched contractors pay for software that works against them. Scope
questioned by a tool you licensed. Documentation living in someone else's
database. Per-user pricing set for a US market that looks nothing like ours.

So we built the other thing.

RestoreAssist has one customer: the restorer.

$99 a month runs the office CRM — your whole team, not per user. The extra
services are $11/month add-ons you turn on only if you want them.

What it does:

Capture the site from your phone while you're standing in it — photos, moisture
readings, scope, voice notes. Works offline, syncs when you're back in signal.

IICRC S500:2021-aligned reports build from what you actually recorded, not what
you reconstructed at 9pm. You review and own every decision before it leaves
your company.

Evidence that's honest. If a photo didn't capture a GPS location, we say so. We
don't fill the field with a number that looks like data. Your documentation
holds up because nothing in it is invented.

Built in Australia. GST, NCC 2022, WHS, state regulators — in the workflow, not
in a separate folder. Australia and New Zealand.

RIA starts tomorrow. I'm not there — but a lot of you are, and a lot of you have
been asking me about this for months.

It's live now. 15-day trial, 50 report credits.

restoreassist.app

#restoration #waterdamage #IICRC #RIA2026 #AustralianBusiness
```

---

## 3. Short version — X, Facebook groups, WhatsApp

```text
Restoration software built for the contractor, not the insurer.

$99/month for the office CRM — your whole team, not per user. Extra services
are $11/month add-ons.

Capture on site from your phone, offline. IICRC S500 reports build from what you
actually recorded. Evidence that's honest about what it does and doesn't know.

Australian-built. AU + NZ.

Live now, 15-day trial: restoreassist.app
```

---

## 4. Email — existing CARSI customers

**Subject:** `The thing you've been asking me about`

```text
Hi [First name],

You've heard me complain about restoration software. Here's what I did about it.

RestoreAssist is built on one principle: the software works for the restorer,
not the insurer.

Site capture from your phone — photos, readings, scope, on site, in the moment.
Reports built from what you recorded. Evidence that's honest about what it does
and doesn't know.

$99 a month for the office CRM, your whole team — not per user. The extra
services are $11/month add-ons you turn on only if you want them.

You're on a short list of people I'm putting it in front of first, because
you've backed what we do and you'll tell me straight if it's wrong.

Want a look? Just reply "yes" and I'll set you up.

Phill McGurk
Unite-Group
```

---

## 5. DM — for people at RIA

```text
Hey [name] — saw you're at RIA. I'm not there this year, but RestoreAssist is
live as of this week.

Short version: built for the contractor instead of the carrier. $99/month for
the office CRM, whole team, not per user. Australian-built.

Worth a look while you're comparing what's on the floor — I'd genuinely value
your read on it against what you're being shown.

restoreassist.app
```

---

## 6. Reply template — for the "yes" responses

```text
Hi [name],

Great — here's your link: restoreassist.app/signup

15-day trial, 50 inspection report credits. Setup is instant; you can run your
next job through it today.

After the trial it's $99/month for the office CRM — your whole workspace, not
per user — so bring your team in from the start. Field capture and the other
services are $11/month add-ons if you want them.

One thing worth knowing: on-site capture runs on your phone, in the browser or
the iOS app. The desktop app can't capture photos and video on site, so put it
on the phone of whoever is standing in the job.

One ask: if anything about it annoys you, tell me directly rather than quietly
stopping. You're one of the first in and I'd rather fix it than lose you.

Phill
```

---

## 7. If someone asks "how is it different?"

1. **Everyone else answers to the insurer. We answer to you.**
2. **$99 for the office CRM, your whole team** — not per user on the core system.
3. **Built for how restoration runs in Australia** — GST, NCC, state WHS, IICRC, AU + NZ.
4. **It's honest about evidence.** If data wasn't captured, we don't invent it to fill a field.

That fourth one sounds small. It isn't. Documentation that fabricates provenance is worthless the first time it's challenged — and everyone in that room has been challenged.

---

## Claims check

| Claim | Verified against |
| --- | --- |
| $99/month office CRM, per workspace not per user | `lib/pricing.ts` — one workspace plan |
| $11/month add-ons; field seats per technician | `lib/billing/*-addon.ts`; `technician-seats-addon.ts` is `perSeat: true` |
| Offline capture | `lib/capture/`, `lib/evidence-upload-queue.ts` |
| GPS honesty | `cocoa-client.ts` returns null on denial; `qa-scorer.ts` raises "GPS location not recorded"; `CapturePhotoTagModal` renders "GPS unavailable" |
| IICRC S500:2021 | Homepage + `/compliance-library` |
| GST AU 10% / NZ 15%, NCC 2022, state WHS | Homepage coverage section |
| 15-day trial, 50 report credits | `lib/pricing.ts` |
| Live now | `restoreassist.app` serves 200; smoke suite targets it |

**Not claimed anywhere:** Google Play availability, insurer partnerships, customer counts, "Australia's first" (removed from all live surfaces — an absolute market-primacy claim with nothing to substantiate it and ACCC exposure).

---

## Decision record

**Waitlist vs live trial — decided: live trial.** The product sells a 15-day trial and a $99/month plan today; a waitlist in front of a working signup would understate what a visitor can do.

**"Australia's first" — decided: removed.** "Australian-designed" carries the same weight with none of the exposure.

**Still open:** whether field service should be a flat $11 unlock (the stated intent) or stay $11 per technician (the shipped code). The copy follows the code until that is settled.
