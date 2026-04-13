/**
 * Guidewire ClaimCenter Integration Endpoint
 *
 * Transforms a completed NIR inspection into a Guidewire ClaimCenter
 * claim intake payload. The payload is returned as JSON — no call is
 * made to Guidewire from this endpoint (credentials are insurer-side).
 *
 * Intended audience:
 *   - Insurer technical teams evaluating the integration
 *   - RestoreAssist clients whose insurers use ClaimCenter (IAG, QBE, Allianz AU)
 *   - Phase 3 tooling that will auto-submit claims on behalf of the technician
 *
 * Source: lib/nir-guidewire-integration.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  transformNirToGuidewireClaim,
  transformNirScopeToGuidewireLineItems,
  GUIDEWIRE_FIELD_MAP,
  type NirReportOutput,
  type NirTechnician,
  type NirProperty,
  type NirLossClassification,
  type NirScopeLineItem,
  type NirStandardsCitation,
  type NirPhotoManifest,
  type NirEvidenceClearance,
} from "@/lib/nir-guidewire-integration";
import { getPropertyLocationFlags } from "@/lib/nir-location-services";

// ─── STATE DERIVATION ─────────────────────────────────────────────────────────

// Maps Australian postcode prefix to state — used when address doesn't include state
const POSTCODE_STATE_MAP: Array<{
  min: number;
  max: number;
  state: NirProperty["state"];
}> = [
  { min: 800, max: 999, state: "NT" }, // NT uses 0800–0999 — match on 3-digit prefix
  { min: 1000, max: 2599, state: "NSW" },
  { min: 2600, max: 2619, state: "ACT" },
  { min: 2620, max: 2899, state: "NSW" },
  { min: 2900, max: 2920, state: "ACT" },
  { min: 2921, max: 2999, state: "NSW" },
  { min: 3000, max: 3999, state: "VIC" },
  { min: 4000, max: 4999, state: "QLD" },
  { min: 5000, max: 5999, state: "SA" },
  { min: 6000, max: 6999, state: "WA" },
  { min: 7000, max: 7999, state: "TAS" },
  { min: 8000, max: 8999, state: "VIC" }, // VIC PO Box range
  { min: 9000, max: 9999, state: "QLD" }, // QLD PO Box range
];

function deriveStateFromPostcode(postcode: string): NirProperty["state"] {
  const num = parseInt(postcode.replace(/\D/g, ""), 10);
  if (isNaN(num)) return "NSW"; // safe fallback
  const match = POSTCODE_STATE_MAP.find((r) => num >= r.min && num <= r.max);
  return match?.state ?? "NSW";
}

/** Extract suburb from address string: "123 Smith St, Parramatta NSW 2150" → "Parramatta" */
function extractSuburb(address: string): string {
  // Try comma split: "123 Street, Suburb State Postcode"
  const parts = address.split(",");
  if (parts.length >= 2) {
    const afterComma = parts[1].trim();
    // Remove trailing state + postcode: "Parramatta NSW 2150" → "Parramatta"
    return afterComma.replace(/\s+[A-Z]{2,3}\s+\d{4}$/, "").trim();
  }
  return "";
}

/** Derive IICRC loss type string from DB category */
function deriveLossType(category: string): string {
  switch (category) {
    case "1":
      return "water-damage";
    case "2":
      return "water-damage";
    case "3":
      return "water-damage";
    default:
      return "water-damage";
  }
}

// ─── SHARED INSPECTION FETCH ──────────────────────────────────────────────────

async function fetchInspectionForGuidewire(id: string, userId: string) {
  return prisma.inspection.findFirst({
    where: { id, userId },
    include: {
      classifications: true,
      scopeItems: true,
      costEstimates: true,
      affectedAreas: true,
      moistureReadings: true,
      photos: true,
      environmentalData: true,
    },
  });
}

// ─── NIR → GUIDEWIRE PAYLOAD BUILDER ─────────────────────────────────────────

function buildNirReportOutput(
  inspection: Awaited<ReturnType<typeof fetchInspectionForGuidewire>>,
  technicianName: string,
  userId: string,
): NirReportOutput {
  if (!inspection) throw new Error("Inspection not found");

  const postcode = inspection.propertyPostcode ?? "";
  const address = inspection.propertyAddress ?? "";
  const state = deriveStateFromPostcode(postcode);
  const suburb = extractSuburb(address);

  const locationFlags = postcode
    ? getPropertyLocationFlags(postcode, state)
    : {
        isFloodZone: false,
        isBushfireProne: false,
        isCycloneZone: false,
        isHeritageListed: false,
        windRegion: null,
        approximateBALZone: null,
        confidence: "requires-verification" as const,
        advisoryNotes: [],
      };

  // ── Technician ─────────────────────────────────────────────────────────────

  const technician: NirTechnician = {
    technicianId: userId,
    name: technicianName,
    certifications: [], // TODO: load from user profile (Phase 3)
  };

  // ── Property ───────────────────────────────────────────────────────────────

  const property: NirProperty = {
    address,
    suburb,
    state,
    postcode,
    locationFlags: {
      isFloodZone: locationFlags.isFloodZone,
      isBushfireProne: locationFlags.isBushfireProne,
      isCycloneZone: locationFlags.isCycloneZone,
      isHeritageListed: locationFlags.isHeritageListed,
      windRegion: locationFlags.windRegion,
      approximateBALZone: locationFlags.approximateBALZone,
    },
  };

  // ── Loss classification ────────────────────────────────────────────────────

  const primaryCls = inspection.classifications?.[0];
  const clauseRefs: string[] =
    ((primaryCls as any)?.clauseRefs as string[]) ??
    (primaryCls?.standardReference ? [primaryCls.standardReference] : []);

  const lossClassification: NirLossClassification = {
    lossType: deriveLossType(primaryCls?.category ?? "1"),
    primaryClassification: primaryCls
      ? `Category ${primaryCls.category}, Class ${primaryCls.class}`
      : "Not yet classified",
    secondaryClassification: primaryCls?.class,
    clauseRefs,
    classificationConfidence: (primaryCls?.confidence as number | null) ?? 0,
  };

  // ── Scope line items ───────────────────────────────────────────────────────

  // Join scopeItems with costEstimates by description match (they share inspectionId
  // but not a direct foreign key in the current schema)
  const scopeLineItems: NirScopeLineItem[] = inspection.scopeItems.map((si) => {
    const costMatch = inspection.costEstimates.find(
      (ce) => ce.description === si.description,
    );
    return {
      lineItemId: si.id,
      category: mapItemTypeToCategory(si.itemType ?? ""),
      description: si.description,
      standardsJustification: si.justification ?? "",
      quantity: si.quantity ?? 1,
      unit: si.unit ?? "item",
      unitRate: costMatch?.rate ?? undefined,
      discretionary: !(si.isRequired ?? true),
    };
  });

  // ── Standards citations ────────────────────────────────────────────────────

  const standardsCitations: NirStandardsCitation[] = clauseRefs.map((ref) => ({
    standard: ref.startsWith("IICRC S520")
      ? ("IICRC S520" as const)
      : ref.startsWith("IICRC S700")
        ? ("IICRC S700" as const)
        : ref.startsWith("NCC")
          ? ("NCC 2022" as const)
          : ("IICRC S500" as const),
    edition: ref.startsWith("IICRC S500")
      ? "7th Ed"
      : ref.startsWith("IICRC S520")
        ? "3rd Ed"
        : ref.startsWith("IICRC S700")
          ? "2nd Ed"
          : "2022",
    clauseRef: ref,
    fieldName: "Water category / class classification",
    complianceStatus: "COMPLIANT" as const,
  }));

  // ── Photo manifest ─────────────────────────────────────────────────────────

  const photoManifest: NirPhotoManifest = {
    totalPhotos: inspection.photos.length,
    photos: inspection.photos.map((p, idx) => ({
      photoId: p.id,
      capturedAt: p.timestamp
        ? new Date(p.timestamp).toISOString()
        : new Date().toISOString(),
      latitude: 0, // TODO: add GPS EXIF extraction (Phase 3)
      longitude: 0,
      sequenceNumber: idx + 1,
      category: mapPhotoCategory((p as any).category),
      standardRef: "IICRC S500 §12.2",
    })),
  };

  // ── Evidence clearance ─────────────────────────────────────────────────────
  // Snapshot only — not a live gate check (call /api/content/gate-check for live status)

  const evidenceClearance: NirEvidenceClearance = {
    checkedAt: new Date().toISOString(),
    lossTypeDomain: lossClassification.lossType,
    gateStatus: inspection.status === "COMPLETED" ? "open" : "partial",
    certificationMet: false, // Human certification required — see nir-content-gate.ts
  };

  return {
    reportId: inspection.id,
    inspectionDate: inspection.inspectionDate
      ? new Date(inspection.inspectionDate).toISOString()
      : new Date().toISOString(),
    submittedAt: inspection.submittedAt
      ? new Date(inspection.submittedAt as Date).toISOString()
      : new Date().toISOString(),
    technician,
    property,
    lossClassification,
    scopeLineItems,
    standardsCitations,
    photoManifest,
    evidenceClearance,
  };
}

// ─── CATEGORY MAPPERS ─────────────────────────────────────────────────────────

function mapItemTypeToCategory(itemType: string): NirScopeLineItem["category"] {
  if (
    itemType.includes("dehumidif") ||
    itemType.includes("air_mover") ||
    itemType.includes("equipment")
  )
    return "equipment";
  if (
    itemType.includes("antimicrobial") ||
    itemType.includes("sanitize") ||
    itemType.includes("material")
  )
    return "materials";
  if (itemType.includes("testing") || itemType.includes("assessment"))
    return "testing";
  if (itemType.includes("contents") || itemType.includes("pack_out"))
    return "contents";
  return "labour";
}

function mapPhotoCategory(
  cat: string | null | undefined,
): NirPhotoManifest["photos"][number]["category"] {
  switch (cat?.toLowerCase()) {
    case "overview":
      return "overview";
    case "damage":
      return "damage";
    case "moisture":
    case "moisture-reading":
      return "moisture-reading";
    case "equipment":
      return "equipment";
    case "content":
    case "contents":
      return "content";
    case "post-restoration":
      return "post-restoration";
    default:
      return "damage";
  }
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

/**
 * GET /api/inspections/[id]/guidewire?policyNumber=POL-12345&insurerLossTypeCode=PR_WaterDamage
 *
 * Convenience endpoint for insurer technical teams evaluating the integration.
 * Returns the full Guidewire payload + field map as JSON.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const policyNumber = searchParams.get("policyNumber") ?? "POL-UNKNOWN";
    const insurerLossTypeCode =
      searchParams.get("insurerLossTypeCode") ?? "PR_WaterDamage";

    return await buildResponse(
      id,
      session.user.id,
      session.user.name ?? "Technician",
      policyNumber,
      insurerLossTypeCode,
    );
  } catch (error) {
    console.error("Error generating Guidewire payload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/inspections/[id]/guidewire
 * Body: { policyNumber: string, insurerLossTypeCode: string }
 *
 * Programmatic endpoint. Returns the Guidewire claim payload, line items,
 * and the field mapping spec (for insurer documentation).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      policyNumber?: string;
      insurerLossTypeCode?: string;
    };
    const policyNumber = body.policyNumber ?? "POL-UNKNOWN";
    const insurerLossTypeCode = body.insurerLossTypeCode ?? "PR_WaterDamage";

    return await buildResponse(
      id,
      session.user.id,
      session.user.name ?? "Technician",
      policyNumber,
      insurerLossTypeCode,
    );
  } catch (error) {
    console.error("Error generating Guidewire payload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── SHARED RESPONSE BUILDER ──────────────────────────────────────────────────

async function buildResponse(
  id: string,
  userId: string,
  technicianName: string,
  policyNumber: string,
  insurerLossTypeCode: string,
) {
  const inspection = await fetchInspectionForGuidewire(id, userId);

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  // Only COMPLETED/ESTIMATED inspections have enough data for a Guidewire payload
  const submittableStatuses = [
    "ESTIMATED",
    "COMPLETED",
    "SCOPED",
    "CLASSIFIED",
  ];
  if (!submittableStatuses.includes(inspection.status)) {
    return NextResponse.json(
      {
        error:
          "Inspection must be processed before Guidewire payload can be generated",
        currentStatus: inspection.status,
        requiredStatuses: submittableStatuses,
      },
      { status: 422 },
    );
  }

  const nirOutput = buildNirReportOutput(inspection, technicianName, userId);

  const claimPayload = transformNirToGuidewireClaim(
    nirOutput,
    policyNumber,
    insurerLossTypeCode,
  );
  const lineItems = transformNirScopeToGuidewireLineItems(
    nirOutput.scopeLineItems,
  );

  return NextResponse.json({
    /**
     * Guidewire ClaimCenter claim intake payload.
     * Submit to: POST /pc/rest/v1/claim (insurer's ClaimCenter instance)
     */
    claimPayload,

    /**
     * Scope line items for service request.
     * Submit to: POST /pc/rest/v1/claim/{claimId}/serviceRequests/{srId}/lineItems
     */
    lineItems,

    /**
     * Field mapping specification — for insurer technical team documentation.
     * Shows the NIR source field for every Guidewire field populated.
     */
    fieldMap: GUIDEWIRE_FIELD_MAP,

    /**
     * The NIR report output used to generate the payload.
     * Useful for debugging field mapping issues.
     */
    nirOutput,

    meta: {
      inspectionId: id,
      inspectionStatus: inspection.status,
      generatedAt: new Date().toISOString(),
      guidewireApiBase: "/pc/rest/v1",
      integrationGuide:
        "https://docs.restoreassist.com.au/integrations/guidewire",
      note: "This payload is generated locally. No call is made to Guidewire. Submit claimPayload to your ClaimCenter instance using your insurer-issued OAuth 2.0 credentials.",
    },
  });
}
