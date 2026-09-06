import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import {
  attachRoomNamesToPins,
  resolveEvidenceRoomLink,
} from "@/lib/sketch/sync-room-graph";
import { toNormalized } from "@/lib/sketch/pin-coords";
import { signEvidencePinUrls } from "./sign-response";
import {
  inspectionStorageRef,
  toStorageLocator,
} from "@/lib/storage/sign-stored-url";

const PIN_KINDS = new Set(["photo", "video", "document", "voice"]);

async function loadSketchForInspection(inspectionId: string, sketchId: string) {
  return prisma.claimSketch.findFirst({
    where: { id: sketchId, inspectionId },
    select: {
      id: true,
      rooms: {
        select: {
          id: true,
          name: true,
          fabricObjectId: true,
          geometryJson: true,
        },
        take: 500,
      },
    },
  });
}

/** GET /api/inspections/[id]/sketches/[sketchId]/evidence-pins */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
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

    const { id, sketchId } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const sketch = await loadSketchForInspection(id, sketchId);
    if (!sketch) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Sketch not found",
        status: 404,
      });
    }

    const pins = await prisma.evidencePin.findMany({
      where: { sketchId },
      orderBy: { createdAt: "asc" },
      take: 1000,
      select: {
        id: true,
        sketchId: true,
        sketchRoomId: true,
        inspectionPhotoId: true,
        kind: true,
        x: true,
        y: true,
        nx: true,
        ny: true,
        rotationDeg: true,
        scale: true,
        fileUrl: true,
        thumbnailUrl: true,
        fileName: true,
        fileMimeType: true,
        caption: true,
        captureSource: true,
        syncState: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const responsePins = await Promise.all(
      attachRoomNamesToPins(pins, sketch.rooms).map(signEvidencePinUrls),
    );

    return NextResponse.json({ pins: responsePins });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-pins:list" });
  }
}

/** POST /api/inspections/[id]/sketches/[sketchId]/evidence-pins */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
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

    const { id, sketchId } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const sketch = await loadSketchForInspection(id, sketchId);
    if (!sketch) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Sketch not found",
        status: 404,
      });
    }

    const body = (await request.json()) as {
      kind?: string;
      x?: number;
      y?: number;
      nx?: number;
      ny?: number;
      canvasWidth?: number;
      canvasHeight?: number;
      sketchRoomId?: string | null;
      inspectionPhotoId?: string | null;
      fileUrl?: string | null;
      thumbnailUrl?: string | null;
      fileName?: string | null;
      fileMimeType?: string | null;
      fileSizeBytes?: number | null;
      caption?: string | null;
      captureSource?: string;
      rotationDeg?: number;
      scale?: number;
    };

    const linkedPhoto = body.inspectionPhotoId
      ? await prisma.inspectionPhoto.findFirst({
          where: { id: body.inspectionPhotoId, inspectionId: id },
          select: {
            id: true,
            url: true,
            thumbnailUrl: true,
            description: true,
            location: true,
            mimeType: true,
            fileSize: true,
          },
        })
      : null;
    if (body.inspectionPhotoId && !linkedPhoto) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Inspection photo not found",
        status: 400,
      });
    }

    const kind = body.kind ?? "photo";
    if (!PIN_KINDS.has(kind)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "kind must be photo | video | document | voice",
        status: 400,
      });
    }

    if (typeof body.x !== "number" || typeof body.y !== "number") {
      return apiError(request, {
        code: "VALIDATION",
        message: "x and y are required",
        status: 400,
      });
    }

    let nx = body.nx;
    let ny = body.ny;
    if (
      (nx == null || ny == null) &&
      typeof body.canvasWidth === "number" &&
      typeof body.canvasHeight === "number"
    ) {
      const n = toNormalized(
        body.x,
        body.y,
        body.canvasWidth,
        body.canvasHeight,
      );
      nx = n.nx;
      ny = n.ny;
    }

    let sketchRoomId = body.sketchRoomId ?? null;
    let roomName: string | null = null;
    let captureAdapter: string | null = null;
    if (!sketchRoomId) {
      const link = resolveEvidenceRoomLink(sketch.rooms, body.x, body.y);
      sketchRoomId = link?.sketchRoomId ?? null;
      roomName = link?.roomName ?? null;
      captureAdapter = link?.captureAdapter ?? null;
    } else {
      const named = sketch.rooms.find((r) => r.id === sketchRoomId);
      if (!named) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected room does not belong to this floor plan.",
          status: 400,
        });
      }
      roomName = named?.name ?? null;
      const geo = named?.geometryJson as {
        data?: { captureAdapter?: unknown };
      } | null;
      captureAdapter =
        typeof geo?.data?.captureAdapter === "string"
          ? geo.data.captureAdapter
          : null;
    }

    let fileUrl = linkedPhoto?.url ?? null;
    let thumbnailUrl = linkedPhoto?.thumbnailUrl ?? linkedPhoto?.url ?? null;
    if (!linkedPhoto && body.fileUrl) {
      const ref = inspectionStorageRef(body.fileUrl, id, "photos");
      if (!ref) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Evidence media must come from this inspection's private storage.",
          status: 400,
        });
      }
      fileUrl = toStorageLocator(ref);
    }
    if (!linkedPhoto && body.thumbnailUrl) {
      const ref = inspectionStorageRef(body.thumbnailUrl, id, "photos");
      if (!ref) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Evidence thumbnail must come from this inspection's private storage.",
          status: 400,
        });
      }
      thumbnailUrl = toStorageLocator(ref);
    }

    const pin = await prisma.evidencePin.create({
      data: {
        sketchId,
        sketchRoomId,
        inspectionPhotoId: linkedPhoto?.id ?? null,
        kind,
        x: body.x,
        y: body.y,
        nx: nx ?? null,
        ny: ny ?? null,
        rotationDeg: body.rotationDeg ?? 0,
        scale: body.scale ?? 1,
        fileUrl,
        thumbnailUrl,
        fileName: body.fileName ?? null,
        fileMimeType: linkedPhoto?.mimeType ?? body.fileMimeType ?? null,
        fileSizeBytes: linkedPhoto?.fileSize ?? body.fileSizeBytes ?? null,
        caption:
          linkedPhoto?.description ??
          linkedPhoto?.location ??
          body.caption ??
          null,
        capturedByUserId: session.user.id,
        captureSource: body.captureSource ?? "web",
        syncState: "synced",
      },
      select: {
        id: true,
        sketchId: true,
        sketchRoomId: true,
        inspectionPhotoId: true,
        kind: true,
        x: true,
        y: true,
        nx: true,
        ny: true,
        rotationDeg: true,
        scale: true,
        fileUrl: true,
        thumbnailUrl: true,
        fileName: true,
        caption: true,
        captureSource: true,
        syncState: true,
        createdAt: true,
      },
    });

    const responsePin = await signEvidencePinUrls({
      ...pin,
      roomName,
      captureAdapter,
    });

    return NextResponse.json({ pin: responsePin }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-pins:create" });
  }
}
