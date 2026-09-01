import type { RegulatoryEntry } from "./types";

/**
 * Electrical. The domain a water-damage job touches on day one, before any
 * drying equipment is plugged in.
 *
 * The restoration-critical rule is not in a wiring standard at all: a
 * flood-inundated installation must be inspected and tested by a licensed
 * electrical worker BEFORE supply is reconnected, and switchboard components
 * that have been under water are generally replaced rather than dried and
 * re-used. A technician who energises a dehumidifier off a wet board has not
 * made a judgement call; they have skipped a step the law does not treat as
 * optional.
 *
 * WHAT IS DELIBERATELY NOT HERE: the "80% continuous-load rule" this codebase
 * applies when sizing circuits. Three files assert it and they do not agree on
 * its authority --
 *
 *   lib/equipment-power.ts:35            "AS/NZS 3012:2019 -- continuous loads
 *                                         limited to 80% of circuit rating"
 *   lib/equipment-calculator-fire.ts:10  "AS/NZS 3012:2019 80% continuous-load rule"
 *   lib/restoration/equipment-planner.ts:17,60
 *                                        "AS/NZS 3000 continuous-load"
 *
 * -- which is the same one-fact-two-answers shape as the asbestos defect. The
 * 80%/125% continuous-load construct is characteristic of the US National
 * Electrical Code (NEC 210.19/210.20), where 80% is simply the inverse of the
 * 125% multiplier. AS/NZS 3000 sizes circuits by maximum demand and diversity
 * (Appendix C, Tables C1/C2) and the Ib <= In <= Iz inequality, which is a
 * different method, not the same rule under another name.
 *
 * So the derate may well be sound conservative engineering -- it is not the
 * NUMBER that is in doubt -- while the CITATION attached to it is unproven and
 * internally contradictory. Settling it needs the licensed text of AS/NZS 3000
 * and AS/NZS 3012, which this environment cannot reach and which is copyright
 * in any case. An entry asserting it would be exactly the kind of confident,
 * sourced, unverified claim this registry exists to stop, so it stays out until
 * someone with the standards on the desk resolves it. See the spec.
 *
 * `verification: "secondary-quoting-primary"` throughout, as elsewhere: this
 * environment cannot reach safeworkaustralia.gov.au, legislation.gov.au,
 * legislation.govt.nz, worksafe.govt.nz or standards.org.au (egress policy,
 * proxy healthy). Checked 2026-09-01 against sources quoting those regulators,
 * corroborated across more than one wherever the rule is load-bearing.
 */
export const ELECTRICAL_ENTRIES: RegulatoryEntry[] = [
  {
    id: "electrical.flood-reconnection-inspection.au",
    domain: "electrical",
    jurisdiction: "AU",
    instrument:
      "Work Health and Safety Regulations (model), Part 4.7 (Electrical safety in workplaces), with state electrical safety legislation and supply authority reconnection rules",
    effectiveFrom: "2012-01-01",
    requirement:
      "An electrical installation that has been flood-inundated or water-damaged must be inspected and tested by a licensed electrical worker before supply is reconnected. Switchboard components that have been submerged -- circuit breakers, residual current devices, relays and contactors -- are generally replaced rather than dried and re-used, because internal contamination is not visible and their protective function cannot be assumed. In New South Wales the inspection must be done by the holder of an electrical qualified supervisor certificate or an endorsed contractor licence, and is recorded on an Electrical Installation Inspection Safety Certificate. Do not energise restoration equipment from an installation in this state until that inspection has been done.",
    sourceUrl:
      "https://www.nsw.gov.au/housing-and-construction/compliance-and-regulation/electricians/electrical-standards-rules-and-notes/electrical-installation-safety-inspection-instructions-after-a-flooding-event",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "electrical.energised-work-prohibition.au",
    domain: "electrical",
    jurisdiction: "AU",
    instrument: "Work Health and Safety Regulations (model), regulation 157",
    provision: "reg 157",
    effectiveFrom: "2012-01-01",
    requirement:
      "Electrical work on energised electrical equipment is prohibited unless one of a small set of exceptions applies: it is necessary in the interests of health and safety, it is necessary for the work to be done properly, it is necessary for testing, or there is no reasonable alternative. Convenience is expressly not an exception, and a short interruption to supply is not a justification for working live. De-energise, isolate, and prove dead before touching.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/system/files/documents/1810/model-cop-managing-electrical-risks-in-the-workplace.pdf",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "electrical.rcd-protection.au",
    domain: "electrical",
    jurisdiction: "AU",
    instrument:
      "AS/NZS 3012:2019 (Amendment 1:2020), Electrical installations - Construction and demolition sites",
    effectiveFrom: "2019",
    requirement:
      "On a construction or demolition site every appliance, luminaire and item of electrical equipment must be supplied from a residual current device protected circuit, with a rated tripping current no greater than 30 mA. The RCD may sit at the switchboard, in the socket outlet, or in a portable socket-outlet assembly. A restoration strip-out is this kind of site: drying and extraction equipment running off site power falls inside the scope, not outside it. effectiveFrom carries year precision: the publication day was not established from the sources reachable here.",
    sourceUrl: "https://store.standards.org.au/product/as-nzs-3012-2019",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: 30,
  },
  {
    id: "electrical.in-service-testing.au",
    domain: "electrical",
    jurisdiction: "AU",
    instrument:
      "AS/NZS 3760:2022, In-service safety inspection and testing of electrical equipment and RCDs",
    effectiveFrom: "2022-06",
    requirement:
      "Cord-and-plug connected equipment -- portable appliances, power tools, extension leads, power boards and portable RCDs -- is subject to in-service visual inspection and testing, covering earth continuity, insulation resistance and polarity. Fixed installations are outside this standard's scope. There is no single legislated interval: the frequency depends on the operating environment, the equipment type and how likely it is to be damaged in normal use, so a fixed number must not be presented as the requirement. AS/NZS 3760:2022 was published in June 2022 and superseded the 2010 edition; a citation of the 2010 edition is out of date.",
    sourceUrl:
      "https://www.standards.org.au/blog/spotlight-on-in-service-safety-inspection-and-testing-of-electrical-equipment-and-rcds",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2022",
  },
  {
    id: "electrical.wiring-rules.au",
    domain: "electrical",
    jurisdiction: "AU",
    instrument:
      "AS/NZS 3000:2018, Electrical installations (Australian/New Zealand Wiring Rules)",
    effectiveFrom: "2018",
    requirement:
      "The current Wiring Rules are the sixth edition, AS/NZS 3000:2018, incorporating Amendment 1 (2020), Amendment 2 (2021), Amendment 3 (2023, mainly switchboard and switchgear clauses) and Ruling 1 (2024). Cite the edition with its amendment state rather than a bare year. This entry records currency only: the standard's text is copyright and must not be reproduced in RestoreAssist output.",
    sourceUrl: "https://www.standards.org.au/flagship-projects/wiring-rules",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2018",
  },
  {
    id: "electrical.prescribed-work-certification.nz",
    domain: "electrical",
    jurisdiction: "NZ",
    instrument: "Electricity (Safety) Regulations 2010 (SR 2010/36), regulation 65",
    provision: "reg 65",
    effectiveFrom: "2010-04-01",
    requirement:
      "A certificate of compliance must be issued for all general-risk and high-risk prescribed electrical work, and high-risk work additionally requires a record of inspection before it can be treated as complete. Low-risk work may be certified but is not required to be. Where an installation was disconnected while the work was done, the work is not complete until the installation is reconnected to supply -- which is the situation a flood or fire restoration reconnection is in. New Zealand has no separate flood-reconnection instrument: this is the mechanism that governs it.",
    sourceUrl:
      "https://www.legislation.govt.nz/regulation/public/2010/0036/latest/DLM2763697.html",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
  },
  {
    id: "electrical.wiring-rules.nz",
    domain: "electrical",
    jurisdiction: "NZ",
    instrument:
      "AS/NZS 3000:2018, applied through the Electricity (Safety) Regulations 2010",
    effectiveFrom: "2010-04-01",
    requirement:
      "New Zealand applies the same AS/NZS 3000 Wiring Rules as Australia, but through a different legal route: compliance is required via the Electricity (Safety) Regulations 2010 and certified by a licensed electrical worker registered with the Electrical Workers Registration Board, not through work health and safety regulations. Cite the New Zealand hook on a New Zealand job even though the wiring standard is shared.",
    sourceUrl:
      "https://www.worksafe.govt.nz/laws-and-regulations/regulations/electrical-regulations/electricity-safety-regulations-2010/",
    verifiedAt: "2026-09-01",
    verification: "secondary-quoting-primary",
    value: "2018",
  },
];
