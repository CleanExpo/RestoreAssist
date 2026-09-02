/**
 * Lead in paint — the presumption years.
 *
 * WHY THIS DOMAIN EXISTS. lib/reports/build-structured-report.ts USED TO set
 * `leadRisk` from the ASBESTOS presumption year, because the registry held no
 * lead domain at all. CodeRabbit flagged that on PR #2164 and it was right: a
 * reader was shown an asbestos-derived year as though it were a lead
 * determination. The borrowed year was conservative in both countries -- it
 * over-warned rather than under-warned -- but conservative is not correct, and a
 * borrowed threshold cannot be cited.
 *
 * It now reads lib/compliance/lead-era.ts, which reads these entries. The
 * practical effect in Australia is that a building from the lead year through
 * to 2003 is no longer reported as a lead risk on an asbestos ban's authority.
 *
 * LEAD IS NOT ASBESTOS, AND THE SHAPE OF THE RULE IS DIFFERENT. Australia
 * PROHIBITED asbestos in workplaces from 31 December 2003, so
 * asbestos.presumption-year.au rests on a ban with a commencement date. There is
 * no equivalent moment for lead paint. What exists is regulator GUIDANCE saying
 * "presume lead unless it is tested", plus a stepped reduction in the permitted
 * concentration. So these entries describe a presumption, never a prohibition,
 * and the requirement text says so.
 *
 * A LATER BUILD YEAR DOES NOT MEAN CLEAR. The Australian guidance is explicit
 * that homes built after the presumption year may still carry lead paint: the
 * permitted concentration fell in steps (1 per cent from 1965, 0.25 per cent
 * from 1992, 0.1 per cent from 1997) rather than going to zero. The presumption
 * year is the line for "assume unless tested", not a certificate.
 *
 * AUSTRALIA IS NOW SEEDED, AND THE 2014-VERSUS-2016 QUESTION IS SETTLED. This
 * entry was held back because the guidance document's own edition year could not
 * be established: sources disagreed between a 2014 publication and a 2016
 * Commonwealth copyright line, and every page that could settle it was
 * unreachable from this environment's egress policy.
 *
 * The two years turned out not to be a contradiction. They are two PRINTINGS of
 * the same fifth edition. The copy hosted by a third party since 2014 carries
 * "Commonwealth of Australia 2014" under a CC-BY 3.0 AU licence; the copy on the
 * Commonwealth's own domain -- the one WorkSafe Tasmania, EPA NSW, SA Health and
 * Somerset Regional Council all link to -- carries "(C) Copyright Commonwealth of
 * Australia, 2016" and a CC-BY 4.0 licence, and self-attributes as
 * "Lead Alert: The six step guide to painting your home-5th edition,
 * Commonwealth of Australia 2016". The entry cites the Commonwealth-hosted copy,
 * so `effectiveFrom` is its year: 2016. The booklet itself notes it was
 * "originally developed in 1995".
 *
 * THE SOURCES DISAGREE ABOUT THE YEAR ITSELF, IN BOTH COUNTRIES, AND THAT IS
 * RECORDED RATHER THAN AVERAGED. Each entry's `value` is the year stated by the
 * instrument it CITES, and the divergence is written into `requirement` so a
 * reader is not misled into thinking the threshold is crisper than it is:
 *
 *   Australia   Commonwealth Lead Alert (cited)   before 1970
 *               SA Health                          before the mid-1970s
 *               NHMRC                              before 1980
 *
 *   New Zealand Management Guidelines (cited)      pre-1980  (section 5.2 duty)
 *               WorkSafe NZ web guidance           "1980s or earlier", i.e. <1990
 *
 * Picking the broadest year from any source would over-warn on a threshold no
 * cited instrument states; picking the narrowest would under-warn. The cited
 * instrument governs the number, and the requirement text carries the rest.
 */

import type { RegulatoryEntry } from "./types";

export const LEAD_ENTRIES: RegulatoryEntry[] = [
  {
    id: "lead.presumption-year.au",
    domain: "lead",
    jurisdiction: "AU",
    instrument:
      "Lead Alert: The six step guide to painting your home, 5th edition (Australian Government Department of the Environment, Commonwealth of Australia)",
    effectiveFrom: "2016",
    requirement:
      "Assume paint in a home built before 1970 contains lead unless testing proves otherwise, and treat any work that disturbs those coatings as lead work. This is a presumption for planning and worker protection, not a prohibition: Australia set no single date on which lead paint became unlawful, and the permitted concentration fell in steps rather than to zero -- as much as 50 per cent lead in homes built before 1950, more than 1 per cent still in use until the late 1960s, limited to 1 per cent by 1970, a 0.25 per cent limit recommended in 1992, and 0.1 per cent since December 1997. A LATER BUILD YEAR IS NOT A CLEARANCE: the guidance is explicit that homes built after 1970 may still carry paint above 1 per cent, particularly where old, industrial or marine paints were used, and some specialised coatings sold today still contain lead. Other Australian sources set the line later still -- SA Health advises presuming lead-based paint before the mid-1970s, and the NHMRC states that houses built before 1980 are likely to contain it -- so a building between 1970 and 1980 falls outside this entry's year without being cleared by it, and should be tested before coatings are disturbed.",
    sourceUrl:
      "https://www.agriculture.gov.au/sites/default/files/documents/lead-paint-fifth-edition.pdf",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
    value: 1970,
  },
  {
    id: "lead.presumption-year.nz",
    domain: "lead",
    jurisdiction: "NZ",
    instrument:
      "Guidelines for the Management of Lead-based Paint (Ministry of Health and Ministry of Business, Innovation and Employment, Wellington), published via WorkSafe New Zealand",
    provision: "Sections 4.3 and 5.2",
    effectiveFrom: "2013",
    requirement:
      "Assume paintwork on a pre-1980 building is lead-based unless records or testing prove otherwise. This is a presumption for planning and worker protection, not a prohibition: New Zealand has no single date on which lead paint became unlawful, and a building constructed after the presumption year may still carry lead paint on earlier layers or on repainted joinery. The guidelines note that some properties built between 1970 and 1980 still used lead-based paint. Treat disturbance of coatings on a pre-1980 building as lead work until tested. Note the wider net cast by WorkSafe's own web guidance, which advises presuming lead-based paint on anything built in the 1980s or earlier: a 1985 building sits outside this entry's year but is NOT cleared, and should be tested before coatings are disturbed.",
    sourceUrl:
      "https://www.worksafe.govt.nz/dmsdocument/983-guidelines-for-the-management-of-lead-based-paint/",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
    value: 1980,
  },
];
