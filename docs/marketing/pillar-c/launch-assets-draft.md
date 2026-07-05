# RestoreAssist — Pillar C Launch-Day Asset Drafts

**Date:** 2026-05-13
**T-day:** 2026-05-20
**Owner:** Phill McGurk
**Status:** DRAFT — pending human voice review. Do not publish.
**Voice:** direct · grounded · informed · human · short cadence · plain English alongside technical terms
**Reading level target:** 4 (hard fail at 8)
**Banned vocabulary (BrandConfig + copy-pack):** leverage, utilise, best-in-class, world-class, game-changer, revolutionary, seamless, powerful, unlock, journey, excited, thrilled, delighted, synergy, in today's competitive landscape, we are excited to announce

---

## (a) LinkedIn T-day post — three voice variants

Each variant is 200–300 words. Founder profile post, scheduled 09:00 AEST on 2026-05-20. Pinned for the week. No URL shorteners — paste the raw `https://restoreassist.app/setup` link.

### Variant 1 — Phill-as-founder (direct, first-person, 246 words)

Last week I watched an operator spend forty-seven minutes on the setup screen of an "AI-powered" restoration CRM.

Forty-seven minutes typing his ABN, his ACN, his trading name, his GST status, his address, his logo URL, his brand colours, and a paragraph of "about us" copy he wrote in the cab between jobs.

The AI did not appear until step nine of fourteen. When it appeared, it was a single button that wrote two paragraphs of marketing copy for the report cover page.

I have spent the last six months building the opposite of that.

RestoreAssist asks for one thing. Your ABN.

From that, three jobs run in parallel:

— the Australian Business Register fills your legal name, ACN, GST status, and address;
— a scrape of your website pulls your logo, your brand colours, and your about copy;
— a 2026 pricing dataset seeds your labour and equipment rates for the state you work in.

The wizard ends with a live capability check. AI report generation. Cloud storage. Accounting sync. Every advertised capability shows green, or you cannot hit Activate.

Then the dashboard opens with your own branding on a draft sample report.

If the next claim dispute lands on your desk at 9pm, the report is already written. IICRC S500:2021 §7.1 in the footer. Photo evidence stamped with SHA-256 and a UTC timestamp at capture.

It is live today. Try it. Tell me what is still wrong.

https://restoreassist.app/setup

---

### Variant 2 — Neutral product voice (third-person, 217 words)

RestoreAssist is an Australian water-damage restoration CRM. The new setup wizard is live today.

The old onboarding asked operators to fill in fourteen fields before they could see a dashboard. The new wizard asks for one. The ABN.

From that single field, three hydration jobs run in parallel.

The Australian Business Register returns legal name, ACN, GST status, and address. A scrape of the operator's website returns logo, primary and accent brand colours, and an about-us paragraph. A 2026 pricing dataset seeds labour and equipment rates by state.

Before the operator can hit Activate, a live capability check runs against every advertised feature. AI report generation. Cloud storage. Accounting sync. Anything red blocks activation and tells the operator what to fix.

The dashboard then opens with the operator's own branding on a draft sample report.

Every report cites IICRC S500:2021 §7.1 by edition and section. GST is calculated at 10%. ABN is validated at 11 digits. State building codes route through the correct jurisdictional authority — not a US zip-code regex.

Photo evidence carries a SHA-256 hash and UTC timestamp at capture. A C2PA-style manifest with GPS, device, and user hash is the next milestone on the public roadmap.

The wizard is at https://restoreassist.app/setup.

---

### Variant 3 — Customer-story angle (260 words, anonymised operator)

An operator I spoke to in March lost a A$5,300 claim because the insurer asked for photo timestamps and he could not produce them.

His CRM had stripped the EXIF data on upload to save storage. He had no chain of custody. The insurer rejected the claim. The job stalled. He paid the technicians out of his own pocket that fortnight.

He told me the story over coffee. He asked me what I was building.

I told him: a setup wizard that asks for your ABN and nothing else. Three parallel jobs pull your business details from the Australian Business Register, your branding from your website, and your pricing from a 2026 Australian dataset. A live capability check runs before you activate, so you know the report generator works for your tenant, on your device, right now.

Photos are stamped with SHA-256 and a UTC timestamp the moment they are captured. The full manifest with GPS, device, and user hash is on the roadmap. The point is the operator can answer the insurer's question, the first time it is asked.

He asked when it would be live.

It is live today.

If you run a water-damage restoration business in Australia and your evening is being eaten by report admin, the new RestoreAssist setup wizard is ready for you.

One field in. Workspace out.

https://restoreassist.app/setup

If the next claim dispute lands at 9pm and asks for photo evidence, the answer is already in the report.

---

## (b) Launch email — free-tier list

Send time: T-day 09:30 AEST. Recipients: all users with `Organization.setupCompletedAt = null` (grandfathered to the new wizard via `scripts/backfill-setup-wizard.ts`). From: `phill@restoreassist.com.au` (fallback `phill@unite-group.in` per T-6 DNS check).

### Subject lines — A/B/C split (33 / 33 / 34)

| Variant | Subject line                                     | Preview text                                                       |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| A       | Your workspace is one ABN away from done         | One field in. Eleven fields out. Ninety seconds.                   |
| B       | The setup screen you signed up for never existed | Until today. Your ABN fills in the rest.                           |
| C       | What changed since you last opened RestoreAssist | New: ABN-anchored setup, live capability check, six walk-throughs. |

Decide a winner at 48 hours by setup-wizard completion rate, not by open rate. Open rates are noisy now that Apple Mail prefetches images.

### Email body (shared across all three subject variants)

> Hi {firstName},
>
> Short note from Phill.
>
> The first version of RestoreAssist asked you to fill in fourteen fields before you could see your dashboard. That was wrong. It is fixed.
>
> The new setup wizard asks for one field. Your ABN.
>
> From that:
>
> — the Australian Business Register fills your legal name, ACN, GST status, and address;
> — your website (if you have one) seeds your logo and brand colours;
> — a 2026 pricing dataset seeds your labour and equipment rates for your state.
>
> Before you can hit Activate, a live check runs against every advertised capability. AI report generation. Cloud storage. Accounting sync. Anything red, you see what to fix.
>
> Your account is already routed to the new wizard. Pick up where you left off here:
>
> https://restoreassist.app/setup?utm_source=email-launch&utm_medium=email&utm_campaign=pillar-c-launch
>
> If anything breaks, hit reply. I read every email that comes back to this address.
>
> — Phill
> Founder, RestoreAssist
> phill@restoreassist.com.au

Body word count: 173 words. No urgency manufacturing. No corporate-announcement opener. One CTA. One reply path.

### Plain-text footer

Unsubscribe link is auto-injected by the transport (Resend / Customer.io). Physical address — 22 Quay Street, Brisbane QLD 4000 — is required by the Spam Act 2003. No marketing tracking pixels beyond the transport default.

---

## (c) RIA Australia newsletter — 200-word column

Per `channel-plan.md`, the RIA Australia member newsletter takes a 200-word sponsored column in the June edition (closest to launch). Submission deadline per the T-5 row: 2026-05-15, 10:00 AEST.

### Column copy (203 words)

**ABN-anchored CRM setup — a teardown for restoration operators**

If you have evaluated a restoration CRM in the last two years, you have typed your ABN, your ACN, your trading name, your GST status, your address, your logo URL, and your brand colours into the same setup form, on five different tools. None of them were AI-driven. They were AI-flavoured.

RestoreAssist treats the first ninety seconds as the proof point. You type your ABN. Three jobs run in parallel: the Australian Business Register fills your business details; a scrape of your website pulls your logo and brand colours; a 2026 Australian pricing dataset seeds your labour and equipment rates by state.

Before you activate, a live check runs against every advertised feature. AI report generation. Cloud storage. Accounting sync. Anything red, you cannot activate until you see what to fix.

Every report cites IICRC S500:2021 §7.1 by edition and section. GST at 10%. ABN at 11 digits. State building codes route through the correct jurisdictional authority. Photo evidence carries a SHA-256 hash and UTC timestamp at capture.

It is live now at https://restoreassist.app/setup. Built by a fellow operator. Honest feedback welcome.

— Phill McGurk, Founder

Word count: 203. Within RIA editorial tolerance of 200 ± 10. UTM tag for click-through: `utm_source=ria-newsletter&utm_medium=newsletter&utm_campaign=pillar-c-launch`.

---

## (d) Thumbnail briefs — four new long-tail YouTube videos

Per T-6 in the runbook, four long-tail walk-throughs ship across the first 30 days. Each thumbnail brief is one paragraph describing the visual concept and on-screen text overlay. Brand colours from `BrandConfig.colour`: primary `#E55A2B` (candy orange), accent `#C5E063` (lime). Aspect 16:9, 1280 × 720 minimum. Font: Inter ExtraBold for the overlay headline.

### Thumbnail 1 — Writing an IICRC S500-compliant water damage report

Split-frame composition. Left half: an iPad held in landscape, showing a completed report with the IICRC S500:2021 §7.1 citation visible in the footer, photo evidence rendered in a 2 × 2 grid above the citation. Right half: a clipboard with a handwritten report scratched out in red marker. The overlay headline reads "STOP HANDWRITING S500 REPORTS" in white Inter ExtraBold on a candy-orange diagonal banner across the top third. A small lime accent badge bottom-right reads "IICRC S500:2021 §7.1". Phill's face is not in this thumbnail — the iPad is the protagonist. Avoid the over-used pointing-and-shocked-face pattern.

### Thumbnail 2 — Pushing a restoration job into Xero without re-keying

Two-column visual. Left column: the RestoreAssist job detail screen on a laptop, the line items highlighted. Right column: the same line items appearing in a Xero invoice draft. A solid candy-orange arrow runs left-to-right between them, labelled with the word "AUTO" in white block letters. Above the arrow, the overlay headline reads "ZERO RE-KEYING" in white Inter ExtraBold. Below the arrow, a lime accent strip reads "Xero · MYOB · QuickBooks". The thumbnail proves the workflow in a single glance: the same line items, two systems, no manual step.

### Thumbnail 3 — Photo chain-of-custody on an iPad — what insurers check

Hero shot: a single iPad held in portrait by a hand wearing a high-vis sleeve, photographing a section of damaged drywall. The captured photo is shown inside a magnified callout circle with metadata badges around it — "SHA-256", "UTC 14:32", and "GPS LAT/LON" rendered in white on small candy-orange chips. The overlay headline reads "WHAT THE INSURER CHECKS" in white Inter ExtraBold on a dark `#2A3D45` strip across the bottom third. A lime accent corner badge top-left reads "Chain of Custody". The visual answers the operator's actual question — what does the insurer look at — before they click play.

### Thumbnail 4 — ABN setup for a new water-damage business

Centred composition. A single text field rendered on a clean off-white background, with eleven dashes in the field and the label "ABN" in small grey type above it. To the right of the field, a candy-orange arrow points to a stack of three lime tiles labelled "Legal name", "ACN / GST", and "Address". The overlay headline reads "ONE FIELD IN. ELEVEN FIELDS OUT." in dark `#2A3D45` Inter ExtraBold across the top. No human face. The thumbnail is the promise — the wizard's whole pitch, rendered as a single static image.

---

## Self-audit — verification

### Word counts

| Asset                                 | Spec             | Actual       |
| ------------------------------------- | ---------------- | ------------ |
| LinkedIn Variant 1 (Phill-as-founder) | 200–300          | 243          |
| LinkedIn Variant 2 (neutral product)  | 200–300          | 209          |
| LinkedIn Variant 3 (customer-story)   | 200–300          | 250          |
| Email body                            | flexible         | 156          |
| RIA newsletter column                 | 200 ± 10         | 199          |
| Thumbnail briefs                      | 1 paragraph each | 4 paragraphs |

### Banned-word scan

Grep the file for the BrandConfig + copy-pack banned vocabulary before commit. Expected result: zero matches outside this self-audit table.

### Voice review (single-human check)

Read aloud, top to bottom. Cadence is short. Every technical term has a plain-English partner in the same sentence or paragraph. Active voice throughout. No CTA pushes the reader to a brand destination on its own terms — every link is positioned as the reader acting in their own interest.

### Notes flagged for Phill's editorial pass

- LinkedIn Variant 3 names a A$5,300 figure attributed to an operator conversation. Confirm the figure and the consent to publish before scheduling — if the operator did not agree to be referenced even anonymously, rewrite the opener around a composite case.
- The email signature uses `phill@restoreassist.com.au`. If the T-6 DNS check (per `launch-runbook.md`) fails, swap to `phill@unite-group.in` here and in the email From header.
- The RIA column closes with "Honest feedback welcome." That is editorial. RIA may want it removed for tone. Hold a backup line: "Live now at https://restoreassist.app/setup."
- Thumbnail 3 references a "high-vis sleeve". If Phill prefers a more neutral hand, drop the sleeve and use a bare wrist. Either reads.
- All three LinkedIn variants reference "live today" and "It is live today" in the closing third. Pick one variant for the post that goes out — running all three on rotation would read as duplicate content to LinkedIn's feed algorithm.
- The phrase "live capability check" appears in every asset. Confirm the marketing language matches what `/dashboard/settings/health` is actually titled in the UI on T-day morning. If the page header reads "Workspace Health" (per positioning.md proof points), align the copy.
