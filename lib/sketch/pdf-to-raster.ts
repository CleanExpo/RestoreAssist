/**
 * RA-6849 [C3] — PDF → raster underlay step.
 *
 * The existing-plan import plan (critical finding #3) notes PDF ingestion needs
 * a new raster step: Fabric's canvas + the report embed can only render raster
 * images, so an uploaded PDF must be rendered to a PNG before it can be used as
 * a traceable `underlay_reference` background.
 *
 * This renders PAGE 1 only (a floor plan is a single sheet) in the browser via
 * `pdfjs-dist`, at a scale chosen to land near a target pixel width, and returns
 * a PNG data URL. The heavy pdfjs import + worker are loaded lazily so they
 * never enter the main sketch bundle. The scale math is factored out as a pure
 * function so it can be unit-tested without a DOM/worker.
 */

/** Target raster width for an imported plan (px). Balances trace detail vs size. */
export const UNDERLAY_RASTER_TARGET_WIDTH = 1600;
/** Never upscale a tiny page beyond this, nor downscale below readability. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

/**
 * Scale factor to render a PDF page (whose natural viewport is `pageWidthPx` at
 * scale 1) so the output lands near `targetWidth`, clamped to sane bounds.
 */
export function computeRasterScale(
  pageWidthPx: number,
  targetWidth = UNDERLAY_RASTER_TARGET_WIDTH,
): number {
  if (!(pageWidthPx > 0)) return 1;
  const raw = targetWidth / pageWidthPx;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

/**
 * Render page 1 of a PDF file to a PNG data URL (browser-only).
 * @throws if the PDF cannot be parsed or has no pages.
 */
export async function pdfFileToPngDataUrl(
  file: Blob,
  targetWidth = UNDERLAY_RASTER_TARGET_WIDTH,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // pdfjs v5 ships an ESM worker; point the worker at the bundled asset URL so
  // it resolves under Next without a separate copy step.
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
    new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await (
    pdfjs as unknown as {
      getDocument: (src: { data: Uint8Array }) => { promise: Promise<unknown> };
    }
  ).getDocument({ data }).promise;

  const numPages = (doc as { numPages: number }).numPages;
  if (!numPages) throw new Error("PDF has no pages");

  const page = await (
    doc as { getPage: (n: number) => Promise<unknown> }
  ).getPage(1);

  const baseViewport = (
    page as { getViewport: (o: { scale: number }) => { width: number } }
  ).getViewport({ scale: 1 });
  const scale = computeRasterScale(baseViewport.width, targetWidth);
  const viewport = (
    page as {
      getViewport: (o: { scale: number }) => { width: number; height: number };
    }
  ).getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  await (
    page as {
      render: (o: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
      }) => { promise: Promise<void> };
    }
  ).render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL("image/png");
}
