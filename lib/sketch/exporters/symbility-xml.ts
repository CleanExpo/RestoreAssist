/**
 * symbility-xml.ts — pluggable XML export for the V3 wall graph.
 *
 * Symbility's official S31 sketch schema is partner-only (NDA-gated). The
 * publishable shape isn't documented anywhere we can cite, so this module is
 * deliberately structured around a `SymbilityProfile` interface — callers
 * supply a profile that maps the wall-graph types to specific XML element
 * names, attribute keys, and unit conventions. The generic shape (rooms +
 * walls + openings, all metric) is locked in; the per-profile naming is
 * pluggable.
 *
 * Default profile (`DEFAULT_SYMBILITY_PROFILE`) targets a generic
 * Symbility-flavoured schema. Once the partner doc is in hand, swap to a
 * `SYMBILITY_S31_V3_PROFILE` — only this file changes.
 *
 * Output is sha256-hashed by the caller and persisted to `SymbilityExport`,
 * which is append-only at both the application layer and via Postgres
 * trigger (Rule 22).
 */

import type {
  Floor,
  Opening,
  Room,
  Wall,
  WallGraph,
} from "../v3/wall-graph-types";

export interface SymbilityProfile {
  schemaVersion: string;
  /** Top-level wrapper element name. */
  rootTag: string;
  /** Element + attribute names — overridable per profile. */
  tags: {
    floor: string;
    wall: string;
    opening: string;
    room: string;
    vertex: string;
  };
  /** Map an OpeningType to the value emitted as the element's `type` attr. */
  mapOpeningType: (type: Opening["type"]) => string;
}

export const DEFAULT_SYMBILITY_PROFILE: SymbilityProfile = {
  schemaVersion: "S31_v3_generic",
  rootTag: "Sketch",
  tags: {
    floor: "Floor",
    wall: "Wall",
    opening: "Opening",
    room: "Room",
    vertex: "Vertex",
  },
  mapOpeningType: (t) => {
    switch (t) {
      case "DOOR":
        return "DOOR";
      case "WINDOW":
        return "WINDOW";
      case "GARAGE_DOOR":
        return "GARAGE_DOOR";
      case "OPEN_PASS":
        return "OPEN_PASSAGE";
    }
  },
};

export interface ExportOptions {
  profile?: SymbilityProfile;
  exportedAt?: Date;
  inspectionId: string;
}

export interface ExportResult {
  xml: string;
  schemaVersion: string;
  contentHash: string;
}

/**
 * Synchronous serialiser. Returns the XML payload + sha256 contentHash.
 * Pure — no Prisma or I/O.
 */
export async function exportToSymbilityXml(
  graph: WallGraph,
  opts: ExportOptions,
): Promise<ExportResult> {
  const profile = opts.profile ?? DEFAULT_SYMBILITY_PROFILE;
  const exportedAt = opts.exportedAt ?? new Date();

  const inner = graph.floors
    .map((floor) => floorToXml(floor, profile, graph.scale.pxPerMetre))
    .join("\n");

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<${profile.rootTag} schemaVersion="${profile.schemaVersion}" inspectionId="${escAttr(opts.inspectionId)}" exportedAt="${exportedAt.toISOString()}" units="metric">`,
    indent(`<Scale pxPerMetre="${graph.scale.pxPerMetre}" />`),
    indent(inner),
    `</${profile.rootTag}>`,
  ].join("\n");

  const contentHash = await sha256(xml);
  return { xml, schemaVersion: profile.schemaVersion, contentHash };
}

/* ─── per-element serialisers ────────────────────────────────────────────── */

function floorToXml(
  floor: Floor,
  profile: SymbilityProfile,
  graphPxPerMetre: number,
): string {
  const cornerById = new Map(floor.corners.map((c) => [c.id, c]));
  const walls = floor.walls
    .map((w) => wallToXml(w, cornerById, profile))
    .filter((s): s is string => Boolean(s))
    .join("\n");
  const openings = floor.openings
    .map((o) => openingToXml(o, profile))
    .join("\n");
  const rooms = floor.rooms
    .map((r) => roomToXml(r, cornerById, profile))
    .filter((s): s is string => Boolean(s))
    .join("\n");

  return [
    `<${profile.tags.floor} index="${floor.floorIndex}" label="${escAttr(floor.floorLabel)}" pxPerMetre="${floor.pxPerMetre}" canvasPxPerMetre="${graphPxPerMetre}">`,
    indent(walls),
    indent(openings),
    indent(rooms),
    `</${profile.tags.floor}>`,
  ].join("\n");
}

function wallToXml(
  wall: Wall,
  cornerById: Map<string, { x: number; y: number }>,
  profile: SymbilityProfile,
): string | null {
  const from = cornerById.get(wall.from);
  const to = cornerById.get(wall.to);
  if (!from || !to) return null;
  return `<${profile.tags.wall} id="${escAttr(wall.id)}" from-x="${from.x}" from-y="${from.y}" to-x="${to.x}" to-y="${to.y}" thicknessMm="${wall.thicknessMm}" exterior="${wall.isExterior}"${wall.height != null ? ` height="${wall.height}"` : ""} />`;
}

function openingToXml(opening: Opening, profile: SymbilityProfile): string {
  return `<${profile.tags.opening} id="${escAttr(opening.id)}" wallRef="${escAttr(opening.wallId)}" type="${profile.mapOpeningType(opening.type)}" positionM="${opening.positionM}" widthM="${opening.widthM}"${opening.heightM != null ? ` heightM="${opening.heightM}"` : ""}${opening.sillHeightM != null ? ` sillHeightM="${opening.sillHeightM}"` : ""}${opening.swingDir ? ` swingDir="${opening.swingDir}"` : ""} />`;
}

function roomToXml(
  room: Room,
  cornerById: Map<string, { x: number; y: number }>,
  profile: SymbilityProfile,
): string | null {
  const vertices = room.cornerCycle
    .map((id) => cornerById.get(id))
    .filter((p): p is { x: number; y: number } => Boolean(p));
  if (vertices.length < 3) return null;
  const verts = vertices
    .map((p) => `<${profile.tags.vertex} x="${p.x}" y="${p.y}" />`)
    .join("");
  return `<${profile.tags.room} id="${escAttr(room.id)}" label="${escAttr(room.label)}"${room.roomType ? ` roomType="${escAttr(room.roomType)}"` : ""} areaM2="${room.areaM2.toFixed(4)}">${verts}</${profile.tags.room}>`;
}

/* ─── small helpers ──────────────────────────────────────────────────────── */

function escAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function indent(text: string): string {
  if (!text) return "";
  return text
    .split("\n")
    .map((l) => (l ? `  ${l}` : l))
    .join("\n");
}

/**
 * Cross-runtime sha256 — uses Web Crypto when available (browser, edge, Node
 * 20+), falls back to Node's `crypto` module otherwise.
 */
async function sha256(input: string): Promise<string> {
  // Web Crypto path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input, "utf8").digest("hex");
}
