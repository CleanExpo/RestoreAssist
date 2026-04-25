/**
 * GET /api/integrations/weather?inspectionId=xxx
 * GET /api/integrations/weather?lat=-33.87&lng=151.21&date=2026-01-15
 *
 * Returns weather conditions at a given location on the loss date.
 * If inspectionId is provided, derives lat/lng from propertyPostcode and
 * uses inspectionDate as the loss date.
 *
 * Backed by Open-Meteo historical archive (free, no key required).
 * Provides floodRiskIndicator to support automatic claim classification.
 *
 * P1-INT10 — RA-1128
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getWeatherAtDate,
  postcodeToApproximateCoords,
  WeatherLookupError,
} from "@/lib/integrations/weather-lookup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const inspectionId = searchParams.get("inspectionId");

  let latitude: number;
  let longitude: number;
  let date: string;

  if (inspectionId) {
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { userId: true, propertyPostcode: true, inspectionDate: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    if (inspection.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const coords = postcodeToApproximateCoords(inspection.propertyPostcode);
    if (!coords) {
      return NextResponse.json(
        { error: "Cannot derive coordinates from postcode" },
        { status: 422 },
      );
    }
    latitude = coords.latitude;
    longitude = coords.longitude;
    date = inspection.inspectionDate.toISOString().slice(0, 10);
  } else {
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    const dateStr = searchParams.get("date");

    if (!latStr || !lngStr || !dateStr) {
      return NextResponse.json(
        { error: "Provide inspectionId OR lat+lng+date" },
        { status: 400 },
      );
    }
    latitude = parseFloat(latStr);
    longitude = parseFloat(lngStr);
    date = dateStr;
  }

  try {
    const result = await getWeatherAtDate(latitude, longitude, date);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WeatherLookupError) {
      const status = err.code === "OUT_OF_RANGE" ? 422 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
