---
type: concept
name: launch-copy-pack-2026-08-25
description: RestoreAssist launch copy pack — landing page, LinkedIn, CARSI email, RIA DM, objection handling
okf_version: "0.1"
updated: 2026-08-25
---

# RestoreAssist — Launch Copy Pack

**Date:** 2026-08-25
**Author:** Phill McGurk (Unite-Group)
**Status:** Landing-page copy is live in code. Off-site channel copy below is ready to paste.

Edit names and links in `[brackets]` before sending. The only open decision is the domain used in each `[link]`.

---

## Where this copy lives

| Section                     | Home                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Hero headline / support     | `components/landing/home/homeContent.ts` → `HOME.hero`                                          |
| Sub-hero three-column strip | `components/landing/home/homeContent.ts` → `HOME.stance`                                        |
| Positioning block           | `components/landing/home/homeContent.ts` → `HOME.positioning`                                   |
| Rendering                   | `components/landing/concepts/claim-folio/ClaimFolioLanding.tsx` (sections `stance`, `positioning`) |
| LinkedIn / email / DM / FAQ | This document only — no code surface                                                            |

`HOME` is shared by all three landing concepts, so hero copy changes land on `/`, `/landing/claim-folio`, `/landing/dawn-split`, and `/landing/operator-atlas` at once.

---

## 1. Landing page

### Hero

> **Restoration software that works for you. Not the insurer.**
>
> Every other platform in this industry was built to serve the carrier. RestoreAssist was built for the contractor doing the work — and the homeowner living through it.
>
> Australian-built. Australian-priced.

### Sub-hero strip (three columns)

**Built for the job, not the claim file**
Capture the site on your phone — photos, moisture readings, scope notes — while you're standing in it. The report builds from what you recorded, not from what you remembered later.

**Evidence you can stand behind**
Every photo carries its real capture data. If a location wasn't recorded, we say so — we don't invent one to fill a field. Your documentation holds up because it's honest.

**Priced for Australian businesses**
No US-scale licensing. No per-seat gouging. One flat plan, built around how restoration actually runs here.

### The positioning block

> **Who your software works for tells you everything.**
>
> The established platforms are owned by, funded by, or sold to insurance interests. Their job is to make the claim cheaper. That's a legitimate business — it just isn't yours.
>
> When the software is designed around the carrier's workflow, you spend your day feeding their system instead of running your job. Your scope gets questioned by a tool you paid for. Your evidence sits in someone else's database.
>
> RestoreAssist has one customer: the restorer. We make your documentation faster, your scope defensible, and your client informed. If that makes your claims run smoother, good. But you're who we answer to.

### Close

The site's closing CTA stays on the shipped funnel — the 15-day trial with report credits, per `HOME.cta`. The original draft closed on a waitlist ("We're opening early access this week"). That framing was not carried into the page because the product is live and sells a $99 AUD/month plan today; a waitlist CTA in front of a working trial would understate what a visitor can actually do. See **Open decision** below.

---

## 2. LinkedIn post — post this now

```
Every restoration platform in this market was built to serve the insurer.

I've spent years watching contractors pay for software that works against them. Scope questioned by a tool you licensed. Documentation living in someone else's database. Pricing set for a US market that doesn't look anything like ours.

So we built the other thing.

RestoreAssist has one customer: the restorer.

Capture the site from your phone while you're standing in it. Photos, readings, scope. The report builds from what you actually recorded — not what you reconstructed at 9pm.

Evidence that's honest. If a photo didn't capture a location, we say so. We don't fill the field with a number that looks like data. Your documentation holds up because nothing in it is invented.

Australian-built. Australian-priced.

RIA kicks off tomorrow and I'm not there — but a lot of you are, and a lot of you have been asking me about this for months.

Comment or DM and I'll walk you through it.

[link]

#restoration #waterdamage #IICRC #RIA2026
```

---

## 3. Email — existing CARSI customers

**Subject:** `The thing you've been asking me about`

```
Hi [First name],

You've heard me complain about restoration software. Here's what I did about it.

RestoreAssist is built on one principle: the software works for the restorer,
not the insurer.

Site capture from your phone — photos, readings, scope, on site, in the moment.
Reports built from what you recorded. Evidence that's honest about what it does
and doesn't know. Priced for an Australian business, not a US one.

You're on a short list of people I'm putting it in front of first, because you've
backed what we do and you'll tell me straight if it's wrong.

Want a look? Just reply "yes" and I'll set you up.

[Link]

Phill McGurk
Unite-Group
```

---

## 4. DM — for people at RIA

```
Hey [name] — saw you're at RIA. I'm not there this year, but RestoreAssist
is up and running.

Short version: restoration software built for the contractor instead of the
carrier. Australian-built and Australian-priced.

Have a look while you're comparing what's on the floor — I'd genuinely value
your read on it against what you're being shown.

[link]
```

---

## 5. If someone asks "how is it different?"

Three sentences. Don't over-explain.

1. Everyone else answers to the insurer. We answer to you.
2. It's built for how restoration runs in Australia — pricing, standards, scale.
3. It's honest about evidence. If data wasn't captured, we don't invent it to fill a field.

That third one sounds small. It isn't. Documentation that fabricates provenance is worthless the first time it's challenged — and everyone in that room has been challenged.

---

## Claim verification

Every claim in the landing copy was checked against shipped behaviour before it went into the page:

| Claim                                                    | Evidence in the build                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| "Capture the site on your phone"                         | `lib/capture/cocoa-client.ts`, `lib/evidence-upload-queue.ts` — browser capture with SHA-256 and offline queue                  |
| "If a location wasn't recorded, we say so"               | `lib/capture/cocoa-client.ts` returns `null` on denial/timeout; `lib/evidence/qa-scorer.ts` raises "GPS location not recorded"; `components/inspection/CapturePhotoTagModal.tsx` renders "GPS unavailable" |
| "Every photo carries its real capture data"              | `lib/media/exif-extract.ts` (EXIF/GPS extraction), `lib/evidence/manifest-verify.ts` (rejects form coordinates when the manifest signed no location) |
| "No per-seat gouging"                                    | `lib/pricing.ts` — one $99 AUD/month workspace plan, no seat multiplier                                                        |
| "Australian-priced"                                      | `lib/pricing.ts` — AUD, GST 10% (NZ 15%)                                                                                       |

If a feature claim is added later, verify it ships before the sentence goes out.

---

## Open decision

**Waitlist vs live trial.** The source draft used early-access CTAs ("Get early access", "Request access") on the grounds that a waitlist form can't break in front of a competitor's booth. The site ships the live funnel instead, because the product is live: `/signup`, a 15-day trial with report credits, and a $99 AUD/month plan behind Stripe.

If the launch should run as a waitlist anyway, that is a separate change: an email-capture endpoint, CTA label and destination swaps in `HOME.hero` and `HOME.cta`, and an update to `app/__tests__/funnel-launch-assets.test.tsx`, which currently asserts the trial CTA renders on the home page.

The `[link]` in each off-site asset is the remaining decision — production domain vs a campaign-tagged URL.
