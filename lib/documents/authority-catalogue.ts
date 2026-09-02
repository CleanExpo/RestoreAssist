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
   * Identifies the rule within its domain, matched against the entry id, e.g.
   * "presumption-year" for asbestos.presumption-year.au / .nz.
   */
  rule: string;
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
      { domain: "asbestos", rule: "register-requirement" },
      { domain: "asbestos", rule: "register-exemption" },
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
  return REGULATORY_ENTRIES.filter((e) => {
    if (e.domain !== family.domain || e.supersededBy) return false;
    const parts = e.id.split(".");
    return parts.length === 3 && parts[1] === family.rule;
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
  return `${family.domain}.${family.rule}`;
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
    (spec.citesRegulationFamilies?.length ?? 0) > 0
  );
}
