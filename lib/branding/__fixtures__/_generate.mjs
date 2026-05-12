// One-off fixture generator. Regenerate with: node lib/branding/__fixtures__/_generate.mjs
// Keep this file — useful for future engineers to tweak fixtures without ImageMagick.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

function solid(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return sharp({ create: { width: 100, height: 100, channels: 4, background: { r, g, b, alpha: 1 } } }).png();
}

async function gradient(from, to, out) {
  const w = 100, h = 100;
  const fromR = parseInt(from.slice(1, 3), 16), fromG = parseInt(from.slice(3, 5), 16), fromB = parseInt(from.slice(5, 7), 16);
  const toR = parseInt(to.slice(1, 3), 16), toG = parseInt(to.slice(3, 5), 16), toB = parseInt(to.slice(5, 7), 16);
  const buf = Buffer.alloc(w * h * 4);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const t = x / (w - 1);
    const i = (y * w + x) * 4;
    buf[i]     = Math.round(fromR + (toR - fromR) * t);
    buf[i + 1] = Math.round(fromG + (toG - fromG) * t);
    buf[i + 2] = Math.round(fromB + (toB - fromB) * t);
    buf[i + 3] = 255;
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
}

async function circleOnTransparent(hex, out) {
  const w = 100, h = 100, r = 30;
  const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
  const buf = Buffer.alloc(w * h * 4);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const dx = x - 50, dy = y - 50;
    const inside = (dx * dx + dy * dy) <= r * r;
    const i = (y * w + x) * 4;
    buf[i]     = inside ? cr : 0;
    buf[i + 1] = inside ? cg : 0;
    buf[i + 2] = inside ? cb : 0;
    buf[i + 3] = inside ? 255 : 0;
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
}

await solid('#C0392B').toFile(join(DIR, 'red-logo.png'));
await solid('#2980B9').toFile(join(DIR, 'blue-logo.png'));
await gradient('#222222', '#444444', join(DIR, 'monochrome.png'));
await circleOnTransparent('#C0392B', join(DIR, 'transparent.png'));
await gradient('#888888', '#999999', join(DIR, 'low-contrast.png'));
console.log('fixtures generated');
