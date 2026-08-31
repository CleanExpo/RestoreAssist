# Finding: the IICRC standards provenance record

**Verified:** 2026-08-31.
**Method:** the publishers' own pages (iicrc.org, the Gilmore Global webstore, the
Standards Australia catalogue, ncc.abcb.gov.au), read via a server-side fetch; a
full sweep of the Google Drive reachable from this account; and direct reading of
the repository. Every external claim below carries its source. Nothing here was
taken from model recall.
**Severity:** High. Four places in this repository assert facts about which
standards govern a job, and they disagree with each other and — until the changes
recorded below — with the publishers.
**Status:** the registry is now correct and gated. The holdings and the retrieval
path are not, and are recorded here rather than fixed.

## Why this document exists

`standardCite()` has been checked against itself and against the owner's reading of
the owner's own documents. It had never been checked against the organisations that
publish the standards. This record is that check, plus a written answer to "which
editions do we actually hold, and how would anyone know" — so the next session
re-reads rather than re-derives.

Facts and citations only: designations, editions, years, section numbers, short
titles, Drive file identifiers. No standard's prose appears here, and none may.

## 1. The registry against the publisher

`STANDARDS_VERSIONS` (`lib/nir-standards-mapping.ts`) versus the IICRC's own
standard pages, read 2026-08-31. **All five match.** This is the first
independent confirmation the registry has had.

| Key | Registry | IICRC page | Source |
|---|---|---|---|
| S500 | 5th, 2021 | "Fifth Edition, 2021" | iicrc.org/s500/ |
| S520 | 4th, 2024 | "Fourth Edition, 2024" | iicrc.org/s520/ |
| S540 | 2nd, 2023 | "Second Edition, 2023" | iicrc.org/s540/ |
| S700 | 1st, 2025 | "First Edition, 2025" | iicrc.org/s700/ |
| S100 | 7th, 2021 | "Seventh Edition, 2021" | iicrc.org/s100/ |

Also recorded from those pages: consensus bodies have **begun revising** S500,
S540, S700 and S100. No revised edition is published, so nothing changes in the
registry — but the former `nextRevisionExpected` predictions of 2028 (S540) and
2030 (S700) were already contradicted, which is part of why that field was
removed.

Standards published by the IICRC that this product does not cite and does not
carry: S220 (2021), S300 (2nd, 2025), S400 (1st, 2025), S410 (2025), S800 (2023),
S900 (1st, 2025). In development, and therefore citable by nobody: **BSR**/IICRC
S230, S250, S320, S530, S590. The repository correctly avoids the draft S760.

## 2. Australia has its own adopted standards

The most consequential finding, and the reason the registry was incomplete rather
than merely unverified.

| Australian Standard | Adopts | Published |
|---|---|---|
| AS-IICRC S500:2025 | ANSI/IICRC S500:2021 **MOD** | 28 March 2025 |
| AS-IICRC S520:2025 | ANSI/IICRC S520:2024 (Ed 4.0) **MOD** | 28 November 2025 |

Prepared by Standards Australia committee **ME-094 (Mould and Water
Restoration)**, on which the IICRC, the Insurance Council of Australia, RIA
Australasia, the HIA, Master Builders Australia and IAQAA are represented. Source:
the Standards Australia catalogue and the IICRC's own announcement,
`iicrc.org/wp-content/uploads/2025/04/AS-IICRC-S500-Published-Press-Release_March-2025.pdf`.

Both are **modified** adoptions. The Australian changes are collected in
**Appendix ZZ**, so for an Australian job an ANSI-only citation does not merely
lose precision — it omits requirements.

**Australia only.** These carry the `AS-` prefix, not `AS/NZS-`: Standards
Australia publishes joint trans-Tasman standards under `AS/NZS`, and these do not.
The adoption boilerplate in the preface mentions "Australia/New Zealand", but that
is template text rather than a joint designation, and independent New Zealand
research reached the same conclusion (`docs/marketing/pillar-c/icp-nz.md:144`).
New Zealand cites the ANSI publication.

Now codified in `AS_IICRC_ADOPTIONS` with `applicableStandard(std, jurisdiction)`.

### A fabricated designation was in published material

`scripts/check-standards-citations.ts` gained a check for AS designations and, on
its first run, found **29 instances of "AS-IICRC S500:2021"** across nine files. <!-- standards-cite-ignore: quoting the fabrication, not committing it -->
No such document has ever existed: the Australian adoption is S500:**2025**, and
what it adopts is ANSI/IICRC S500:2021. The two had been merged into one
designation. It was the title of a published YouTube video, its curriculum row,
its index entry, two lines of a FINAL campaign asset, and archived analysis. All
corrected; the gate now fails on any AS designation for a standard Standards
Australia has not adopted.

## 3. What is actually held, and how sightable it is

A sweep of the Google Drive reachable from this account, 2026-08-31.

| Standard | Current edition | Held | Sightable |
|---|---|---|---|
| S500 | 5th, 2021 | a third-party retyping of the definitions clause only | no edition statement, no ANSI designation, no copyright line — cannot establish an edition |
| S520 | 4th, 2024 | **nothing** | — |
| S540 | 2nd, 2023 | **1st edition, 2017** — superseded | edition read from the document's own front matter |
| S700 | 1st, 2025 | **nothing** | — |
| S100 and all others | 2021–2025 | **nothing** | — |

**Of the four standards this product actively cites, no current edition is held in
the Drive.** The one complete IICRC standard present is an edition the publisher
superseded three years ago, and it has additionally been split into 19 PDFs and
partly re-keyed into editable Word files with course annotations mixed into the
standard's text.

No licence, purchase record or receipt for any of it exists in the Drive.

The benign reading is that the licensed copies live in the Gilmore Global /
VitalSource subscription, which is a DRM reader and not a folder. That is
consistent with everything observed — and it means the repository's
"verified from the owner's licensed documents" claims **cannot be checked by a
second party**. They are owner attestations. Recording them as such is the point
of this section.

### The Drive path is broken at the identity layer

`lib/google-drive.ts` `getStandardsFolderId()` defaults to folder
`1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1`. That folder is real — titled "IICRC
Standards", modified 2026-02-03 — but it is **not shared with this account**: its
metadata resolves by identifier while listing its children returns nothing, and it
does not appear under `sharedWithMe`. `docs/runbooks/ra-6934-iicrc-rag-populate.md`
calls it "verified genuine" without recording which account verified it.

## 4. Four sources that assert standards facts, and where they disagree

1. **`STANDARDS_VERSIONS`** — five IICRC standards, now confirmed against the
   publisher, plus `AS_IICRC_ADOPTIONS`.
2. **`docs/runbooks/ra-6934-iicrc-rag-populate.md`** — an editions table that adds
   **S900, S410, S400 and S300 at edition 2025**, none of which the registry
   carries and none of which exists in the Drive. The runbook instructs an operator
   to ingest and tag four standards at an edition nobody in this repository has
   verified.
3. **`scripts/data/standards-corpus.json`** — 25 rows, of which the citation gate
   checks **8**. The rest name standards absent from the registry and are skipped,
   which is how three rows of **AS/NZS 4360:2004 — a withdrawn standard** sit in
   the embedded corpus unexamined.
4. **The database** — `IicrcChunk.standard` and `.edition` are free-text `String`
   with no constraint, and the table has **zero rows on production**. It asserts
   nothing today.

## 5. NCC is not a constant

Recorded here because it shares the defect class: a single global value where the
jurisdiction has its own answer. Per ncc.abcb.gov.au, read 2026-08-31 —
NCC 2025 published 1 May 2026; NCC 2022 superseded by Amendment 1 (1 May 2025)
then Amendment 2 (29 July 2025); adoption split with ACT, Victoria and Western
Australia on NCC 2025 from 1 May 2026, New South Wales and Queensland from
1 May 2027, South Australia split between its plumbing and building codes, and the
**Northern Territory not adopting it at all**.

**Adoption is not monotonic, and getting that wrong cost a correction.** The first
version of this record and of `lib/anz/ncc-adoption.ts` had Tasmania on NCC 2025
from 1 May 2026. It is not. The **Building Amendment Act 2026 (Tas) No. 6 of 2026**
received Royal Assent and commenced on **5 June 2026**, substituting the
Building Act 2016 s 4(1) definition to fix the applicable edition at NCC 2022 as
amended by Amendment 2 until **30 April 2027**. Tasmania was on NCC 2025 for five
weeks (1 May to 4 June 2026) and then reverted. Confirmed against the Australian
Institute of Architects, HIA and the Act itself. A model that assumes jurisdictions
only move forward is wrong about Tasmania for eleven months, so the table stores a
list of steps per state, and a later step may name an older edition.

Caught by CodeRabbit on this PR, not by me — worth recording, because the table and
the test I wrote to guard it encoded the same error. A test is only ever as correct
as the table it locks.

Now in `lib/anz/ncc-adoption.ts` with its source and verification date.

## 6. Three standards paths, and only one runs

| Path | State |
|---|---|
| `lib/standards-retrieval.ts` → Drive → model → report prompt | live, on five report and claim routes |
| `IicrcChunk` RAG via `retrieveForCitation` | wired into the inspection-report route, **zero rows** |
| `StandardsChunk`, in-house authored summaries | built, **zero rows**, unused |

The live path is degraded in production: the Drive folder is unreadable from the
app's identity and the service-account credentials are unset, so
`degradedStandards()` is the normal state. `lib/standards-retrieval.ts` documents
what follows — the report free-generates IICRC content from general knowledge.
Constrained as of this change set: with no standards text in the prompt, the report
may cite by designation and edition only, never by section or clause.

## 7. What this record does NOT establish

- **That the section numbers in `S500_SECTIONS` and `S520_SECTIONS` are correct.**
  No licensed standard was opened in producing this document, and the Drive does
  not hold the editions those files claim. `s520-sections.ts` in particular rested
  on a circular claim, now corrected in place to say it is owner-attested.
- **That the repository's holdings are lawful to hold or excerpt.** No licence or
  purchase record was located. That is a separate question, addressed in
  `docs/compliance/IICRC-STANDARDS-LICENSING.md`.
- **Anything about editions published after 2026-08-31.** Every row above is dated
  so it can be re-checked rather than re-trusted.

## Corrections made to this record after first writing

- **Tasmania**, above. The table and its test both had it wrong.
- **RA-1120's premise is stale.** `lib/compliance/nzbs-compliance-gate.ts` carried
  `// TODO RA-1120 … no country field exists`, and I repeated that claim in two
  more comments. `Inspection.propertyCountry String @default("AU")` has existed
  since RA-6996 (`prisma/schema.prisma`, "schema-drift reconciliation, verified
  against prod 2026-07-05"). **No migration is needed** to make report output
  jurisdiction-aware; the report footer is now wired to it. The NZBC gate remains
  a deliberate no-op because un-no-opping it starts blocking New Zealand
  submissions that currently pass, which needs its own change set.
- **A bulk find-and-replace caused collateral damage.** Correcting 29 instances of
  the fabricated "AS-IICRC S500:2021" <!-- standards-cite-ignore: naming it again -->
  by substitution also rewrote sentences whose
  meaning depended on the old string: an archived audit finding that correctly
  called the designation fabricated was inverted into calling a real standard
  fabricated, a competitor's product description was made to assert conformance it
  does not claim, and an ANZ-wide specification was made to name an Australia-only
  standard. All repaired. The lesson is narrow and worth keeping: a designation is
  not a token, and substituting one changes the claim around it.

## Open items

1. The RA-6934 runbook's S900/S410/S400/S300 editions are unverified and unheld.
2. `AS/NZS 4360:2004` is withdrawn and sits in the embedded corpus, ungated.
3. The Drive standards folder is unreadable from the application's identity.
4. No current edition of S500, S520, S540 or S700 is held.
5. The section indexes remain owner-attested and unverifiable by a second party.
