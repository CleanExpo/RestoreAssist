/**
 * Prepare an uploaded floor-plan file for the underlay preview/apply path.
 *
 * Validates type/size and rasterises PDF page 1. `dataUrl` is the unmarked
 * raster to upload: the server bakes the one stored watermark
 * (server-underlay-import.ts), so marking it here would stamp it twice
 * (RA-8236). `previewUrl` carries a watermark for the on-screen preview only.
 */

import {
  isPdfUnderlay,
  validateUnderlayUpload,
} from "@/lib/sketch/validate-underlay-upload";
import { watermarkImageDataUrl } from "@/lib/sketch/underlay-watermark";
import type { UnderlayOriginalSource } from "@/lib/sketch/commit-underlay-import";

export type PrepareUnderlayResult =
  | {
      ok: true;
      dataUrl: string;
      previewUrl: string;
      original: UnderlayOriginalSource;
      /** Set when part of the file will not be used. */
      notice?: string;
    }
  | { ok: false; error: string };

const PDF_MANUAL_FALLBACK =
  "Export page 1 as a PNG or JPG and upload that, or draw the rooms by hand.";

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

function pageOneNotice(pageCount: number): string | undefined {
  return pageCount > 1
    ? `Only page 1 of this ${pageCount}-page PDF is used. To use another page, export it as an image and upload that.`
    : undefined;
}

export async function prepareUnderlayFile(
  file: File,
): Promise<PrepareUnderlayResult> {
  const check = validateUnderlayUpload({ type: file.type, size: file.size });
  if (!check.ok) {
    return { ok: false, error: check.error ?? "Invalid file." };
  }

  const isPdf = isPdfUnderlay(file.type);
  try {
    let dataUrl: string;
    let pageCount: number | null = null;
    if (isPdf) {
      const { pdfFirstPageToPng } = await import("@/lib/sketch/pdf-to-raster");
      const raster = await pdfFirstPageToPng(file);
      dataUrl = raster.dataUrl;
      pageCount = raster.pageCount;
    } else {
      dataUrl = await readFileAsDataUrl(file);
    }
    const previewUrl = await watermarkImageDataUrl(dataUrl);
    const notice = pageCount == null ? undefined : pageOneNotice(pageCount);
    return {
      ok: true,
      dataUrl,
      previewUrl,
      original: { mimeType: file.type, page: isPdf ? 1 : null, pageCount },
      ...(notice ? { notice } : {}),
    };
  } catch (err) {
    if (!isPdf) {
      return {
        ok: false,
        error: "Couldn't prepare that image — please try another file.",
      };
    }
    return {
      ok: false,
      error:
        (err as { code?: string } | null)?.code === "encrypted"
          ? `That PDF is password-protected, so it can't be read. ${PDF_MANUAL_FALLBACK}`
          : `Couldn't read that PDF. ${PDF_MANUAL_FALLBACK}`,
    };
  }
}
