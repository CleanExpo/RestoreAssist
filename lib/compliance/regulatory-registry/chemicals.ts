import type { RegulatoryEntry } from "./types";

/**
 * Chemicals and volatile organic compounds.
 *
 * Three things here are easy to state confidently and wrongly, and all three
 * are the kind of claim a restoration report makes in passing:
 *
 * 1. "GHS 7 applies from 1 January 2023" is true everywhere in Australia
 *    EXCEPT Western Australia, which moved on 31 March 2023 -- and New Zealand
 *    reached GHS 7 by a different road entirely, under HSNO from 30 April 2021
 *    with its transition closing 30 April 2025.
 *
 * 2. "VOC levels are within the limit" cannot be true as written, because
 *    THERE IS NO EXPOSURE STANDARD FOR TOTAL VOCs. Standards are
 *    substance-specific. A hand-held TVOC meter reading has no legal threshold
 *    to be compared against, and presenting one as compliance is inventing a
 *    limit.
 *
 * 3. The methamphetamine numbers are NOT law in either country, and they are
 *    not the same number. Australia works to 0.5 ug/100cm2 from the
 *    Clandestine Drug Laboratory Remediation Guidelines; New Zealand to
 *    1.5 ug/100cm2 for high-use areas under NZS 8510:2017 -- three times
 *    Australia's figure. Both are voluntary and neither is cited in
 *    legislation. A report calling either a legal requirement is wrong about
 *    its own foundation, and one that applies the wrong country's number
 *    either fails a property that passes or clears one that does not.
 *
 * Units are worth naming explicitly because the secondary sources disagree:
 * one gave "1.5 mg/100cm2" for the same figure other sources give as
 * 1.5 ug/100cm2. That is a thousandfold error on a clearance threshold. The
 * microgram figures are the corroborated ones.
 *
 * `verification: "secondary-quoting-primary"` throughout, as elsewhere:
 * safeworkaustralia.gov.au, legislation.gov.au, legislation.govt.nz,
 * epa.govt.nz, apvma.gov.au and standards.govt.nz are all unreachable from
 * here (egress policy, proxy healthy). Checked 2026-09-01 against sources
 * quoting those regulators.
 */
export const CHEMICALS_ENTRIES: RegulatoryEntry[] = [
  {
    id: "chemicals.ghs-classification.au",
    domain: "chemicals",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model), hazardous chemicals classification",
    effectiveFrom: "2023-01-01",
    requirement:
      "Hazardous chemicals must be classified, labelled and supplied with safety data sheets under revision 7 of the Globally Harmonized System. The two-year transition from GHS 3 closed on 1 January 2023. Stock manufactured or imported before that date need not be relabelled or destroyed, but its safety data sheet must still meet GHS 7 even where the label does not.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/classifying-chemicals/transition-ghs7",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 7,
  },
  {
    id: "chemicals.ghs-classification.wa",
    domain: "chemicals",
    jurisdiction: "WA",
    instrument:
      "Work Health and Safety (General) Regulations 2022 (WA), hazardous chemicals classification",
    effectiveFrom: "2023-03-31",
    requirement:
      "Western Australia moved to GHS 7 on 31 March 2023, three months after every other Australian jurisdiction. The requirement is the same; the date is not. A compliance statement citing 1 January 2023 is wrong for a Western Australian workplace in that window, and this entry exists so the national date is never served as though it were universal.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/media-centre/news/hazardous-chemicals-are-you-ready-ghs-7",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 7,
  },
  {
    id: "chemicals.ghs-classification.nz",
    domain: "chemicals",
    jurisdiction: "NZ",
    instrument:
      "Hazardous Substances and New Organisms Act 1996; Health and Safety at Work (Hazardous Substances) Regulations 2017",
    effectiveFrom: "2021-04-30",
    requirement:
      "New Zealand also classifies to GHS 7, but adopted it on 30 April 2021 under HSNO and administers it through the Environmental Protection Authority rather than work health and safety regulators. Importers, manufacturers and suppliers had four years to update labelling, safety data sheets and packaging; that transition closed on 30 April 2025 and full compliance is now required. Cite the New Zealand instrument on a New Zealand job: the revision matches, the legal route and the dates do not.",
    sourceUrl:
      "https://www.epa.govt.nz/hazardous-substances/classification/new-zealands-hazard-classification-system/",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 7,
  },
  {
    id: "chemicals.sds-and-register.au",
    domain: "chemicals",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model), regulations 344 and 346",
    provision: "regs 344, 346",
    effectiveFrom: "2012-01-01",
    requirement:
      "A business must keep a register of every hazardous chemical used, handled or stored at the workplace, holding a current safety data sheet for each, and must make both readily accessible to workers who use the chemical and to emergency services. Safety data sheets are reviewed and updated by the manufacturer or importer at least every five years, so an SDS more than five years old is not a current one. For restoration this covers antimicrobials, solvents, sealers and cleaning chemicals carried onto site, not only what the building already held.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/system/files/documents/1909/hazardous_chemical_register_template.pdf",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 5,
  },
  {
    id: "chemicals.antimicrobial-registration.au",
    domain: "chemicals",
    jurisdiction: "AU",
    instrument:
      "Agricultural and Veterinary Chemicals Code Act 1994 (Cth), administered by the APVMA; Therapeutic Goods Order 54 for disinfectants, administered by the TGA",
    effectiveFrom: "1994",
    requirement:
      "An agricultural or veterinary chemical product must be registered before it is supplied, sold or used in Australia, and products making mould, algae or pest claims are regulated by the APVMA on that basis. Disinfectants making hospital-grade, surface or domestic claims fall to the TGA instead, so WHICH REGULATOR APPLIES DEPENDS ON THE CLAIM THE PRODUCT MAKES, not on what the technician intends to do with it. Applying an unregistered product, or using a registered one contrary to its label without an APVMA permit, is not a technique choice. Record the product and its registration or permit number on the job. effectiveFrom carries year precision from the Act's year; the Code's commencement day was not established from the sources reachable here.",
    sourceUrl:
      "https://www.apvma.gov.au/registrations-and-permits/chemical-product-registration",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "chemicals.total-voc-exposure-standard.au",
    domain: "chemicals",
    jurisdiction: "AU",
    instrument:
      "Workplace Exposure Standards for Airborne Contaminants (Safe Work Australia)",
    effectiveFrom: "2022",
    requirement:
      "There is NO workplace exposure standard for total volatile organic compounds. Exposure standards are set substance by substance, so a total-VOC or TVOC reading from a hand-held meter has no legal threshold to be compared against. Do not report a TVOC figure as being within or above 'the limit', and do not derive a clearance decision from one: identify the specific compounds of concern and compare each against its own standard. This entry records an absence deliberately, because an invented limit is easier to write than a missing one is to notice.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/exposure-standards",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "chemicals.meth-remediation-guideline.au",
    domain: "chemicals",
    jurisdiction: "AU",
    instrument:
      "Clandestine Drug Laboratory Remediation Guidelines (Commonwealth), with state and territory guidelines referencing them",
    effectiveFrom: "2011",
    requirement:
      "The Australian guideline value for methamphetamine residue on indoor surfaces is 0.5 micrograms per 100 square centimetres. This is GUIDANCE, NOT LAW: the national guidelines are not cited in legislation and are therefore voluntary, and most states and territories have their own guidelines referencing them, so the applicable document varies by jurisdiction. Do not describe this figure as a legal limit or a mandatory standard. effectiveFrom carries year precision; the publication day was not established from the sources reachable here.",
    sourceUrl:
      "https://www.industry.gov.au/sites/default/files/2019-06/clandestine-drug-lab-remediation-guidelines.pdf",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 0.5,
  },
  {
    id: "chemicals.meth-remediation-standard.nz",
    domain: "chemicals",
    jurisdiction: "NZ",
    instrument:
      "NZS 8510:2017, Testing and decontamination of methamphetamine-contaminated properties",
    effectiveFrom: "2017",
    requirement:
      "New Zealand works to 1.5 micrograms per 100 square centimetres in high-use areas and 3.8 micrograms per 100 square centimetres in limited-use areas such as crawl spaces and cavities. The high-use figure is three times Australia's 0.5, so applying the Australian number in New Zealand fails properties that pass, and applying the New Zealand number in Australia clears properties that do not. NZS 8510 is a VOLUNTARY standard and is not cited in legislation. effectiveFrom carries year precision; the publication day was not established from the sources reachable here.",
    sourceUrl:
      "https://www.standards.govt.nz/shop/NZS-85102017",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 1.5,
  },
];
