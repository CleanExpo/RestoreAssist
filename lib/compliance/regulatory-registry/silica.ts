import type { RegulatoryEntry } from "./types";

/**
 * Crystalline silica. The domain where the numbers differ across the Tasman,
 * and where quoting the wrong one under-protects the worker by half.
 *
 * Australia's workplace exposure standard for respirable crystalline silica is
 * 0.05 mg/m3 as an eight-hour TWA. New Zealand's is 0.025 mg/m3 -- WorkSafe NZ
 * halved it in November 2023, and Australia has not followed. A product that
 * carries one silica number and calls it "the exposure standard" is therefore
 * wrong in one country whichever number it picks. That is the same failure the
 * asbestos entries were written to stop, one hazard along.
 *
 * Victoria is the second trap. Victoria is not a model WHS jurisdiction: its
 * duties sit in the Occupational Health and Safety Regulations 2017 (Vic),
 * Part 4.5, not in the model WHS Regulations. The exposure figure happens to
 * match, but the instrument does not, and Victoria's engineered stone ban has
 * NO transitional period where the model jurisdictions have one. Serving a
 * Victorian technician a model WHS citation is a wrong citation even when the
 * number beside it is right.
 *
 * Restoration relevance: this is not a benchtop-fabrication concern only.
 * Cutting, grinding or drilling concrete, masonry, brick, tile, render and
 * fibre-cement sheeting during a strip-out is processing a crystalline silica
 * substance, and since 1 September 2024 that carries duties in its own right.
 *
 * `verification: "secondary-quoting-primary"` on every entry, for the same
 * reason as asbestos.ts: this environment cannot reach safeworkaustralia.gov.au,
 * worksafe.govt.nz, worksafe.vic.gov.au or legislation.gov.au (egress policy;
 * the proxy itself reports healthy). Each was checked on 2026-09-01 against
 * sources quoting those regulators, corroborated across more than one where the
 * figure is load-bearing. Before any of this supports a commercial compliance
 * claim it should be re-checked against the regulator's own page and moved to
 * `primary-source` or `owner-confirmed`.
 */
export const SILICA_ENTRIES: RegulatoryEntry[] = [
  {
    id: "silica.exposure-standard.au",
    domain: "silica",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model) — workplace exposure standards for airborne contaminants",
    effectiveFrom: "2020-07-01",
    requirement:
      "A worker must not be exposed to respirable crystalline silica above 0.05 mg/m3 measured as an eight-hour time-weighted average. Safe Work Australia halved the previous 0.1 mg/m3 figure with effect from 1 July 2020 and applied one figure to all crystalline forms. The standard is a legal ceiling, not a safe level: the duty to eliminate or minimise exposure so far as is reasonably practicable applies below it.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/hazards/silica/whs-duties-silica/workplace-exposure-standard-respirable-crystalline-silica",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 0.05,
  },
  {
    id: "silica.exposure-standard.vic",
    domain: "silica",
    jurisdiction: "VIC",
    instrument:
      "Occupational Health and Safety Regulations 2017 (Vic), Part 4.1 and Part 4.5",
    effectiveFrom: "2020-07-01",
    requirement:
      "Victoria applies the same 0.05 mg/m3 eight-hour time-weighted average for respirable crystalline silica, but under its own instrument: Victoria is not a model WHS jurisdiction, and the duty sits in the Victorian OHS Regulations rather than the model WHS Regulations. Cite the Victorian instrument on a Victorian job even though the figure matches.",
    sourceUrl:
      "https://www.worksafe.vic.gov.au/preventing-exposure-crystalline-silica-dust",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 0.05,
  },
  {
    id: "silica.exposure-standard.nz",
    domain: "silica",
    jurisdiction: "NZ",
    instrument:
      "Health and Safety at Work Act 2015; WorkSafe New Zealand workplace exposure standards",
    effectiveFrom: "2023-11",
    requirement:
      "New Zealand's workplace exposure standard for respirable crystalline silica is 0.025 mg/m3 as an eight-hour time-weighted average -- half the Australian figure. WorkSafe reduced it from 0.05 mg/m3 in November 2023. Do not apply the Australian number on a New Zealand job. The sources reachable when this entry was written established the month but not the commencement day, so effectiveFrom carries month precision rather than a padded day; WorkSafe reissues the exposure-standard schedule periodically, so confirm the current edition before relying on this for monitoring.",
    sourceUrl:
      "https://www.worksafe.govt.nz/topic-and-industry/monitoring/workplace-exposure-standards-and-biological-exposure-indices/all-substances/view/silica-crystalline-all-forms",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 0.025,
  },
  {
    id: "silica.engineered-stone-ban.au",
    domain: "silica",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model) — engineered stone prohibition",
    effectiveFrom: "2024-07-01",
    requirement:
      "Manufacturing, supplying, processing and installing engineered stone benchtops, panels and slabs is prohibited in Australia from 1 July 2024. Engineered stone means an artificial product containing at least 1 per cent crystalline silica by weight, made by combining natural stone with resins, pigments or similar. Model jurisdictions allowed installation to continue to 31 December 2024 under contracts entered on or before 31 December 2023. Removal, repair, minor modification and disposal of stone installed before the prohibition remain permitted and are controlled work, not exempt work -- which is the case a restoration strip-out actually meets.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/hazards/silica/engineered-stone-ban",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2024-07-01",
  },
  {
    id: "silica.engineered-stone-ban.vic",
    domain: "silica",
    jurisdiction: "VIC",
    instrument: "Occupational Health and Safety Regulations 2017 (Vic)",
    effectiveFrom: "2024-07-01",
    requirement:
      "Victoria prohibits the manufacture, supply, processing and installation of engineered stone benchtops, panels and slabs from 1 July 2024 with NO transitional period: a contract entered before that date does not permit installation afterwards, unlike the model jurisdictions. Repair, minor modification, removal and disposal of legacy stone installed before the ban remain permitted.",
    sourceUrl:
      "https://www.worksafe.vic.gov.au/frequently-asked-questions-engineered-stone-ban",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2024-07-01",
  },
  {
    id: "silica.crystalline-silica-substance-regime.au",
    domain: "silica",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model), as amended by the Crystalline Silica Substance amendment 2024",
    effectiveFrom: "2024-09-01",
    requirement:
      "From 1 September 2024 duties attach to processing any crystalline silica substance -- any material containing at least 1 per cent crystalline silica by weight, not engineered stone alone. Processing must be controlled, and the business must assess the risk of the work. Where that assessment finds the processing is high risk, the business must provide information, instruction and training on the health risks and controls, and prepare a silica risk control plan. The plan is triggered by a high-risk assessment, not by every job involving a silica-containing material. For restoration this reaches cutting, grinding and drilling concrete, masonry, brick, tile, render and fibre-cement sheeting.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/media-centre/news/stronger-regulation-crystalline-silica-substances-1-september-2024",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 1,
  },
  {
    id: "silica.engineered-stone-import-ban.au",
    domain: "silica",
    jurisdiction: "AU",
    instrument:
      "Customs (Prohibited Imports) Regulations 1956 (Cth), regulation 5M",
    effectiveFrom: "2025-01-01",
    requirement:
      "Engineered stone benchtops, panels and slabs became prohibited imports into Australia on 1 January 2025. This is a customs prohibition and sits alongside the work health and safety prohibition, not in place of it.",
    sourceUrl:
      "https://www.abf.gov.au/prohibited-goods-subsite/Pages/engineered-stone.aspx",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2025-01-01",
  },
  {
    id: "silica.engineered-stone-status.nz",
    domain: "silica",
    jurisdiction: "NZ",
    instrument:
      "Health and Safety at Work Act 2015; Health and Safety at Work (General Risk and Workplace Management) Regulations 2016",
    effectiveFrom: "2016-04-04",
    requirement:
      "New Zealand has not prohibited engineered stone. It manages the risk through the lower 0.025 mg/m3 exposure standard, guidance and voluntary accreditation, and MBIE has consulted on options including a ban, so the position may change. A PCBU must eliminate or minimise exposure to respirable crystalline silica so far as is reasonably practicable and keep airborne levels below the exposure standard. This entry exists so that Australia's prohibition is never asserted on a New Zealand job: the absence of a ban is itself a claim the product can get wrong.",
    sourceUrl:
      "https://www.worksafe.govt.nz/topic-and-industry/dust/accelerated-silicosis/our-prevention-activities-with-the-engineered-stone-industry/",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
];
