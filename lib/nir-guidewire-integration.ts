/**
 * NIR Guidewire ClaimCenter Integration Specification
 *
 * Maps the RestoreAssist NIR JSON output to Guidewire ClaimCenter
 * REST API fields. Published as open documentation so insurer technical
 * teams can begin feasibility assessment without RestoreAssist resource.
 *
 * Target insurers using Guidewire ClaimCenter (AU):
 *   - IAG (NRMA, CGU, SGIO, SGIC) — Priority 1
 *   - QBE Australia                — Priority 2
 *   - Allianz Australia (in transition to Guidewire)
 *
 * Integration pathway:
 *   Phase 3 Launch (Month 10+): Publish this guide + NIR API key for insurers
 *   Phase 4 Growth: Formal Guidewire Marketplace listing
 *
 * Source: lib/nir-insurer-engagement.ts → INSURER_ADOPTION_PATHWAY step 3
 * Critique addressed: C5 — No named insurer engagement or API path
 */

// ─── NIR OUTPUT SCHEMA ────────────────────────────────────────────────────────

/**
 * The top-level NIR report output — produced by the RestoreAssist field app
 * and submitted to the insurer via the NIR API or direct upload.
 *
 * This is what the Guidewire adapter consumes.
 */
export interface NirReportOutput {
  /** Globally unique report identifier */
  reportId: string;
  /** ISO 8601 — date the inspection was conducted */
  inspectionDate: string;
  /** ISO 8601 — date the report was submitted/locked */
  submittedAt: string;
  /** Technician details */
  technician: NirTechnician;
  /** Property being inspected */
  property: NirProperty;
  /** Primary loss classification */
  lossClassification: NirLossClassification;
  /** Line items generated from the standards engine */
  scopeLineItems: NirScopeLineItem[];
  /** IICRC standards and clauses cited in this report */
  standardsCitations: NirStandardsCitation[];
  /** Photo documentation record */
  photoManifest: NirPhotoManifest;
  /** Content gate clearance snapshot at time of submission */
  evidenceClearance: NirEvidenceClearance;
}

export interface NirTechnician {
  technicianId: string;
  name: string;
  /** IICRC certifications held (e.g. WRT, ASD, FSRT) */
  certifications: string[];
  licenceNumber?: string;
  licenceState?: string;
}

export interface NirProperty {
  address: string;
  suburb: string;
  state: "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "NT" | "ACT";
  postcode: string;
  /** From nir-location-services — advisory flags at time of inspection */
  locationFlags: {
    isFloodZone: boolean;
    isBushfireProne: boolean;
    isCycloneZone: boolean;
    isHeritageListed: boolean;
    windRegion: string | null;
    approximateBALZone: string | null;
  };
}

export interface NirLossClassification {
  /** 'water-damage' | 'mould-remediation' | 'fire-smoke' */
  lossType: string;
  /** IICRC Category 1/2/3 (water) or Condition 1/2/3 (mould) or smoke residue type */
  primaryClassification: string;
  /** IICRC Class 1/2/3/4 (water only) */
  secondaryClassification?: string;
  /** All IICRC clause refs cited for this classification */
  clauseRefs: string[];
  /** Overall confidence score 0–1 from classification engine */
  classificationConfidence: number;
}

export interface NirScopeLineItem {
  lineItemId: string;
  category: "labour" | "materials" | "equipment" | "contents" | "testing";
  description: string;
  /** IICRC clause that makes this line item mandatory */
  standardsJustification: string;
  quantity: number;
  unit: string;
  unitRate?: number;
  /** Whether this item can be disputed — false = standards-mandated */
  discretionary: boolean;
}

export interface NirStandardsCitation {
  standard: "IICRC S500" | "IICRC S520" | "IICRC S700" | "NCC 2022";
  edition: string;
  clauseRef: string;
  fieldName: string;
  complianceStatus: "COMPLIANT" | "NON_COMPLIANT" | "REQUIRES_ACTION";
}

export interface NirPhotoManifest {
  totalPhotos: number;
  photos: Array<{
    photoId: string;
    capturedAt: string;
    latitude: number;
    longitude: number;
    sequenceNumber: number;
    category:
      | "overview"
      | "damage"
      | "moisture-reading"
      | "equipment"
      | "content"
      | "post-restoration";
    standardRef: string;
  }>;
}

export interface NirEvidenceClearance {
  /** Snapshot of gate status at time of report submission */
  checkedAt: string;
  lossTypeDomain: string;
  gateStatus: "open" | "partial" | "blocked";
  certificationMet: boolean;
}

// ─── GUIDEWIRE CLAIMCENTER FIELD MAPPING ─────────────────────────────────────

/**
 * Maps NIR output fields to Guidewire ClaimCenter REST API fields.
 *
 * ClaimCenter API base path: /pc/rest/v1/claim
 * Auth: OAuth 2.0 client credentials (insurer-issued)
 *
 * Reference: Guidewire ClaimCenter REST API Developer Guide (v10+)
 */
export const GUIDEWIRE_FIELD_MAP = {
  // ─── Claim root fields ─────────────────────────────────────────────────────

  claim: {
    /** NIR report ID stored as insurer's external reference for cross-system tracing */
    lossType: {
      nirSource: "lossClassification.lossType",
      gwField: "claim.lossType",
      notes:
        'Map NIR lossType to Guidewire LossType typecode (e.g. "PR_WaterDamage")',
    },
    claimNumber: {
      nirSource: "reportId",
      gwField: "claim.externalClaimNumber",
      notes: "NIR reportId stored as external reference for audit trail",
    },
    lossDate: {
      nirSource: "inspectionDate",
      gwField: "claim.lossDate",
      notes:
        "Date loss was inspected — not the date damage occurred; insurer may adjust",
    },
    reportedDate: {
      nirSource: "submittedAt",
      gwField: "claim.reportedDate",
      notes: "ISO 8601 timestamp NIR was submitted",
    },
    description: {
      nirSource: "lossClassification.primaryClassification",
      gwField: "claim.description",
      notes: "Primary IICRC classification drives claim description",
    },
  },

  // ─── Loss location ─────────────────────────────────────────────────────────

  lossLocation: {
    addressLine1: {
      nirSource: "property.address",
      gwField: "claim.lossLocation.addressLine1",
      notes: "",
    },
    city: {
      nirSource: "property.suburb",
      gwField: "claim.lossLocation.city",
      notes: "",
    },
    state: {
      nirSource: "property.state",
      gwField: "claim.lossLocation.state",
      notes: "Map AU state abbreviation to Guidewire state typecode",
    },
    postalCode: {
      nirSource: "property.postcode",
      gwField: "claim.lossLocation.postalCode",
      notes: "",
    },
  },

  // ─── Exposure / damage fields ──────────────────────────────────────────────

  exposure: {
    /**
     * Guidewire exposures represent individual areas of loss.
     * Each NIR scope category maps to a separate exposure.
     */
    primaryCoverage: {
      nirSource: "lossClassification.lossType",
      gwField: "exposure.primaryCoverage",
      notes: "Map to Guidewire Coverage typecode on the policy",
    },
    exposureState: {
      nirSource: null,
      gwField: "exposure.state",
      notes: 'Set to "open" on creation; insurer workflow advances state',
    },
    closingReserve: {
      nirSource: "scopeLineItems[].unitRate (sum)",
      gwField: "exposure.closingReserve",
      notes: "Sum of all NIR scope line item rates — initial reserve estimate",
    },
  },

  // ─── Service request / vendor assignment ───────────────────────────────────

  serviceRequest: {
    /**
     * ClaimCenter service requests link the claim to the restoration vendor.
     * NIR technician details map to the assigned vendor contact.
     */
    vendorName: {
      nirSource: "technician.name",
      gwField: "serviceRequest.vendorContact.displayName",
      notes: "Technician name as vendor contact",
    },
    vendorLicence: {
      nirSource: "technician.licenceNumber",
      gwField: "serviceRequest.vendorContact.licenceNumber",
      notes: "Maps to Guidewire vendor profile if pre-registered",
    },
    specialInstructions: {
      nirSource: "standardsCitations (formatted)",
      gwField: "serviceRequest.specialInstructions",
      notes: "Formatted IICRC citation list appended as special instructions",
    },
  },

  // ─── Documents ─────────────────────────────────────────────────────────────

  documents: {
    /**
     * NIR photo manifest uploads as claim documents.
     * Each photo category maps to a Guidewire document type.
     */
    nirReport: {
      nirSource: "reportId (PDF link)",
      gwField: "document.name + document.mimeType",
      notes: 'Full NIR PDF uploaded as "Restoration Assessment Report"',
    },
    photoEvidence: {
      nirSource: "photoManifest.photos[]",
      gwField: "document (per photo)",
      notes: "Each photo uploaded individually; exif metadata preserved",
    },
  },

  // ─── Notes ─────────────────────────────────────────────────────────────────

  notes: {
    classificationNote: {
      nirSource: "lossClassification (formatted)",
      gwField: "note.text",
      notes: "IICRC classification with clause refs appended as a claim note",
    },
    jurisdictionalNote: {
      nirSource: "property.locationFlags",
      gwField: "note.text",
      notes:
        "Location risk flags (flood zone, BAL, cyclone) appended as advisory note",
    },
  },
} as const;

// ─── TRANSFORMATION FUNCTIONS ─────────────────────────────────────────────────

/**
 * Transform a NIR report output into a Guidewire ClaimCenter
 * claim intake payload.
 *
 * This function produces the JSON body for:
 *   POST /pc/rest/v1/claim
 *
 * @param nir - The completed NIR report output
 * @param policyNumber - The insurer policy number to link the claim to
 * @param insurerLossTypeCode - Insurer-specific Guidewire LossType typecode
 * @returns Guidewire claim intake payload
 */
export function transformNirToGuidewireClaim(
  nir: NirReportOutput,
  policyNumber: string,
  insurerLossTypeCode: string,
): GuidewireClaimIntakePayload {
  const lineItemTotal = nir.scopeLineItems
    .filter((li) => li.unitRate !== undefined)
    .reduce((sum, li) => sum + li.unitRate! * li.quantity, 0);

  const citationText = nir.standardsCitations
    .map((c) => `${c.standard} ${c.clauseRef} (${c.complianceStatus})`)
    .join("; ");

  const locationFlags = nir.property.locationFlags;
  const locationNotes: string[] = [];
  if (locationFlags.isFloodZone)
    locationNotes.push("ADVISORY: Property in identified flood zone");
  if (locationFlags.isBushfireProne)
    locationNotes.push("ADVISORY: Property in bushfire-prone area");
  if (locationFlags.isCycloneZone)
    locationNotes.push("ADVISORY: Property in cyclone zone");
  if (locationFlags.isHeritageListed)
    locationNotes.push(
      "ADVISORY: Heritage-dense area — confirm heritage listing before structural works",
    );
  if (locationFlags.windRegion)
    locationNotes.push(`Wind Region: ${locationFlags.windRegion}`);
  if (locationFlags.approximateBALZone)
    locationNotes.push(
      `Approximate BAL Zone: ${locationFlags.approximateBALZone}`,
    );

  return {
    claim: {
      lossType: insurerLossTypeCode,
      externalClaimNumber: nir.reportId,
      lossDate: nir.inspectionDate,
      reportedDate: nir.submittedAt,
      description: `${nir.lossClassification.primaryClassification} — NIR ${nir.reportId}`,
      policy: { policyNumber },
      lossLocation: {
        addressLine1: nir.property.address,
        city: nir.property.suburb,
        state: nir.property.state,
        postalCode: nir.property.postcode,
      },
    },
    exposures: [
      {
        primaryCoverage: insurerLossTypeCode,
        state: "open",
        closingReserve: lineItemTotal > 0 ? lineItemTotal : undefined,
      },
    ],
    notes: [
      {
        text: `IICRC Standards Compliance: ${citationText}`,
        confidential: false,
      },
      ...(locationNotes.length > 0
        ? [
            {
              text: locationNotes.join("\n"),
              confidential: false,
            },
          ]
        : []),
    ],
    serviceRequest: {
      vendorContact: {
        displayName: nir.technician.name,
        licenceNumber: nir.technician.licenceNumber,
      },
      specialInstructions: citationText,
    },
  };
}

/**
 * Format NIR scope line items into Guidewire ClaimCenter
 * service request line items for reserve/estimate upload.
 *
 * POST /pc/rest/v1/claim/{claimId}/serviceRequests/{srId}/lineItems
 */
export function transformNirScopeToGuidewireLineItems(
  scopeLineItems: NirScopeLineItem[],
): GuidewireLineItem[] {
  return scopeLineItems.map((li) => ({
    description: li.description,
    category: mapNirCategoryToGuidewire(li.category),
    quantity: li.quantity,
    unitCost: li.unitRate ?? 0,
    totalCost: li.unitRate ? li.unitRate * li.quantity : 0,
    notes: li.standardsJustification,
    discretionary: li.discretionary,
  }));
}

function mapNirCategoryToGuidewire(
  nirCategory: NirScopeLineItem["category"],
): string {
  const MAP: Record<NirScopeLineItem["category"], string> = {
    labour: "LABOR",
    materials: "MATERIAL",
    equipment: "EQUIPMENT",
    contents: "CONTENTS",
    testing: "OTHER_EXPENSE",
  };
  return MAP[nirCategory];
}

// ─── GUIDEWIRE PAYLOAD TYPES ──────────────────────────────────────────────────

/**
 * Subset of the Guidewire ClaimCenter claim intake payload.
 * Full schema: Guidewire ClaimCenter REST API Developer Guide §4.2.
 *
 * These are the fields NIR populates — insurers may require additional
 * insurer-specific fields per their ClaimCenter configuration.
 */
export interface GuidewireClaimIntakePayload {
  claim: {
    lossType: string;
    externalClaimNumber: string;
    lossDate: string;
    reportedDate: string;
    description: string;
    policy: { policyNumber: string };
    lossLocation: {
      addressLine1: string;
      city: string;
      state: string;
      postalCode: string;
    };
  };
  exposures: Array<{
    primaryCoverage: string;
    state: string;
    closingReserve?: number;
  }>;
  notes: Array<{
    text: string;
    confidential: boolean;
  }>;
  serviceRequest: {
    vendorContact: {
      displayName: string;
      licenceNumber?: string;
    };
    specialInstructions: string;
  };
}

export interface GuidewireLineItem {
  description: string;
  category: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  notes: string;
  discretionary: boolean;
}

// ─── MAJESCO CLAIMS MAPPING (SUNCORP) ─────────────────────────────────────────

/**
 * Suncorp uses Majesco Claims — same NIR output, different field names.
 * This is a stub — full Majesco field mapping to be completed in Phase 3
 * once Suncorp technical engagement is confirmed.
 *
 * @stub — populated in Phase 3 after Suncorp technical team engagement
 */
export const MAJESCO_FIELD_MAP_STUB = {
  _status: "STUB — Phase 3 completion after Suncorp technical engagement",
  _reference: "Majesco Claims API v2 — obtain from Suncorp procurement",
  _nirContactForMapping:
    "RestoreAssist technical team via docs.restoreassist.app/integrations",
  knownMappings: {
    claimReference: {
      nirSource: "reportId",
      majescoField: "claim.externalReference",
      notes: "Confirmed equivalent to Guidewire externalClaimNumber",
    },
    lossDate: {
      nirSource: "inspectionDate",
      majescoField: "claim.incidentDate",
      notes: "Confirmed — Majesco uses incidentDate not lossDate",
    },
  },
} as const;
