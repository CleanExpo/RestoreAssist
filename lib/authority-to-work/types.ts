/**
 * Authority to Work and Payment Approval -- job model (RA-8468, slice 1).
 *
 * WHY THIS EXISTS. The existing authority forms (lib/documents/authority-catalogue.ts)
 * hang off a report and know one signer role at a time. Nothing records WHO
 * CONTROLS EACH ASSET, who is commissioning a given scope line, or who is
 * actually paying for it. So "the client signed" was the only question the CRM
 * could ask, and a strata owners corporation, a lot owner and a tenant were all
 * "the client".
 *
 * This model keeps six things separate on every scope line: access, work
 * authority, payer, insurer/principal approval, safety, and irreversible
 * actions. One person may hold several roles; each role and its evidence is
 * still stored on its own.
 *
 * SLICE 1 IS PREVIEW-ONLY. Nothing here sends, saves or charges. The planner is
 * a pure function over these records, so the rules can be proven on fictional
 * jobs before any schema change or send path exists.
 */

/** Jurisdiction packs. A job with no enabled pack is held, never defaulted. */
export type Jurisdiction =
  | "AU-NSW"
  | "AU-QLD"
  | "AU-VIC"
  | "AU-WA"
  | "AU-SA"
  | "AU-TAS"
  | "AU-ACT"
  | "AU-NT"
  | "NZ"
  | "UNKNOWN";

/**
 * How far a fact has been established.
 *
 * "reported" is the state that matters: an email saying "the insurer approved
 * it" is a report of approval, not proof of it. Only "verified" clears a gate.
 */
export type EvidenceState = "verified" | "reported" | "unknown";

/** The capacity a party acts in on THIS job. */
export type Capacity =
  | "OWNER"
  | "OWNERS_CORPORATION"
  | "PROPERTY_MANAGER"
  | "TENANT"
  | "OCCUPIER"
  | "INSURER"
  | "ASSESSOR"
  | "BROKER"
  | "BUILDER_TPA"
  | "COMPANY_SIGNATORY"
  | "SITE_MANAGER";

export interface Party {
  id: string;
  name: string;
  capacity: Capacity;
  email?: string | null;
  /**
   * The party this one acts for, e.g. a property manager acting for a landlord.
   * Acting for someone clears a gate only when `delegationEvidence` is verified.
   */
  actsForPartyId?: string | null;
  delegationEvidence?: EvidenceState;
  /** Where the delegation proof lives (document id, resolution reference). */
  delegationRef?: string | null;
  /**
   * Whether this party can commit money on this job. Assessors and brokers are
   * often recommendation-only, so this is false unless proven.
   */
  canAuthoriseSpend?: boolean;
  /**
   * Assets this party occupies (tenant, occupier, site manager). An occupier can
   * give access only to these, and only when `occupancyEvidence` is verified.
   */
  occupiesAssetIds?: string[];
  occupancyEvidence?: EvidenceState;
}

export type AssetClass =
  | "COMMON_PROPERTY"
  | "LOT_FIXTURES"
  | "BUILDING"
  | "CONTENTS"
  | "COMMERCIAL_FITOUT"
  | "STOCK";

export interface Asset {
  id: string;
  label: string;
  assetClass: AssetClass;
  /** Who controls this asset. `null` means not established, which holds work. */
  ownerPartyId: string | null;
  ownershipEvidence: EvidenceState;
  /** Kept for an insurer or assessor inspection: nothing may be discarded. */
  evidenceHold?: boolean;
}

export type Currency = "AUD" | "NZD";
/** Whether an amount includes GST, excludes it, or GST does not apply. */
export type GstBasis = "INC" | "EX" | "NA";

/** Money is integer minor units (cents). Never a float. */
export interface Money {
  minor: number;
  currency: Currency;
  gst: GstBasis;
}

/** Actions that cannot be undone, or that a principal restricts by name. */
export type RestrictedAction = "STRIP_OUT" | "DISPOSAL" | "FLOORING_REMOVAL";

/**
 * The only work an emergency basis can cover without written authority. A line
 * flagged emergency but naming none of these is never treated as make-safe.
 */
export type MakeSafeTask =
  | "WATER_EXTRACTION"
  | "TEMPORARY_COVER"
  | "ISOLATE_SERVICES"
  | "SECURE_SITE"
  | "DRYING";

export type PaymentBasis =
  "OWNER_DIRECT" | "INSURER_WORK_ORDER" | "UNCONFIRMED";

export interface ScopeLine {
  id: string;
  assetId: string;
  description: string;
  amount: Money;
  /** Who is expected to pay for THIS line. Lines may differ (split billing). */
  payment: {
    basis: PaymentBasis;
    payerPartyId: string | null;
  };
  restricted?: RestrictedAction | null;
  /** Involves hazardous material. Consent never stands in for safety clearance. */
  hazardous?: boolean;
  /** Emergency make-safe work. Needs a documented basis, never assumed. */
  emergency?: boolean;
  /** The listed make-safe task this emergency line performs, if any. */
  makeSafe?: MakeSafeTask;
  /** Contents pack-out, storage and return. */
  packOut?: boolean;
  /** Where make-safe authority ends (A02). Absent means none recorded. */
  stopPoint?: string | null;
}

export type ApprovalKind =
  "ACCESS" | "WORK" | "PAYMENT" | "RESTRICTED_ACTION" | "IRREVERSIBLE";

export interface Approval {
  id: string;
  partyId: string;
  kind: ApprovalKind;
  /** Scope lines this approval covers. Access approvals use `assetIds`. */
  scopeLineIds?: string[];
  assetIds?: string[];
  evidence: EvidenceState;
  /** Where the proof lives. Never a guess. */
  evidenceRef?: string | null;
}

export interface SafetyClearance {
  scopeLineId: string;
  evidence: EvidenceState;
  evidenceRef?: string | null;
}

/**
 * A funding cap from a principal's executed agreement or work order.
 *
 * Only a reviewed rule is evaluated. An unreviewed one produces a hold, never
 * a silent pass and never an invented limit.
 */
export interface FundingCap {
  id: string;
  funderPartyId: string;
  cap: Money;
  /** Already committed against this cap before the lines in this plan. */
  committed: Money;
  /** Actions needing separate written approval from the funder regardless of amount. */
  restrictedNeedsSeparateApproval: RestrictedAction[];
  status: "REVIEWED" | "UNREVIEWED";
  /** Source document and clause. */
  sourceRef: string;
  /** ISO date. A cap past this date holds the work. */
  expiresOn?: string | null;
  /** True for teaching fixtures. Carried into every reason so it cannot pass as real. */
  fictional?: boolean;
}

export interface BusinessProfile {
  legalName: string | null;
  tradingName?: string | null;
  /** ABN/ACN in Australia, NZBN or company number in New Zealand. */
  businessNumber: string | null;
  gstRegistered: boolean | null;
  phone: string | null;
  email: string | null;
}

export interface JobFacts {
  id: string;
  jurisdiction: Jurisdiction;
  tenure: "OWNER_OCCUPIED" | "STRATA" | "RENTAL" | "COMMERCIAL";
  siteAddress: string | null;
  claimRef?: string | null;
  /**
   * Job-level reference only. It does not say which funder issued it, so drafts
   * never copy it; A04 takes its reference from the funder's own verified order.
   */
  workOrderRef?: string | null;
  business: BusinessProfile;
  parties: Party[];
  assets: Asset[];
  scope: ScopeLine[];
  approvals: Approval[];
  safetyClearances: SafetyClearance[];
  caps: FundingCap[];
  /** Emergency basis for make-safe lines. Absent means none recorded. */
  emergencyBasis?: {
    documented: boolean;
    noticeAttemptsLogged: boolean;
    note?: string;
  } | null;
  /** A deposit was asked for. Slice 1 never enables one. */
  depositRequested?: boolean;
  /** ISO date the plan is evaluated at, so expiry is deterministic. */
  asOf: string;
}
