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
import { regulation } from "@/lib/compliance/regulatory-registry";

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
