/**
 * RA-447: Inspection photo label API — PATCH endpoint
 * PATCH /api/inspections/[id]/photos/[photoId]/labels
 *
 * Accepts all 13 required + 2 optional S500:2025 label fields.
 * Enforces cross-field validation rules from INSPECTION-IMAGE-SCHEMA.md §8.
 * Returns { asbestosStopWork: true } when ASBESTOS_SUSPECT is flagged.
 * Workspace-scoped: inspection must belong to authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DamageCategory,
  DamageClass,
  RoomType,
  MoistureSource,
  AffectedMaterial,
  SurfaceOrientation,
  DamageExtentEstimate,
  SecondaryDamageIndicator,
  PhotoStage,
  CaptureAngle,
  LabelledBy,
  hasStopWorkIndicator,
  validateCrossFieldRules,
} from "@/types/inspection-photo-labels";

// ---------------------------------------------------------------------------
// Enum allowlists for request validation
// ---------------------------------------------------------------------------

const VALID_DAMAGE_CATEGORIES: DamageCategory[] = ["CAT_1", "CAT_2", "CAT_3"];
const VALID_DAMAGE_CLASSES: DamageClass[] = [
  "CLASS_1",
  "CLASS_2",
  "CLASS_3",
  "CLASS_4",
];
const VALID_ROOM_TYPES: RoomType[] = [
  "KITCHEN",
  "BATHROOM",
  "LAUNDRY",
  "TOILET",
  "BEDROOM",
  "LIVING",
  "DINING",
  "HALLWAY",
  "GARAGE",
  "ROOF_SPACE",
  "SUBFLOOR",
  "BASEMENT",
  "COMMERCIAL_OFFICE",
  "COMMERCIAL_WAREHOUSE",
  "COMMON_AREA",
  "EXTERNAL",
  "OTHER",
];
const VALID_MOISTURE_SOURCES: MoistureSource[] = [
  "FLEXI_HOSE",
  "TAP_FAILURE",
  "PIPE_BURST",
  "PIPE_LEAK",
  "ROOF_LEAK",
  "STORMWATER",
  "SEWAGE_OVERFLOW",
  "WASHING_MACHINE",
  "DISHWASHER",
  "HOT_WATER_SYSTEM",
  "AIR_CON_DRAIN",
  "FLOOD_EXTERNAL",
  "RISING_DAMP",
  "CONDENSATION",
  "UNKNOWN",
  "OTHER",
];
const VALID_AFFECTED_MATERIALS: AffectedMaterial[] = [
  "PLASTERBOARD",
  "VILLABOARD",
  "FIBRE_CEMENT_SHEET",
  "TIMBER_FRAME",
  "TIMBER_FLOORING",
  "PARTICLE_BOARD_FLOOR",
  "PLYWOOD_SUBFLOOR",
  "SLAB_ON_GROUND",
  "BRICK_VENEER",
  "DOUBLE_BRICK",
  "TERRACOTTA_TILE",
  "VINYL_FLOORING",
  "CARPET",
  "INSULATION_BATTS",
  "INSULATION_FOAM",
  "CORNICE",
  "RENDER",
  "CABINETRY",
  "OTHER",
];
const VALID_SURFACE_ORIENTATIONS: SurfaceOrientation[] = [
  "FLOOR",
  "WALL_LOWER",
  "WALL_MID",
  "WALL_UPPER",
  "CEILING",
  "JUNCTION",
  "COLUMN_PIER",
  "SUBFLOOR_BEARER",
  "ROOF_RAFTER",
];
const VALID_DAMAGE_EXTENTS: DamageExtentEstimate[] = [
  "SPOT",
  "PARTIAL",
  "MAJORITY",
  "FULL",
  "UNCERTAIN",
];
const VALID_SECONDARY_INDICATORS: SecondaryDamageIndicator[] = [
  "MOULD_VISIBLE",
  "MOULD_ODOUR",
  "EFFLORESCENCE",
  "STAINING_RUST",
  "STAINING_TANNIN",
  "DELAMINATION",
  "BUCKLING",
  "SWELLING",
  "PEELING",
  "CEILING_SAG",
  "INSULATION_COLLAPSE",
  "SUBFLOOR_STANDING",
  "CONTAMINATION_SEWAGE",
  "TERMITE_DAMAGE",
  "ASBESTOS_SUSPECT",
];
const VALID_PHOTO_STAGES: PhotoStage[] = [
  "PRE_WORK",
  "DURING_WORK",
  "MONITORING",
  "POST_WORK",
  "REINSTATEMENT",
];
const VALID_CAPTURE_ANGLES: CaptureAngle[] = [
  "STRAIGHT_ON",
  "OBLIQUE",
  "OVERHEAD",
  "MACRO",
  "WIDE",
];
const VALID_LABELLED_BY: LabelledBy[] = [
  "HUMAN_TECH",
  "HUMAN_OFFICE",
  "AI_ASSISTED",
  "AI_AUTO",
];

// ---------------------------------------------------------------------------
// PATCH — update labels on an existing InspectionPhoto
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: inspectionId, photoId } = await params;

    // Workspace-scoped auth: inspection must belong to this user
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

    // Photo must exist and belong to this inspection
    const existingPhoto = await prisma.inspectionPhoto.findFirst({
      where: { id: photoId, inspectionId },
      select: { id: true },
    });
    if (!existingPhoto) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const body = await request.json();
    const errors: string[] = [];

    // ---- Enum validation (only validate fields that are present in body) ----
    if (
      body.damageCategory !== undefined &&
      !VALID_DAMAGE_CATEGORIES.includes(body.damageCategory)
    ) {
      errors.push(
        `damageCategory must be one of: ${VALID_DAMAGE_CATEGORIES.join(", ")}`,
      );
    }
    if (
      body.damageClass !== undefined &&
      !VALID_DAMAGE_CLASSES.includes(body.damageClass)
    ) {
      errors.push(
        `damageClass must be one of: ${VALID_DAMAGE_CLASSES.join(", ")}`,
      );
    }
    if (
      body.roomType !== undefined &&
      !VALID_ROOM_TYPES.includes(body.roomType)
    ) {
      errors.push(`roomType must be one of: ${VALID_ROOM_TYPES.join(", ")}`);
    }
    if (
      body.moistureSource !== undefined &&
      !VALID_MOISTURE_SOURCES.includes(body.moistureSource)
    ) {
      errors.push(
        `moistureSource must be one of: ${VALID_MOISTURE_SOURCES.join(", ")}`,
      );
    }
    if (body.affectedMaterial !== undefined) {
      if (!Array.isArray(body.affectedMaterial)) {
        errors.push("affectedMaterial must be an array");
      } else {
        const invalid = body.affectedMaterial.filter(
          (m: string) =>
            !VALID_AFFECTED_MATERIALS.includes(m as AffectedMaterial),
        );
        if (invalid.length > 0)
          errors.push(`Invalid affectedMaterial values: ${invalid.join(", ")}`);
      }
    }
    if (
      body.surfaceOrientation !== undefined &&
      !VALID_SURFACE_ORIENTATIONS.includes(body.surfaceOrientation)
    ) {
      errors.push(
        `surfaceOrientation must be one of: ${VALID_SURFACE_ORIENTATIONS.join(", ")}`,
      );
    }
    if (
      body.damageExtentEstimate !== undefined &&
      !VALID_DAMAGE_EXTENTS.includes(body.damageExtentEstimate)
    ) {
      errors.push(
        `damageExtentEstimate must be one of: ${VALID_DAMAGE_EXTENTS.join(", ")}`,
      );
    }
    if (body.secondaryDamageIndicators !== undefined) {
      if (!Array.isArray(body.secondaryDamageIndicators)) {
        errors.push("secondaryDamageIndicators must be an array");
      } else {
        const invalid = body.secondaryDamageIndicators.filter(
          (s: string) =>
            !VALID_SECONDARY_INDICATORS.includes(s as SecondaryDamageIndicator),
        );
        if (invalid.length > 0)
          errors.push(
            `Invalid secondaryDamageIndicators values: ${invalid.join(", ")}`,
          );
      }
    }
    if (
      body.photoStage !== undefined &&
      !VALID_PHOTO_STAGES.includes(body.photoStage)
    ) {
      errors.push(
        `photoStage must be one of: ${VALID_PHOTO_STAGES.join(", ")}`,
      );
    }
    if (
      body.captureAngle !== undefined &&
      !VALID_CAPTURE_ANGLES.includes(body.captureAngle)
    ) {
      errors.push(
        `captureAngle must be one of: ${VALID_CAPTURE_ANGLES.join(", ")}`,
      );
    }
    if (
      body.labelledBy !== undefined &&
      !VALID_LABELLED_BY.includes(body.labelledBy)
    ) {
      errors.push(`labelledBy must be one of: ${VALID_LABELLED_BY.join(", ")}`);
    }

    // s500SectionRef pattern validation
    if (body.s500SectionRef !== undefined) {
      if (!/^§\d+\.\d+(\.\d+)?$/.test(body.s500SectionRef)) {
        errors.push("s500SectionRef must match pattern §XX.X or §XX.X.X");
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // ---- Cross-field validation (S500:2025 §8) ----
    const crossFieldErrors = validateCrossFieldRules({
      damageCategory: body.damageCategory,
      secondaryDamageIndicators: body.secondaryDamageIndicators,
      affectedMaterial: body.affectedMaterial,
      s500SectionRef: body.s500SectionRef,
    });
    if (crossFieldErrors.length > 0) {
      return NextResponse.json({ errors: crossFieldErrors }, { status: 422 });
    }

    // ---- Build Prisma update payload (only include provided fields) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    const labelFields = [
      "damageCategory",
      "damageClass",
      "s500SectionRef",
      "roomType",
      "moistureSource",
      "affectedMaterial",
      "surfaceOrientation",
      "damageExtentEstimate",
      "equipmentVisible",
      "secondaryDamageIndicators",
      "photoStage",
      "captureAngle",
      "labelledBy",
      "technicianNotes",
      "moistureReadingLink",
    ] as const;
    for (const field of labelFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No label fields provided" },
        { status: 400 },
      );
    }

    // Persist
    const updatedPhoto = await prisma.inspectionPhoto.update({
      where: { id: photoId },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        inspectionId,
        action: "Photo labels updated",
        entityType: "InspectionPhoto",
        entityId: photoId,
        userId: session.user.id,
        changes: JSON.stringify(updateData),
      },
    });

    // Determine stop-work flag for client
    const labels = updatedPhoto as typeof updatedPhoto & {
      secondaryDamageIndicators: string[];
    };
    const asbestosStopWork = hasStopWorkIndicator({
      secondaryDamageIndicators: (labels.secondaryDamageIndicators ??
        []) as SecondaryDamageIndicator[],
    });

    return NextResponse.json(
      { photo: updatedPhoto, asbestosStopWork },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating photo labels:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
