/**
 * RA-6847 [C1] — underlay watermark.
 *
 * An imported plan is a reference-only `underlay_reference` layer. Spec §8.1
 * and `au-ip-opinion-brief.md` require it to be visibly watermarked so it can
 * never be mistaken for authoritative measured geometry. We bake a tiled,
 * faded "REFERENCE ONLY" watermark into the raster at import time — for every
 * client-upload source (PDF-rastered or a directly-uploaded image) — so the
 * marking travels with the pixels. This is defense-in-depth alongside the
 * export firewall (`export-sketch-png.ts`), which strips the underlay from
 * exports entirely.
 */

export const WATERMARK_TEXT = "REFERENCE ONLY";
/** Grid spacing between repeated stamps (px). */
export const WATERMARK_TILE_PX = 260;

export interface TilePoint {
  x: number;
  y: number;
}

/**
 * Grid of stamp origins covering an image, over-scanned by one tile on every
 * side so the 45°-rotated text still fills the corners. Pure — the actual draw
 * lives in `watermarkImageDataUrl`.
 */
export function watermarkTilePositions(
  width: number,
  height: number,
  tilePx = WATERMARK_TILE_PX,
): TilePoint[] {
  if (!(width > 0) || !(height > 0) || !(tilePx > 0)) return [];
  const pts: TilePoint[] = [];
  for (let y = -tilePx; y <= height + tilePx; y += tilePx) {
    for (let x = -tilePx; x <= width + tilePx; x += tilePx) {
      pts.push({ x, y });
    }
  }
  return pts;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load underlay image"));
    img.src = src;
  });
}

/**
 * Draw a tiled, faded watermark over an image and return a PNG data URL.
 * Browser-only (needs a 2D canvas). The tiling math is `watermarkTilePositions`.
 * @throws if the image cannot be loaded or a 2D context is unavailable.
 */
export async function watermarkImageDataUrl(
  source: string,
  text = WATERMARK_TEXT,
): Promise<string> {
  const img = await loadImage(source);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(img, 0, 0, width, height);

  const fontPx = Math.max(16, Math.round(Math.min(width, height) / 22));
  ctx.font = `600 ${fontPx}px sans-serif`;
  ctx.fillStyle = "rgba(220, 38, 38, 0.18)"; // faded red — visible, non-obscuring
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const p of watermarkTilePositions(width, height)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
