/**
 * RA-8239 — header ink for the floor-plan PDF.
 *
 * The header band takes the tenant's primary colour, so its text colour is
 * chosen by WCAG contrast. Contrast is a luminance ratio, so the choice also
 * holds on a greyscale print.
 */

export type Rgb01 = { r: number; g: number; b: number };

/** The default header band, #1C2E47 (BRAND_DARK). */
export const DEFAULT_BAND_RGB: Rgb01 = { r: 0.11, g: 0.18, b: 0.28 };
const INK_WHITE: Rgb01 = { r: 1, g: 1, b: 1 };
// Pure black, so white-or-black always reaches at least ~4.58:1 (WCAG AA).
const INK_DARK: Rgb01 = { r: 0, g: 0, b: 0 };
const INK_CYAN: Rgb01 = { r: 0.0, g: 0.73, b: 0.83 };

/** WCAG 2 relative luminance of a 0..1 sRGB colour. */
export function relativeLuminance({ r, g, b }: Rgb01): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio between two colours (1..21). */
export function contrastRatio(a: Rgb01, b: Rgb01): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * RA-8239 — header ink for a band colour. The main text is white or near
 * black, whichever contrasts more with the band. The accent stays brand cyan
 * only where it still reaches 4.5:1; otherwise it matches the main text.
 * Contrast is a luminance ratio, so this also holds on a greyscale print.
 */
export function headerTextColours(band: Rgb01): { text: Rgb01; accent: Rgb01 } {
  const text =
    contrastRatio(INK_WHITE, band) >= contrastRatio(INK_DARK, band)
      ? INK_WHITE
      : INK_DARK;
  const accent = contrastRatio(INK_CYAN, band) >= 4.5 ? INK_CYAN : text;
  return { text, accent };
}
