/**
 * J6 stand-in photo store. Replaces only the network half of the Cloudinary
 * SDK (`cloudinary.v2.uploader.upload` / `destroy`) and Cloudinary's delivery
 * host for the fake cloud `jevfake`; lib/cloudinary.ts, the storage provider,
 * every route and every report builder run unchanged.
 *
 * Why Cloudinary-shaped URLs and not a .invalid host: the report photo guard
 * (lib/reports/inspection-photos-to-images.ts, RA-7879) only fetches a stored
 * photo from Supabase storage or from https://res.cloudinary.com/<our cloud>/,
 * so a URL on any other host is refused before it is fetched. The stand-in
 * therefore issues exactly the URL shape production stores, on the fake cloud
 * name the JEV env sets (CLOUDINARY_CLOUD_NAME=jevfake). Its delivery is
 * answered from memory here; no request for it ever leaves the process, and
 * every other host (and every other cloud on res.cloudinary.com) stays refused
 * by runner/setup.ts.
 *
 * Mode "drop" is a planted defect for the controls: uploads still succeed and
 * return a URL, but the bytes are not kept, so delivery answers 404.
 */
import crypto from "node:crypto";

export const STANDIN_CLOUD = "jevfake";
const HOST = "res.cloudinary.com";

export interface StoredObject {
  publicId: string;
  bytes: Buffer;
  sha256: string;
  format: string;
  resourceType: string;
  dropped: boolean;
}

interface StandInState {
  objects: Map<string, StoredObject>;
  mode: "keep" | "drop";
  seq: number;
  uploads: number;
  deliveries: number;
}

const g = globalThis as typeof globalThis & { __j6Store?: StandInState };
g.__j6Store ??= { objects: new Map(), mode: "keep", seq: 0, uploads: 0, deliveries: 0 };

export function store(): StandInState {
  return g.__j6Store!;
}

export function setMode(mode: "keep" | "drop"): void {
  store().mode = mode;
}

export function sha256(b: Uint8Array): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}

/** Width/height from PNG IHDR or JPEG SOFn; null when neither. */
export function imageSize(b: Buffer): { width: number; height: number; format: string } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), format: "png" };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), format: "jpg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

function decodeDataUri(input: unknown): { bytes: Buffer; mime: string } | null {
  if (typeof input !== "string") return null;
  const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(input);
  if (!m) return null;
  return { bytes: Buffer.from(m[2], "base64"), mime: m[1] ?? "application/octet-stream" };
}

/** Stand-in for cloudinary.v2.uploader.upload(file, options). */
export async function standInUpload(file: unknown, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const s = store();
  const decoded = decodeDataUri(file);
  if (!decoded) {
    // A remote URL or a path would make the real SDK fetch it; refuse like the network guard.
    const err = new Error("JEV stand-in: only data: URIs can be stored") as Error & { http_code?: number };
    err.http_code = 400;
    throw err;
  }
  s.seq += 1;
  s.uploads += 1;
  const resourceType = String(options.resource_type ?? "image") === "raw" ? "raw" : "image";
  const size = imageSize(decoded.bytes);
  const format = String(options.format ?? size?.format ?? (decoded.mime.split("/")[1] || "bin"));
  const folder = String(options.folder ?? "uploads");
  const leaf = options.public_id ? String(options.public_id) : `jev${String(s.seq).padStart(6, "0")}`;
  const publicId = `${folder}/${leaf}`;
  const dropped = s.mode === "drop";
  s.objects.set(publicId, {
    publicId,
    bytes: dropped ? Buffer.alloc(0) : decoded.bytes,
    sha256: sha256(decoded.bytes),
    format,
    resourceType,
    dropped,
  });
  const secureUrl = `https://${HOST}/${STANDIN_CLOUD}/${resourceType}/upload/v1761091200/${publicId}.${format}`;
  return {
    public_id: publicId,
    version: 1761091200,
    secure_url: secureUrl,
    url: secureUrl.replace(/^https:/, "http:"),
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    format,
    resource_type: resourceType,
    bytes: decoded.bytes.length,
  };
}

export async function standInDestroy(publicId: string): Promise<Record<string, unknown>> {
  const had = store().objects.delete(publicId);
  return { result: had ? "ok" : "not found" };
}

function urlOf(input: unknown): URL | null {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    if (input && typeof input === "object" && "url" in input) return new URL(String((input as { url: string }).url));
  } catch {
    return null;
  }
  return null;
}

/** True for a delivery URL of the stand-in cloud (http or https). */
export function isStandInUrl(input: unknown): boolean {
  const u = urlOf(input);
  return !!u && u.hostname === HOST && u.pathname.split("/")[1] === STANDIN_CLOUD;
}

/** The stored object a delivery URL names, ignoring transformation and version segments. */
export function objectFor(input: unknown): StoredObject | null {
  const u = urlOf(input);
  if (!u || !isStandInUrl(u)) return null;
  const path = decodeURIComponent(u.pathname).replace(/\.[a-z0-9]+$/i, "");
  let best: StoredObject | null = null;
  for (const o of store().objects.values()) {
    if (path.endsWith(`/${o.publicId}`) && (!best || o.publicId.length > best.publicId.length)) best = o;
  }
  return best;
}

/**
 * Wrap the (already network-refusing) global fetch so stand-in delivery URLs
 * are answered from memory. Returns a restore function.
 */
export function installDelivery(): () => void {
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isStandInUrl(input)) return prev(input, init);
    const s = store();
    s.deliveries += 1;
    const o = objectFor(input);
    if (!o || o.bytes.length === 0) return new Response("Resource not found", { status: 404 });
    const type = o.format === "png" ? "image/png" : o.format === "jpg" || o.format === "jpeg" ? "image/jpeg" : "application/octet-stream";
    return new Response(new Uint8Array(o.bytes), { status: 200, headers: { "content-type": type, "content-length": String(o.bytes.length) } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = prev;
  };
}
