/**
 * persistence.ts — server-side helpers for writing a wall-graph to Prisma.
 *
 * Lives in `lib/sketch/v3/` (not the API route) so multiple endpoints can
 * reuse the diff logic and so the file is unit-testable with a Prisma mock.
 *
 * Strategy: full-replace per floor inside a transaction. Graphs are bounded
 * (typical residence: <200 corners, <250 walls, <50 openings, <20 rooms);
 * computing a row-level diff is added complexity for sub-millisecond gains.
 *
 * Caller is the API route — it owns auth, tenancy, and the parent
 * `ClaimSketch` JSON-cache write. This module only owns the V3 relational
 * tables.
 */

import { fromJSON, toPrismaWrite } from "./serialize";
import type { WallGraph } from "./wall-graph-types";
import { validateGraph } from "./wall-graph-types";

/**
 * Anything that quacks like a Prisma client with the V3 models on it. We use
 * `unknown` rather than the generated `PrismaClient` type so this module
 * compiles even before `prisma generate` has run.
 */
export interface MinimalPrismaV3 {
  $transaction: (
    fn: (tx: MinimalPrismaV3) => Promise<unknown>,
  ) => Promise<unknown>;
  floorPlanV3: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<{ id: string }>;
    upsert: (args: unknown) => Promise<{ id: string }>;
  };
  floorCornerV3: { createMany: (args: unknown) => Promise<unknown> };
  floorWallV3: { createMany: (args: unknown) => Promise<unknown> };
  floorOpeningV3: { createMany: (args: unknown) => Promise<unknown> };
  floorRoomV3: { createMany: (args: unknown) => Promise<unknown> };
}

/**
 * Persist a wall graph for an inspection. Replaces all V3 rows for the given
 * inspection's floors; the JSON cache (in `ClaimSketch.sketchData`) is the
 * caller's responsibility.
 *
 * Returns the floor-plan ids that were written.
 */
export async function persistWallGraph(
  prisma: MinimalPrismaV3,
  inspectionId: string,
  graph: WallGraph,
): Promise<string[]> {
  const issues = validateGraph(graph);
  if (issues.length > 0) {
    throw new WallGraphIntegrityError(
      `Refusing to persist invalid graph: ${issues.length} issue(s)`,
      issues.map((i) => i.code),
    );
  }
  const plan = toPrismaWrite(graph);

  await prisma.$transaction(async (tx) => {
    // Delete every existing FloorPlanV3 for this inspection — cascading FKs
    // remove the dependent rows. Cheaper than per-row diff at our scale.
    await tx.floorPlanV3.deleteMany({
      where: { inspectionId },
    });

    for (const fp of plan.floorPlans) {
      await tx.floorPlanV3.create({
        data: {
          id: fp.id,
          inspectionId,
          floorIndex: fp.floorIndex,
          floorLabel: fp.floorLabel,
          pxPerMetre: fp.pxPerMetre,
          northRotationDeg: fp.northRotationDeg,
          origin: fp.origin ?? undefined,
          geoTransform: fp.geoTransform ?? undefined,
          sourceType: fp.sourceType,
          sourceFootprintId: fp.sourceFootprintId ?? undefined,
        },
      });
    }

    if (plan.corners.length > 0) {
      await tx.floorCornerV3.createMany({
        data: plan.corners.map((c) => ({
          id: c.id,
          floorPlanId: c.floorPlanId,
          x: c.x,
          y: c.y,
          isLocked: c.locked ?? false,
          metadata: c.metadata ?? undefined,
        })),
      });
    }

    if (plan.walls.length > 0) {
      await tx.floorWallV3.createMany({
        data: plan.walls.map((w) => ({
          id: w.id,
          floorPlanId: w.floorPlanId,
          fromCornerId: w.from,
          toCornerId: w.to,
          thicknessMm: w.thicknessMm,
          isExterior: w.isExterior,
          height: w.height ?? undefined,
          finishLeft: w.finishLeft ?? undefined,
          finishRight: w.finishRight ?? undefined,
          metadata: w.metadata ?? undefined,
        })),
      });
    }

    if (plan.openings.length > 0) {
      await tx.floorOpeningV3.createMany({
        data: plan.openings.map((o) => ({
          id: o.id,
          floorPlanId: o.floorPlanId,
          wallId: o.wallId,
          type: o.type,
          positionM: o.positionM,
          widthM: o.widthM,
          heightM: o.heightM ?? undefined,
          sillHeightM: o.sillHeightM ?? undefined,
          swingDir: o.swingDir ?? undefined,
          metadata: o.metadata ?? undefined,
        })),
      });
    }

    if (plan.rooms.length > 0) {
      await tx.floorRoomV3.createMany({
        data: plan.rooms.map((r) => ({
          id: r.id,
          floorPlanId: r.floorPlanId,
          label: r.label,
          roomType: r.roomType ?? undefined,
          cornerCycle: r.cornerCycle,
          centroidX: r.centroidX,
          centroidY: r.centroidY,
          areaM2: r.areaM2,
          metadata: r.metadata ?? undefined,
        })),
      });
    }
  });

  return plan.floorPlans.map((f) => f.id);
}

/**
 * Validate-and-parse the incoming JSON wire format. Returns the typed
 * `WallGraph` ready to pass to `persistWallGraph`.
 */
export function parseIncomingWallGraph(value: unknown): WallGraph {
  const parsed = fromJSON(value);
  const issues = validateGraph(parsed);
  if (issues.length > 0) {
    throw new WallGraphIntegrityError(
      `Wall-graph payload failed validation: ${issues.length} issue(s)`,
      issues.map((i) => i.code),
    );
  }
  return parsed;
}

export class WallGraphIntegrityError extends Error {
  readonly codes: string[];
  constructor(message: string, codes: string[]) {
    super(message);
    this.name = "WallGraphIntegrityError";
    this.codes = codes;
  }
}
