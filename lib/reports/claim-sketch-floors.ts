import type { SketchFloor } from "@/lib/generate-sketch-pdf";
import { createHash } from "node:crypto";
import { parseMoisturePins } from "./moisture-map";
import { parseEvidencePins } from "./evidence-map";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import {
  filterNormalizedPinsInRoom,
  type RoomMoistureCropMeta,
} from "@/lib/sketch/room-moisture-crop";
import { roomMoistureCropFromStoredSketchData } from "@/lib/sketch/pending-sketch-load";
import { parseSupabaseStorageUrl } from "@/lib/storage/sign-stored-url";
import { stableStringify } from "@/lib/sketch/roomplan-custody-queue";

const MAX_RENDER_BYTES = 15 * 1024 * 1024;

async function readStoredRender(
  storedUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const ref = parseSupabaseStorageUrl(storedUrl);
  if (
    !ref ||
    ref.bucket !== "sketch-media" ||
    !/^inspections\/[^/]+\/exports\/(?:(?:verified|client)\/)?[^/]+\.png$/i.test(
      ref.path,
    )
  )
    return null;
  const signedUrl = await signStoredMediaUrl(storedUrl);
  if (!signedUrl || signedUrl.startsWith("storage://")) return null;
  const response = await fetchImpl(signedUrl, { redirect: "manual" });
  if (!response.ok || response.status >= 300) return null;
  const contentType = (response.headers.get("content-type") ?? "").split(
    ";",
  )[0];
  if (contentType !== "image/png") return null;
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RENDER_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RENDER_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, total);
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  )
    return null;
  return { bytes, contentType };
}

/**
 * The subset of a `ClaimSketch` row needed to build a report floor page.
 * `renderedPngUrl` is the immutable server-rendered floor (allowlisted operator
 * geometry only) stored in the private `sketch-media/exports/verified` prefix.
 */
export interface ClaimSketchRow {
  floorNumber: number;
  floorLabel: string;
  renderedPngUrl: string | null;
  sketchData?: unknown;
  /**
   * RA-120 §3: the client moisture-overlay pins persisted on the sketch. Not
   * baked into `renderedPngUrl` (they're a React DOM overlay), so they are
   * parsed here and overlaid onto the sketch image in the report PDF.
   */
  moisturePoints?: unknown;
  evidencePins?: unknown;
  underlayReferences?: Array<{
    verifiedAt: Date | string | null;
    verificationJson?: unknown;
  }>;
  inspection?: {
    sketchUnderlayReferences?: Array<{
      floorNumber: number;
      verifiedAt: Date | string | null;
      verificationJson?: unknown;
    }>;
  };
}

export function isClaimSketchExportEligible(sketch: ClaimSketchRow): boolean {
  if (!sketch.renderedPngUrl) return false;
  const render = parseSupabaseStorageUrl(sketch.renderedPngUrl);
  if (
    !render ||
    render.bucket !== "sketch-media" ||
    !/^inspections\/[^/]+\/exports\/verified\/floor-\d+-[a-f0-9]{64}\.png$/i.test(
      render.path,
    )
  )
    return false;
  const inspectionHistory = sketch.inspection?.sketchUnderlayReferences;
  const references = Array.isArray(inspectionHistory)
    ? inspectionHistory.filter(
        (reference) => reference.floorNumber === sketch.floorNumber,
      )
    : (sketch.underlayReferences ?? []);
  if (!references.length) return true;
  const sketchSha256 = createHash("sha256")
    .update(stableStringify(sketch.sketchData ?? null))
    .digest("hex");
  return references.some((reference) => {
    if (!reference.verifiedAt || !reference.verificationJson) return false;
    const receipt = reference.verificationJson as Record<string, unknown>;
    const renderSha256 =
      typeof receipt.renderSha256 === "string" ? receipt.renderSha256 : "";
    return (
      /^[a-f0-9]{64}$/i.test(renderSha256) &&
      receipt.sketchSha256 === sketchSha256 &&
      receipt.storagePath === render.path &&
      render.path.endsWith(`-${renderSha256}.png`)
    );
  });
}

/**
 * When a floor has room moisture crop meta, append a room-scoped moisture page
 * (Hydro-style workflow outcome — room map for reports).
 */
export function expandFloorsWithRoomMoisture(
  floors: SketchFloor[],
): SketchFloor[] {
  const out: SketchFloor[] = [];
  for (const floor of floors) {
    out.push(floor);
    const cropMeta = floor.roomMoistureCrop;
    if (!cropMeta?.roomPoints?.length) continue;
    const w = cropMeta.canvasWidth ?? 0;
    const h = cropMeta.canvasHeight ?? 0;
    const roomPins = filterNormalizedPinsInRoom(
      floor.moisturePins ?? [],
      cropMeta.roomPoints,
      w,
      h,
    );
    const label = cropMeta.crop.label ?? cropMeta.roomId ?? "Room";
    out.push({
      ...floor,
      label: `Room moisture — ${label}`,
      moisturePins: roomPins,
      evidencePins: null,
      roomMoistureCrop: cropMeta,
      isRoomMoisturePage: true,
    });
  }
  return out;
}

/**
 * Convert persisted `ClaimSketch` rows into `SketchFloor`s for
 * {@link embedSketchesInPdf}. Only receipt-eligible canonical server renders
 * are included, sorted by floor. Each PNG is fetched and inlined as a data URL because
 * `dataUrlToBytes` (the embed path) only decodes `data:` URLs.
 *
 * A floor whose image fails to fetch is skipped rather than failing the whole
 * report — a missing floor plan must never block the PDF download.
 *
 * `fetchImpl` is injectable for testing.
 */
export async function claimSketchesToFloors(
  sketches: ClaimSketchRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<SketchFloor[]> {
  const renderable = sketches
    .filter(
      (s): s is ClaimSketchRow & { renderedPngUrl: string } =>
        Boolean(s.renderedPngUrl) &&
        isClaimSketchExportEligible(s),
    )
    .sort((a, b) => a.floorNumber - b.floorNumber);

  const floors = await Promise.all(
    renderable.map(async (s): Promise<SketchFloor | null> => {
      try {
        const stored = await readStoredRender(s.renderedPngUrl, fetchImpl);
        if (!stored) return null;
        const base64 = stored.bytes.toString("base64");
        const roomMoistureCrop: RoomMoistureCropMeta | null =
          roomMoistureCropFromStoredSketchData(s.sketchData);
        return {
          label: s.floorLabel,
          pngDataUrl: `data:image/png;base64,${base64}`,
          fabricJson:
            s.sketchData && typeof s.sketchData === "object"
              ? (s.sketchData as Record<string, unknown>)
              : null,
          moisturePins: parseMoisturePins(s.moisturePoints),
          evidencePins: parseEvidencePins(s.evidencePins),
          roomMoistureCrop,
        };
      } catch {
        return null;
      }
    }),
  );

  return expandFloorsWithRoomMoisture(
    floors.filter((f): f is SketchFloor => f !== null),
  );
}
