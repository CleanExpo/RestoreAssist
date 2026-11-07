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
