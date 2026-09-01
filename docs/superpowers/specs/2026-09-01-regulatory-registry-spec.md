# SPM Spec — Verified Regulatory Registry, and the Document Catalogue Built On It

> Produced 2026-09-01, after a live defect was found: RestoreAssist held three
> different answers to one asbestos question, and one of them was invented.
> Scope: the machinery that makes "these regulations are correct" an enforced
> property rather than a claim, plus the document catalogue that consumes it.

## 1. Task being planned

- **Original request:** "We need to find the ISO regulations, and laws specific
  to Asbestos, Silica Dust, VOCs, Electrical, Building Codes, etc and bring them
  directly into the finished product... These are legal regulations, laws, and
  standards. We need to have them built in. No exceptions." Plus: a catalogue of
  generated documents (Authority Forms, Review Forms) attached to the claim.
- **Interpreted task:** Build a **provenance-carrying regulatory registry** whose
  entries cannot enter the product without a named instrument, a source, a
  jurisdiction and a verification date — enforced by CI, the same way
  `check-standards-citations.ts` already enforces IICRC editions. Then generate
  claim documents from it, so a form can never cite a regulation the registry
  does not hold.
- **Target outcome:** Every regulatory statement RestoreAssist shows a
  technician, an insurer or a client is traceable to an instrument and a date,
  and a stale or unsourced one fails the build.
- **Non-build clarification:** This spec plans. It does not itself populate every
  domain; §17 sequences that.

## 2. Current project context

- **Repo:** CleanExpo/RestoreAssist · **Branch:** `claude/feature-enablement-check-f3yxs4` @ `32387ffb` · PR #2153 open.
- **What already works and should be copied, not reinvented:**
  - `lib/nir-standards-mapping.ts` — `STANDARDS_VERSIONS`, `AS_IICRC_ADOPTIONS`,
    `standardCite()`. Verified against the publishers 2026-09-01; all five
    editions and both Australian adoptions correct.
  - `scripts/check-standards-citations.ts` — CI gate that fails on a stale
    edition, a fabricated Australian adoption, or an invented S500 section. It
    has already caught 29 live instances of a fabricated adoption.
  - `lib/standards/copyright-guard.ts` — blocks verbatim standard text.
  - `lib/anz/ncc-edition.ts` — NCC as a function of state and date.
  - `lib/compliance/asbestos-era.ts` — **new, 2026-09-01**; the first entry built
    to this pattern.
- **Blast radius measured:** regulatory assertions appear across `lib/nir-*`,
  `lib/ai/claim-type-prompts.ts`, `lib/swms/`, `lib/compliance/`,
  `lib/evidence/`. The asbestos fix alone touched **9 files**.
- **Unknowns:** whether the owner can supply licensed AS/NZS copies for clause
  checking; whether this environment's egress policy can be widened (see §8).

## 3. Problem statement

- **User:** restoration businesses selling on compliance, their technicians, and
  the insurers and assessors who audit the resulting documents.
- **Pain, measured not assumed.** On 2026-09-01 the codebase held:

  | Claim | Where | Reality |
  | --- | --- | --- |
  | Asbestos presumed pre-**1990** | 9 files incl. the SWMS generator | Queensland's *register* exemption, applied nationally |
  | Asbestos presumed pre-**1987** in NSW | `nir-jurisdictional-matrix.ts` | **No such cutoff exists.** SafeWork NSW uses 31 Dec 2003 |
  | Asbestos presumed pre-**2004** AU / pre-2000 NZ | `safework-notification-gate.ts` | Correct |

- **Business impact:** a Safe Work Method Statement for a 1995 building carried
  **no asbestos hazard**, and a test pinned that behaviour. The NSW entry stated
  a false cutoff, cited the NSW WHS Regulation 2017 as its authority, and
  contrasted it with Queensland — confident, sourced, invented.
- **Why now:** this content is being sold as a differentiator. An assessor who
  finds one fabricated citation discounts every other one.

## 4. Desired outcome

- **User-facing:** regulatory guidance that names its instrument and date, and
  documents that carry the same provenance into the claim file.
- **Internal:** one registry; a CI gate; a re-verification cadence.
- **Success:** no regulatory assertion reaches a user without a registry entry;
  the gate fails on an unsourced, undated or stale entry, **and has been watched
  failing**.
- **What must not happen:** verbatim standard text redistributed; a regulation
  asserted without an instrument; a single national answer where jurisdictions
  differ; legal advice presented as such.

## 5. Scope

### In scope
- `lib/compliance/regulatory-registry/` — typed entries, one module per domain.
- Entry shape carrying: instrument, jurisdiction, commencement/effective date,
  source URL, `verifiedAt`, `verifiedBy`, and a plain-English requirement.
- `scripts/check-regulatory-registry.ts` — CI gate (rules in §11).
- Domains, in the order of §17: asbestos (**done**), crystalline silica (**done**),
  electrical on wet sites, VOCs and hazardous chemicals, building codes.
- The document catalogue (§9.3) as the registry's first consumer.

### Out of scope
- Reproducing AS/NZS or ISO text (§12).
- Legal advice. Every surface keeps the CARSI course's own notice:
  *educational, not legal advice, verify with your regulator*.
- An LMS inside RestoreAssist — `spec.md` §27 stands.
- Jurisdictions beyond AU and NZ.

## 6. Existing capability review

Reuse, do not rebuild:

| Need | Existing |
| --- | --- |
| Versioned facts + CI enforcement | `STANDARDS_VERSIONS` + `check-standards-citations.ts` |
| Jurisdiction-varying answer | `lib/anz/ncc-edition.ts` (state + date), `asbestos-era.ts` |
| Regulator directory | `REGULATOR_MAP` in `safework-notification-gate.ts` — all 8 AU regulators + WorkSafe NZ |
| Copyright boundary | `lib/standards/copyright-guard.ts` |
| Document generation | `lib/generate-sketch-pdf.ts`, `lib/export/scope-contract.ts` |
| PPE / hazard derivation | `lib/restoration/ppe-requirements.ts`, `plan-inputs.ts` |

## 7. Specialist board review

- **Compliance:** the registry must distinguish *duty* (assess for asbestos) from
  *administrative trigger* (hold a register). Conflating them is exactly how
  Queensland's 1989 register date became a national safety threshold.
- **Legal:** "100% correct" is defensible only as *"traceable to a named
  instrument, verified on a date, re-verified on a cadence"*. An undated claim of
  correctness is the weaker claim, not the stronger one.
- **Engineering:** entries are data, not prose. Prose duplicates; data is gated.

## 8. Judge challenge — the honest ceiling

Four things must be said plainly or the commercial claim is built on sand.

1. **ISO is largely the wrong instrument.** For AU/NZ restoration the governing
   law is the WHS Acts and Regulations, Codes of Practice and **AS/NZS**
   standards. Citing ISO where AS/NZS governs is the same class of error as the
   US material the CARSI course exists to correct. The registry names the
   instrument that actually governs; ISO appears only where one genuinely does.
2. **Standards text cannot be reproduced.** AS/NZS and ISO are copyrighted and
   paywalled, as IICRC already is here. What is lawful — and what an assessor
   wants — is the instrument, the clause number, and the requirement in our own
   words. `copyright-guard.ts` already enforces this and must cover the registry.
3. **Correctness is a cadence, not a snapshot.** Silica changed twice in 2024.
   Lead blood-level triggers changed in 2025. Workplace exposure *standards*
   become *limits* on 1 December 2026. Any table without a re-verification date
   is wrong within a year, so `verifiedAt` is mandatory and the gate fails on
   staleness.
4. **This environment cannot reach the primary sources.** `legislation.gov.au`,
   `standards.org.au`, `safeworkaustralia.gov.au`, `worksafe.govt.nz` and
   `iicrc.org` are all blocked by the egress policy — verified, and the proxy
   itself is healthy, so it is policy, not fault. Everything verified so far was
   verified through **search results quoting those pages**, which is one step
   removed. For a claim being sold, close this: either widen the allowlist for
   this environment, or have a human confirm each entry against the source. The
   registry records which of the two happened per entry.

**Ceiling:** I can guarantee *traceable, dated, gated, and consistent*. I cannot
guarantee *complete* — no registry of AU/NZ WHS law is — and I will not assert
completeness in a customer-facing surface.

## 9. Proposed solution

### 9.1 The entry

```ts
interface RegulatoryEntry {
  id: string;                     // "asbestos.presumption-year"
  domain: RegulatoryDomain;       // asbestos | silica | electrical | chemicals | building-code
  jurisdiction: "AU" | "NZ" | AuState;
  instrument: string;             // "Work Health and Safety Regulations (model)"
  provision?: string;             // "reg 5M" / "Chapter 8"
  effectiveFrom: string;          // ISO date the rule commenced
  requirement: string;            // our words, never the standard's
  sourceUrl: string;
  verifiedAt: string;             // ISO date
  verification: "primary-source" | "secondary-quoting-primary" | "owner-confirmed";
  supersededBy?: string;
}
```

`verification` is the field that makes §8.4 auditable instead of hidden.

### 9.2 Already verified, to seed the registry

| Domain | Rule | Verified |
| --- | --- | --- |
| Asbestos AU | All asbestos prohibited in Australian workplaces from **31 Dec 2003**; pre-2004 buildings need survey/register | Safe Work Australia, SafeWork NSW |
| Asbestos NZ | Assume ACM in anything built or renovated before **1 Jan 2000**; management plan required | WorkSafe NZ, HSW (Asbestos) Regulations 2016 |
| Asbestos QLD | Register exemption for buildings built after **31 Dec 1989** — a register rule, not a safety threshold | Safe Work Australia duties tool |
| Silica | Engineered stone ban **1 Jul 2024** (manufacture, supply, processing, installation); engineered stone = artificial product ≥1% crystalline silica w/w | Safe Work Australia, SafeWork NSW, DEWR |
| Silica | CSS regime from **1 Sep 2024** — all materials ≥1% crystalline silica | Safe Work Australia |
| Silica | Import prohibition **1 Jan 2025**, Customs (Prohibited Imports) Regulations 1956 reg 5M | Safe Work Australia |
| Silica AU | RCS exposure standard **0.05 mg/m³** 8-hour TWA, halved from 0.1 with effect from **1 Jul 2020** | Safe Work Australia, Comcare, SafeWork SA, WorkSafe Victoria |
| Silica NZ | RCS exposure standard **0.025 mg/m³** 8-hour TWA — halved from 0.05 in **November 2023**, and Australia has not followed | WorkSafe NZ, MBIE consultation Annex III |
| Silica VIC | Same 0.05 mg/m³ figure, but under the **OHS Regulations 2017 (Vic) Pt 4.1/4.5** — Victoria is not a model WHS jurisdiction; its engineered stone ban has **no transitional period** | WorkSafe Victoria, Victorian Building Authority |
| Silica NZ | Engineered stone is **not prohibited** in New Zealand; managed by the lower WES, guidance and voluntary accreditation, with MBIE consulting on options | WorkSafe NZ, MBIE |

Two of those rows were the point of doing this rather than trusting the course.
The RCS figure is **not one number**: New Zealand's is half Australia's, so a
product carrying a single "silica exposure standard" permits twice the legal
exposure on one side of the Tasman. And **Victoria is not a model WHS
jurisdiction** — the figure matches but the instrument does not, so a model WHS
citation shown to a Victorian technician is wrong even where the number is right.
Neither distinction appears in the course material.

The Silica Risk Control Plan duty was also narrower than asserted: it is
triggered where a risk assessment finds the processing of a crystalline silica
substance is **high risk**, not by every job touching a silica-bearing material.
The registry entry says so.

**Still asserted by the CARSI course and NOT independently verified** — these
enter the registry only after checking: the 2025 lead blood-level changes
(20 / 5 µg/dL); GHS 7 mandatory from 1 Jan 2023; AS/NZS 1715/1716, 3012, 3760
currency; the 85 dB(A) noise standard. Also unconfirmed: the claim in this
repository that exposure standards become *workplace exposure limits* in
December 2026.

### 9.3 The document catalogue — first consumer

Documents generate from data the system already holds (claim, client, business,
inspection, registry) and attach to the claim:

| Document | Draws on | Registry dependency |
| --- | --- | --- |
| Authority to Commence Works | client, business, claim, scope | none |
| Asbestos Assessment Authority | building era, jurisdiction | asbestos entries |
| Silica Risk Control Plan | materials, cutting/grinding tasks | silica entries |
| SWMS | existing `lib/swms/auto-generator.ts` | asbestos, electrical, confined space |
| WHS Site Induction Record | business, site hazards | multiple |
| Notifiable Incident Record | `WHSIncident`, jurisdiction | regulator + notification duties |
| Client Review / Satisfaction Form | client, job | none |
| Certificate of Completion | drying log, clearance | S500/S520 via `standardCite()` |

**The rule that makes this safe:** a document template may only cite a registry
entry id. A template that hard-codes a regulation fails the gate — which is
precisely how "pre-1990" survived in nine files.

## 10. UX requirements

- Every regulatory statement shows its instrument and `verifiedAt` on hover or in
  a footnote; documents carry it in a provenance block.
- The CARSI notice travels with every surface it feeds: *educational and
  pre-training, not legal advice, verify against your regulator*.
- NZ jobs never silently receive Australian law: where only an AU entry exists,
  the surface says so.

## 11. Technical requirements

- Registry entries are pure data; no I/O, no AI.
- `scripts/check-regulatory-registry.ts` fails on: a missing `sourceUrl` or
  `verifiedAt`; `verifiedAt` older than 12 months; a document template citing a
  regulation not in the registry; a regulatory keyword (asbestos, silica, RCD,
  GHS, notifiable) in a prompt or template without a registry reference; an
  entry whose `verification` is `secondary-quoting-primary` in a customer-facing
  document surface, unless allow-listed.
- Wire into `.github/workflows/pr-checks.yml` beside `check:standards`.

## 12. Security and privacy requirements

- No verbatim AS/NZS, ISO or IICRC text. `copyright-guard.ts` extended to scan
  registry `requirement` fields.
- Documents contain client PII: existing tenancy and token-route rules apply
  unchanged; generated documents inherit the claim's access control.
- No regulatory content in the shared RAG corpus without jurisdiction tagging —
  `rag-corpus-hygiene` applies.

## 13. Verification plan

- **Prove the gate fails before trusting it.** Add an entry with no `sourceUrl`;
  the gate must go red. Backdate a `verifiedAt` past 12 months; red. Hard-code a
  regulation in a template; red. Restore; green. Nothing is trusted until watched
  failing — the same method that caught the 1995-building defect.
- **Regression:** the asbestos suite already proves `< 1990` turns 5 cases red.
- **Coverage:** a test asserting every domain named in this spec has at least one
  entry, so a domain cannot be silently skipped.
- **Not provable here:** that an entry matches the instrument's current text.
  That needs either primary-source access or owner confirmation, and the
  `verification` field records which.

## 14. Loop testing and stress testing

- Run the gate against the current tree before writing entries — it should fail
  loudly on existing hard-coded regulatory prose, and that failure list is the
  work queue.
- Fixture a jurisdiction with no entry for a domain and assert the surface
  degrades to "not covered here", never to the Australian answer.

## 15. Acceptance criteria

1. `lib/compliance/regulatory-registry/` exists with asbestos and silica
   populated from §9.2, every entry carrying source and `verifiedAt`.
2. `check:regulatory-registry` runs in CI and has been observed failing on each
   of its four rules.
3. `asbestos-era.ts` delegates to the registry rather than holding its own copy.
4. At least one document template (Authority to Commence Works) generates from
   registry ids and attaches to a claim.
5. No regulatory keyword remains hard-coded outside the registry, proven by the
   gate rather than by inspection.
6. Every customer-facing regulatory surface carries the educational notice.

## 16. Goal command

```
/goal Build the verified regulatory registry and its CI gate. Completion
condition: check:regulatory-registry runs in pr-checks.yml, has been observed
failing on each of missing-source, stale-verifiedAt, template-hard-codes-a-
regulation and keyword-without-entry, and passes on the seeded asbestos and
silica domains; asbestos-era.ts reads the registry; one document template
generates from registry ids. Required proof: the four sabotage runs with their
red output, green type-check + test:unit + check:standards + the new gate, and a
grep proving no regulatory keyword outside the registry. Constraints: no verbatim
standard text; every entry carries sourceUrl, verifiedAt and verification
provenance; no entry marked primary-source unless the primary source was actually
opened; NZ never silently served Australian law; no LMS surface (spec.md §27).
```

## 17. Implementation sequence

1. Registry module, types, and the gate — **with the gate proven failing first**.
2. Seed asbestos from `asbestos-era.ts` (already verified); make that module a
   consumer, not an owner.
3. Seed silica from §9.2's verified rows; leave the unverified rows out until
   checked.
4. Electrical (AS/NZS 3012 / 3760, RCD ≤30 mA, 230 V) — verify first.
5. Chemicals and VOCs (GHS 7, SDS, register, placarding) — verify first.
6. Building codes — `ncc-edition.ts` becomes a registry consumer; add NZBC for NZ.
7. Document catalogue: Authority to Commence Works, then the asbestos and silica
   authorities, then the rest of §9.3.

## 18. Session handoff seed

Registry + gate land first and are worthless until watched failing. The asbestos
domain is verified and can be seeded immediately; silica is verified for the
three ban dates only. Everything else in §9.2's second paragraph is a CARSI-course
assertion awaiting independent check — do not seed it on the course's authority
alone, because the course is itself marked DRAFT pending founder review.

## 19. Final recommendation

Build the gate before the content. The defect this spec answers was not a missing
regulation — it was nine files agreeing with each other and none of them with the
law. Content without enforcement regenerates that state within a release.

Close the primary-source gap (§8.4) before the registry is used to support a
commercial compliance claim. It is the difference between "we verified this" and
"we verified this against the regulator".
