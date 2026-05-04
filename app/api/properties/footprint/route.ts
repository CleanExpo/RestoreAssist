/**
 * POST /api/properties/footprint — pull a building footprint by address.
 *
 * Pipeline:
 *   1. Auth + tenancy via assertInspectionTenancy (so we don't burn paid
 *      Geoscape calls for users with no claim on the inspection).
 *   2. Cache check on GeoscapeFootprint (90-day TTL).
 *   3. If miss: geocode → fetch footprint → upsert.
 *   4. Convert WGS84 polygon to a starter WallGraph and return both the cache
 *      row and the wire-format graph.
 *
 * The route is feature-flagged behind `NEXT_PUBLIC_SKETCH_V3_GEOSCAPE_ENABLED`
 * for end-user UX, but the route always works server-side so the editor's
 * import-from-mock path can drive integration tests. Mock data is used when
 * `GEOSCAPE_API_KEY` is unset.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import {
  fetchFootprintByAddress,
  GeoscapeError,
  normaliseAddressKey,
  type FootprintHit,
} from "@/lib/property/geoscape-client";
import { wgs84PolygonToWallGraph } from "@/lib/sketch/v3/geo-transform";
import { toJSON } from "@/lib/sketch/v3/serialize";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        inspectionId?: string;
        address?: string;
        postcode?: string;
      }
    | null;

  if (!body || !body.inspectionId || !body.address) {
    return NextResponse.json(
      { error: "inspectionId and address are required" },
      { status: 400 },
    );
  }

  const tenancy = await assertInspectionTenancy(session, body.inspectionId);
  if (!tenancy.ok) {
    return NextResponse.json({ error: tenancy.reason }, { status: tenancy.status });
  }

  const addressKey = normaliseAddressKey(body.address, body.postcode);

  // 1. Cache lookup.
  const now = new Date();
  const cached = await (prisma as any).geoscapeFootprint.findFirst({
    where: { addressKey, expiresAt: { gt: now } },
    select: {
      id: true,
      gnafPid: true,
      buildingId: true,
      geomGeoJson: true,
      storeyCount: true,
      roofMaterial: true,
      capturedAt: true,
      source: true,
      expiresAt: true,
    },
    orderBy: { fetchedAt: "desc" },
  });

  let footprintRow = cached;
  if (!footprintRow) {
    // 2. Miss — fetch upstream (or mock).
    let pulled: { footprint: FootprintHit | null };
    try {
      pulled = await fetchFootprintByAddress(body.address);
    } catch (err) {
      const status =
        err instanceof GeoscapeError && err.status >= 400 ? err.status : 502;
      console.error("Geoscape fetch failed:", err);
      return NextResponse.json(
        { error: "Failed to fetch property footprint" },
        { status },
      );
    }

    if (!pulled.footprint) {
      return NextResponse.json(
        { error: "No building footprint found for that address" },
        { status: 404 },
      );
    }

    const fp = pulled.footprint;
    const expiresAt = new Date(now.getTime() + NINETY_DAYS_MS);

    // Upsert by gnafPid when present, else create fresh.
    footprintRow = await (prisma as any).geoscapeFootprint.create({
      data: {
        gnafPid: fp.gnafPid,
        buildingId: fp.buildingId,
        geomGeoJson: fp.geomGeoJson,
        storeyCount: fp.storeyCount,
        roofMaterial: fp.roofMaterial,
        rawResponse: fp.rawResponse as object,
        source: fp.source,
        addressKey,
        expiresAt,
      },
      select: {
        id: true,
        gnafPid: true,
        buildingId: true,
        geomGeoJson: true,
        storeyCount: true,
        roofMaterial: true,
        capturedAt: true,
        source: true,
        expiresAt: true,
      },
    });
  }

  // 3. Convert to wall-graph wire format. Caller drops it straight into the
  // editor as a starter graph.
  const floorId = `floor_${footprintRow.id.slice(0, 8)}`;
  let starterGraph;
  try {
    starterGraph = wgs84PolygonToWallGraph(footprintRow.geomGeoJson, {
      floorId,
      pxPerMetre: 100,
      sourceType: "geoscape",
      sourceFootprintId: footprintRow.id,
    });
  } catch (err) {
    console.error("Footprint → wall-graph conversion failed:", err);
    return NextResponse.json(
      { error: "Footprint geometry could not be converted to a wall-graph" },
      { status: 422 },
    );
  }

  return NextResponse.json({
    footprint: footprintRow,
    starterGraph: toJSON(starterGraph),
    suggestedFloors: footprintRow.storeyCount ?? 1,
  });
}
