/**
 * RA-7694: structured room observations (odour, visible growth, staining).
 *
 * GET  /api/inspections/[id]/room-observations   list, oldest first
 * POST /api/inspections/[id]/room-observations   record one
 *
 * Records what was seen, smelt or measured. No species, diagnosis, condition or
 * clearance. The report prints these in Section 6C.
 *
 * One rule for both handlers: the caller's reach and the room's membership are
 * asserted in the SAME statement or transaction that reads or writes the rows,
 * never only in a check before it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  resolveInspectionReach,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { checkRoomObservationInput } from "@/lib/observations/room-observations";

const ROOM_OBSERVATION_LIST_LIMIT = 500;

const SELECT = {
  id: true,
  inspectionId: true,
  sketchRoomId: true,
  roomLabel: true,
  kind: true,
  basis: true,
  odourDescriptor: true,
  odourIntensity: true,
  odourPattern: true,
  areaM2: true,
  surface: true,
  detail: true,
  source: true,
  observedAt: true,
  createdAt: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;

    const reach = await resolveInspectionReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: reach.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: reach.reason ?? "Forbidden",
        status: reach.status,
      });
    }

    // The caller's reach is part of this query, so a job that leaves their
    // reach between a check and the read returns nothing.
    const where = { inspectionId: id, inspection: reach.data };
    const [observations, total] = await Promise.all([
      prisma.roomObservation.findMany({
        where,
        orderBy: { observedAt: "asc" },
        take: ROOM_OBSERVATION_LIST_LIMIT,
        select: SELECT,
      }),
      prisma.roomObservation.count({ where }),
    ]);
    if (total === 0) {
      // An empty list is only trusted for a job the caller can reach.
      const job = await prisma.inspection.findFirst({
        where: { id, ...reach.data },
        select: { id: true },
      });
      if (!job) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }
    }
    return NextResponse.json({
      observations,
      omitted: Math.max(0, total - observations.length),
    });
  } catch (error) {
    return fromException(request, error, { stage: "list-room-observations" });
  }
}

class RoomNotOnJob extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const userId = session.user.id;
    const { id } = await params;

    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const checked = checkRoomObservationInput(body);
    if (!checked.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: checked.message,
        status: 422,
      });
    }
    const input = checked.data;

    // D-028: re-check the caller's reach inside the write. A linked room is
    // looked up INSIDE the same transaction and every row the membership test
    // reads (the room AND its sketch, which carries the job) is held with FOR
    // SHARE until it commits, so neither can be deleted, detached or moved to
    // another job between the check and the insert. Its name is the label; a label sent
    // with a room id is ignored, so a record never names a different room than
    // the one it links to.
    let created;
    try {
      created = await writeWithinInspectionScope(
        tenancy.data.inspectionManyWhere,
        { updatedAt: new Date() },
        async (tx) => {
          let roomLabel = input.roomLabel;
          if (input.sketchRoomId) {
            const rooms = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
              SELECT sr."name" AS "name"
              FROM "SketchRoom" sr
              JOIN "ClaimSketch" cs ON cs."id" = sr."sketchId"
              WHERE sr."id" = ${input.sketchRoomId}
                AND sr."detachedAt" IS NULL
                AND cs."inspectionId" = ${id}
              FOR SHARE OF sr, cs
            `);
            if (rooms.length === 0) throw new RoomNotOnJob();
            roomLabel = rooms[0].name;
          }
          return tx.roomObservation.create({
            data: {
              inspectionId: id,
              sketchRoomId: input.sketchRoomId,
              roomLabel: roomLabel as string,
              kind: input.kind,
              basis: input.basis,
              odourDescriptor: input.odourDescriptor,
              odourIntensity: input.odourIntensity,
              odourPattern: input.odourPattern,
              areaM2: input.areaM2,
              surface: input.surface,
              detail: input.detail,
              source: "manual",
              capturedByUserId: userId,
              ...(input.observedAt ? { observedAt: input.observedAt } : {}),
            },
            select: SELECT,
          });
        },
      );
    } catch (e) {
      if (e instanceof RoomNotOnJob) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected room does not belong to this job.",
          status: 422,
        });
      }
      throw e;
    }
    if (!created) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    return NextResponse.json({ observation: created }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "create-room-observation" });
  }
}
