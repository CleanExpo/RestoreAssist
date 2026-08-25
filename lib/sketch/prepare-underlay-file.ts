/**
 * Prepare an uploaded floor-plan file for the underlay preview/apply path.
 *
 * Validates type/size, rasterises PDF page 1, then bakes the reference-only
 * watermark. Returns a data URL the canvas and persist helper can consume.
 */

import {
  isPdfUnderlay,
  validateUnderlayUpload,
} from "@/lib/sketch/validate-underlay-upload";
import { watermarkImageDataUrl } from "@/lib/sketch/underlay-watermark";

export type PrepareUnderlayResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read failed"));
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function prepareUnderlayFile(
  file: File,
): Promise<PrepareUnderlayResult> {
  const check = validateUnderlayUpload({ type: file.type, size: file.size });
  if (!check.ok) {
    return { ok: false, error: check.error ?? "Invalid file." };
  }

  try {
    let source: string;
    if (isPdfUnderlay(file.type)) {
      const { pdfFileToPngDataUrl } = await import("@/lib/sketch/pdf-to-raster");
      source = await pdfFileToPngDataUrl(file);
    } else {
      source = await readFileAsDataUrl(file);
    }
    const dataUrl = await watermarkImageDataUrl(source);
    return { ok: true, dataUrl };
  } catch {
    return {
      ok: false,
      error: isPdfUnderlay(file.type)
        ? "Couldn't read that PDF — try exporting page 1 as an image."
        : "Couldn't prepare that image — please try another file.",
    };
  }
}
