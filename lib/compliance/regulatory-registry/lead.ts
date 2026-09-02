/**
 * Lead in paint — the presumption years.
 *
 * WHY THIS DOMAIN EXISTS. lib/reports/build-structured-report.ts sets `leadRisk`
 * from the ASBESTOS presumption year, because until now the registry held no
 * lead domain at all. CodeRabbit flagged that on PR #2164 and it was right: a
 * reader was shown an asbestos-derived year as though it were a lead
 * determination. The borrowed year is conservative in both countries -- it
 * over-warns rather than under-warns -- but conservative is not correct, and a
 * borrowed threshold cannot be cited.
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
 * AUSTRALIA IS DELIBERATELY NOT SEEDED HERE. The presumption year itself is well
 * corroborated -- the Australian Government's own guidance says paint in
 * pre-1970 houses should be assumed to contain high levels of lead unless tests
 * prove otherwise, and independent searches agree. What could NOT be established
 * is the guidance document's own commencement year: sources disagree between a
 * 2014 publication and a 2016 Commonwealth copyright line, and every page that
 * could settle it (dcceew.gov.au, agriculture.gov.au, healthnz.govt.nz) is
 * unreachable from this environment's egress policy.
 *
 * `effectiveFrom` is documented in types.ts as "a positive claim about what is
 * known, not a placeholder to be padded out", and picking either year would
 * manufacture the certainty this registry exists to prevent. An Australian entry
 * needs a confirmable edition year from someone who can open the source. Until
 * then `leadRisk` keeps its stated asbestos-era approximation for AU jobs.
 */

import type { RegulatoryEntry } from "./types";

export const LEAD_ENTRIES: RegulatoryEntry[] = [
  {
    id: "lead.presumption-year.nz",
    domain: "lead",
    jurisdiction: "NZ",
    instrument:
      "Guidelines for the Management of Lead-based Paint (Ministry of Health and Ministry of Business, Innovation and Employment, Wellington), published via WorkSafe New Zealand",
    effectiveFrom: "2013",
    requirement:
      "Presume that a building constructed in the 1980s or earlier has been painted with lead-based paint, unless testing establishes otherwise. This is a presumption for planning and worker protection, not a prohibition: New Zealand has no single date on which lead paint became unlawful, and a building constructed after the presumption year may still carry lead paint on earlier layers or on repainted joinery. Treat disturbance of coatings on a pre-1980 building as lead work until tested.",
    sourceUrl:
      "https://www.worksafe.govt.nz/topic-and-industry/hazardous-substances/guidance/substances/managing-lead-based-paint/",
    verifiedAt: "2026-09-02",
    verification: "secondary-quoting-primary",
    value: 1980,
  },
];
