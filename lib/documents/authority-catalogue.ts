/**
 * The authority-document catalogue.
 *
 * WHY THIS FILE EXISTS. The five authority templates were defined as JSON
 * blobs inside prisma/seed-authority-forms.ts, each carrying one free-text
 * `authorityDescription` box and nothing else. So "Authority for Chemical
 * Treatment" -- a document in which a client consents to an antimicrobial being
 * applied to their home -- had no regulatory grounding at all: whatever the
 * technician typed became the authority. That is the same shape as the defect
 * that let "pre-1990" live in nine files, one layer out: a rule stated in prose
 * is indistinguishable from a rule that was checked.
 *
 * THE RULE (spec 9.3): a document template may only cite a regulation by
 * REGISTRY ENTRY ID. It may never restate the rule in its own prose. The
 * requirement text, instrument, source and verification date are resolved from
 * lib/compliance/regulatory-registry at render time, so a document cannot drift
 * from the registry and the registry's staleness gate covers the document too.
 *
 * `scripts/check-regulatory-registry.ts` enforces it: a template whose prose
 * carries a regulatory keyword without a citation fails the build, and a
 * citation naming an id the registry does not hold fails the build.
 *
 * This module is the single source of truth. prisma/seed-authority-forms.ts
 * imports it rather than holding a second copy -- the two used to be one file,
 * which meant the only definition lived in a script nothing type-checked
 * against the registry.
 */
import {
  regulation,
  REGULATORY_ENTRIES,
  type RegulatoryDomain,
  type RegulatoryEntry,
  type RegulatoryJurisdiction,
} from "@/lib/compliance/regulatory-registry";
import {
  applicableStandard,
  STANDARDS_VERSIONS,
  type StandardKey,
  type StandardsJurisdiction,
} from "@/lib/nir-standards-mapping";

/** Roles the existing AuthoritySignatoryRole enum accepts. */
export type SignatoryRole =
  | "CLIENT"
  | "INSURER"
  | "CONTRACTOR"
  | "ADMIN"
  | "TECHNICIAN"
  | "MANAGER"
  | "PROPERTY_OWNER";

export interface TemplateField {
  id: string;
  type: "textarea" | "text" | "date" | "checkbox";
  label: string;
  required: boolean;
  /** Shown under the field. Our words -- never an instrument's. */
  help?: string;
}

/**
 * A rule cited by WHICH RULE IT IS, leaving the country to be chosen per job.
 *
 * WHY THIS EXISTS ALONGSIDE `citesRegulations`. An exact id names one country's
 * rule. That is right for a duty only one country has -- the APVMA registration
 * cited by AUTH_CHEMICAL has no verified New Zealand counterpart, so naming the
 * Australian id and letting the provenance block mark it foreign is honest.
 *
 * It is WRONG for a duty both countries have. Asbestos and silica are the
 * obvious cases: citing both `asbestos.presumption-year.au` and `.nz` renders
 * both, and the foreign-entry notice then tells an Australian reader
 * "RestoreAssist holds no verified Australian equivalent" while the Australian
 * entry sits directly above it. A true statement about a single-country duty
 * becomes a false one the moment the other country's entry is in the same
 * block, and the reader has no way to tell which sentence to believe.
 *
 * So a family resolves to ONE entry, chosen for the job, through
 * `regulationFor()` -- which also gives a state job its state entry and falls
 * back to the national one, and which never hands a New Zealand job an
 * Australian rule.
 */
export interface RegulationFamily {
  domain: RegulatoryDomain;
  /**
   * Identifies the rule within its domain, matched against the entry id's rule
   * segment, e.g. "presumption-year" for asbestos.presumption-year.au / .nz.
   *
   * SEVERAL SEGMENTS MEAN "these are answers to the same question". New South
   * Wales requires an asbestos register and Queensland exempts a class of
   * premises from one; the ids therefore differ in the rule segment, but a job
   * has one asbestos-register position, not two.
   *
   * Citing them as separate families was wrong in a way that reached the page:
   * a New South Wales document reported "no verified Australian entry for
   * asbestos.register-exemption", which reads as a gap in our coverage when it
   * is simply Queensland's rule not applying in New South Wales. One family
   * resolves to whichever applies, and reports nothing missing when one does.
   */
  rule: string | string[];
}

/** The rule segments a family covers, normalised. */
export function familyRules(family: RegulationFamily): string[] {
  return Array.isArray(family.rule) ? family.rule : [family.rule];
}

/**
 * An IICRC standard cited by a document.
 *
 * A SECOND SSOT, AND A SECOND JURISDICTION PROBLEM. The regulatory registry does
 * not hold IICRC standards -- they are licensed, copyrighted documents, and
 * `lib/standards/copyright-guard.ts` exists because of it. They live in
 * `lib/nir-standards-mapping.ts`, and which one GOVERNS depends on the country
 * exactly as a regulation does:
 *
 *   - On an Australian job the governing document is the Standards Australia
 *     adoption, `AS-IICRC S500:2025`. It is a MODIFIED adoption whose Australian
 *     changes sit in Appendix ZZ, so citing the ANSI original does not merely
 *     lose precision -- it omits requirements.
 *   - New Zealand has no adoption, so the ANSI publication governs there.
 *
 * The two also carry DIFFERENT YEARS: `AS-IICRC S500:2025` adopts
 * `ANSI/IICRC S500:2021`. A designation typed into a template would be wrong for
 * one country and carry the wrong year for the other. `applicableStandard()`
 * resolves both from the job, which is why this stores a KEY and never a string.
 */
export interface StandardCitation {
  standard: StandardKey;
  /**
   * A clause, where one has been established. Deliberately unused by the
   * templates here: `standardCite()` numbers clauses against the ANSI edition,
   * and the Australian adoption renumbers nothing but adds Appendix ZZ, so a
   * clause cited on an Australian job would point into the document the job is
   * not governed by. Cite the standard, not a clause, until that is resolved.
   */
  section?: string;
}

export interface AuthorityTemplateSpec {
  code: string;
  name: string;
  description: string;
  fields: TemplateField[];
  defaultSignatories: SignatoryRole[];
  /**
   * Registry entry ids whose requirement renders into this document's
   * provenance block.
   *
   * Ids only. Never the rule's wording: the whole point is that the document
   * and the registry cannot disagree, and prose copied out of an entry is a
   * copy that stops tracking its source the moment the entry is re-verified.
   */
  citesRegulations: string[];
  /**
   * Rules cited by family, resolved to the job's country at render time.
   *
   * Optional: the five original templates predate it and cite exact ids or
   * nothing. Prefer this form for any duty both countries carry.
   */
  citesRegulationFamilies?: RegulationFamily[];
  /**
   * IICRC standards this document says the works were performed under.
   *
   * Separate from the two registry forms because it is a separate source of
   * truth with its own licence conditions, not because it is less important.
   */
  citesStandards?: StandardCitation[];
  isActive: boolean;
}

export const AUTHORITY_TEMPLATES: AuthorityTemplateSpec[] = [
  {
    code: "AUTH_COMMENCE",
    name: "Authority to Commence Work",
    description:
      "Authorisation for the restoration company to commence work on the property",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT"],
    // No regulatory citation, deliberately: commencing work is a matter of
    // contract and consent, not a duty the registry holds. An empty list here
    // is an answer, not an omission waiting to be filled.
    citesRegulations: [],
    isActive: true,
  },
  {
    code: "AUTH_DISPOSE",
    name: "Authority to Dispose",
    description:
      "Authorisation to dispose of contaminated or damaged materials",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT", "INSURER"],
    // Deliberately empty. Disposal of ASBESTOS or crystalline silica waste is
    // regulated, but this template is generic and most disposals engage no
    // registry duty. Citing an asbestos rule on every disposal would put a
    // hazard notice on jobs that have none, which trains people to ignore it.
    // The hazard-specific authority carries the hazard-specific citation.
    citesRegulations: [],
    isActive: true,
  },
  {
    code: "AUTH_NO_REMOVE",
    name: "Authority to Not Remove Recommended Damaged Building Materials",
    description:
      "Client authorisation to not remove damaged building materials that were recommended for removal",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT"],
    citesRegulations: [],
    isActive: true,
  },
  {
    code: "AUTH_CHEMICAL",
    name: "Authority for Chemical Treatment",
    description:
      "Authorisation to apply an antimicrobial or chemical treatment at the property",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
      {
        id: "productName",
        type: "text",
        label: "Product name",
        required: true,
        help: "The product as labelled, not the chemical family.",
      },
      {
        id: "productRegistrationNumber",
        type: "text",
        label: "Registration or permit number",
        required: true,
        help: "Record the number shown on the product label or permit. If the product carries none, do not apply it.",
      },
    ],
    defaultSignatories: ["CLIENT"],
    // The reason this template exists at all. A client consenting to a chemical
    // being applied to their home is entitled to know the product is one that
    // may lawfully be applied -- and the two new fields make that recordable
    // rather than assumed.
    citesRegulations: ["chemicals.antimicrobial-registration.au"],
    isActive: true,
  },
  {
    code: "AUTH_EXTENDED_DRYING",
    name: "Authority for Extended Drying Period",
    description:
      "Authorisation for a drying period extending beyond the standard timeline",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT"],
    citesRegulations: [],
    isActive: true,
  },
  {
    // Spec 9.3. The document a job needs BEFORE anyone disturbs material in a
    // building old enough to be presumed to contain asbestos.
    //
    // Note what is deliberately absent from every string below: a year. The
    // presumption year differs by country (and the registry holds both), and a
    // year typed here would be a fourth copy of the value that already caused
    // this repository to report a 1995 building as asbestos-free. The gate
    // rejects a year threshold in template prose for exactly that reason; the
    // year reaches the page through the resolved registry entry at render time.
    code: "AUTH_ASBESTOS_ASSESSMENT",
    name: "Asbestos Assessment Authority",
    description:
      "Records how asbestos was established for the property before work begins, and authorises the approach taken",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Authority Description",
        required: true,
      },
      {
        id: "buildingYearBuilt",
        type: "text",
        label: "Year the building was constructed",
        required: true,
        help: "As recorded on the title, a council record or the owner's advice. Record where it came from. If nobody knows, write 'not established' — an estimate here decides whether the material is presumed to contain asbestos, and a guess is indistinguishable from a record once it is on the page.",
      },
      {
        id: "assessmentBasis",
        type: "text",
        label: "Basis for the asbestos position",
        required: true,
        help: "One of: a licensed assessor's report, an existing asbestos register for the site, or presumption from the building's age. Name which.",
      },
      {
        id: "assessmentReference",
        type: "text",
        label: "Assessor or register reference",
        required: false,
        help: "The report or register number, and the assessor's name and licence. Leave blank only where the basis is presumption.",
      },
      {
        id: "assessmentDate",
        type: "date",
        label: "Date of assessment or register entry",
        required: false,
      },
      {
        id: "presumedMaterials",
        type: "textarea",
        label: "Materials being treated as asbestos-containing",
        required: true,
        help: "List them by location. A material that cannot be tested is treated as asbestos, so it belongs on this list rather than off it.",
      },
      {
        id: "clientAdvisedNoDisturbance",
        type: "checkbox",
        label:
          "The client has been advised not to disturb the materials listed above before work begins",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT", "CONTRACTOR"],
    citesRegulations: [],
    // Both countries carry a presumption duty, so it is cited by family and the
    // job's country picks the entry. The register rules are cited separately
    // because NSW's requirement and Queensland's exemption are DIFFERENT rules,
    // not one rule with two spellings: a job in either state gets its own, and
    // a job elsewhere correctly gets neither rather than a neighbour's.
    citesRegulationFamilies: [
      { domain: "asbestos", rule: "presumption-year" },
      // ONE family, not two. New South Wales requires a register and Queensland
      // exempts a class of premises from one -- two answers to a single
      // question, so a job resolves whichever applies and reports nothing
      // missing. A state with neither (Victoria has a register duty the
      // registry has not seeded) still reports the family unresolved, which is
      // the case the notice is actually for.
      { domain: "asbestos", rule: ["register-requirement", "register-exemption"] },
    ],
    isActive: true,
  },
  {
    // Spec 9.3. Restoration cuts, grinds and drills concrete, masonry, render
    // and tile far more often than it touches a benchtop, so this plan is built
    // around the exposure standard and the substance regime rather than the
    // engineered-stone prohibition. The prohibition is a different workflow with
    // a different document, and Australia and New Zealand name their positions
    // differently enough (a ban here, an explicit absence of one there) that
    // citing it by family would resolve to nothing on a New Zealand job and say
    // less than the registry actually holds. It is not cited here rather than
    // cited badly.
    code: "SILICA_CONTROL_PLAN",
    name: "Silica Risk Control Plan",
    description:
      "Records the crystalline silica exposure expected from the planned work and the controls that will be in place before it starts",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Scope of work generating dust",
        required: true,
      },
      {
        id: "materialsWorked",
        type: "textarea",
        label: "Materials to be cut, ground, drilled or demolished",
        required: true,
        help: "Concrete, masonry, render, screed, tile, fibre cement, mortar. Name each and where it is.",
      },
      {
        id: "tasksAndDuration",
        type: "textarea",
        label: "Tasks and how long each will run",
        required: true,
        help: "Duration drives exposure as much as the tool does, so record it rather than the task alone.",
      },
      {
        id: "engineeringControls",
        type: "textarea",
        label: "Controls applied at the source",
        required: true,
        help: "Water suppression, on-tool extraction with the class of unit, enclosure. These come before respiratory protection, not instead of it.",
      },
      {
        id: "respiratoryProtection",
        type: "text",
        label: "Respiratory protection and fit-test reference",
        required: true,
        help: "The class of respirator and the date each wearer was fit-tested. An untested respirator is recorded as untested.",
      },
      {
        id: "airMonitoringReference",
        type: "text",
        label: "Air monitoring reference",
        required: false,
        help: "Where monitoring has been done for comparable work, cite it. Leave blank where none has been.",
      },
      {
        id: "exclusionZone",
        type: "textarea",
        label: "Exclusion zone and who else is on site",
        required: true,
        help: "Include occupants and other trades. Their exposure counts.",
      },
    ],
    defaultSignatories: ["CONTRACTOR", "TECHNICIAN"],
    // Australia-only, and cited by exact id for that reason: New Zealand has no
    // verified counterpart in the registry, so the provenance block marks it
    // foreign and says the New Zealand position is not held. That is the honest
    // shape for a single-country duty, and the reason both citation forms exist.
    citesRegulations: ["silica.crystalline-silica-substance-regime.au"],
    citesRegulationFamilies: [{ domain: "silica", rule: "exposure-standard" }],
    isActive: true,
  },
  {
    // Spec 9.3, "Registry dependency: multiple". This is the document that names
    // the hazards actually present, to the people who will be standing in them.
    //
    // Every hazard is cited BY FAMILY, including the ones with no New Zealand
    // entry seeded. That is deliberate and it is the distinction between the two
    // registry citation forms:
    //
    //   - An exact id says "this duty exists in one country". AUTH_CHEMICAL's
    //     APVMA registration is genuinely Australian; New Zealand regulates
    //     those products under HSNO through a different regulator entirely.
    //   - A family that resolves to nothing says "no verified entry is held for
    //     this country". RCD protection is not an Australian peculiarity -- New
    //     Zealand plainly requires residual current devices too; the registry
    //     simply has not seeded the New Zealand rule yet.
    //
    // Citing RCD protection by exact id would print an Australian regulation on
    // a New Zealand induction under a notice reading "no verified New Zealand
    // equivalent" -- which a reader could fairly take as "New Zealand has no RCD
    // duty". On an induction record that is a dangerous sentence, so the family
    // form is used and the document says an entry is missing instead.
    code: "WHS_SITE_INDUCTION",
    name: "WHS Site Induction Record",
    description:
      "Records that each person attending the site has been briefed on the hazards present, the controls in place and the emergency arrangements",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Site and works being inducted for",
        required: true,
      },
      {
        id: "hazardsPresent",
        type: "textarea",
        label: "Hazards identified on this site",
        required: true,
        help: "Name each one and where it is. Asbestos, lead paint, silica dust, electrical, confined space, biological contamination, working at height. A hazard nobody wrote down is a hazard nobody was inducted on.",
      },
      {
        id: "controlsInPlace",
        type: "textarea",
        label: "Controls in place before entry",
        required: true,
        help: "Exclusion zones, isolation and lock-out, extraction, decontamination. Say which are already in place and which are still to be established.",
      },
      {
        id: "temporaryPowerArrangements",
        type: "text",
        label: "Temporary power and residual current protection",
        required: true,
        help: "How site equipment is supplied, and how it is protected. Record the test date of the protective device rather than only its presence.",
      },
      {
        id: "ppeRequired",
        type: "textarea",
        label: "Personal protective equipment required",
        required: true,
        help: "Including respiratory protection class and whose fit-tests are current. PPE is the last control, not the first.",
      },
      {
        id: "chemicalsOnSite",
        type: "textarea",
        label: "Chemicals on site and where the safety data sheets are",
        required: false,
        help: "Leave blank only if no chemical will be brought onto or used at the site.",
      },
      {
        id: "emergencyArrangements",
        type: "textarea",
        label: "Emergency arrangements",
        required: true,
        help: "First aid, assembly point, nearest hospital, and who to call. Include the site address as it would be given to an ambulance.",
      },
      {
        id: "inducteeQuestionsRaised",
        type: "textarea",
        label: "Questions or concerns raised during induction",
        required: false,
        help: "Record them even where they were resolved on the spot. An induction with no questions ever recorded is an induction nobody is reading back.",
      },
      {
        id: "inductionDate",
        type: "date",
        label: "Date of induction",
        required: true,
      },
    ],
    defaultSignatories: ["TECHNICIAN", "CONTRACTOR", "MANAGER"],
    citesRegulations: [],
    citesRegulationFamilies: [
      { domain: "asbestos", rule: "presumption-year" },
      { domain: "lead", rule: "presumption-year" },
      { domain: "silica", rule: "exposure-standard" },
      { domain: "electrical", rule: "rcd-protection" },
      { domain: "chemicals", rule: "sds-and-register" },
    ],
    isActive: true,
  },
  {
    // Spec 9.3, "S500/S520 via standardCite()".
    //
    // The designation is resolved per job, never typed. On an Australian job the
    // governing document is AS-IICRC S500:2025; on a New Zealand job it is
    // ANSI/IICRC S500-2021, which the Australian one adopts. Four years apart,
    // and a certificate is exactly the document someone later reads to decide
    // whether the works met the standard in force.
    //
    // No clause is cited. `standardCite()` numbers against the ANSI edition, and
    // an Australian job is not governed by that document -- a clause reference
    // would point into the wrong publication. The standard is named; the clause
    // waits until the adoption's numbering has been established.
    //
    // S520 is cited alongside S500 because a restoration job may include mould
    // remediation, and the field below records whether it did. Both standards
    // are named and the field says which applied, rather than the document
    // asserting a remediation standard for a job that never involved mould.
    code: "CERT_COMPLETION",
    name: "Certificate of Completion",
    description:
      "Certifies that the restoration works are complete, and records the drying and clearance evidence they were completed against",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "Works completed",
        required: true,
      },
      {
        id: "dryingGoalBasis",
        type: "textarea",
        label: "Drying goal and how it was established",
        required: true,
        help: "The target and where it came from -- an unaffected reference area, the material's own dry standard, or a documented alternative. A goal with no basis cannot be shown to have been met.",
      },
      {
        id: "finalMoistureReadings",
        type: "textarea",
        label: "Final readings against that goal",
        required: true,
        help: "By location and material, with the instrument used. Record any location that did not reach the goal and what was agreed about it.",
      },
      {
        id: "mouldRemediationIncluded",
        type: "checkbox",
        label: "Mould remediation formed part of these works",
        required: false,
      },
      {
        id: "clearanceEvidence",
        type: "text",
        label: "Clearance evidence reference",
        required: false,
        help: "The post-remediation verification or clearance report, and who issued it. Required where mould remediation was performed; leave blank otherwise.",
      },
      {
        id: "outstandingItems",
        type: "textarea",
        label: "Items not completed, and why",
        required: false,
        help: "Write them here rather than leaving the certificate silent. A certificate that omits an outstanding item reads as though there were none.",
      },
      {
        id: "completionDate",
        type: "date",
        label: "Date works were completed",
        required: true,
      },
    ],
    defaultSignatories: ["CLIENT", "CONTRACTOR"],
    citesRegulations: [],
    citesStandards: [{ standard: "S500" }, { standard: "S520" }],
    isActive: true,
  },
  {
    // Spec 9.3, and the last of the eight. It was blocked for weeks because the
    // registry held no notification duty to cite, and the rule that makes this
    // system safe is that a template may cite a registry id and never restate a
    // rule in its own prose. The duties are now seeded from primary sources in
    // lib/compliance/regulatory-registry/whs.ts.
    //
    // THIS ONE RECORDS; IT DOES NOT AUTHORISE. Every other template here is a
    // consent -- a client permitting something to happen. Nobody authorises an
    // incident. It sits in this catalogue because the underlying model is a
    // template that generates an instance against a job and collects
    // signatures, which is exactly what an incident record needs, and a parallel
    // system for one document would be worse. Do not "fix" the naming by adding
    // a client signatory.
    //
    // THE FIELD THAT MATTERS MOST is "when the business became aware". Both
    // countries run the notification duty from that moment, not from the
    // incident, not from the inspection. Getting it recorded at the time is the
    // difference between demonstrating compliance and arguing about it later.
    code: "NOTIFIABLE_INCIDENT_RECORD",
    name: "Notifiable Incident Record",
    description:
      "Records a notifiable incident, when the business became aware of it, how the regulator was notified, and what was done to preserve the site",
    fields: [
      {
        id: "authorityDescription",
        type: "textarea",
        label: "What happened",
        required: true,
        help: "Plain facts in the order they occurred. What the person was doing, what failed, what the outcome was. Not an assessment of fault.",
      },
      {
        id: "incidentDateTime",
        type: "text",
        label: "Date and time the incident happened",
        required: true,
        help: "As precisely as it is known. If the time is uncertain, say so rather than estimating a figure that will later be read as exact.",
      },
      {
        id: "becameAwareDateTime",
        type: "text",
        label: "Date and time the business became aware",
        required: true,
        help: "This is the moment the duty to notify starts running, and it is often later than the incident itself. In general the business becomes aware once any supervisor or manager knows. Record it even where it is the same as the incident time.",
      },
      {
        id: "incidentCategory",
        type: "text",
        label: "Category",
        required: true,
        help: "Death, serious injury or illness, or dangerous incident. Where it is not clear which, record what is known and ask the regulator rather than deciding alone.",
      },
      {
        id: "personsInvolved",
        type: "textarea",
        label: "People involved and their role",
        required: true,
        help: "Worker, contractor, occupant or member of the public. The duty covers all of them, not only employees.",
      },
      {
        id: "regulatorNotified",
        type: "text",
        label: "Regulator notified, and by whom",
        required: true,
        help: "Name the regulator and the person who made the call. The regulator for the job's jurisdiction is shown in the regulatory basis below.",
      },
      {
        id: "notificationDateTimeAndMethod",
        type: "text",
        label: "When and how the regulator was notified",
        required: true,
        help: "Telephone, online form, or both, with the time. Emergency services attending is not notification.",
      },
      {
        id: "notificationReference",
        type: "text",
        label: "Regulator reference number",
        required: false,
        help: "Where one was issued. Leave blank if the regulator gave none.",
      },
      {
        id: "sitePreservation",
        type: "textarea",
        label: "What was preserved, and what was disturbed",
        required: true,
        help: "Record anything moved and why. Helping an injured person, removing a deceased person, making the site safe and assisting police are all permitted -- but they are only defensible if written down at the time.",
      },
      {
        id: "regulatorAttendance",
        type: "text",
        label: "Has an inspector attended or given a direction",
        required: false,
        help: "Including any non-disturbance notice and the period it covers.",
      },
    ],
    defaultSignatories: ["MANAGER", "CONTRACTOR"],
    citesRegulations: [],
    // Both duties, both by family, so a New Zealand job is governed by the HSWA
    // and an Australian job by the model WHS Act. On a document with a statutory
    // clock attached, serving the wrong country's rule is the worst outcome the
    // provenance block exists to prevent.
    citesRegulationFamilies: [
      { domain: "whs", rule: "notifiable-incident-duty" },
      { domain: "whs", rule: "incident-site-preservation" },
    ],
    isActive: true,
  },
];

/**
 * Hazards a consent document may name.
 *
 * Lives here rather than in the gate script so it has ONE home and can be
 * asserted by tests. `scripts/check-regulatory-registry.ts` rule 5 imports it.
 *
 * Deliberately broader than the gate's REGULATORY_KEYWORD, which exists to spot
 * a year threshold beside a hazard in CODE and carries a 68-line baseline that
 * widening would churn. A document a client signs is held to a higher bar than
 * a comment.
 *
 * WHY IT EXISTS. Rule 5 was written to protect AUTH_CHEMICAL -- the form in
 * which a client consents to an antimicrobial being applied to their home --
 * and the gate's keyword list matched NONE of that template's prose, because
 * "antimicrobial" and "chemical" were not on it. The guard could not have fired
 * for the one document it was built for. The sabotage that "proved" rule 5 used
 * AUTH_DISPOSE with the word "asbestos", already on the list: it proved the
 * guard works for an easy case, not the hard one. CodeRabbit caught it on
 * #2158, after that PR had merged. Spec 11 names asbestos, silica, RCD, GHS and
 * notifiable; the chemical terms come from the template that exposed the gap.
 */
export const TEMPLATE_HAZARD_KEYWORD =
  /\b(asbestos|acm|silica|crystalline|engineered stone|lead paint|blood[- ]lead|ghs|rcd|notifiable|antimicrobial|biocide|disinfectant|fungicide|pesticide|chemical)\b/i;

/** The prose a template renders to the person signing it. */
export function templateProse(spec: AuthorityTemplateSpec): string {
  return [
    spec.name,
    spec.description,
    ...spec.fields.flatMap((f) => [f.label, f.help ?? ""]),
  ].join(" \n ");
}

/** The JSON shape AuthorityFormTemplate.formContent has always held. */
export function formContentFor(spec: AuthorityTemplateSpec): string {
  return JSON.stringify({
    fields: spec.fields,
    defaultSignatories: spec.defaultSignatories,
    citesRegulations: spec.citesRegulations,
    // Omitted entirely when absent, so the five templates already seeded in
    // live databases keep their exact stored JSON and do not churn on reseed.
    ...(spec.citesRegulationFamilies?.length
      ? { citesRegulationFamilies: spec.citesRegulationFamilies }
      : {}),
    // Omitting this was a real defect, caught by its own test: the spec carried
    // the standards in memory while the SEEDED ROW carried none -- and the row
    // is what renders the document. It would have shipped as a certificate that
    // named no standard at all, on every environment that had been seeded.
    ...(spec.citesStandards?.length ? { citesStandards: spec.citesStandards } : {}),
  });
}

export interface CitedRegulation {
  id: string;
  instrument: string;
  provision?: string;
  requirement: string;
  sourceUrl: string;
  verifiedAt: string;
  verification: string;
}

/**
 * Resolve a template's citations into the provenance block a document renders.
 *
 * Throws through `regulation()` on an unknown id rather than rendering a blank
 * where the law goes. The build gate catches this first; this is the runtime
 * backstop, and the reason a template stores an id instead of prose.
 */
export function citedRegulations(spec: AuthorityTemplateSpec): CitedRegulation[] {
  return spec.citesRegulations.map((id) => {
    const e = regulation(id);
    return {
      id: e.id,
      instrument: e.instrument,
      provision: e.provision,
      requirement: e.requirement,
      sourceUrl: e.sourceUrl,
      verifiedAt: e.verifiedAt,
      verification: e.verification,
    };
  });
}

export function authorityTemplate(code: string): AuthorityTemplateSpec {
  const spec = AUTHORITY_TEMPLATES.find((t) => t.code === code);
  if (!spec) {
    throw new Error(
      `Unknown authority template "${code}". Add it to lib/documents/authority-catalogue.ts.`,
    );
  }
  return spec;
}

/**
 * Every entry a family could resolve to, in any jurisdiction.
 *
 * Matches the id's RULE SEGMENT EXACTLY rather than by substring. Ids are
 * `domain.rule.jurisdiction`, and substring matching silently over-matches:
 * "engineered-stone" also catches `engineered-stone-import-ban.au`, so a plan
 * citing the workplace prohibition could render the customs one instead
 * depending only on array order. An id that resolves by accident of ordering is
 * the same class of defect as a padded date -- it looks deliberate and is not.
 *
 * The build gate uses this: a family matching nothing is a typo that would
 * otherwise surface as a document silently missing its regulatory basis, which
 * is the failure a citation-by-id was introduced to remove.
 */
export function familyCandidates(family: RegulationFamily): RegulatoryEntry[] {
  const rules = familyRules(family);
  return REGULATORY_ENTRIES.filter((e) => {
    if (e.domain !== family.domain || e.supersededBy) return false;
    const parts = e.id.split(".");
    return parts.length === 3 && rules.includes(parts[1]);
  });
}

/**
 * The one entry a family resolves to for a job, or undefined.
 *
 * Undefined has two distinct causes and the caller must tell them apart,
 * because they are different sentences on the document:
 *
 *   - `jurisdiction` is null. Nobody recorded the job's country, so no rule can
 *     be chosen. Guessing here would always guess Australia and would therefore
 *     always look right -- see lib/documents/job-jurisdiction.ts.
 *   - No entry exists for that country.
 *
 * The jurisdiction rules mirror `regulationFor()` deliberately: a state job
 * takes its state entry and otherwise falls back to the national Australian
 * one, and NEW ZEALAND NEVER FALLS BACK. Silence is safer than another
 * country's law. This resolves from `familyCandidates()` rather than calling
 * `regulationFor()` so the gate and the renderer cannot disagree about which
 * entries a family covers -- they read the same list.
 */
export function resolveFamily(
  family: RegulationFamily,
  jurisdiction: RegulatoryJurisdiction | null,
): RegulatoryEntry | undefined {
  if (jurisdiction === null) return undefined;
  const candidates = familyCandidates(family);
  const exact = candidates.find((e) => e.jurisdiction === jurisdiction);
  if (exact) return exact;
  if (jurisdiction === "NZ") return undefined;
  return candidates.find((e) => e.jurisdiction === "AU");
}

/** How a template describes a family in prose and in error messages. */
export function familyLabel(family: RegulationFamily): string {
  return `${family.domain}.${familyRules(family).join("/")}`;
}

/**
 * Does this template cite anything at all, by either form?
 *
 * The gate's hazard-keyword rule asks this question. Asking it of
 * `citesRegulations` alone would leave a family-only template unguarded --
 * exactly the hole CodeRabbit found on #2158, one form of citation later.
 */
export function citesAnything(spec: AuthorityTemplateSpec): boolean {
  return (
    spec.citesRegulations.length > 0 ||
    (spec.citesRegulationFamilies?.length ?? 0) > 0 ||
    (spec.citesStandards?.length ?? 0) > 0
  );
}

export interface ResolvedStandard {
  standard: StandardKey;
  /** What governs THIS job: the AS adoption in Australia, else the ANSI one. */
  designation: string;
  /** True when the Australian adoption is what governs, rather than the ANSI. */
  isAustralianAdoption: boolean;
}

/**
 * Resolve a template's standards for a job, or report that it cannot.
 *
 * `null` jurisdiction returns an EMPTY list rather than defaulting to Australia.
 * Defaulting would pick `AS-IICRC S500:2025` for every job whose country nobody
 * recorded, and on a New Zealand job that names a document which does not govern
 * it -- the same failure the registry side refuses to make, in the SSOT where the
 * two designations differ by four years.
 */
export function citedStandards(
  spec: AuthorityTemplateSpec,
  jurisdiction: StandardsJurisdiction | null,
): ResolvedStandard[] {
  if (jurisdiction === null) return [];
  return (spec.citesStandards ?? []).map((c) => {
    const designation = applicableStandard(c.standard, jurisdiction);
    return {
      standard: c.standard,
      designation,
      isAustralianAdoption:
        designation !== STANDARDS_VERSIONS[c.standard].designation,
    };
  });
}

/**
 * A designation or an edition year written into a template's own prose.
 *
 * The standards analogue of the gate's year-threshold rule. `AS-IICRC S500:2025`
 * typed into a field label is wrong on every New Zealand job and goes stale on
 * the next adoption, and nothing would catch either.
 */
export const STANDARD_DESIGNATION_IN_PROSE =
  /\b(?:ANSI\/IICRC|AS-IICRC|AS\/NZS-IICRC)\b|\bS(?:100|500|520|540|700)\s*[:-]\s*\d{4}\b/i;
