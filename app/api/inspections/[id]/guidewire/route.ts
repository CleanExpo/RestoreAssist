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
import { buildClaimsIntegrationExport } from "@/lib/export/claims-contract";
import {
  fetchInspectionForGuidewire,
  fetchTechnicianCertifications,
  buildNirReportOutput,
} from "@/lib/export/guidewire-report-output";
import {
  transformNirToGuidewireClaim,
  transformNirScopeToGuidewireLineItems,
  GUIDEWIRE_FIELD_MAP,
} from "@/lib/nir-guidewire-integration";
import { withIdempotency } from "@/lib/idempotency";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

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
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const policyNumber = searchParams.get("policyNumber") ?? "POL-UNKNOWN";
    const insurerLossTypeCode =
      searchParams.get("insurerLossTypeCode") ?? "PR_WaterDamage";

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    return await buildResponse(
      request,
      id,
      session.user.id,
      session.user.name ?? "Technician",
      policyNumber,
      insurerLossTypeCode,
    );
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-guidewire-get",
    });
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: Guidewire submission is a downstream integration event —
  // idempotency prevents duplicate payload generation/submission on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const tenancy = await assertInspectionTenancy(session, id);
      if (!tenancy.ok) {
        return apiError(request, {
          code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
          message: tenancy.reason,
          status: tenancy.status,
        });
      }

      let body: { policyNumber?: string; insurerLossTypeCode?: string } = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const policyNumber = body.policyNumber ?? "POL-UNKNOWN";
      const insurerLossTypeCode = body.insurerLossTypeCode ?? "PR_WaterDamage";

      return await buildResponse(
        request,
        id,
        userId,
        session.user.name ?? "Technician",
        policyNumber,
        insurerLossTypeCode,
      );
    } catch (error) {
      return fromException(request, error, {
        stage: "inspection-guidewire-post",
      });
    }
  });
}

// ─── SHARED RESPONSE BUILDER ──────────────────────────────────────────────────

async function buildResponse(
  request: NextRequest,
  id: string,
  userId: string,
  technicianName: string,
  policyNumber: string,
  insurerLossTypeCode: string,
) {
  const inspection = await fetchInspectionForGuidewire(id);

  if (!inspection) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
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

  // The insurer payload carries the attendance date as fact; never invent one.
  if (!inspection.inspectionDate) {
    return apiError(request, {
      code: "VALIDATION",
      message:
        "Record the inspection attendance date before generating the Guidewire payload",
      status: 422,
    });
  }

  const certifications = await fetchTechnicianCertifications(userId);

  const nirOutput = buildNirReportOutput(
    inspection,
    technicianName,
    userId,
    certifications,
  );

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

    /**
     * Versioned insurer-agnostic claims envelope (schemaVersion-bound).
     * Contract: docs/contracts/claims-integration-v2.schema.json.
     * Insurer fields we don't hold are listed in explicitOmissions.
     */
    claimsIntegration: buildClaimsIntegrationExport({
      nir: nirOutput,
      inspectionId: id,
      policyNumber: policyNumber === "POL-UNKNOWN" ? null : policyNumber,
    }),

    meta: {
      inspectionId: id,
      inspectionStatus: inspection.status,
      generatedAt: new Date().toISOString(),
      guidewireApiBase: "/pc/rest/v1",
      integrationGuide: "https://docs.restoreassist.app/integrations/guidewire",
      note: "This payload is generated locally. No call is made to Guidewire. Submit claimPayload to your ClaimCenter instance using your insurer-issued OAuth 2.0 credentials.",
    },
  });
}
