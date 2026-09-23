/**
 * POST /api/integrations/nir-sync
 *
 * Trigger NIR sync to all connected integrations (or a specific one).
 *
 * Body: { reportId: string, targetIntegrationId?: string }
 *
 * Schema field mapping (verified against prisma/schema.prisma):
 *   report.hazardType              → damageType (WATER/FIRE/MOULD/GENERAL)
 *   report.claimReferenceNumber    → insuranceClaim
 *   report.technicianName          → technician
 *   report.waterCategory           → waterCategory (IICRC S500 field)
 *   report.waterClass              → waterClass (IICRC S500 field)
 *   report.totalCost               → fallback total
 *   report.inspection.scopeItems   → scope items (NOT report.scopeItems)
 *   report.inspection.costEstimates → financial totals
 *   scopeItem.justification        → iicrcRef
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  syncNIRToAllConnectedIntegrations,
  syncNIRToSpecificIntegration,
  type NIRJobPayload,
} from "@/lib/integrations/nir-sync-orchestrator";
import { resolveUserGstTreatment } from "@/lib/gst/resolve-user-gst";
import { computeGstCents } from "@/lib/gst-rules";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });

    const { reportId, targetIntegrationId } = await request.json();
    if (!reportId)
      return apiError(request, {
        code: "VALIDATION",
        message: "reportId required",
        status: 400,
      });

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        client: true,
        inspection: {
          include: {
            scopeItems: true,
            costEstimates: true,
            classifications: {
              where: { isFinal: true },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!report)
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    if (report.userId !== session.user.id)
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });

    const inspection = report.inspection;
    const classification = inspection?.classifications?.[0];
    const costEstimates = inspection?.costEstimates ?? [];

    // Sum cost estimates. All CostEstimate money columns are Float (dollars),
    // ex-GST. RA-7725: since RA-7708 the contingency is its own row (subtotal
    // 0, amount in contingency and total), so it belongs in the ex-GST base.
    // Treating the total as inc-GST booked the contingency as tax.
    const totalExGSTDollars = costEstimates.reduce(
      (s, ce) => s + (ce.subtotal ?? 0) + (ce.contingency ?? 0),
      0,
    );
    const fallback = report.totalCost ?? 0;
    const gstTreatment = await resolveUserGstTreatment(session.user.id);

    const totalExGST = Math.round(
      (totalExGSTDollars > 0 ? totalExGSTDollars : fallback) * 100,
    );
    const gstAmount = computeGstCents(totalExGST, gstTreatment.country);
    const totalIncGST = totalExGST + gstAmount;

    const payload: NIRJobPayload = {
      reportId: report.id,
      country: gstTreatment.country,
      currency: gstTreatment.currency,
      clientName: report.client?.name ?? report.clientName,
      clientEmail: report.client?.email ?? undefined,
      clientPhone: report.client?.phone ?? undefined,
      clientAddress: report.client?.address ?? undefined,
      propertyAddress: report.propertyAddress,
      reportNumber: report.reportNumber ?? report.id,
      damageType: mapDamageType(report.hazardType),
      waterCategory: (report.waterCategory ??
        classification?.category ??
        undefined) as "1" | "2" | "3" | undefined,
      waterClass: (report.waterClass ?? classification?.class ?? undefined) as
        | "1"
        | "2"
        | "3"
        | "4"
        | undefined,
      scopeItems: (inspection?.scopeItems ?? []).map((item: any) => ({
        description: item.description,
        category: item.itemType,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? "each",
        unitPriceExGST: Math.round(
          (costEstimates.find((ce) => ce.scopeItemId === item.id)?.rate ?? 0) *
            100,
        ),
        gstRate: gstTreatment.ratePercent,
        subtotalExGST: Math.round(
          (costEstimates.find((ce) => ce.scopeItemId === item.id)?.subtotal ??
            0) * 100,
        ),
        iicrcRef: item.justification ?? undefined,
      })),
      // RA-7736: the contingency row has no scope item (RA-7708), so the
      // scope mapping above never carries it. Hand it over separately.
      contingencyExGST: Math.round(
        costEstimates.reduce((s, ce) => s + (ce.contingency ?? 0), 0) * 100,
      ),
      totalExGST,
      gstAmount,
      totalIncGST,
      inspectionDate:
        report.inspectionDate ?? inspection?.inspectionDate ?? report.createdAt,
      reportDate: report.createdAt,
      technician:
        report.technicianName ?? inspection?.technicianName ?? undefined,
      insuranceClaim: report.claimReferenceNumber ?? undefined,
      notes: report.description ?? undefined,
    };

    const results = targetIntegrationId
      ? [
          await syncNIRToSpecificIntegration(
            session.user.id,
            targetIntegrationId,
            payload,
          ),
        ]
      : await syncNIRToAllConnectedIntegrations(session.user.id, payload);

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: results.filter((r) => r.status === "success").length,
        errors: results.filter((r) => r.status === "error").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "nir-sync" });
  }
}

function mapDamageType(
  raw?: string | null,
): "WATER" | "FIRE" | "MOULD" | "GENERAL" {
  if (!raw) return "GENERAL";
  const u = raw.toUpperCase();
  if (u.includes("WATER") || u.includes("FLOOD") || u.includes("LEAK"))
    return "WATER";
  if (u.includes("FIRE") || u.includes("SMOKE") || u.includes("SOOT"))
    return "FIRE";
  if (u.includes("MOULD") || u.includes("MOLD") || u.includes("FUNGAL"))
    return "MOULD";
  return "GENERAL";
}
