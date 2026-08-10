/**
 * Cost estimates for an inspection.
 *
 * GET  — list CostEstimate rows
 * POST — generate from selected scope items via estimateCosts (replaces prior rows)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateCosts } from "@/lib/nir-cost-estimation";
import { apiError, fromException } from "@/lib/api-errors";
import { z } from "zod";

const postSchema = z.object({
  /** When true, regenerate even if estimates already exist (default true). */
  replace: z.boolean().optional().default(true),
});

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
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const costEstimates = await prisma.costEstimate.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ costEstimates });
  } catch (error) {
    return fromException(request, error, { stage: "cost-estimates-get" });
  }
}

export async function POST(
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
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        status: true,
        propertyPostcode: true,
        scopeItems: {
          where: { isSelected: true },
          select: {
            id: true,
            itemType: true,
            description: true,
            quantity: true,
            unit: true,
            specification: true,
            justification: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    let replace = true;
    try {
      const raw = await request.json().catch(() => ({}));
      const parsed = postSchema.safeParse(raw ?? {});
      if (parsed.success) replace = parsed.data.replace;
    } catch {
      // empty body is fine
    }

    if (inspection.scopeItems.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Select at least one scope item before generating a cost estimate",
        status: 400,
      });
    }

    const region =
      inspection.propertyPostcode?.length >= 4
        ? null // state not on Inspection; NRPG midpoints don't need it
        : null;

    const costEstimate = await estimateCosts(
      inspection.scopeItems,
      region,
      null,
      session.user.id,
    );

    if (costEstimate.items.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "No priced lines could be generated from the selected scope items. Check item types against the pricing catalog.",
        status: 400,
      });
    }

    const contingencyPerItem =
      costEstimate.items.length > 0
        ? costEstimate.contingency / costEstimate.items.length
        : 0;

    const costEstimates = await prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.costEstimate.deleteMany({ where: { inspectionId: id } });
      }

      await tx.costEstimate.createMany({
        data: costEstimate.items.map((costItem) => ({
          inspectionId: id,
          scopeItemId: costItem.scopeItemId ?? null,
          category: costItem.category,
          description: costItem.description,
          quantity: costItem.quantity,
          unit: costItem.unit,
          rate: costItem.rate,
          subtotal: costItem.subtotal,
          costDatabaseId: costItem.costDatabaseId || null,
          isEstimated: costItem.isEstimated,
          contingency: contingencyPerItem,
          total: costItem.subtotal + contingencyPerItem,
        })),
      });

      // Advance status when still pre-estimate (don't regress later states).
      if (
        ["DRAFT", "IN_PROGRESS", "CLASSIFIED", "SCOPED"].includes(
          inspection.status,
        )
      ) {
        await tx.inspection.update({
          where: { id },
          data: { status: "ESTIMATED" },
        });
      }

      await tx.auditLog.create({
        data: {
          inspectionId: id,
          action: "Cost estimates generated",
          entityType: "CostEstimate",
          userId: session.user.id,
          changes: JSON.stringify({
            itemCount: costEstimate.items.length,
            total: costEstimate.total,
            pricingSource: costEstimate.pricingSource,
          }),
        },
      });

      return tx.costEstimate.findMany({
        where: { inspectionId: id },
        orderBy: { createdAt: "asc" },
      });
    });

    return NextResponse.json(
      {
        costEstimates,
        summary: {
          subtotal: costEstimate.subtotal,
          contingency: costEstimate.contingency,
          total: costEstimate.total,
          pricingSource: costEstimate.pricingSource,
          nrpgCompliant: costEstimate.nrpgCompliant,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "cost-estimates-post" });
  }
}
