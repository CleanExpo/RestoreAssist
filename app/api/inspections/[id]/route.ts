import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEMO_INSPECTION = {
  id: "demo-inspection-001",
  inspectionNumber: "NIR-2026-04-DEMO",
  propertyAddress: "47 Rosella Street, Buderim QLD 4556",
  propertyPostcode: "4556",
  technicianName: "Phill McGurk",
  status: "COMPLETED",
  createdAt: "2026-04-01T09:00:00.000Z",
  submittedAt: "2026-04-01T09:00:00.000Z",
  processedAt: "2026-04-07T10:00:00.000Z",
  environmentalData: {
    ambientTemperature: 26.4,
    humidityLevel: 72,
    dewPoint: 21.1,
    airCirculation: true,
    weatherConditions: "Fine, warm",
    notes: "LGR dehumidification deployed. Air movers active.",
  },
  moistureReadings: [
    {
      id: "dmr-001",
      location: "Kitchen — base cabinet (north wall)",
      surfaceType: "Particleboard (Yellow Tongue)",
      moistureLevel: 42,
      depth: "Subsurface",
      notes: "Pre-drying day 1",
      photoUrl: null,
    },
    {
      id: "dmr-002",
      location: "Kitchen — vinyl flooring centre",
      surfaceType: "Vinyl over particleboard",
      moistureLevel: 38,
      depth: "Surface",
      notes: "Pre-drying day 1",
      photoUrl: null,
    },
    {
      id: "dmr-003",
      location: "Hallway — carpet underlay centre",
      surfaceType: "Carpet underlay (foam)",
      moistureLevel: 65,
      depth: "Subsurface",
      notes: "Saturated — extraction required",
      photoUrl: null,
    },
    {
      id: "dmr-004",
      location: "Living room — carpet near hallway entry",
      surfaceType: "Carpet (nylon)",
      moistureLevel: 34,
      depth: "Surface",
      notes: "Damp via hallway migration",
      photoUrl: null,
    },
    {
      id: "dmr-005",
      location: "Kitchen — base cabinet (north wall)",
      surfaceType: "Particleboard (Yellow Tongue)",
      moistureLevel: 14,
      depth: "Subsurface",
      notes: "Day 7 — within drying goal",
      photoUrl: null,
    },
  ],
  affectedAreas: [
    {
      id: "daa-001",
      roomZoneId: "Kitchen",
      affectedSquareFootage: 14,
      waterSource: "Burst braided flexi-hose under sink",
      timeSinceLoss: 6,
      category: "Category 2",
      class: "Class 2",
      description: "Vinyl lifting, particleboard subfloor saturated",
    },
    {
      id: "daa-002",
      roomZoneId: "Hallway",
      affectedSquareFootage: 8,
      waterSource: "Migration from kitchen",
      timeSinceLoss: 6,
      category: "Category 2",
      class: "Class 2",
      description: "Carpet and underlay saturated",
    },
    {
      id: "daa-003",
      roomZoneId: "Living Room",
      affectedSquareFootage: 10,
      waterSource: "Migration via hallway",
      timeSinceLoss: 6,
      category: "Category 2",
      class: "Class 1",
      description: "Carpet damp near hallway entry",
    },
  ],
  scopeItems: [
    {
      id: "dsi-001",
      itemType: "Extraction",
      description: "Truck-mount extraction — carpet and hard floor",
      quantity: 1,
      unit: "job",
      justification: "Category 2 standing water removal (IICRC S500:2021 §8.1)",
      isRequired: true,
      isSelected: true,
      autoDetermined: true,
    },
    {
      id: "dsi-002",
      itemType: "Dehumidification",
      description: "LGR dehumidifier deployment (2 units × 7 days)",
      quantity: 14,
      unit: "unit-days",
      justification: "Class 2 drying standard (IICRC S500:2021 §11.3)",
      isRequired: true,
      isSelected: true,
      autoDetermined: true,
    },
    {
      id: "dsi-003",
      itemType: "Air Movement",
      description: "Air mover deployment (4 units × 7 days)",
      quantity: 28,
      unit: "unit-days",
      justification: "Accelerate surface evaporation (IICRC S500:2021 §11.4)",
      isRequired: true,
      isSelected: true,
      autoDetermined: true,
    },
    {
      id: "dsi-004",
      itemType: "Antimicrobial",
      description: "Antimicrobial application — all affected surfaces",
      quantity: 32,
      unit: "m²",
      justification: "Category 2 contamination protocol (IICRC S500:2021 §9.2)",
      isRequired: true,
      isSelected: true,
      autoDetermined: true,
    },
    {
      id: "dsi-005",
      itemType: "Carpet Removal",
      description: "Remove and dispose saturated carpet and underlay — hallway",
      quantity: 8,
      unit: "m²",
      justification: "Non-restorable — Category 2 contamination",
      isRequired: true,
      isSelected: true,
      autoDetermined: false,
    },
  ],
  classifications: [
    {
      id: "dcl-001",
      category: "Category 2",
      class: "Class 2",
      justification:
        "Burst braided flexi-hose; grey water contact with structural materials",
      standardReference: "IICRC S500:2021 §6.2, §6.3",
      confidence: 95,
    },
  ],
  costEstimates: [
    {
      id: "dce-001",
      category: "Extraction",
      description: "Truck-mount extraction",
      quantity: 1,
      unit: "job",
      rate: 450,
      subtotal: 450,
      total: 495,
    },
    {
      id: "dce-002",
      category: "Dehumidification",
      description: "LGR dehumidifier (2 units × 7 days)",
      quantity: 14,
      unit: "unit-days",
      rate: 95,
      subtotal: 1330,
      total: 1463,
    },
    {
      id: "dce-003",
      category: "Air Movement",
      description: "Air mover (4 units × 7 days)",
      quantity: 28,
      unit: "unit-days",
      rate: 35,
      subtotal: 980,
      total: 1078,
    },
    {
      id: "dce-004",
      category: "Antimicrobial",
      description: "Antimicrobial application",
      quantity: 32,
      unit: "m²",
      rate: 12,
      subtotal: 384,
      total: 422.4,
    },
    {
      id: "dce-005",
      category: "Carpet Removal",
      description: "Remove and dispose carpet and underlay",
      quantity: 8,
      unit: "m²",
      rate: 45,
      subtotal: 360,
      total: 396,
    },
  ],
  photos: [],
  auditLogs: [
    {
      id: "dal-001",
      action: "Inspection created",
      timestamp: "2026-04-01T09:00:00.000Z",
    },
    {
      id: "dal-002",
      action: "Environmental data recorded",
      timestamp: "2026-04-01T09:15:00.000Z",
    },
    {
      id: "dal-003",
      action: "Moisture readings added (5)",
      timestamp: "2026-04-01T09:45:00.000Z",
    },
    {
      id: "dal-004",
      action: "AI classification completed — Category 2 / Class 2",
      timestamp: "2026-04-01T10:30:00.000Z",
    },
    {
      id: "dal-005",
      action: "Scope generated — 5 items",
      timestamp: "2026-04-01T10:32:00.000Z",
    },
    {
      id: "dal-006",
      action: "Inspection marked COMPLETED",
      timestamp: "2026-04-07T10:00:00.000Z",
    },
  ],
};

// GET - Get single inspection by ID with all relations
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Demo inspection — no auth required, static data
    if (id === "demo-inspection-001") {
      return NextResponse.json({ inspection: DEMO_INSPECTION });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-1711 batch 5 — adopt shared tenancy helper for read.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        // Inspection is returned wholesale to the client — enumerate every
        // scalar to preserve response shape per CLAUDE.md rule 4.
        environmentalData: {
          select: {
            id: true,
            inspectionId: true,
            ambientTemperature: true,
            humidityLevel: true,
            dewPoint: true,
            airCirculation: true,
            weatherConditions: true,
            notes: true,
            recordedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        moistureReadings: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            inspectionId: true,
            location: true,
            surfaceType: true,
            moistureLevel: true,
            depth: true,
            notes: true,
            photoUrl: true,
            unit: true,
            deviceVendor: true,
            deviceModel: true,
            source: true,
            isBaseline: true,
            isMonitoringPoint: true,
            affectedArea: true,
            mapX: true,
            mapY: true,
            recordedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        affectedAreas: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            inspectionId: true,
            roomZoneId: true,
            affectedSquareFootage: true,
            waterSource: true,
            timeSinceLoss: true,
            category: true,
            class: true,
            description: true,
            photos: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        scopeItems: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            inspectionId: true,
            itemType: true,
            description: true,
            areaId: true,
            quantity: true,
            unit: true,
            specification: true,
            autoDetermined: true,
            justification: true,
            clauseRef: true,
            isRequired: true,
            isSelected: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        classifications: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            inspectionId: true,
            category: true,
            class: true,
            justification: true,
            standardReference: true,
            confidence: true,
            inputData: true,
            isFinal: true,
            reviewedBy: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        costEstimates: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            inspectionId: true,
            scopeItemId: true,
            category: true,
            description: true,
            quantity: true,
            unit: true,
            rate: true,
            subtotal: true,
            costDatabaseId: true,
            isEstimated: true,
            contingency: true,
            total: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        photos: {
          orderBy: { timestamp: "asc" },
          select: {
            id: true,
            inspectionId: true,
            url: true,
            thumbnailUrl: true,
            location: true,
            description: true,
            timestamp: true,
            uploadedAt: true,
            fileSize: true,
            mimeType: true,
            gpsLatitude: true,
            gpsLongitude: true,
            damageCategory: true,
            damageClass: true,
            s500SectionRef: true,
            roomType: true,
            moistureSource: true,
            affectedMaterial: true,
            surfaceOrientation: true,
            damageExtentEstimate: true,
            equipmentVisible: true,
            secondaryDamageIndicators: true,
            photoStage: true,
            captureAngle: true,
            labelledBy: true,
            technicianNotes: true,
            moistureReadingLink: true,
            aiLabels: true,
            aiConfidence: true,
            aiModel: true,
            aiRunAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        auditLogs: {
          orderBy: { timestamp: "desc" },
          take: 50,
          select: {
            id: true,
            inspectionId: true,
            action: true,
            entityType: true,
            entityId: true,
            userId: true,
            device: true,
            gpsLocation: true,
            changes: true,
            previousValue: true,
            newValue: true,
            timestamp: true,
            ipAddress: true,
            userAgent: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    return NextResponse.json({ inspection });
  } catch (error) {
    return fromException(request, error, { stage: "inspection:get" });
  }
}

// PATCH - Update mutable scalar fields (lossDescription, technicianName)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await context.params;

    // RA-1711 batch 5 — adopt shared tenancy helper. PATCH allows
    // workspace members + admin (techs document the loss in the field).
    // RA-6800 — scope the write so ownership is re-asserted atomically.
    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.lossDescription !== undefined) {
      data.lossDescription = body.lossDescription
        ? sanitizeString(body.lossDescription, 2000)
        : null;
    }
    if (body.technicianName !== undefined) {
      data.technicianName = body.technicianName
        ? sanitizeString(body.technicianName, 200)
        : null;
    }
    // RA-6949 — per-job Restoration Pulse kill switch (judge AC6). Boolean
    // only; ignored when absent so this stays additive to the existing idiom.
    if (typeof body.pulseEnabled === "boolean") {
      data.pulseEnabled = body.pulseEnabled;
    }

    if (Object.keys(data).length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No updatable fields provided",
        status: 400,
      });
    }

    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "inspection:patch" });
  }
}

// DELETE - Delete single inspection (user must own it)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    await prisma.inspection.delete({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "inspection:delete" });
  }
}
