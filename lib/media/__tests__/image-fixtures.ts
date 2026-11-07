import { deflateSync } from "node:zlib";

/** Hand-built, network-free image fixtures. CRCs are zero: the policy checks structure, sharp checks pixels. */
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([
    len,
    Buffer.from(type, "latin1"),
    data,
    Buffer.alloc(4),
  ]);
}

export function makePng(width = 2, height = 2): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  // One tiny scanline set is enough: decoders are not run by the header policy.
  const idat = deflateSync(
    Buffer.alloc(Math.min(height, 4) * (Math.min(width, 4) + 1)),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function makeJpeg(width = 2, height = 2): Buffer {
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
    sof,
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x12, 0x34]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** Lossy-bitstream (VP8) WebP header carrying the given dimensions. */
export function makeWebp(width = 2, height = 2): Buffer {
  const vp8 = Buffer.alloc(10);
  vp8.set([0x10, 0x02, 0x00], 0); // frame tag (keyframe)
  vp8.set([0x9d, 0x01, 0x2a], 3);
  vp8.writeUInt16LE(width & 0x3fff, 6);
  vp8.writeUInt16LE(height & 0x3fff, 8);
  const chunkHead = Buffer.alloc(8);
  chunkHead.write("VP8 ", 0, "latin1");
  chunkHead.writeUInt32LE(vp8.length, 4);
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), chunkHead, vp8]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

/** Terminated, correctly signed files that no decoder can open. */
export function makePngWithoutIdat(): Buffer {
  const png = makePng();
  // signature + IHDR + IEND, dropping the IDAT chunk
  const idatStart = 8 + 25;
  const idatLength = png.readUInt32BE(idatStart);
  return Buffer.concat([
    png.subarray(0, idatStart),
    png.subarray(idatStart + 12 + idatLength),
  ]);
}

export function makePngWithGarbageIdat(): Buffer {
  const png = makePng();
  const idatStart = 8 + 25;
  const idatLength = png.readUInt32BE(idatStart);
  const garbage = Buffer.from(png);
  garbage.fill(0xa5, idatStart + 8, idatStart + 8 + idatLength);
  return garbage;
}

export function makeJpegWithoutScan(): Buffer {
  const jpeg = makeJpeg();
  const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  return Buffer.concat([jpeg.subarray(0, sos), Buffer.from([0xff, 0xd9])]);
}

export function makeWebpCanvasOnly(): Buffer {
  const head = Buffer.alloc(8);
  head.write("VP8X", 0, "latin1");
  head.writeUInt32LE(10, 4);
  const canvas = Buffer.alloc(10);
  canvas.writeUIntLE(1, 4, 3); // width - 1
  canvas.writeUIntLE(1, 7, 3); // height - 1
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), head, canvas]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

/** A real, decoder-valid image made by sharp (no network). */
export async function genuineImage(
  format: "png" | "jpeg" | "webp",
  width = 64,
  height = 48,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  });
  return image[format]().toBuffer();
}

/** Real sharp JPEG: headers kept, one entropy byte after SOS, then EOI. */
export async function makeTruncatedScanJpeg(): Promise<Buffer> {
  const real = await genuineImage("jpeg", 64, 64);
  const sos = real.indexOf(Buffer.from([0xff, 0xda]));
  const scanStart = sos + 2 + real.readUInt16BE(sos + 2);
  return Buffer.concat([
    real.subarray(0, scanStart + 1),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** Real sharp JPEG followed by camera-style trailer bytes (positive control). */
export async function makeJpegWithTrailer(): Promise<Buffer> {
  return Buffer.concat([
    await genuineImage("jpeg", 64, 64),
    Buffer.from("MPF-TRAILER-DATA"),
  ]);
}

/** Non-square sharp JPEG carrying an EXIF orientation tag (stored 64x48). */
export async function makeOrientedJpeg(orientation: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .withMetadata({ orientation })
    .toBuffer();
}

/** Opaque flat-colour PNG of any size (decoder-valid, made by sharp). */
export async function flatPng(width: number, height: number): Promise<Buffer> {
  return genuineImage("png", width, height);
}

/**
 * Pixel-level watermark proof: decode the source (orientation applied) and the
 * stored output to raw RGBA and count pixels that differ. Byte inequality is
 * not enough: composing changes RGB to RGBA even when nothing is painted.
 */
export async function countChangedPixels(
  source: Uint8Array,
  output: Uint8Array,
): Promise<number> {
  const sharp = (await import("sharp")).default;
  const a = await sharp(source)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    throw new Error(
      `size mismatch ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`,
    );
  }
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      changed++;
    }
  }
  return changed;
}
