import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const VALID_EVIDENCE_CLASSES = [
  "SITE_OVERVIEW",
  "DAMAGE_CLOSE_UP",
  "MOISTURE_READING",
  "THERMAL_IMAGE",
  "EQUIPMENT_PLACEMENT",
  "CONTAINMENT_SETUP",
  "AIR_QUALITY_READING",
  "MATERIAL_SAMPLE",
  "FLOOR_PLAN_ANNOTATION",
  "PROGRESS_PHOTO",
  "COMPLETION_PHOTO",
  "AFFECTED_CONTENTS",
  "STRUCTURAL_ASSESSMENT",
  "SAFETY_HAZARD",
  "UTILITY_STATUS",
  "ENVIRONMENTAL_CONDITION",
  "OTHER",
] as const;

const VALID_MEDIA_TYPES = [
  "PHOTO",
  "VIDEO",
  "AUDIO",
  "NOTE",
  "READING",
  "SKETCH",
  "DOCUMENT",
] as const;

// GET - List evidence items for an inspection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId: id },
      include: { custodyEvents: true },
      orderBy: { capturedAt: "desc" },
    });

    return NextResponse.json({ data: evidenceItems });
  } catch (error) {
    console.error("Error fetching evidence items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create a new evidence item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.evidenceClass) {
      return NextResponse.json(
        { error: "evidenceClass is required" },
        { status: 400 },
      );
    }

    if (
      !VALID_EVIDENCE_CLASSES.includes(
        body.evidenceClass as (typeof VALID_EVIDENCE_CLASSES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid evidenceClass. Must be one of: ${VALID_EVIDENCE_CLASSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!body.mediaType) {
      return NextResponse.json(
        { error: "mediaType is required" },
        { status: 400 },
      );
    }

    if (
      !VALID_MEDIA_TYPES.includes(
        body.mediaType as (typeof VALID_MEDIA_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Generate content hash if fileUrl is provided
    const contentHash = body.fileUrl
      ? crypto.createHash("sha256").update(body.fileUrl).digest("hex")
      : null;

    // Create evidence item with initial custody event
    const evidenceItem = await prisma.evidenceItem.create({
      data: {
        inspectionId: id,
        evidenceClass: body.evidenceClass,
        mediaType: body.mediaType,
        status: "CAPTURED",
        title: body.title || null,
        description: body.description || null,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName || null,
        fileSizeMb: body.fileSizeMb ? parseFloat(body.fileSizeMb) : null,
        mimeType: body.mimeType || null,
        measurementValue: body.measurementValue
          ? parseFloat(body.measurementValue)
          : null,
        measurementUnit: body.measurementUnit || null,
        instrumentType: body.instrumentType || null,
        instrumentSerial: body.instrumentSerial || null,
        latitude: body.latitude ? parseFloat(body.latitude) : null,
        longitude: body.longitude ? parseFloat(body.longitude) : null,
        floorLevel: body.floorLevel || null,
        roomName: body.roomName || null,
        zoneRef: body.zoneRef || null,
        iicrcStandard: body.iicrcStandard || null,
        iicrcSection: body.iicrcSection || null,
        iicrcNote: body.iicrcNote || null,
        capturedById: session.user.id,
        contentHash,
        custodyEvents: {
          create: {
            action: "CAPTURED",
            actorId: session.user.id,
            actorName: session.user.name || null,
            contentHash,
          },
        },
      },
      include: { custodyEvents: true },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Evidence captured",
        entityType: "EvidenceItem",
        entityId: evidenceItem.id,
        userId: session.user.id,
        changes: JSON.stringify({
          evidenceClass: evidenceItem.evidenceClass,
          mediaType: evidenceItem.mediaType,
          title: evidenceItem.title,
          fileUrl: evidenceItem.fileUrl,
        }),
      },
    });

    return NextResponse.json({ data: evidenceItem }, { status: 201 });
  } catch (error) {
    console.error("Error creating evidence item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH - Update an existing evidence item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const body = await request.json();

    if (!body.evidenceItemId) {
      return NextResponse.json(
        { error: "evidenceItemId is required" },
        { status: 400 },
      );
    }

    // Verify the evidence item belongs to this inspection
    const existingItem = await prisma.evidenceItem.findFirst({
      where: {
        id: body.evidenceItemId,
        inspectionId: id,
      },
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: "Evidence item not found" },
        { status: 404 },
      );
    }

    // Build update data from allowed fields
    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.qualityScore !== undefined)
      updateData.qualityScore = parseInt(body.qualityScore, 10);
    if (body.qaNote !== undefined) updateData.qaNote = body.qaNote;

    // Determine custody action based on status change
    const custodyAction =
      body.status && body.status !== existingItem.status
        ? "REVIEWED"
        : "ANNOTATED";

    // Update evidence item and create custody event in a transaction
    const updatedItem = await prisma.$transaction(async (tx) => {
      const updated = await tx.evidenceItem.update({
        where: { id: body.evidenceItemId },
        data: updateData,
        include: { custodyEvents: true },
      });

      await tx.custodyEvent.create({
        data: {
          evidenceItemId: body.evidenceItemId,
          action: custodyAction,
          actorId: session.user.id,
          actorName: session.user.name || null,
          metadata: JSON.stringify({
            updatedFields: Object.keys(updateData),
            previousStatus: existingItem.status,
          }),
        },
      });

      // Re-fetch with custody events after creating the new one
      return tx.evidenceItem.findUnique({
        where: { id: body.evidenceItemId },
        include: { custodyEvents: true },
      });
    });

    return NextResponse.json({ data: updatedItem });
  } catch (error) {
    console.error("Error updating evidence item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
