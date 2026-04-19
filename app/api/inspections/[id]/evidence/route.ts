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
import { withIdempotency } from "@/lib/idempotency";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = await params;

  try {
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId },
      orderBy: { capturedAt: "desc" },
    });

    return NextResponse.json({ evidenceItems });
  } catch (error) {
    console.error("[evidence GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // RA-1266: evidence items are append-only with chain-of-custody —
  // retry creates duplicate C2PA-manifest records, which breaks the
  // one-reading-per-capture invariant (Board M-10).
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const inspection = await prisma.inspection.findFirst({
        where: { id: inspectionId, userId },
      });
      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
        );
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
      console.error("[evidence POST]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: inspectionId } = await params;
  const body = await request.json();
  const { evidenceId } = body;

  try {
    // Verify ownership chain
    const evidence = await prisma.evidenceItem.findFirst({
      where: {
        id: evidenceId,
        inspectionId,
        inspection: { userId: session.user.id },
      },
    });

    if (!evidence) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    }

    await prisma.evidenceItem.delete({ where: { id: evidenceId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[evidence DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
