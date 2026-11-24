/**
 * Contents Pack-Out Items API — RA-290 (NIR Phase 2)
 *
 * GET  /api/inspections/[id]/contents-pack-out
 *   Returns all ContentsPackOutItems for this inspection, grouped by packOutDecision,
 *   each with its sketch room, plus the job's rooms an item can be filed
 *   against (RA-8501).
 *
 * POST /api/inspections/[id]/contents-pack-out
 *   Creates a new pack-out item. Stamps Inspection.claimType = CONTENTS.
 *   An optional sketchRoomId must name a room of this job that is not
 *   detached, or the request is refused with 422 (RA-8501).
 *
 * PATCH  /api/inspections/[id]/contents-pack-out/[itemId]
 *   Sets or clears an item's before / after photo (see [itemId]/route.ts).
 *
 * DELETE /api/inspections/[id]/contents-pack-out/[itemId]
 *   Removes a specific item (see [itemId]/route.ts).
 *
 * RA-8537: an item's photo URLs must name a photo already uploaded to this
 * job through /photos; GET re-signs them so private-bucket photos display.
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
import {
  resolvePackOutPhotos,
  signPackOutItemPhotos,
} from "@/lib/contents/pack-out-item-photos";
import { moneySafe } from "@/lib/auth/redact-money";

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

    const stored = await prisma.contentsPackOutItem.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: { sketchRoom: { select: { id: true, name: true } } },
    });

    // RA-8501: the rooms an item can be filed against. Detached rooms are
    // history, not a placement target (same rule as moisture readings). A hard
    // cap of 500 across all floors of the job: the sketches route reads 500 per
    // floor, so a job with more than 500 active rooms lists only the first 500
    // here (follow-up: page the room list).
    const rooms = await prisma.sketchRoom.findMany({
      where: { detachedAt: null, sketch: { inspectionId: id } },
      select: { id: true, name: true, floorNumber: true },
      orderBy: [{ floorNumber: "asc" }, { name: "asc" }],
      take: 500,
    });
    // RA-8537: stored photo URLs on a private bucket do not load unsigned.
    const items = await Promise.all(stored.map(signPackOutItemPhotos));

    const totalReplacementValueAud = items.reduce(
      (sum, item) =>
        item.packOutDecision === "TOTAL_LOSS"
          ? sum + Number(item.replacementValueAud ?? 0)
          : sum,
      0,
    );

    // RA-8494 / D-028: pack-out items carry replacement values and
    // restoration estimates, which are money.
    return NextResponse.json(await moneySafe(session, {
      items,
      rooms,
      summary: {
        totalItems: items.length,
        cleanOnsite: items.filter((i) => i.packOutDecision === "CLEAN_ONSITE")
          .length,
        packOut: items.filter((i) => i.packOutDecision === "PACK_OUT").length,
        totalLoss: items.filter((i) => i.packOutDecision === "TOTAL_LOSS")
          .length,
        totalReplacementValueAud,
      },
    }));
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

      // RA-8537: a photo must be one already uploaded to this job.
      const photos = await resolvePackOutPhotos(id, {
        beforePhotoUrl: data.beforePhotoUrl,
        afterPhotoUrl: data.afterPhotoUrl,
      });
      if (!photos.ok) {
        return apiError(req, {
          code: "VALIDATION",
          message: `${photos.field} is not a photo on this job. Upload it to the job's photos first.`,
          status: 400,
        });
      }

      // RA-8501: a room must belong to this job and still be on its sketch.
      let sketchRoomId: string | null = null;
      if (data.sketchRoomId) {
        const room = await prisma.sketchRoom.findFirst({
          where: {
            id: data.sketchRoomId,
            detachedAt: null,
            sketch: { inspectionId: id },
          },
          select: { id: true },
        });
        if (!room) {
          return apiError(req, {
            code: "VALIDATION",
            message: "The selected room does not belong to this job.",
            status: 422,
          });
        }
        sketchRoomId = room.id;
      }

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
              beforePhotoUrl: photos.data.beforePhotoUrl ?? null,
              afterPhotoUrl: photos.data.afterPhotoUrl ?? null,
              claimType: data.claimType ?? null,
              sketchRoomId,
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

      return NextResponse.json(
        await moneySafe(session, await signPackOutItemPhotos(record)),
        { status: 201 },
      );
    } catch (err) {
      return fromException(req, err, { stage: "contents-pack-out:create" });
    }
  });
}
