/**
 * /api/inspections/[id]/sketches/symbility
 *   POST → produce a Symbility XML export, persist to SymbilityExport,
 *          return { xml, schemaVersion, contentHash, exportId }.
 *   GET  → list past exports for the inspection (most recent first).
 *
 * Append-only: every export is a new row. Postgres trigger blocks UPDATE /
 * DELETE on `SymbilityExport` (Rule 22).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { fromJSON } from "@/lib/sketch/v3/serialize";
import {
  exportToSymbilityXml,
  DEFAULT_SYMBILITY_PROFILE,
} from "@/lib/sketch/exporters/symbility-xml";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return NextResponse.json({ error: tenancy.reason }, { status: tenancy.status });
  }

  // Pull every V3 sketch for the inspection. Wall-graph blob lives in
  // ClaimSketch.sketchData so we don't have to re-hydrate from the relational
  // tables for export.
  const sketches = await (prisma as any).claimSketch.findMany({
    where: { inspectionId: id, sketchType: "wall_graph_v3" },
    select: {
      id: true,
      floorNumber: true,
      sketchData: true,
    },
    orderBy: { floorNumber: "asc" },
    take: 50,
  });

  if (sketches.length === 0) {
    return NextResponse.json(
      { error: "No V3 wall-graph sketches found on this inspection" },
      { status: 404 },
    );
  }

  // Combine into a single multi-floor wall-graph for export. Strategy: take
  // the first sketch's graph as the base and append subsequent floors. This
  // assumes per-floor sketches share scale; in practice the editor enforces
  // that (Phase 1 reducer's SET_SCALE applies graph-level).
  let combined;
  try {
    combined = fromJSON(sketches[0].sketchData);
    for (let i = 1; i < sketches.length; i++) {
      const next = fromJSON(sketches[i].sketchData);
      combined.floors.push(...next.floors);
    }
  } catch (err) {
    console.error("Symbility export — failed to parse stored graph:", err);
    return NextResponse.json(
      { error: "Stored sketch data is not valid wall-graph V3 JSON" },
      { status: 422 },
    );
  }

  const result = await exportToSymbilityXml(combined, {
    inspectionId: id,
    profile: DEFAULT_SYMBILITY_PROFILE,
  });

  const row = await (prisma as any).symbilityExport.create({
    data: {
      inspectionId: id,
      floorPlanIds: combined.floors.map((f: { id: string }) => f.id),
      xmlPayload: result.xml,
      schemaVersion: result.schemaVersion,
      contentHash: result.contentHash,
      createdById: session.user.id,
    },
    select: {
      id: true,
      schemaVersion: true,
      contentHash: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    exportId: row.id,
    xml: result.xml,
    schemaVersion: row.schemaVersion,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return NextResponse.json({ error: tenancy.reason }, { status: tenancy.status });
  }

  const exports = await (prisma as any).symbilityExport.findMany({
    where: { inspectionId: id },
    select: {
      id: true,
      schemaVersion: true,
      contentHash: true,
      createdAt: true,
      createdById: true,
      floorPlanIds: true,
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json({ exports });
}
