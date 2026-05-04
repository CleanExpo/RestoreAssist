/**
 * geo-transform.ts — WGS84 ↔ canvas conversions for the wall-graph editor.
 *
 * Used in Phase 2 by the Geoscape/Nearmap auto-pull. The functions here are
 * pure and dependency-free so the same code runs in the editor (browser) and
 * in the API route (Node).
 *
 * Projection model: equirectangular at the centroid of the property. For
 * residential-scale footprints (<200m on a side) this introduces <0.1% error
 * versus a proper UTM projection — well below the precision of Geoscape
 * Buildings polygons themselves.
 */

import { emptyFloor, type Floor, type LatLng, type WallGraph } from "./wall-graph-types";

/** Mean Earth radius in metres. */
const R_EARTH = 6_371_000;

/**
 * Convert WGS84 lat/lng to local metres (eastings, northings) anchored at
 * `origin`. North is +y, east is +x. Caller scales to canvas pixels using
 * `pxPerMetre`.
 */
export function wgs84ToLocalMetres(
  point: LatLng,
  origin: LatLng,
): { x: number; y: number } {
  const φOrigin = (origin.lat * Math.PI) / 180;
  const dLat = ((point.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((point.lng - origin.lng) * Math.PI) / 180;

  const x = R_EARTH * dLng * Math.cos(φOrigin);
  const y = R_EARTH * dLat;
  return { x, y };
}

/**
 * Inverse of `wgs84ToLocalMetres`.
 */
export function localMetresToWgs84(
  point: { x: number; y: number },
  origin: LatLng,
): LatLng {
  const φOrigin = (origin.lat * Math.PI) / 180;
  const dLat = point.y / R_EARTH;
  const dLng = point.x / (R_EARTH * Math.cos(φOrigin));
  return {
    lat: origin.lat + (dLat * 180) / Math.PI,
    lng: origin.lng + (dLng * 180) / Math.PI,
  };
}

/**
 * Convert local metres to canvas pixels. Canvas y-axis grows downward, so we
 * flip the sign on `y` so that "north" remains visually up.
 */
export function localMetresToCanvas(
  point: { x: number; y: number },
  pxPerMetre: number,
): { x: number; y: number } {
  return { x: point.x * pxPerMetre, y: -point.y * pxPerMetre };
}

/* ─── Polygon → wall graph ───────────────────────────────────────────────── */

export interface PolygonToWallGraphOpts {
  floorId: string;
  pxPerMetre?: number;
  thicknessMm?: number;
  /** When true, drop near-collinear points (within `collinearToleranceM`). */
  reduceCollinear?: boolean;
  collinearToleranceM?: number;
  /** Source label written to the floor's `sourceType`. */
  sourceType?: Floor["sourceType"];
  sourceFootprintId?: string;
}

/**
 * Convert a GeoJSON Polygon outer ring (WGS84) into a closed-loop wall graph.
 * All walls are flagged `isExterior: true`. Interior walls are added by the
 * user inside the editor.
 *
 * Input expected: { type: "Polygon", coordinates: [[ [lng, lat], ... ]] }
 * Or:            { type: "MultiPolygon", coordinates: [[[ [lng, lat], ... ]]] }
 *
 * Only the outer ring of the first polygon is consumed.
 */
export function wgs84PolygonToWallGraph(
  geom: unknown,
  opts: PolygonToWallGraphOpts,
): WallGraph {
  const ring = extractOuterRing(geom);
  if (ring.length < 4) {
    throw new Error(
      "Polygon outer ring must have at least 3 distinct points (plus closing duplicate)",
    );
  }

  const pxPerMetre = opts.pxPerMetre ?? 100;
  const thicknessMm = opts.thicknessMm ?? 110;
  const sourceType = opts.sourceType ?? "geoscape";

  // Drop the closing duplicate point if present.
  const distinct = ring[ring.length - 1].lat === ring[0].lat &&
    ring[ring.length - 1].lng === ring[0].lng
    ? ring.slice(0, -1)
    : ring.slice();

  // Centroid in WGS84 — used as projection origin to minimise distortion.
  const origin = centroidLatLng(distinct);

  // Project to canvas pixels.
  let pts = distinct.map((latLng) => {
    const local = wgs84ToLocalMetres(latLng, origin);
    return localMetresToCanvas(local, pxPerMetre);
  });

  if (opts.reduceCollinear !== false) {
    const tolPx = (opts.collinearToleranceM ?? 0.05) * pxPerMetre;
    pts = collapseCollinear(pts, tolPx);
  }

  if (pts.length < 3) {
    throw new Error("Polygon collapsed to fewer than 3 corners after dedupe");
  }

  // Translate so the bounding box is non-negative — keeps the editor's default
  // viewport happy. We don't centre on origin because the editor positions
  // its own viewport.
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const offsetX = -minX + 50; // 50px gutter
  const offsetY = -minY + 50;
  pts = pts.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));

  const floor = emptyFloor({
    id: opts.floorId,
    pxPerMetre,
    sourceType,
  });
  floor.origin = origin;
  if (opts.sourceFootprintId) floor.sourceFootprintId = opts.sourceFootprintId;

  // Stable corner ids; deterministic so re-imports of the same polygon don't
  // churn relational rows.
  const cornerIds = pts.map((_, i) => `${opts.floorId}_c${i}`);
  floor.corners = pts.map((p, i) => ({
    id: cornerIds[i],
    x: p.x,
    y: p.y,
  }));

  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    floor.walls.push({
      id: `${opts.floorId}_w${i}`,
      from: cornerIds[i],
      to: cornerIds[j],
      thicknessMm,
      isExterior: true,
    });
  }

  return {
    version: 3,
    scale: {
      pxPerMetre,
      calibratedAt: new Date().toISOString(),
      method: opts.sourceType === "geoscape" ? "geoscape" : "manual",
    },
    floors: [floor],
    activeFloorId: floor.id,
  };
}

/* ─── Internal helpers ───────────────────────────────────────────────────── */

function extractOuterRing(geom: unknown): LatLng[] {
  if (!geom || typeof geom !== "object") {
    throw new Error("geom must be a GeoJSON Polygon or MultiPolygon");
  }
  const g = geom as Record<string, unknown>;
  if (g.type === "Polygon") {
    const coords = g.coordinates as unknown;
    if (!Array.isArray(coords) || !Array.isArray(coords[0])) {
      throw new Error("Polygon.coordinates malformed");
    }
    return (coords[0] as unknown[]).map(toLatLng);
  }
  if (g.type === "MultiPolygon") {
    const coords = g.coordinates as unknown;
    if (
      !Array.isArray(coords) ||
      !Array.isArray(coords[0]) ||
      !Array.isArray((coords[0] as unknown[])[0])
    ) {
      throw new Error("MultiPolygon.coordinates malformed");
    }
    return ((coords[0] as unknown[])[0] as unknown[]).map(toLatLng);
  }
  throw new Error(`Unsupported geometry type: ${String(g.type)}`);
}

function toLatLng(pair: unknown): LatLng {
  if (!Array.isArray(pair) || pair.length < 2) {
    throw new Error("Coordinate pair must be [lng, lat]");
  }
  const [lng, lat] = pair as number[];
  if (typeof lng !== "number" || typeof lat !== "number") {
    throw new Error("Coordinate pair entries must be numbers");
  }
  return { lat, lng };
}

function centroidLatLng(points: LatLng[]): LatLng {
  let sumLat = 0;
  let sumLng = 0;
  for (const p of points) {
    sumLat += p.lat;
    sumLng += p.lng;
  }
  return { lat: sumLat / points.length, lng: sumLng / points.length };
}

/**
 * Drop a midpoint when its perpendicular distance to the chord between its
 * neighbours is below `tolPx`. Operates in-order; one pass suffices for
 * residential footprints.
 */
function collapseCollinear(
  points: ReadonlyArray<{ x: number; y: number }>,
  tolPx: number,
): { x: number; y: number }[] {
  if (points.length < 3) return points.slice();
  const out: { x: number; y: number }[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = out[out.length - 1] ?? points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d = perpendicularDistance(cur, prev, next);
    if (d > tolPx) out.push(cur);
  }
  // Final pass — first/last may now be near-collinear with the wrap-around.
  while (out.length >= 3) {
    const a = out[out.length - 1];
    const b = out[0];
    const c = out[1];
    if (perpendicularDistance(b, a, c) <= tolPx) out.shift();
    else break;
  }
  return out;
}

function perpendicularDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}
