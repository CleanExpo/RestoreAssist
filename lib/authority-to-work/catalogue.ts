/**
 * The Authority to Work template catalogue, A01 to A13 (RA-8468).
 *
 * These are FIELD-LEVEL DRAFTS, not signable forms. The wording each pack uses
 * is approved per jurisdiction by qualified practitioners before release; this
 * file holds only what each template is for, what it never authorises, and the
 * fields it needs. No statutory figure or threshold is written here: those stay
 * provisional until a jurisdiction pack is signed off.
 */

export type TemplateCode =
  | "A01"
  | "A02"
  | "A03"
  | "A04"
  | "A05"
  | "A06"
  | "A07"
  | "A08"
  | "A09"
  | "A10"
  | "A11"
  | "A12"
  | "A13";

export interface TemplateSpec {
  code: TemplateCode;
  name: string;
  purpose: string;
  /** Stated on the customer's preview so a signature is never read as more than it is. */
  doesNotAuthorise: string;
  /** Field keys this template needs beyond the shared supplier/site fields. */
  requiredFields: string[];
}

export const SHARED_FIELDS = [
  "supplierLegalName",
  "supplierBusinessNumber",
  "supplierGstStatus",
  "supplierContact",
  "siteAddress",
  "recipientName",
  "recipientCapacity",
] as const;

export const TEMPLATES: Record<TemplateCode, TemplateSpec> = {
  A01: {
    code: "A01",
    name: "Site access, inspection and evidence",
    purpose: "Permission to enter named areas to inspect and record evidence.",
    doesNotAuthorise: "any works or any payment",
    requiredFields: ["areas", "accessBasis"],
  },
  A02: {
    code: "A02",
    name: "Emergency make-safe work authorisation",
    purpose: "Exact non-permanent work on named assets, with a stop point.",
    doesNotAuthorise: "removal of materials, ongoing reinstatement or disposal",
    requiredFields: ["scopeLines", "amount", "emergencyBasis"],
  },
  A03: {
    code: "A03",
    name: "Owner direct-pay contract and estimate",
    purpose: "Scope, price and payment terms where the customer pays directly.",
    doesNotAuthorise: "any work outside the listed scope lines",
    requiredFields: ["scopeLines", "amount", "payer"],
  },
  A04: {
    code: "A04",
    name: "Insurer, builder or TPA approval record",
    purpose: "Records the order issuer, its authority, caps and exclusions.",
    doesNotAuthorise:
      "anything on the insurer's behalf; the owner never signs for the insurer",
    requiredFields: ["workOrderRef", "scopeLines", "amount"],
  },
  A05: {
    code: "A05",
    name: "Strata or body corporate package",
    purpose:
      "Separates common-property and lot responsibilities and approvals.",
    doesNotAuthorise: "work on assets the signer does not control",
    requiredFields: ["scopeLines", "delegationRef"],
  },
  A06: {
    code: "A06",
    name: "Tenant, landlord and agent package",
    purpose:
      "Building authority from the landlord or verified agent; tenant goods by the tenant.",
    doesNotAuthorise: "any charge to the tenant by default",
    requiredFields: ["scopeLines", "accessBasis"],
  },
  A07: {
    code: "A07",
    name: "Commercial lease and business authority",
    purpose: "Company signatory and delegation for the business's own assets.",
    doesNotAuthorise: "anything a site manager signs beyond granting access",
    requiredFields: ["scopeLines", "delegationRef"],
  },
  A08: {
    code: "A08",
    name: "Contents pack-out, storage, return and access",
    purpose: "Custody of named items, destination, duration and return.",
    doesNotAuthorise: "disposal of any item",
    requiredFields: ["scopeLines"],
  },
  A09: {
    code: "A09",
    name: "Itemised disposal or strip-out authorisation",
    purpose:
      "Separate decision for each item or material to be removed or discarded.",
    doesNotAuthorise: "safety clearance; a signature is not a safety permit",
    requiredFields: ["scopeLines"],
  },
  A10: {
    code: "A10",
    name: "Variation and approval over limit",
    purpose:
      "Changed amount, cumulative commitment and the approver for the change.",
    doesNotAuthorise: "unaffected work, which continues under its own approval",
    requiredFields: ["scopeLines", "amount", "cumulativeCommitment"],
  },
  A11: {
    code: "A11",
    name: "Payment split and authority",
    purpose:
      "Who pays which lines, and what is confirmed, pending or disputed.",
    doesNotAuthorise:
      "stored card details, automatic debit or a personal guarantee",
    requiredFields: ["scopeLines", "payer"],
  },
  A12: {
    code: "A12",
    name: "Final handover and completion acknowledgment",
    purpose: "Completed versus excluded scope, and return of goods and keys.",
    doesNotAuthorise:
      "a waiver of any statutory right or deemed insurer acceptance",
    requiredFields: ["scopeLines"],
  },
  A13: {
    code: "A13",
    name: "Limited permission to share claim documents",
    purpose: "Named recipients, data and purpose, with expiry and withdrawal.",
    doesNotAuthorise: "negotiating, lodging or settling a claim",
    requiredFields: ["recipients", "purpose"],
  },
};
