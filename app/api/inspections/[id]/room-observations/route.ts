/**
 * RA-7694: structured room observations (odour, visible growth, staining).
 *
 * GET  /api/inspections/[id]/room-observations   list, oldest first
 * POST /api/inspections/[id]/room-observations   record one
 *
 * Records what was seen, smelt or measured. No species, diagnosis, condition or
 * clearance. The report prints these in Section 6C.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  assertInspectionReadable,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { checkRoomObservationInput } from "@/lib/observations/room-observations";

const LIST_LIMIT = 500;

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

    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const observations = await prisma.roomObservation.findMany({
      where: { inspectionId: id },
      orderBy: { observedAt: "asc" },
      take: LIST_LIMIT,
      select: SELECT,
    });
    return NextResponse.json({ observations });
  } catch (error) {
    return fromException(request, error, { stage: "list-room-observations" });
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

    // A linked room must belong to THIS job's floor plan and still exist on it.
    // Its name is copied onto the record so the report keeps it.
    let roomLabel = input.roomLabel;
    if (input.sketchRoomId) {
      const room = await prisma.sketchRoom.findFirst({
        where: {
          id: input.sketchRoomId,
          detachedAt: null,
          sketch: { inspectionId: id },
        },
        select: { name: true },
      });
      if (!room) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected room does not belong to this job.",
          status: 422,
        });
      }
      roomLabel = roomLabel ?? room.name;
    }

    // D-028: re-check the caller's reach inside the write.
    const created = await writeWithinInspectionScope(
      tenancy.data.inspectionManyWhere,
      { updatedAt: new Date() },
      (tx) =>
        tx.roomObservation.create({
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
        }),
    );
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
