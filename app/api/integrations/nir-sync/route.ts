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
import {
  syncNIRToAllConnectedIntegrations,
  syncNIRToSpecificIntegration,
  type NIRJobPayload,
} from "@/lib/integrations/nir-sync-orchestrator";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { reportId, targetIntegrationId } = await request.json();
    if (!reportId)
      return NextResponse.json({ error: "reportId required" }, { status: 400 });

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
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (report.userId !== session.user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const inspection = report.inspection;
    const classification = inspection?.classifications?.[0];
    const costEstimates = inspection?.costEstimates ?? [];

    // Sum cost estimates. All CostEstimate.subtotal / total are Float (dollars) in schema.
    const totalExGSTDollars = costEstimates.reduce(
      (s, ce) => s + (ce.subtotal ?? 0),
      0,
    );
    const totalIncGSTDollars = costEstimates.reduce(
      (s, ce) => s + (ce.total ?? 0),
      0,
    );
    const fallback = report.totalCost ?? 0;

    const totalExGST = Math.round(
      (totalExGSTDollars > 0 ? totalExGSTDollars : fallback) * 100,
    );
    const totalIncGST = Math.round(
      (totalIncGSTDollars > 0 ? totalIncGSTDollars : fallback * 1.1) * 100,
    );
    const gstAmount = totalIncGST - totalExGST;

    const payload: NIRJobPayload = {
      reportId: report.id,
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
        gstRate: 10,
        subtotalExGST: Math.round(
          (costEstimates.find((ce) => ce.scopeItemId === item.id)?.subtotal ??
            0) * 100,
        ),
        iicrcRef: item.justification ?? undefined,
      })),
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
      ? [await syncNIRToSpecificIntegration(targetIntegrationId, payload)]
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
    console.error("[NIR Sync API]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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
