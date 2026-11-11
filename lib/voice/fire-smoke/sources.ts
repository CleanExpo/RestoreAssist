/**
 * Source register for the fire and smoke walkthrough. Ids match the
 * research pack (docs/research/fire-smoke-make-safe-research-pack.md).
 * Every source here was opened on the date shown.
 *
 * Licence:
 * - TITLE_ONLY: copyrighted standard (IICRC, Standards Australia). Cited by
 *   title and edition only. Its text never appears in this app, in a
 *   prompt, or in any AI tool. The technician consults their licensed copy.
 * - PARAPHRASE_OK: legislation, regulator guidance or a public industry
 *   code. Checklist wording paraphrases it in our own words.
 */

export type SourceLicence = "TITLE_ONLY" | "PARAPHRASE_OK";

export interface FireSource {
  id: string;
  title: string;
  publisher: string;
  version: string;
  url: string;
  /** ISO date the source was opened for the research pack. */
  openedOn: string;
  licence: SourceLicence;
  /** Applies in Victoria (false = national comparison only). */
  appliesInVictoria: boolean;
}

const OPENED = "2026-11-11";

export const FIRE_SOURCES: readonly FireSource[] = [
  {
    id: "S01",
    title: "ANSI/IICRC S700 Standard for Professional Fire and Smoke Damage Restoration",
    publisher: "IICRC",
    version: "First Edition, 2025 (no Australian adoption found, 11/11/2026)",
    url: "https://iicrc.org/s700/",
    openedOn: OPENED,
    licence: "TITLE_ONLY",
    appliesInVictoria: true,
  },
  {
    id: "S04",
    title: "AS-IICRC S500:2025 Standard for professional water damage restoration",
    publisher: "Standards Australia",
    version: "Current, published 28/03/2025 (adopts ANSI/IICRC S500:2021)",
    url: "https://store.standards.org.au/product/as-iicrc-s500-2025",
    openedOn: OPENED,
    licence: "TITLE_ONLY",
    appliesInVictoria: true,
  },
  {
    id: "S05",
    title: "AS-IICRC S520:2025 Standard for professional mould remediation",
    publisher: "Standards Australia",
    version: "Current, published 28/11/2025 (adopts ANSI/IICRC S520:2024)",
    url: "https://store.standards.org.au/product/as-iicrc-s520-2025",
    openedOn: OPENED,
    licence: "TITLE_ONLY",
    appliesInVictoria: true,
  },
  {
    id: "S07",
    title: "NCC 2025 state and territory adoption information",
    publisher: "Australian Building Codes Board",
    version: "Victoria adopted NCC 2025 on 1 May 2026",
    url: "https://ncc.abcb.gov.au/ncc-2025-state-and-territory-adoption-information",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S08",
    title: "Occupational Health and Safety Act 2004 (Vic)",
    publisher: "Victorian Government (legislation.vic.gov.au)",
    version: "Authorised Version 045",
    url: "https://www.legislation.vic.gov.au/in-force/acts/occupational-health-and-safety-act-2004/045",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S09",
    title: "Occupational Health and Safety Regulations 2017 (Vic)",
    publisher: "Victorian Government (legislation.vic.gov.au)",
    version: "Authorised Version 018, as at 20 Oct 2026",
    url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017/018",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S10",
    title: "Building Act 1993 (Vic)",
    publisher: "Victorian Government (legislation.vic.gov.au)",
    version: "Authorised Version 152, as at 16 Sep 2026",
    url: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993/152",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S11",
    title: "Surveillance Devices Act 1999 (Vic)",
    publisher: "Victorian Government (legislation.vic.gov.au)",
    version: "Authorised Version 048, as at 10 Dec 2025",
    url: "https://www.legislation.vic.gov.au/in-force/acts/surveillance-devices-act-1999/048",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S12",
    title: "Model Work Health and Safety Act",
    publisher: "Safe Work Australia",
    version: "Model version as at 5 Dec 2025 (not in force in Victoria)",
    url: "https://www.safeworkaustralia.gov.au/doc/model-whs-act",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: false,
  },
  {
    id: "S13",
    title: "Model Work Health and Safety Regulations",
    publisher: "Safe Work Australia",
    version: "Model version as at 5 Dec 2025 (not in force in Victoria)",
    url: "https://www.safeworkaustralia.gov.au/doc/model-whs-regulations",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: false,
  },
  {
    id: "S24",
    title: "Compliance code: Managing asbestos in workplaces",
    publisher: "WorkSafe Victoria",
    version: "Published 19 Dec 2019",
    url: "https://www.worksafe.vic.gov.au/resources/compliance-code-managing-asbestos-workplaces",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S26",
    title: "Compliance code: Prevention of falls in general construction",
    publisher: "WorkSafe Victoria",
    version: "Published 19 Dec 2019",
    url: "https://www.worksafe.vic.gov.au/resources/compliance-code-prevention-falls-general-construction",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S27",
    title: "Compliance code: First aid in the workplace",
    publisher: "WorkSafe Victoria",
    version: "Published 04 Nov 2021",
    url: "https://www.worksafe.vic.gov.au/resources/compliance-code-first-aid-workplace",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S29",
    title: "Compliance code: Hazardous substances",
    publisher: "WorkSafe Victoria",
    version: "Published 25 Nov 2022",
    url: "https://www.worksafe.vic.gov.au/resources/compliance-code-hazardous-substances",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S32",
    title: "Demolition of buildings or structures with fire-damaged non-friable asbestos-containing material",
    publisher: "WorkSafe Victoria",
    version: "Undated page (re-check before release)",
    url: "https://www.worksafe.vic.gov.au/demolition-buildings-or-structures-fire-damaged-non-friable-asbestos-containing-material",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S33",
    title: "Hidden hazards pose fire clean-up risk",
    publisher: "WorkSafe Victoria",
    version: "News item, 09 Jan 2020",
    url: "https://www.worksafe.vic.gov.au/news/2020-01/hidden-hazards-pose-fire-clean-risk",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S34",
    title: "Energy safety during bushfires",
    publisher: "Energy Safe Victoria",
    version: "Reviewed 9 May 2024",
    url: "https://www.energysafe.vic.gov.au/community-safety/emergencies/energy-safety-during-bushfires",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S35",
    title: "Gas emergencies",
    publisher: "Energy Safe Victoria",
    version: "Reviewed 29 Jan 2023",
    url: "https://www.energysafe.vic.gov.au/community-safety/emergencies/gas-emergencies",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S36",
    title: "Electrical emergencies",
    publisher: "Energy Safe Victoria",
    version: "Reviewed 14 Oct 2025",
    url: "https://www.energysafe.vic.gov.au/community-safety/emergencies/electrical-emergencies",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S37",
    title: "After the fire (legacy page)",
    publisher: "Country Fire Authority",
    version: "Legacy page, undated (re-check before release)",
    url: "https://www.cfa.vic.gov.au/plan-prepare-old/fires-in-the-home-old/after-the-fire-old",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S38",
    title: "General Insurance Code of Practice",
    publisher: "Insurance Council of Australia",
    version: "Updated October 2023 (redraft submitted 22 Oct 2026, not in force)",
    url: "https://insurancecouncil.com.au/cop/",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S39",
    title: "Australian Privacy Principles",
    publisher: "Office of the Australian Information Commissioner",
    version: "Page read 11/11/2026",
    url: "https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
  {
    id: "S40",
    title: "After a fire: asbestos hazards (publication 1719.3)",
    publisher: "EPA Victoria",
    version: "Updated 5 May 2025",
    url: "https://www.epa.vic.gov.au/about-epa/publications/1719-3",
    openedOn: OPENED,
    licence: "PARAPHRASE_OK",
    appliesInVictoria: true,
  },
];

export function getFireSource(id: string): FireSource | undefined {
  return FIRE_SOURCES.find((s) => s.id === id);
}

/** Short citation for display, e.g. "OHS Regulations 2017 (Vic) r304". */
export function formatCitation(sourceId: string, pinpoint?: string): string {
  const source = getFireSource(sourceId);
  if (!source) return sourceId;
  return pinpoint ? `${source.title}, ${pinpoint}` : source.title;
}
