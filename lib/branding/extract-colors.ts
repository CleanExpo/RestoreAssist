import sharp from 'sharp';
import { kmeans } from 'ml-kmeans';

export interface ColorExtractResult {
  primary: string;
  accent: string;
  contrastWarning: boolean;
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
): number {
  const L1 = relativeLuminance(...rgb1);
  const L2 = relativeLuminance(...rgb2);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// Lighten a colour by mixing with white, used to synthesise a fallback accent
function lighten(r: number, g: number, b: number, amount: number): [number, number, number] {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  ];
}

export async function extractColors(buf: Buffer): Promise<ColorExtractResult> {
  // Downsample to 64×64 RGBA
  const { data } = await sharp(buf)
    .resize(64, 64, { fit: 'inside' })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  // Build pixel list, dropping fully transparent and near-white pixels
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) continue; // skip near-white
    pixels.push([r, g, b]);
  }

  if (pixels.length === 0) {
    return { primary: '#1C2E47', accent: '#8A6B4E', contrastWarning: false };
  }

  // k-means with k=2; seed=42 for reproducibility
  const result = kmeans(pixels, 2, { maxIterations: 25, seed: 42 });
  const sorted = result.centroids.slice().sort((a, b) => {
    return (
      relativeLuminance(a[0], a[1], a[2]) - relativeLuminance(b[0], b[1], b[2])
    );
  });

  const primaryRgb = sorted[0] as [number, number, number];
  let accentRgb = sorted[sorted.length - 1] as [number, number, number];

  // Guard: if both centroids are identical (can happen on uniform images),
  // synthesise a distinct accent by lightening the primary by 40%
  if (toHex(...primaryRgb) === toHex(...accentRgb)) {
    accentRgb = lighten(...primaryRgb, 0.4);
  }

  const ratio = contrastRatio(primaryRgb, accentRgb);

  return {
    primary: toHex(...primaryRgb),
    accent: toHex(...accentRgb),
    contrastWarning: ratio < 4.5,
  };
}
