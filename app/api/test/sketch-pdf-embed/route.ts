/**
 * TEST-ONLY — build the report floor-plan embed from a persisted sketch
 * (RA-2953 Bar 4). Production `/sketches/pdf` 409s without a verified
 * storage render; this helper uses the same `appendSketchPages` /
 * `parseDamageMarkerMap` path the IICRC report uses, with a caller-supplied
 * PNG so CI can prove markers land on the page without Supabase.
 *
 * HARD GUARD — 404 unless testHelpersBlocked() is false.
 *
 * Body: { inspectionId: string, pngDataUrl: data:image/png;base64,... }
 * Returns: application/pdf
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PDFDocument } from "pdf-lib";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { appendSketchPages } from "@/lib/reports/append-sketch-pages";
import {
  damageMarkersFromSketchData,
  parseDamageMarkerMap,
} from "@/lib/reports/damage-marker-map";
import { testHelpersBlocked } from "../_helpers";

const PNG_DATA_URL =
  /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_PNG_DATA_URL = 200_000;

export async function POST(req: NextRequest) {
  if (testHelpersBlocked()) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled in this environment",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: { inspectionId?: unknown; pngDataUrl?: unknown };
  try {
    body = (await req.json()) as { inspectionId?: unknown; pngDataUrl?: unknown };
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const inspectionId =
    typeof body.inspectionId === "string" ? body.inspectionId.trim() : "";
  const pngDataUrl =
    typeof body.pngDataUrl === "string" ? body.pngDataUrl : "";
  if (!inspectionId) {
    return apiError(req, {
      code: "VALIDATION",
      message: "inspectionId is required",
      status: 400,
    });
  }
  if (
    !PNG_DATA_URL.test(pngDataUrl) ||
    pngDataUrl.length > MAX_PNG_DATA_URL
  ) {
    return apiError(req, {
      code: "VALIDATION",
      message: "pngDataUrl must be a small data:image/png;base64 URL",
      status: 400,
    });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, userId: session.user.id },
    select: { id: true, propertyAddress: true },
  });
  if (!inspection) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }

  const sketches = await prisma.claimSketch.findMany({
    where: { inspectionId },
    select: { floorLabel: true, sketchData: true },
    orderBy: { floorNumber: "asc" },
    take: 50,
  });

  const floors = sketches.map((s) => ({
    label: s.floorLabel,
    pngDataUrl,
    fabricJson:
      s.sketchData && typeof s.sketchData === "object"
        ? (s.sketchData as Record<string, unknown>)
        : null,
    damageMarkers: parseDamageMarkerMap(
      damageMarkersFromSketchData(s.sketchData),
    ),
  }));
  const markerCount = floors.reduce(
    (n, f) => n + (f.damageMarkers?.length ?? 0),
    0,
  );
  if (markerCount === 0) {
    return apiError(req, {
      code: "CONFLICT",
      message: "No damage markers persisted on this inspection's sketches",
      status: 409,
    });
  }

  const baseDoc = await PDFDocument.create();
  baseDoc.addPage([200, 200]);
  const baseBytes = await baseDoc.save();
  const pdfBytes = await appendSketchPages(baseBytes, floors, {
    propertyAddress: inspection.propertyAddress ?? "",
    reportNumber: `E2E-${inspection.id.slice(-8)}`,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sketch-embed-${inspection.id.slice(-8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
