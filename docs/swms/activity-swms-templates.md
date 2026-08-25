---
type: concept
name: activity-swms-templates
description: Seven activity-based SWMS transcribed from the Disaster Recovery QLD source documents, with the deviations from those documents recorded
okf_version: "0.1"
updated: 2026-08-25
---

# Activity-based SWMS templates

RestoreAssist already generated a SWMS draft from an inspection's recorded
hazards (`lib/swms/auto-generator.ts`, RA-1131). That answers *what is dangerous
about this job*. It does not answer the question a principal contractor actually
asks at the gate: *show me your SWMS for the task you are about to perform*.

This is the second half. `lib/swms/activity-templates.ts` carries seven
activity SWMS in the seven-column layout Australian principal contractors
expect, and `lib/swms/build-activity-swms.ts` composes one into a job-specific
document. The two generators are complementary, not competing: the hazard-based
draft is per-inspection and derived; these are per-task and issued.

## What is here

| Activity | Source revision | Steps |
| --- | --- | --- |
| Carpet Removal | `swmcr092022sk` | 11 |
| Floor Removal | `swmfr092022sk` | 11 |
| Demolition - Non-Structural | `swmdns092022sk` | 13 |
| Fire and Smoke Cleaning | `swmfasc092022sk` | 12 |
| Decontamination Work | `swmdw092022sk` | 12 |
| Water and Flood - Portable Extraction | `swmwafeowupmascc092022sk` | 14 |
| Water and Flood - Truck-Mounted Extraction | `swmeowutmuascc092022sk` | 15 |

Source: the Disaster Recovery QLD C4.1 SWMS documents supplied by the founder,
revision codes `swm*092022sk`, reviewed 30/07/2024.

## What is deliberately missing

**Working at Heights.** The supplied `Jye SWMS Working at heights signed.pdf` is
an image-only scan. `pdfjs-dist` extracted **zero characters from all twelve
pages** — the file has no text layer at all, so there was nothing to transcribe.

It needs OCR, or the source Word document, before it can be added. A
heights SWMS written from general knowledge rather than from the company's own
assessed controls would be a document a worker relies on at height, which is the
worst place to be wrong. `SWMS_ACTIVITY_IDS` is asserted at length seven so that
adding an eighth is a conscious act.

## Two deliberate deviations from the source documents

Everything else is the source documents' own control text, normalised to
Australian spelling and sentence case. These two are changes of substance and
are recorded here so whoever reconciles the code against the paper originals
finds the difference explained rather than assumed to be a transcription error.

### 1. Jurisdictional law is resolved, not transcribed

The source documents print a fixed reference table of Acts and regulators.
`lib/swms/jurisdiction-reference.ts` does not copy it. The eight Australian
rows read their Act and regulator from `getStateInfo` in
`lib/state-detection.ts`, the single place this application records
jurisdictional law.

This is directly downstream of **UNI-2619**, where the report generator built a
WHS citation by string manipulation, dropped every jurisdiction's year, and
rendered Victoria under a Work Health and Safety Act it has never had. A SWMS
issued alongside a report must not be able to disagree with it about the law.

Two consequences worth knowing:

- **The source documents are wrong about Western Australia.** They cite a "Work
  Health and Safety Act 2022 (WA)". WA's Act is the **Work Health and Safety Act
  2020 (WA)**; 2022 is the year its general regulations were made and the Act
  commenced. The repository's value is used, and a test pins it.
- **Commonwealth and New Zealand are literals**, because `getStateInfo` has no
  entry for either. The NZ gap is real and pre-existing: `getStateInfo("NZ")`
  returns `null`, which is why this module carries New Zealand explicitly rather
  than pretending state detection covers it.

### 2. The test-and-tag standard citation is corrected

All source documents cite **"AS3750 and AS3017"** for testing and tagging
portable electrical equipment. Neither governs it: AS 3750 is the
paints-for-steel-structures series, and AS/NZS 3017 is verification guidelines
for electrical installations.

The instruments that do are **AS/NZS 3760** (in-service safety inspection and
testing of electrical equipment) and **AS/NZS 3012** (electrical installations:
construction and demolition sites). `common-rows.ts` cites those, and a test
asserts the original pair cannot reappear.

The paper SWMS still carry the wrong citation. Correcting them is a founder
decision, not a code change.

## Risk scores

The source documents record a risk band of 1 to 5 before and after controls, but
not the matrix legend that produced those numbers. The scores are therefore
**transcribed, not re-derived** — treat them as the original assessor's recorded
judgement. Tests assert only what holds regardless of the legend: scores stay
inside 1-5, and a residual risk never exceeds the risk it was applied to.

## Shape of the code

```text
lib/swms/activity-swms-types.ts    types: risk row, control group, template
lib/swms/common-rows.ts            rows shared across all seven documents
lib/swms/activity-templates.ts     the seven templates + registry
lib/swms/jurisdiction-reference.ts the reference table, read from state-detection
lib/swms/build-activity-swms.ts    template + job details -> a SWMS document

app/api/swms/activities/           GET catalogue
app/api/swms/activities/[id]/      GET template, POST compose for a job
```

`buildActivitySwms` throws rather than returning a partial document. An unknown
activity, an unrecognised jurisdiction, a missing PCBU or a malformed ABN are
all refusals — a SWMS that names no law is still a document a worker will sign.

Rows that genuinely differ between source documents (Planning, Assessment of
site, Isolate the work area, pack-down) are **not** flattened into the shared
set. The demolition assessment row requires low-voltage tools; the
decontamination isolation row requires an exclusion zone; the water extraction
pack-down row is machine-specific. Consolidating them would have silently
dropped controls each document added for a reason.

## Not done

- **No UI.** These are data and an API. Nothing renders them yet.
- **No PDF output.** The composed document is JSON.
- **Not persisted.** `SwmsDraft` in Prisma stores the hazard-based draft only;
  composing an activity SWMS writes nothing.
- **No NZ entry in `getStateInfo`.** Tracked separately; a data-model change.
- **The paper source documents are unchanged.** Both deviations above exist only
  in code.
