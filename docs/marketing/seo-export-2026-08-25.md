---
type: concept
name: seo-export-2026-08-25
description: Semrush export taken before subscription cancellation — backlink audit, competitor link targets, AU keyword gap
okf_version: "0.1"
updated: 2026-08-25
---

# RestoreAssist — SEO Export Pack

**Pulled from Semrush 2026-08-25, before cancellation. These figures do not come back once the subscription ends.**

This document exists because the data is perishable. Keyword positions go stale in weeks; the target list of association and directory domains does not.

---

## Headline: the backlink profile is spam, not thin

Not "few links" — worse, and more actionable.

### Baseline — restoreassist.app, 2026-08-25

| Metric | Value |
| --- | --- |
| Authority Score | **2** / 100 |
| Total backlinks | 49 |
| Referring domains | 30 |
| Referring URLs | 44 |
| Follow / nofollow | 20 / 29 |
| Text links | 47 |
| GSC impressions (89 days) | **5** |
| GSC clicks | **0** |

### The 30 referring domains

**Legitimate — 3, all our own properties:**

- `disasterrecovery.com.au` (AS 9)
- `carsi.com.au` (AS 8)
- `synthex.social` (AS 2)

**Everything else is junk:**

- **12+ domains registered in Moldova (.md)** — `bye.fyi`, `quero.party`, `atomizelink.icu`, `buzzshrink.website`, `byteshort.xyz`, `anchorurl.cloud`, `urls-shortener.eu`, `blogsphere.top`, `creativeposts.top`, `metamagic.top`, `optimizeflow.top`, `analyticshaven.top`, `dailymusings.top`, `drjack.world`, `screenshots.wiki`
- **`fiverr-affordable-seo-services.site`** — the smoking gun. Somebody bought cheap SEO links.
- **`directorylinkservice.com`**, `backlinks-checker.com`, `domaindexer.com` — link-farm infrastructure
- **`hotonlinegaming.com`**, `sapphirevpn.net`, `trendyhealthtimes.com`, `portailorange.net`, `thunder-data.cn` — unrelated PBN filler
- **`example3.com`** (AS 17) — placeholder domain

**There are zero legitimate third-party backlinks.** Every external link is either our own site or a link farm.

### Why this matters more than the low count

A thin profile is neutral — you just start building. A profile that is majority link-shortener and paid-SEO-farm domains is a quality signal working against us, and it explains AS 2 better than newness does.

**Action:** find out who bought these. If it was a Fiverr / cheap-SEO engagement, stop it — more of the same makes it worse. Then consider a Google Disavow file. Not casually: it is reversible but slow. Get a second opinion before submitting.

---

## Target list — how Encircle actually got authority

Pulled from `encircleapp.com` referring domains, sorted by authority. Their profile is North American, but the **shape** is the transferable part. None of these is a favour or a payment — they are all listings or submissions.

### Category 1 — Industry associations (highest relevance)

| Domain | AS | Note |
| --- | --- | --- |
| **restorationindustry.org** | **39** | The RIA itself. It links to Encircle. |
| issa.com | 39 | Worldwide cleaning industry association |
| uphelp.org | 39 | United Policyholders |

**AU equivalents Encircle cannot have:** RIA Australasia · IICRC ANZ · state restoration & carpet-cleaning associations · Master Builders · AIB.

### Category 2 — Integration directories

| Domain | AS | Their links |
| --- | --- | --- |
| **zapier.com** | **75** | **159** |
| viasocket.com | 33 | 65 |
| salesflare.com | 39 | 1 |
| statuspage.io | 47 | 1 |

We already integrate Xero and Ascora. A Zapier listing is an AS 75 link **plus** real distribution.

### Category 3 — Software comparison / catalogue sites

| Domain | AS |
| --- | --- |
| uptodown.com | 91 |
| webcatalog.io | 59 |
| alternativeto.net | 53 |
| comparably.com | 52 |
| isdown.app | 43 |
| sitelike.org | 42 |
| fitgap.com | 34 |

Free submissions. Position explicitly as **"the Australian alternative to Encircle / Xactimate."**

### Category 4 — Industry press

insurancenewsnet.com (44) · betakit.com (41) · mobilesyrup.com (41) · techlicious.com (39) · globalfintechseries.com (31)

**AU equivalents:** Insurance News AU · Insurance Business AU · Industry Update · SmartCompany · StartupDaily.

### Category 5 — The second-domain play

`getencircle.com` sends `encircleapp.com` **404 backlinks** — their own secondary domain feeding the main one.

`restoreassist.com.au` is sitting **unverified in Search Console**. Same play, costs nothing: verify it, put a real page on it, 301 it to `.app`. See **Repo-side findings** below — this one has already leaked into shipped assets.

---

## Competitor keywords — Australia database

Encircle's AU organic footprint, sorted by volume:

| Keyword | Position | Volume | KD |
| --- | --- | --- | --- |
| encircle | 5 | 880 | 34 |
| encircle | 18 | 880 | 34 |
| profile handle in stripe meaning | 32 | 880 | 30 |
| circle login | 15 | 260 | 40 |
| insimplify login | 24 | 140 | 17 |
| how to set up stripe authenticator app | 12 | 50 | 31 |

### The most useful finding in this document

**Encircle ranks for almost nothing in Australia.** Six keywords. Their top terms are their own brand name and *accidental* rankings on Stripe help-desk articles. Nobody in Australia is finding them through search.

Two consequences:

1. **The AU category keywords are unclaimed.** "restoration software australia", "IICRC S500 report software", "water damage report template australia" — nobody owns them. On-page work already targets these. That is a genuine opening.
2. **Competitors don't win on SEO — they win on presence.** Trade shows, associations, integrations, word of mouth. Which is the game we are in this week, and why the email to the 32 paying customers matters more than any keyword.

---

## Repo-side findings

Checked while filing this, because the second-domain play touches shipped code:

- **Eight files under `tools/remotion/` display `restoreassist.com.au` as the call-to-action URL** — `lib/brand.ts` (`RA_URL`), `components/shared.tsx`, `compositions/hero-product-overview.tsx`, `linkedin-short-1.tsx`, `linkedin-short-2.tsx`, `roi-explainer.tsx`, `setup-wizard-full.tsx`, and `VIDEO_AUDIT.md`. The product runs on `restoreassist.app` (smoke tests, BotID host checks, and the AI endpoint all use `.app`). Every rendered video therefore points viewers at the domain Search Console reports as unverified.
- **`tools/remotion/VIDEO_AUDIT.md:212` resolved this backwards** — it records "Actual site: `restoreassist.com.au` per user discussions. Verify and fix." That contradicts the live deployment.

This does not need new work if `.com.au` gets verified and 301'd to `.app` as recommended above — the videos then resolve correctly. It does need a decision on which domain is canonical for marketing assets. **Not changed here:** picking the canonical marketing domain is a business call, not a cleanup.

---

## What to do, in order

**This week (RIA window — closes Friday):**

1. RIA / restorationindustry.org vendor listing
2. RIA Australasia + IICRC ANZ listings
3. Zapier integration directory
4. AlternativeTo, FitGap, SiteLike, WebCatalog — 20 minutes each
5. Verify `restoreassist.com.au`, point it at `.app`

**Next week:**

6. Trace and stop whoever bought the Fiverr links
7. Assess a disavow file (second opinion first)
8. AU industry press outreach

**Do not bother with:** content volume, comparison-page generation, or anything keyword-led until the link profile is clean and the association listings are live.

---

## Before cancelling Semrush

Still worth exporting while access remains:

- Position tracking baseline for `restoreassist.app` — needs a project set up. Do it before cancelling or the ability to measure change is lost.
- Full referring-domain lists for 2–3 more competitors (Xactimate/Verisk, DASH/Next Gear, RestorationX)
- Site Audit run on `restoreassist.app` — technical issues, one-off, keeps its value after cancellation
