import "server-only";

import { createHash } from "node:crypto";
import { buildCleanSketchSvg } from "@/lib/sketch/clean-sketch-svg";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Render and store the report PNG on the server, without any underlay pixels. */
export async function storeVerifiedCleanRender(
  inspectionId: string,
  floorNumber: number,
  sketchData: unknown,
): Promise<{
  storagePath: string;
  storageLocator: string;
  renderSha256: string;
}> {
  const sharp = (await import("sharp")).default;
  const png = await sharp(buildCleanSketchSvg(sketchData), {
    limitInputPixels: 40_000_000,
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (!png.length || png.length > 15 * 1024 * 1024) {
    throw new Error("Verified clean floor-plan render exceeds the export limit.");
  }

  const renderSha256 = createHash("sha256").update(png).digest("hex");
  const storagePath = `inspections/${inspectionId}/exports/verified/floor-${floorNumber}-${renderSha256}.png`;
  const { error } = await getSupabaseServerClient()
    .storage.from("sketch-media")
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Verified floor-plan render failed: ${error.message}`);
  }
  return {
    storagePath,
    storageLocator: `storage://sketch-media/${storagePath}`,
    renderSha256,
  };
}
