/**
 * Sprint G: Evidence API — CRUD for evidence items on an inspection
 * GET    /api/inspections/[id]/evidence — List all evidence
 * POST   /api/inspections/[id]/evidence — Create evidence item
 * DELETE /api/inspections/[id]/evidence — Delete evidence item (body: { evidenceId })
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { withIdempotency } from "@/lib/idempotency";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: inspectionId } = await params;

  try {
    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId },
      orderBy: { capturedAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ evidenceItems });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-get" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // RA-1711 batch 4 — adopt shared tenancy helper.
  const tenancy = await assertInspectionTenancy(session, inspectionId);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  // RA-1266: evidence items are append-only with chain-of-custody —
  // retry creates duplicate C2PA-manifest records, which breaks the
  // one-reading-per-capture invariant (Board M-10).
  return withIdempotency(
    request,
    userId,
    async (rawBody) => {
      try {
        let body: any;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return apiError(request, {
            code: "VALIDATION",
            message: "Invalid JSON body",
            status: 400,
          });
        }

        const {
          workflowStepId,
          evidenceClass,
          fileUrl,
          fileMimeType,
          fileSizeBytes,
          thumbnailUrl,
          structuredData,
          notes,
          capturedLat,
          capturedLng,
          deviceId,
          deviceType,
        } = body;

        const evidenceItem = await prisma.evidenceItem.create({
          data: {
            inspectionId,
            workflowStepId: workflowStepId || null,
            evidenceClass,
            capturedById: userId,
            capturedByName: session.user.name || "Unknown",
            capturedAt: new Date(),
            capturedLat: capturedLat || null,
            capturedLng: capturedLng || null,
            deviceId: deviceId || null,
            deviceType: deviceType || "WEB_BROWSER",
            fileUrl: fileUrl || null,
            fileMimeType: fileMimeType || null,
            fileSizeBytes: fileSizeBytes || null,
            thumbnailUrl: thumbnailUrl || null,
            structuredData: structuredData
              ? JSON.stringify(structuredData)
              : null,
            ...(notes !== undefined &&
              notes !== null &&
              ({ notes: notes || null } as any)),
          },
        });

        return NextResponse.json({ evidenceItem }, { status: 201 });
      } catch (error) {
        return fromException(request, error, { stage: "evidence-post" });
      }
    },
    tenancy.data.workspaceId
      ? {
          clientMutation: {
            workspaceId: tenancy.data.workspaceId,
            userId,
            inspectionId,
            mutationType: "evidence-item",
          },
        }
      : undefined,
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: inspectionId } = await params;
  const body = await request.json();
  const { evidenceId } = body;

  try {
    // RA-1711 batch 4 — adopt shared tenancy helper.
    // RA-6800 — scope the child write so ownership is re-asserted atomically.
    const tenancy = await resolveInspectionWrite(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const evidence = await prisma.evidenceItem.findFirst({
      where: { id: evidenceId, inspectionId },
    });

    if (!evidence) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Evidence not found",
        status: 404,
      });
    }

    await prisma.evidenceItem.delete({
      where: {
        id: evidenceId,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-delete" });
  }
}
