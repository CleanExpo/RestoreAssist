/**
 * Contents Pack-Out Items API — RA-290 (NIR Phase 2)
 *
 * GET  /api/inspections/[id]/contents-pack-out
 *   Returns all ContentsPackOutItems for this inspection, grouped by packOutDecision.
 *
 * POST /api/inspections/[id]/contents-pack-out
 *   Creates a new pack-out item. Stamps Inspection.claimType = CONTENTS.
 *
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific item (see [itemId]/route.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withIdempotency } from "@/lib/idempotency";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// ─── Validation ────────────────────────────────────────────────────────────────

const packOutItemSchema = z.object({
  itemDescription: z.string().min(1),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  ageYears: z.number().int().nonnegative().nullable().optional(),
  conditionPreLoss: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
    .nullable()
    .optional(),
  conditionPostLoss: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
    .nullable()
    .optional(),
  replacementValueAud: z.number().nonnegative().nullable().optional(),
  restorationCostEstimate: z.number().nonnegative().nullable().optional(),
  packOutDecision: z
    .enum(["CLEAN_ONSITE", "PACK_OUT", "TOTAL_LOSS"])
    .nullable()
    .optional(),
  packOutTag: z.string().nullable().optional(),
  beforePhotoUrl: z.string().url().nullable().optional(),
  afterPhotoUrl: z.string().url().nullable().optional(),
  claimType: z
    .enum([
      "WATER",
      "FIRE",
      "MOULD",
      "STORM",
      "CONTENTS",
      "BIOHAZARD",
      "ODOUR",
      "CARPET",
      "HVAC",
      "ASBESTOS",
    ])
    .nullable()
    .optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(_req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const { id } = await params;

    // RA-1711 batch 3 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const items = await prisma.contentsPackOutItem.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    const totalReplacementValueAud = items.reduce(
      (sum, item) =>
        item.packOutDecision === "TOTAL_LOSS"
          ? sum + Number(item.replacementValueAud ?? 0)
          : sum,
      0,
    );

    return NextResponse.json({
      items,
      summary: {
        totalItems: items.length,
        cleanOnsite: items.filter((i) => i.packOutDecision === "CLEAN_ONSITE")
          .length,
        packOut: items.filter((i) => i.packOutDecision === "PACK_OUT").length,
        totalLoss: items.filter((i) => i.packOutDecision === "TOTAL_LOSS")
          .length,
        totalReplacementValueAud,
      },
    });
  } catch (err) {
    return fromException(_req, err, { stage: "contents-pack-out:list" });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: prevents duplicate pack-out item rows on retry.
  return withIdempotency(req, userId, async (rawBody) => {
    try {
      // RA-1711 batch 3 — adopt shared tenancy helper.
      // RA-6800 — scope the write so ownership is re-asserted atomically.
      const tenancy = await resolveInspectionWrite(session, id);
      if (!tenancy.ok) {
        return NextResponse.json(
          { error: tenancy.reason },
          { status: tenancy.status },
        );
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(req, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const parsed = packOutItemSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid data", details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const data = parsed.data;

      const record = await prisma.contentsPackOutItem.create({
        data: {
          inspectionId: id,
          itemDescription: data.itemDescription,
          make: data.make ?? null,
          model: data.model ?? null,
          serialNumber: data.serialNumber ?? null,
          ageYears: data.ageYears ?? null,
          conditionPreLoss: data.conditionPreLoss ?? null,
          conditionPostLoss: data.conditionPostLoss ?? null,
          replacementValueAud: data.replacementValueAud ?? null,
          restorationCostEstimate: data.restorationCostEstimate ?? null,
          packOutDecision: data.packOutDecision ?? null,
          packOutTag: data.packOutTag ?? null,
          beforePhotoUrl: data.beforePhotoUrl ?? null,
          afterPhotoUrl: data.afterPhotoUrl ?? null,
          claimType: data.claimType ?? null,
        },
      });

      // Stamp Inspection.claimType = CONTENTS if no claim type already set
      await prisma.inspection.update({
        where: tenancy.data.inspectionWhere,
        data: { claimType: "CONTENTS" },
      });

      return NextResponse.json(record, { status: 201 });
    } catch (err) {
      return fromException(req, err, { stage: "contents-pack-out:create" });
    }
  });
}
