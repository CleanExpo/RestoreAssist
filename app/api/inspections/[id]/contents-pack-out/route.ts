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
import { packOutItemSchema } from "@/lib/contents/pack-out-item-schema";
import { withIdempotency } from "@/lib/idempotency";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// ─── Validation ────────────────────────────────────────────────────────────────
// RA-8533: the schema lives in lib/contents so the Contents form builds its
// body from the same contract this route validates.

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

      const record = await writeWithinInspectionScope(
        tenancy.data.inspectionManyWhere,
        // Stamp Inspection.claimType = CONTENTS; this scoped update is also the
        // gate, so the item is only created while the caller still holds the
        // inspection.
        { claimType: "CONTENTS" },
        (tx) =>
          tx.contentsPackOutItem.create({
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
          }),
      );

      // Null means the caller's scope no longer claims this inspection.
      // 404, never 403, so a tenant cannot learn the id exists.
      if (!record) {
        return apiError(req, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      return NextResponse.json(record, { status: 201 });
    } catch (err) {
      return fromException(req, err, { stage: "contents-pack-out:create" });
    }
  });
}
