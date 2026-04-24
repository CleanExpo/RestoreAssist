import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 20,
    prefix: "estimates",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: Idempotency-Key prevents duplicate estimates on client retry.
  // Rate limit stays outside so repeated keys still count toward the quota.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, { code: "VALIDATION", message: "Invalid JSON body", status: 400 });
      }
      const {
        reportId,
        scopeId,
        rateTables,
        commercialParams,
        lineItems,
        assumptions,
        inclusions,
        exclusions,
        allowances,
        complianceStatement,
        disclaimer,
        status,
        version,
      } = body;

      // Validate required fields
      if (!reportId) {
        return apiError(request, { code: "VALIDATION", message: "Missing required field: reportId", status: 400 });
      }

      // Tenancy check — the report must belong to the caller (RA-1362)
      const report = await prisma.report.findFirst({
        where: { id: reportId, userId: userId },
        select: { id: true },
      });
      if (!report) {
        return apiError(request, { code: "NOT_FOUND", message: "Report not found", status: 404 });
      }

      // Verify prisma.estimate exists
      if (!prisma || typeof prisma.estimate === "undefined") {
        return apiError(request, {
          code: "INTERNAL",
          message: "Database models not initialized. Please contact support.",
          status: 500,
          stage: "prisma-init-check",
        });
      }

      // Check if estimate already exists (by reportId or scopeId)
      const existingEstimate = await prisma.estimate.findFirst({
        where: {
          OR: [{ reportId }, ...(scopeId ? [{ scopeId }] : [])],
        },
        include: {
          lineItems: true,
        },
      });

      const estimateData = {
        reportId,
        scopeId: scopeId || null,
        status: status || "DRAFT",
        version: existingEstimate ? existingEstimate.version + 1 : version || 1,
        rateTables: rateTables ? JSON.stringify(rateTables) : null,
        commercialParams: commercialParams
          ? JSON.stringify(commercialParams)
          : null,
        labourSubtotal: body.labourSubtotal || 0,
        equipmentSubtotal: body.equipmentSubtotal || 0,
        chemicalsSubtotal: body.chemicalsSubtotal || 0,
        subcontractorSubtotal: body.subcontractorSubtotal || 0,
        travelSubtotal: body.travelSubtotal || 0,
        wasteSubtotal: body.wasteSubtotal || 0,
        overheads: body.overheads || 0,
        profit: body.profit || 0,
        contingency: body.contingency || 0,
        escalation: body.escalation || 0,
        subtotalExGST: body.subtotalExGST || 0,
        gst: body.gst || 0,
        totalIncGST: body.totalIncGST || 0,
        assumptions: assumptions ? sanitizeString(assumptions, 5000) : null,
        inclusions: inclusions ? sanitizeString(inclusions, 5000) : null,
        exclusions: exclusions ? sanitizeString(exclusions, 5000) : null,
        allowances: allowances ? sanitizeString(allowances, 5000) : null,
        complianceStatement: complianceStatement
          ? sanitizeString(complianceStatement, 5000)
          : null,
        disclaimer: disclaimer ? sanitizeString(disclaimer, 5000) : null,
        estimatedDuration: body.estimatedDuration || null,
        updatedBy: userId,
      };

      let estimate;

      if (existingEstimate) {
        // RA-1359 — diff-and-sync instead of deleteMany+create. The old
        // code wiped createdBy / modifiedBy / modifiedAt / changeReason
        // on every save, destroying the line-item audit trail that the
        // billing-dispute evidence story depends on.
        //
        // Strategy: for each incoming line item with a matching DB id,
        // UPDATE (preserving createdBy, bumping modifiedBy + modifiedAt).
        // Incoming items without an id, or whose id isn't in the DB, get
        // CREATED. DB items whose id isn't in the incoming set are
        // DELETED. All three happen inside a single transaction so the
        // estimate + its line-item diff land atomically.
        const incoming = (lineItems || []) as any[];
        const incomingIds = new Set(
          incoming.map((item) => item.id).filter((id): id is string => !!id),
        );

        const existingLineItems = await prisma.estimateLineItem.findMany({
          where: { estimateId: existingEstimate.id },
          select: { id: true },
        });

        const toDeleteIds = existingLineItems
          .map((li) => li.id)
          .filter((id) => !incomingIds.has(id));

        // Separate incoming into existing-update vs brand-new
        const toUpdate = incoming.filter(
          (item) => item.id && incomingIds.has(item.id) &&
            existingLineItems.some((li) => li.id === item.id),
        );
        const toCreate = incoming.filter(
          (item) => !item.id || !existingLineItems.some((li) => li.id === item.id),
        );

        estimate = await prisma.$transaction(async (tx) => {
          if (toDeleteIds.length > 0) {
            await tx.estimateLineItem.deleteMany({
              where: { id: { in: toDeleteIds } },
            });
          }

          for (const item of toUpdate) {
            await tx.estimateLineItem.update({
              where: { id: item.id },
              data: {
                code: item.code || null,
                category: item.category,
                description: item.description,
                qty: item.qty,
                unit: item.unit,
                rate: item.rate,
                formula: item.formula || null,
                subtotal: item.subtotal || item.qty * item.rate,
                isScopeLinked: item.isScopeLinked || false,
                isEstimatorAdded: item.isEstimatorAdded !== false,
                displayOrder: item.displayOrder || 0,
                // RA-1359: preserve createdBy; track the edit on
                // modifiedBy + modifiedAt + changeReason.
                modifiedBy: userId,
                modifiedAt: new Date(),
                changeReason: item.changeReason || null,
                sourceCostItemId: item.sourceCostItemId || null,
              },
            });
          }

          return await tx.estimate.update({
            where: { id: existingEstimate.id },
            data: {
              ...estimateData,
              lineItems: {
                create: toCreate.map((item: any) => ({
                  code: item.code || null,
                  category: item.category,
                  description: item.description,
                  qty: item.qty,
                  unit: item.unit,
                  rate: item.rate,
                  formula: item.formula || null,
                  subtotal: item.subtotal || item.qty * item.rate,
                  isScopeLinked: item.isScopeLinked || false,
                  isEstimatorAdded: item.isEstimatorAdded !== false,
                  displayOrder: item.displayOrder || 0,
                  createdBy: userId,
                  changeReason: item.changeReason || null,
                  sourceCostItemId: item.sourceCostItemId || null,
                })),
              },
            },
            include: {
              lineItems: true,
            },
          });
        });
      } else {
        // Create new estimate
        estimate = await prisma.estimate.create({
          data: {
            ...estimateData,
            createdBy: userId,
            userId: userId,
            lineItems: {
              create: (lineItems || []).map((item: any) => ({
                code: item.code || null,
                category: item.category,
                description: item.description,
                qty: item.qty,
                unit: item.unit,
                rate: item.rate,
                formula: item.formula || null,
                subtotal: item.subtotal || item.qty * item.rate,
                isScopeLinked: item.isScopeLinked || false,
                isEstimatorAdded: item.isEstimatorAdded !== false,
                displayOrder: item.displayOrder || 0,
                createdBy: userId,
                modifiedBy: userId,
                changeReason: item.changeReason || null,
                sourceCostItemId: item.sourceCostItemId || null,
              })),
            },
          },
          include: {
            lineItems: true,
          },
        });
      }

      return NextResponse.json({
        id: estimate.id,
        reportId: estimate.reportId,
        scopeId: estimate.scopeId,
        status: estimate.status,
        version: estimate.version,
        rateTables: estimate.rateTables
          ? JSON.parse(estimate.rateTables)
          : null,
        commercialParams: estimate.commercialParams
          ? JSON.parse(estimate.commercialParams)
          : null,
        lineItems: estimate.lineItems,
        totals: {
          labourSubtotal: estimate.labourSubtotal,
          equipmentSubtotal: estimate.equipmentSubtotal,
          chemicalsSubtotal: estimate.chemicalsSubtotal,
          subcontractorSubtotal: estimate.subcontractorSubtotal,
          travelSubtotal: estimate.travelSubtotal,
          wasteSubtotal: estimate.wasteSubtotal,
          overheads: estimate.overheads,
          profit: estimate.profit,
          contingency: estimate.contingency,
          escalation: estimate.escalation,
          subtotalExGST: estimate.subtotalExGST,
          gst: estimate.gst,
          totalIncGST: estimate.totalIncGST,
        },
        assumptions: estimate.assumptions,
        inclusions: estimate.inclusions,
        exclusions: estimate.exclusions,
        allowances: estimate.allowances,
        complianceStatement: estimate.complianceStatement,
        disclaimer: estimate.disclaimer,
      });
    } catch (error) {
      // fromException maps P2002 → 409 CONFLICT and P2003 → 409 CONFLICT
      // automatically (see lib/api-errors.ts).
      return fromException(request, error, { stage: "save" });
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get("reportId");

    if (reportId) {
      // Verify prisma.estimate exists
      if (!prisma || typeof prisma.estimate === "undefined") {
        return apiError(request, {
          code: "INTERNAL",
          message: "Database models not initialized",
          status: 500,
          stage: "prisma-init-check",
        });
      }

      // Get estimate for specific report
      const estimate = await prisma.estimate.findFirst({
        where: {
          reportId,
          userId: session.user.id,
        },
        include: {
          lineItems: {
            orderBy: { displayOrder: "asc" },
          },
          versions: {
            orderBy: { version: "desc" },
          },
          variations: {
            orderBy: { variationNumber: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!estimate) {
        return apiError(request, { code: "NOT_FOUND", message: "Estimate not found", status: 404 });
      }

      return NextResponse.json({
        id: estimate.id,
        reportId: estimate.reportId,
        scopeId: estimate.scopeId,
        status: estimate.status,
        version: estimate.version,
        rateTables: estimate.rateTables
          ? JSON.parse(estimate.rateTables)
          : null,
        commercialParams: estimate.commercialParams
          ? JSON.parse(estimate.commercialParams)
          : null,
        lineItems: estimate.lineItems,
        totals: {
          labourSubtotal: estimate.labourSubtotal,
          equipmentSubtotal: estimate.equipmentSubtotal,
          chemicalsSubtotal: estimate.chemicalsSubtotal,
          subcontractorSubtotal: estimate.subcontractorSubtotal,
          travelSubtotal: estimate.travelSubtotal,
          wasteSubtotal: estimate.wasteSubtotal,
          overheads: estimate.overheads,
          profit: estimate.profit,
          contingency: estimate.contingency,
          escalation: estimate.escalation,
          subtotalExGST: estimate.subtotalExGST,
          gst: estimate.gst,
          totalIncGST: estimate.totalIncGST,
        },
        assumptions: estimate.assumptions,
        inclusions: estimate.inclusions,
        exclusions: estimate.exclusions,
        allowances: estimate.allowances,
        complianceStatement: estimate.complianceStatement,
        disclaimer: estimate.disclaimer,
        versions: estimate.versions,
        variations: estimate.variations,
      });
    }

    // Get all estimates for user
    const estimates = await prisma.estimate.findMany({
      where: { userId: session.user.id },
      include: {
        report: {
          select: {
            id: true,
            title: true,
            clientName: true,
            propertyAddress: true,
          },
        },
        lineItems: {
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      estimates.map((estimate: (typeof estimates)[number]) => ({
        id: estimate.id,
        reportId: estimate.reportId,
        scopeId: estimate.scopeId,
        status: estimate.status,
        version: estimate.version,
        rateTables: estimate.rateTables
          ? JSON.parse(estimate.rateTables)
          : null,
        commercialParams: estimate.commercialParams
          ? JSON.parse(estimate.commercialParams)
          : null,
        totals: {
          totalIncGST: estimate.totalIncGST,
        },
        report: estimate.report,
        lineItems: estimate.lineItems,
      })),
    );
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}
