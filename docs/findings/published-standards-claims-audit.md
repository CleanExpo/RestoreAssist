# Finding: published standards claims, and what the evidence supports

**Audited:** 2026-08-31. **Scope:** every outward-facing standards claim in this
repository, plus `carsi.com.au`. **Status:** drafted replacements below. **Nothing
has been published or edited.** Filed store listings and live campaign assets are
outward-facing; the decision to change them is the owner's.

**I am not a lawyer.** The statutory references are provided so the question can be
put properly, not because this settles it. See
`docs/compliance/IICRC-STANDARDS-LICENSING.md`.

## The distinction the whole audit turns on

Two claims that look similar and are not:

- **"Aligned with IICRC S500:2021"** — a statement about how the product is built.
  Defensible: `S500_FIELD_MAP` implements the S500 field structure, and
  `lib/standards/s500-sections.ts` carries the section index. It describes the
  product accurately.
- **"IICRC-compliant"** — a statement that the service *conforms to a standard*.
  That is a conformity claim, and conformity is something somebody assesses. No
  assessment exists. The IICRC does not certify software, and its own CEC directory
  page carries a disclaimer that it *"does not promote any particular educational
  provider, product or offering"*.

The relevant law is not copyright:

- **Australia** — Competition and Consumer Act 2010 Sch 2 (ACL) **s 18** (misleading
  or deceptive conduct) and **s 29(1)(a)** (false or misleading representation that
  services are of a particular *standard*, quality or grade).
- **New Zealand** — Fair Trading Act 1986 **s 9** and **s 13(a)**.

And Standards Australia states in its own terms (GTC cl 7.4(b)) that compliance
with a Standard is voluntary unless a law or contract incorporates it — so
"compliant" does not even have a fixed external meaning to point at.

## What makes this sharper than a wording preference

Three facts from `docs/findings/iicrc-standards-provenance.md`, established the
same day:

1. The standards retrieval path is **degraded in production** — the Drive folder is
   unreadable from the application's identity, so IICRC content in generated
   reports has been coming from model general knowledge.
2. **No current edition of S500, S520, S540 or S700 is held** in the reachable
   Drive.
3. The S520 section index rested on a **circular provenance claim**.

A conformity claim is only as good as the evidence behind it. Right now the claim
is ahead of the evidence, and that gap is the exposure — not the word itself.

## Where the claims are

| File | Line | Claim |
|---|---|---|
| `docs/distribution/app-store/store-listings.md` | 11 | "IICRC-compliant water damage restoration platform for Australian professionals" — **the store subtitle** |
| `docs/distribution/app-store/store-listings.md` | 17 | "**IICRC-Compliant Workflow**" — section heading |
| `docs/distribution/app-store/store-listings.md` | 18 | "aligned with IICRC S500:2021, S520:2024, and S700:2025 standards" |
| `docs/distribution/app-store/app-store-submission-package.md` | 89 | "the full IICRC-compliant inspection workflow" — in reviewer notes to Apple |
| `docs/distribution/app-store/app-store-submission-package.md` | 101 | "IICRC S500/S520/S700 compliant inspection workflows" — promotional text |
| `docs/distribution/app-store/app-store-submission-package.md` | 103 | `IICRC` as a store **keyword** |
| `docs/distribution/app-store/app-store-submission-package.md` | 117 | "IICRC-COMPLIANT WORKFLOW" |
| `docs/distribution/app-store/app-store-submission-package.md` | 163 | "IICRC S500, S520, and S700 compliant inspection workflow" |
| `docs/distribution/app-store/whatsnew/whatsnew-en-AU`, `whatsnew-en-US` | 3 | same compliant-workflow line, both locales |
| `docs/distribution/app-store/icon-source/build-icons.mjs` | 135 | **"IICRC compliance" rendered into the app icon artwork** |
| `docs/distribution/app-store/play-store-submission-package.md` | 49, 153, 171, 172, 187–190 | the same claim set again — **missed in the first pass of this audit** |
| `docs/marketing/RA-5036-organic-launch-campaign-FINAL.md` | 118, 163–165 | bare "NCC 2022" product claims |

The icon is the one most easily missed: the claim is baked into a generated image,
so it survives any copy edit that only touches markdown.

## A second, separate problem in the same copy

The listing targets **"Australian restoration professionals"** and cites the ANSI
editions. For an Australian job the governing documents are **AS-IICRC S500:2025**
and **AS-IICRC S520:2025** — modified adoptions carrying additional requirements in
Appendix ZZ. So the copy is imprecise about *which* standard, in the one market it
names. Fixing the conformity wording without fixing this would leave the listing
half-corrected.

## Drafted replacements — not applied

Written to be **stronger**, not hedged. Naming the Australian adoption and the
specific field structure says more than "compliant" does, and all of it is
demonstrable.

| Where | From | To |
|---|---|---|
| Subtitle | "IICRC-compliant water damage restoration platform for Australian professionals" | "Water damage restoration platform built to the Australian standard, AS-IICRC S500:2025" |
| Heading | "IICRC-Compliant Workflow" | "Standards-Aligned Workflow" |
| Body | "aligned with IICRC S500:2021, S520:2024, and S700:2025 standards" | "structured to AS-IICRC S500:2025 and AS-IICRC S520:2025, Australia's adoptions of ANSI/IICRC S500:2021 and S520:2024, and to ANSI/IICRC S700:2025" |
| Promotional text | "IICRC S500/S520/S700 compliant inspection workflows" | "Inspection workflows structured to the Australian and international restoration standards" |
| What's new | "IICRC S500, S520, and S700 compliant inspection workflow" | "Inspection workflow structured to AS-IICRC S500:2025, AS-IICRC S520:2025 and ANSI/IICRC S700:2025" |
| Reviewer notes | "the full IICRC-compliant inspection workflow" | "the full standards-aligned inspection workflow" |
| App icon | "IICRC compliance" | "Restoration standards" — or drop the line; it is the hardest to change later |
| Campaign copy | bare "NCC 2022" | name the jurisdiction and date, or use jurisdiction-neutral wording — adoption is split and NCC 2022 is superseded nationally |

**Keywords:** `IICRC` as a store keyword is a different question again — trade mark
use, not a conformity claim. Keeping it is arguable (it describes what the product
is for); it should be a deliberate decision rather than an inherited one.

## carsi.com.au

Audited the public homepage the same day. Standards claims there are CEC-approval
claims rather than product-conformity claims, and CARSI already runs a serious
programme on exactly that wording — GP-451 established the "IICRC CEC courses,
never IICRC courses" rule, and GP-523/GP-526 track discipline-acronym branding,
which is still live on the homepage's seven-discipline map. Nothing to add there.

Two CARSI items raised separately, not duplicating that programme: **GP-536** (the
IICRC AI Use Policy is untracked) and **GP-537** (the homepage CEC target reads
20 hours where the IICRC requires 14).

## restoreassist.app

**Not audited.** `docs/distribution/app-store/app-store-submission-package.md:89`
names it as the wrapped origin, but I have not been given it as a site to check and
have not fetched it. Saying so rather than implying coverage: the live site may
carry claims this audit does not cover.

## Applied 2026-08-31, on instruction — and what could not be

The copy replacements below were applied across `store-listings.md`, both
submission packages, and both what's-new locales. 32 replacements; no
"IICRC-compliant" claim remains anywhere in `docs/distribution/`.

**Two things the drafting got wrong, found while applying:**

1. **The Play submission package was missing from the table above.** It carries the
   same claim set. Now listed, and corrected with the rest.
2. **Two replacements exceeded the stores' character limits.** The drafted short
   description was 86 characters against Play's 80, and the drafted promotional
   text 208 against Apple's 170. Both would have been rejected at submission. The
   audit was written as prose and never measured; it should have been. Shipped
   values are 74/80 and 158/170, and the keyword field is unchanged at 96/100.

**The icon is now corrected in both the generator and the artwork — and the
reasoning that first held it back was wrong.**

On 31/08 I corrected `build-icons.mjs:135` to read "Restoration standards ·
Australia + NZ", generated the banner, saw that it did not match the committed
`out/android-feature-graphic.png`, and reverted — recording that regenerating
"would replace the brand artwork wholesale under cover of a text correction."

**That conclusion was drawn from one file and was wrong.** Checking the sibling
outputs settles it:

| Committed asset | Artwork |
|---|---|
| `out/ios-1024.png`, `out/ios-marketing-1024.png` | navy `#1C2E47`, line-art house and magnifier |
| `out/android-512.png` (the Play icon) | navy, line-art |
| `out/adaptive-fg-432.png` | navy line-art foreground |
| `out/android-feature-graphic.png` (before) | **black, photographic metallic badge** |

Every app icon is the navy line-art mark. The feature graphic was the single
outlier — and `icon.svg`, the source of the older look, calls itself *"placeholder
until designer artwork is supplied"* in its own header, while `icon-mark.svg`
describes the navy mark as the brand. Regenerating did not change the brand; it
brought the one stale asset into line with the brand everything else already used.

Confirmed by re-running the generator: of the six tracked outputs, **only the
feature graphic changed**. The other five regenerated byte-identical, which is the
evidence that the generator was already the source of truth for them.

**Why it had never been regenerated here.** `build-icons.mjs` wrote into
`distribution/ios/...` and `distribution/android/...` — native Capacitor projects
not checked into this repository — and a missing directory aborted the whole run.
Because the iOS writes come first and the Play feature graphic last, the banner was
never reached. Those targets now skip loudly and are counted in a `PARTIAL RUN`
summary, so a partial run cannot be mistaken for a complete one.

The lesson worth keeping, since it is the second time in this audit: **checking one
artefact and generalising is how both mistakes happened** — here, and with the
character limits. Look at the siblings.

## Recommendation

1. ~~**Resolve the icon divergence**~~ — **done 31/08/2026.** Generator and artwork
   now agree, and the banner reads "Restoration standards · Australia + NZ".
2. **Update the live listings.** The repository now holds corrected text; App Store
   Connect and Google Play still hold the filed originals. Editing these files does
   not change what is published.
3. ~~The **campaign copy** (`RA-5036`)~~ — **corrected 2026-08-31**, 11 replacements.
   Bare "NCC 2022" removed from six sites (superseded nationally, adoption split by
   state, and no NCC exists in New Zealand). "GST at 10%" removed from a post
   hashtagged `#NewZealandBusiness`. The Day 1 claim that read *"Built for
   Australian and New Zealand conditions: GST at 10%, 11-digit ABN validation …
   Sign-up starts with your ABN"* — every specific AU-only, under an explicit
   AU-and-NZ banner — now names both: 10% and 15%, ABN or NZBN. The NZ post asserted
   New Zealand support without naming any of it; it now names GST at 15%, NZBN
   validation and NZD, all verified against `lib/gst-rules.ts` and
   `lib/validation/nzbn-validator.ts` before the claim was written.

   Note what that correction did: the copy was **understating** the product. NZ
   support is real and was going unclaimed while an AU-only specific stood in its
   place.
4. Consider whether the underlying evidence should be strengthened rather than the
   claim weakened. If the standards retrieval path were grounded and current
   editions held, "aligned with AS-IICRC S500:2025" would be provable rather than
   merely accurate.
