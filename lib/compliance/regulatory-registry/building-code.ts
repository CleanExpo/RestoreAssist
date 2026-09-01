import type { RegulatoryEntry } from "./types";

/**
 * Building codes.
 *
 * THIS DOMAIN DOES NOT OWN THE OPERATIVE TABLE, AND MUST NOT. The edition of the
 * National Construction Code in force is a function of jurisdiction AND date,
 * and `lib/anz/ncc-adoption.ts` already models it -- including a reversion, a
 * non-adoption and a split adoption. Re-stating those dates here would create a
 * second source of truth for one fact, which is the failure this whole registry
 * exists to prevent; the same PDF could then print one edition in the scope and
 * another in the footer.
 *
 * So these entries carry PROVENANCE, not a parallel table: the legal instrument
 * behind each unusual jurisdiction, its source, and the date it was checked.
 * `registry.test.ts` binds them to `resolveNccEdition()` so the two cannot drift
 * apart silently -- change either and the suite fails.
 *
 * The three jurisdictions worth naming, because each breaks a reasonable
 * assumption a developer would otherwise make:
 *
 *   TASMANIA  adoption is NOT monotonic. Tasmania commenced NCC 2025 on
 *             1 May 2026 and REVERTED to NCC 2022 Amendment 2 five weeks later
 *             by primary legislation. Any model assuming a jurisdiction only
 *             moves forward is wrong about Tasmania for eleven months.
 *   NORTHERN  non-adoption is an answer, not missing data. The NT gazetted that
 *   TERRITORY NCC 2025 does not apply at all.
 *   SOUTH     adoption is not all-or-nothing. SA took Volume Three (plumbing)
 *   AUSTRALIA in 2026 and deferred Volumes One and Two (building) to 2027.
 *
 * And New Zealand has no NCC in any form. Citing one on a New Zealand report is
 * not an imprecision, it is a citation of a document that does not govern the
 * job.
 *
 * `verification: "secondary-quoting-primary"` throughout: ncc.abcb.gov.au,
 * legislation.tas.gov.au and legislation.govt.nz are unreachable from here
 * (egress policy, proxy healthy). Checked 2026-09-01 against sources quoting
 * those bodies.
 */
export const BUILDING_CODE_ENTRIES: RegulatoryEntry[] = [
  {
    id: "building-code.ncc-adoption.au",
    domain: "building-code",
    jurisdiction: "AU",
    instrument:
      "National Construction Code, published by the Australian Building Codes Board and adopted by each state and territory under its own building legislation",
    effectiveFrom: "2026-05-01",
    requirement:
      "NCC 2025 was published on 1 May 2026, but publication is not adoption: the code takes legal effect only when a state or territory adopts it, and they have done so on different dates and in one case not at all. There is therefore no single current NCC edition, and any citation that names one without a jurisdiction and a date is asserting more than is known. The operative table is lib/anz/ncc-adoption.ts -- resolve through getNccEdition(state, asAt), never a literal. Where a job records no state, the national floor edition is used, which understates rather than overstates.",
    sourceUrl:
      "https://ncc.abcb.gov.au/ncc-2025/ncc-2025-state-and-territory-adoption-information",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "building-code.ncc-reversion.tas",
    domain: "building-code",
    jurisdiction: "TAS",
    instrument:
      "Building Amendment Act 2026 (Tas), amending the Building Act 2016 (Tas) s 4(1)",
    effectiveFrom: "2026-06-05",
    requirement:
      "Tasmania commenced NCC 2025 on 1 May 2026 and then reversed it: the Building Amendment Act 2026 received Royal Assent and commenced on 5 June 2026, fixing the applicable edition at NCC 2022 as amended by Amendment 2, and NCC 2025 ceased to apply statewide. NCC 2022 Amendment 2 governs until 1 May 2027, when NCC 2025 applies again with no further instrument needed. A project granted approval during the five-week window completes under the edition applied at approval, which is per-project transitional relief rather than a jurisdiction-wide edition. Adoption is not monotonic: do not assume a jurisdiction only ever moves to a newer code.",
    sourceUrl:
      "https://cbos.tas.gov.au/topics/technical-regulation/building-standards/national-construction-code-ncc-2025/national-construction-code-ncc-2026",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "NCC 2022 Amendment 2",
  },
  {
    id: "building-code.ncc-non-adoption.nt",
    domain: "building-code",
    jurisdiction: "NT",
    instrument: "Northern Territory building legislation; NCC 2025 not adopted",
    effectiveFrom: "2026-05-01",
    requirement:
      "The Northern Territory gazetted that NCC 2025 does not apply in the Territory from 1 May 2026 until the next edition is published, after initially indicating it would adopt. NCC 2022 Amendment 2 continues to apply. This is a deliberate non-adoption with a date, not an announcement that has yet to be made, and it must not be treated as missing data to be filled in with the national position.",
    sourceUrl:
      "https://ncc.abcb.gov.au/ncc-2025/ncc-2025-state-and-territory-adoption-information",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "NCC 2022 Amendment 2",
  },
  {
    id: "building-code.ncc-split-adoption.sa",
    domain: "building-code",
    jurisdiction: "SA",
    instrument: "South Australian building and plumbing legislation",
    effectiveFrom: "2026-05-01",
    requirement:
      "South Australia adopted only Volume Three of NCC 2025, the Plumbing Code, from 1 May 2026, and deferred Volumes One and Two, the Building Code, to 1 May 2027. Adoption is therefore not all-or-nothing, and the volume matters: RestoreAssist scopes building reinstatement, so the Building Code date governs a restoration scope and a South Australian job is on NCC 2022 Amendment 2 for that purpose until 2027, even though a plumbing item on the same job is not.",
    sourceUrl:
      "https://ncc.abcb.gov.au/ncc-2025/ncc-2025-state-and-territory-adoption-information",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "NCC 2022 Amendment 2",
  },
  {
    id: "building-code.building-code.nz",
    domain: "building-code",
    jurisdiction: "NZ",
    instrument:
      "Building Act 2004; New Zealand Building Code, Schedule 1 of the Building Regulations 1992",
    effectiveFrom: "2004-08-25",
    requirement:
      "New Zealand is governed by the New Zealand Building Code, which is Schedule 1 of the Building Regulations 1992 made under the Building Act 2004. It is performance-based: the Code states what a building must achieve rather than how, and compliance is demonstrated through Acceptable Solutions, Verification Methods or an alternative solution. There is NO National Construction Code in New Zealand. Citing the NCC on a New Zealand report is not an imprecision to be tolerated -- it names a document that does not govern the job. getNccEdition() returns null for a New Zealand job for exactly this reason, and callers must handle that rather than substituting an Australian edition.",
    sourceUrl:
      "https://www.legislation.govt.nz/act/public/2004/0072/latest/DLM306036.html",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
];
