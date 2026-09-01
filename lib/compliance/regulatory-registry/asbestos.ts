import type { RegulatoryEntry } from "./types";

/**
 * Asbestos. The domain that proved the registry was needed.
 *
 * Every entry here was checked on 2026-09-01 against the regulator, not against
 * the codebase -- which had been agreeing with itself and not with the law.
 *
 * `verification: "secondary-quoting-primary"` on all of them is not padding: the
 * environment that wrote these entries cannot reach safeworkaustralia.gov.au,
 * worksafe.govt.nz, safework.nsw.gov.au or legislation.gov.au (egress policy,
 * with the proxy itself confirmed healthy). They were verified from sources
 * quoting those regulators. Before this registry supports a commercial
 * compliance claim, each should be re-checked against the regulator's own page
 * and moved to `primary-source` or `owner-confirmed`.
 */
export const ASBESTOS_ENTRIES: RegulatoryEntry[] = [
  {
    id: "asbestos.presumption-year.au",
    domain: "asbestos",
    jurisdiction: "AU",
    instrument: "Work Health and Safety Regulations (model), Chapter 8",
    effectiveFrom: "2003-12-31",
    requirement:
      "All asbestos was prohibited in Australian workplaces from 31 December 2003. Treat any building constructed before 2004 as possibly containing asbestos until tested; a workplace built before that date requires an asbestos survey, and a register plus management plan where asbestos is found or assumed. If a material cannot be tested, assume it is asbestos.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/hazards/asbestos",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 2004,
  },
  {
    id: "asbestos.presumption-year.nz",
    domain: "asbestos",
    jurisdiction: "NZ",
    instrument: "Health and Safety at Work (Asbestos) Regulations 2016",
    effectiveFrom: "2016-04-04",
    requirement:
      "Assume any building constructed or renovated before 1 January 2000 may contain asbestos until established otherwise. A PCBU must hold an asbestos management plan for a building constructed prior to 2000, reviewed at least every five years.",
    sourceUrl:
      "https://www.worksafe.govt.nz/topic-and-industry/asbestos/information-for-businesses-organisations-and-building-owners/managing-asbestos-in-your-building-or-workplace-for-pcbus/",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 2000,
  },
  {
    id: "asbestos.register-exemption.qld",
    domain: "asbestos",
    jurisdiction: "QLD",
    instrument: "Work Health and Safety Regulation 2011 (Qld)",
    effectiveFrom: "1989-12-31",
    requirement:
      "Queensland alone exempts a workplace built after 31 December 1989 from the asbestos REGISTER requirement where no asbestos is identified or likely. This is an administrative exemption about record-keeping. It does not make a 1990s Queensland building asbestos-free, and it does not lift the duty to assess before disturbing material. Applying this date as a national safety threshold is the defect this registry was built to stop.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/doc/asbestos-registers-workplace",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 1990,
  },
  {
    id: "asbestos.register-requirement.nsw",
    domain: "asbestos",
    jurisdiction: "NSW",
    instrument: "Work Health and Safety Regulation 2017 (NSW), Chapter 8",
    effectiveFrom: "2003-12-31",
    requirement:
      "A workplace constructed before 31 December 2003 requires an asbestos register. NSW uses the national date; it has no earlier cutoff of its own. A prior revision of the jurisdictional matrix asserted a pre-1987 NSW cutoff, cited this instrument as its authority and contrasted it with Queensland. No such cutoff exists.",
    sourceUrl:
      "https://www.safework.nsw.gov.au/resource-library/asbestos-publications/asbestos-registers-and-management-plans-fact-sheet",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 2004,
  },
];
