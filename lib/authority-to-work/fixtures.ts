/**
 * Three FICTIONAL jobs for proving the planner (RA-8468).
 *
 * Every name, address, number and limit here is invented. The insurer limit in
 * the strata case is a teaching fixture, not any real insurer's rule, and it is
 * flagged `fictional` so its reasons say so wherever they are shown.
 */
import type { BusinessProfile, JobFacts } from "./types";

const BUSINESS: BusinessProfile = {
  legalName: "Example Restoration Pty Ltd",
  businessNumber: "00 000 000 000",
  gstRegistered: true,
  phone: "0400 000 000",
  email: "jobs@example.test",
};

/**
 * Case 1: NSW strata water loss. A burst riser pipe (common property) wets a
 * lot's floor and a tenant's sofa. Three assets, three different controllers.
 */
export function nswStrataWaterLoss(): JobFacts {
  return {
    id: "FIX-NSW-STRATA",
    jurisdiction: "AU-NSW",
    tenure: "STRATA",
    siteAddress: "Unit 4, 1 Example Street, Exampleton NSW",
    claimRef: "CLM-FICTIONAL-1",
    workOrderRef: "WO-FICTIONAL-1",
    business: BUSINESS,
    parties: [
      {
        id: "oc",
        name: "Owners Corporation SP00000",
        capacity: "OWNERS_CORPORATION",
      },
      {
        id: "sm",
        name: "Strata Manager Example",
        capacity: "PROPERTY_MANAGER",
        actsForPartyId: "oc",
        delegationEvidence: "verified",
        delegationRef: "Delegation minute DOC-1",
      },
      { id: "lot", name: "Lot 4 Owner", capacity: "OWNER" },
      { id: "ten", name: "Lot 4 Tenant", capacity: "TENANT" },
      {
        id: "ins",
        name: "Building Insurer Example",
        capacity: "INSURER",
        canAuthoriseSpend: true,
      },
      {
        id: "asr",
        name: "Loss Assessor Example",
        capacity: "ASSESSOR",
        canAuthoriseSpend: false,
      },
    ],
    assets: [
      {
        id: "riser",
        label: "Common riser pipe and wall cavity",
        assetClass: "COMMON_PROPERTY",
        ownerPartyId: "oc",
        ownershipEvidence: "verified",
      },
      {
        id: "floor",
        label: "Lot 4 floating floor",
        assetClass: "LOT_FIXTURES",
        ownerPartyId: "lot",
        ownershipEvidence: "verified",
      },
      {
        id: "sofa",
        label: "Tenant's sofa",
        assetClass: "CONTENTS",
        ownerPartyId: "ten",
        ownershipEvidence: "verified",
      },
    ],
    scope: [
      {
        id: "L1",
        assetId: "riser",
        description: "Extract and dry the common wall cavity",
        amount: { minor: 70_000, currency: "AUD", gst: "EX" },
        payment: { basis: "INSURER_WORK_ORDER", payerPartyId: "ins" },
      },
      {
        id: "L2",
        assetId: "floor",
        description: "Remove wet floating floor in the living room",
        amount: { minor: 10_000, currency: "AUD", gst: "EX" },
        payment: { basis: "INSURER_WORK_ORDER", payerPartyId: "ins" },
        restricted: "FLOORING_REMOVAL",
      },
      {
        id: "L3",
        assetId: "sofa",
        description: "Clean and dry the tenant's sofa off site",
        amount: { minor: 15_000, currency: "AUD", gst: "EX" },
        payment: { basis: "UNCONFIRMED", payerPartyId: null },
        packOut: true,
      },
      {
        // The assessor "approved" this by email. An assessor without spend
        // authority cannot be the funder, so this line must not clear.
        id: "L4",
        assetId: "riser",
        description: "Moisture mapping of the common corridor",
        amount: { minor: 5_000, currency: "AUD", gst: "EX" },
        payment: { basis: "INSURER_WORK_ORDER", payerPartyId: "asr" },
      },
    ],
    approvals: [
      // The strata manager signs for the owners corporation: common property only.
      {
        id: "ap1",
        partyId: "sm",
        kind: "WORK",
        scopeLineIds: ["L1", "L2", "L3"],
        evidence: "verified",
        evidenceRef: "Signed A05 DOC-2",
      },
      {
        id: "ap2",
        partyId: "sm",
        kind: "ACCESS",
        assetIds: ["riser"],
        evidence: "verified",
      },
      {
        id: "ap3",
        partyId: "ins",
        kind: "WORK",
        scopeLineIds: ["L1", "L2"],
        evidence: "verified",
        evidenceRef: "WO-FICTIONAL-1",
      },
      {
        id: "ap4",
        partyId: "asr",
        kind: "PAYMENT",
        scopeLineIds: ["L4"],
        evidence: "reported",
        evidenceRef: "assessor email",
      },
    ],
    safetyClearances: [],
    caps: [
      {
        id: "CAP-FICTIONAL-MAKESAFE",
        funderPartyId: "ins",
        cap: { minor: 300_000, currency: "AUD", gst: "EX" },
        committed: { minor: 240_000, currency: "AUD", gst: "EX" },
        restrictedNeedsSeparateApproval: ["FLOORING_REMOVAL"],
        status: "REVIEWED",
        sourceRef: "fictional schedule, clause 1",
        fictional: true,
      },
    ],
    emergencyBasis: null,
    asOf: "2026-11-19",
  };
}

/**
 * Case 2: Queensland commercial premises, customer pays directly. The site
 * manager let the crew in; only the company's delegated signatory can contract.
 */
export function qldCommercialSelfPay(): JobFacts {
  return {
    id: "FIX-QLD-COMMERCIAL",
    jurisdiction: "AU-QLD",
    tenure: "COMMERCIAL",
    siteAddress: "Shop 2, 10 Example Road, Exampleville QLD",
    business: BUSINESS,
    parties: [
      { id: "co", name: "Example Cafe Pty Ltd", capacity: "OWNER" },
      {
        id: "dir",
        name: "Cafe Director",
        capacity: "COMPANY_SIGNATORY",
        actsForPartyId: "co",
        delegationEvidence: "verified",
        delegationRef: "Company register extract DOC-3",
      },
      { id: "mgr", name: "Cafe Site Manager", capacity: "SITE_MANAGER" },
    ],
    assets: [
      {
        id: "fitout",
        label: "Cafe kitchen fit-out",
        assetClass: "COMMERCIAL_FITOUT",
        ownerPartyId: "co",
        ownershipEvidence: "verified",
      },
    ],
    scope: [
      {
        id: "C1",
        assetId: "fitout",
        description: "Dry and sanitise kitchen joinery",
        amount: { minor: 240_000, currency: "AUD", gst: "INC" },
        payment: { basis: "OWNER_DIRECT", payerPartyId: "dir" },
      },
    ],
    approvals: [
      {
        id: "c-ap1",
        partyId: "mgr",
        kind: "ACCESS",
        assetIds: ["fitout"],
        evidence: "verified",
      },
      // The site manager also "signed" for the work. That does not count.
      {
        id: "c-ap2",
        partyId: "mgr",
        kind: "WORK",
        scopeLineIds: ["C1"],
        evidence: "verified",
      },
    ],
    safetyClearances: [],
    caps: [],
    depositRequested: true,
    asOf: "2026-11-19",
  };
}

/**
 * Case 3: New Zealand rental after a storm. The landlord's agent says they act
 * for the landlord but has not shown it; emergency work has no documented basis
 * yet, although notice attempts were logged.
 */
export function nzRentalNaturalHazard(): JobFacts {
  return {
    id: "FIX-NZ-RENTAL",
    jurisdiction: "NZ",
    tenure: "RENTAL",
    siteAddress: "12 Example Lane, Exampletown, NZ",
    business: {
      ...BUSINESS,
      legalName: "Example Restoration NZ Limited",
      businessNumber: "9400000000000",
    },
    parties: [
      { id: "ll", name: "Landlord Example", capacity: "OWNER" },
      {
        id: "pm",
        name: "Letting Agent Example",
        capacity: "PROPERTY_MANAGER",
        actsForPartyId: "ll",
        delegationEvidence: "reported",
      },
      { id: "tn", name: "Tenant Example", capacity: "TENANT" },
    ],
    assets: [
      {
        id: "house",
        label: "Dwelling roof and ceiling",
        assetClass: "BUILDING",
        ownerPartyId: "ll",
        ownershipEvidence: "verified",
      },
      {
        id: "goods",
        label: "Tenant's bedroom contents",
        assetClass: "CONTENTS",
        ownerPartyId: "tn",
        ownershipEvidence: "verified",
      },
    ],
    scope: [
      {
        id: "N1",
        assetId: "house",
        description: "Temporary tarp and water extraction",
        amount: { minor: 90_000, currency: "NZD", gst: "INC" },
        payment: { basis: "UNCONFIRMED", payerPartyId: null },
        emergency: true,
        makeSafe: "TEMPORARY_COVER",
      },
      {
        id: "N2",
        assetId: "house",
        description: "Remove wet ceiling plasterboard",
        amount: { minor: 120_000, currency: "NZD", gst: "INC" },
        payment: { basis: "UNCONFIRMED", payerPartyId: null },
        emergency: true,
        restricted: "STRIP_OUT",
      },
      {
        id: "N3",
        assetId: "goods",
        description: "Pack out tenant's bedroom contents",
        amount: { minor: 30_000, currency: "NZD", gst: "INC" },
        payment: { basis: "OWNER_DIRECT", payerPartyId: "tn" },
        packOut: true,
      },
    ],
    approvals: [
      {
        id: "n-ap1",
        partyId: "pm",
        kind: "WORK",
        scopeLineIds: ["N1", "N2"],
        evidence: "verified",
      },
      {
        id: "n-ap2",
        partyId: "tn",
        kind: "ACCESS",
        assetIds: ["goods"],
        evidence: "verified",
      },
    ],
    safetyClearances: [],
    caps: [],
    emergencyBasis: {
      documented: false,
      noticeAttemptsLogged: true,
      note: "Two calls to the agent logged",
    },
    asOf: "2026-11-19",
  };
}

export const FIXTURES = {
  nswStrataWaterLoss,
  qldCommercialSelfPay,
  nzRentalNaturalHazard,
};
