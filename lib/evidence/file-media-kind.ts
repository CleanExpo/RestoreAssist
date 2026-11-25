/**
 * The one owner of "which kind of media a file-path evidence class holds".
 *
 * RA-8407. The evidence route's file path used to treat every class except
 * VIDEO_WALKTHROUGH as a photograph. A validly signed VOICE_MEMO made of JPEG
 * bytes was answered 201 and stored as `image/jpeg` with
 * `signedManifestVerified: true`. A signature proves who sent the bytes and
 * when; it does not make a photograph a voice memo.
 *
 * So the route asks this module, with the declared part type AND the file's
 * own leading bytes, before it stores anything. The file name and extension
 * are never consulted. The capture screen asks it too, to choose which input
 * to open.
 *
 * Document classes (floor plans, lab results, certificates and the rest) keep
 * exactly the rule they had: image bytes only, declared type not consulted.
 * Whether they should accept a photograph, a scan or a PDF is a product
 * decision that has not been made (RA-8407, "Decisions for Phill").
 *
 * No imports: the capture screen is a client component and calls this too.
 */

export type EvidenceFileMediaKind = "image" | "video" | "audio" | "document";

/**
 * Every class the file path takes, named on purpose. A class added to the
 * schema later is not on this list, so it is treated as a document (today's
 * image-only rule) until someone decides what it holds; the route tests check
 * this list against the schema so the omission is seen.
 */
const FILE_MEDIA_KIND: Readonly<Record<string, EvidenceFileMediaKind>> = {
  PHOTO_DAMAGE: "image",
  PHOTO_EQUIPMENT: "image",
  PHOTO_PROGRESS: "image",
  PHOTO_COMPLETION: "image",
  THERMAL_IMAGE: "image",
  AFFECTED_CONTENTS: "image",
  VIDEO_WALKTHROUGH: "video",
  VOICE_MEMO: "audio",
  FLOOR_PLAN: "document",
  SCOPE_DOCUMENT: "document",
  LAB_RESULT: "document",
  AUTHORITY_FORM: "document",
  THIRD_PARTY_REPORT: "document",
  COMPLIANCE_CERTIFICATE: "document",
};

/** The kind of media a file-path class holds. */
export function fileMediaKindForEvidenceClass(
  evidenceClass: string,
): EvidenceFileMediaKind {
  return FILE_MEDIA_KIND[evidenceClass] ?? "document";
}

/** The classes this module names, for the guard test. */
export function namedFileMediaClasses(): string[] {
  return Object.keys(FILE_MEDIA_KIND);
}

/**
 * Picker filter for voice memos. An audio-only accept list keeps the phone
 * from opening the stills camera (a mixed or image list does). Phones that
 * offer a recorder for it show one; others offer their files.
 */
export const AUDIO_EVIDENCE_ACCEPT =
  "audio/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/aac,audio/wav,audio/ogg,audio/*";

/** Whether the capture screen may open the native still camera for a class. */
export function capturesWithStillCamera(evidenceClass: string): boolean {
  const kind = fileMediaKindForEvidenceClass(evidenceClass);
  return kind === "image" || kind === "document";
}

// ─── Byte sniffing ───────────────────────────────────────────────────────────

type Container =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "isobmff-image"
  | "isobmff-audio"
  | "isobmff"
  | "webm"
  | "ogg"
  | "wav"
  | "mp3"
  | "aac"
  | "flac"
  | "amr"
  | null;

// HEIF/AVIF stills share the ISO-BMFF ftyp box with MP4 and MOV.
const IMAGE_FTYP_BRANDS = new Set([
  "heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1", "avif", "avis",
]);
// ISO-BMFF brands that only ever hold sound (iTunes and Flash audio).
const AUDIO_FTYP_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "F4A ", "F4B "]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function sniff(b: Uint8Array): { container: Container; ftypBrand: string } {
  const ftypBrand = ascii(b, 8, 12);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { container: "jpeg", ftypBrand };
  }
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG") {
    return { container: "png", ftypBrand };
  }
  if (ascii(b, 0, 4) === "GIF8") return { container: "gif", ftypBrand };
  if (ascii(b, 0, 4) === "RIFF") {
    if (ftypBrand === "WEBP") return { container: "webp", ftypBrand };
    if (ftypBrand === "WAVE") return { container: "wav", ftypBrand };
    return { container: null, ftypBrand };
  }
  if (ascii(b, 4, 8) === "ftyp") {
    if (IMAGE_FTYP_BRANDS.has(ftypBrand)) {
      return { container: "isobmff-image", ftypBrand };
    }
    if (AUDIO_FTYP_BRANDS.has(ftypBrand)) {
      return { container: "isobmff-audio", ftypBrand };
    }
    return { container: "isobmff", ftypBrand };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { container: "webm", ftypBrand };
  }
  if (ascii(b, 0, 4) === "OggS") return { container: "ogg", ftypBrand };
  if (ascii(b, 0, 4) === "fLaC") return { container: "flac", ftypBrand };
  if (ascii(b, 0, 5) === "#!AMR") return { container: "amr", ftypBrand };
  if (ascii(b, 0, 3) === "ID3") return { container: "mp3", ftypBrand };
  // MPEG audio frame sync: 11 set bits. Layer bits 00 is ADTS AAC; anything
  // else is an MPEG audio layer. A JPEG starts FF D8, which this never matches.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    return { container: (b[1] & 0x06) === 0 ? "aac" : "mp3", ftypBrand };
  }
  return { container: null, ftypBrand };
}

const IMAGE_MIME: Partial<Record<NonNullable<Container>, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const AUDIO_MIME: Partial<Record<NonNullable<Container>, string>> = {
  webm: "audio/webm",
  isobmff: "audio/mp4",
  "isobmff-audio": "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  flac: "audio/flac",
  amr: "audio/amr",
};

/** Containers that hold sound or picture; the declared type has to settle it. */
const SOUND_OR_PICTURE = new Set<Container>(["webm", "isobmff", "ogg"]);

/**
 * A declared type that makes no claim: an empty type, or the generic one the
 * multipart encoding substitutes for it. Refusing these would refuse a real
 * photograph the web picker handed over untyped (RA-8388 round 1).
 */
function declaresNothing(declared: string): boolean {
  return declared === "" || declared === "application/octet-stream";
}

export type EvidenceFileMediaCheck =
  | {
      ok: true;
      /** The type the bytes proved, which is the type the route records. */
      mimeType: string;
    }
  | { ok: false; message: string };

const REFUSAL = {
  image:
    "This evidence is a photograph, but the file is not a JPEG, PNG, GIF or WebP image. Nothing was saved.",
  video:
    "This evidence is a video walkthrough, but the file is not an MP4, MOV or WebM video. Nothing was saved.",
  audio:
    "This evidence is a voice memo, but the file is not an audio recording. Nothing was saved.",
  // Unchanged wording: documents keep today's rule and today's answer.
  document: "Invalid file type. Only images are allowed.",
} as const;

/**
 * Whether the file is the kind of media its class names, and the type to
 * record if it is. `declaredType` is the multipart part's type as received.
 */
export function checkEvidenceFileMedia(input: {
  evidenceClass: string;
  declaredType: string;
  bytes: Uint8Array;
}): EvidenceFileMediaCheck {
  const kind = fileMediaKindForEvidenceClass(input.evidenceClass);
  const declared = input.declaredType.trim().toLowerCase();
  const { container, ftypBrand } = sniff(input.bytes);
  const refuse = (): EvidenceFileMediaCheck => ({
    ok: false,
    message: REFUSAL[kind],
  });

  if (kind === "document") {
    // Today's rule, kept exactly: image bytes, declared type not consulted.
    const mimeType = container ? IMAGE_MIME[container] : undefined;
    return mimeType ? { ok: true, mimeType } : refuse();
  }

  if (kind === "image") {
    const mimeType = container ? IMAGE_MIME[container] : undefined;
    if (!mimeType) return refuse();
    if (!declaresNothing(declared) && !declared.startsWith("image/")) {
      return refuse();
    }
    return { ok: true, mimeType };
  }

  if (kind === "video") {
    if (container !== "isobmff" && container !== "webm") return refuse();
    if (!declaresNothing(declared) && !declared.startsWith("video/")) {
      return refuse();
    }
    // A video's exact subtype is not something a few leading bytes settle,
    // so a declared video type is kept; otherwise the container decides.
    const mimeType = declared.startsWith("video/")
      ? input.declaredType
      : container === "webm"
        ? "video/webm"
        : ftypBrand === "qt  "
          ? "video/quicktime"
          : "video/mp4";
    return { ok: true, mimeType };
  }

  // Audio.
  const mimeType = container ? AUDIO_MIME[container] : undefined;
  if (!mimeType) return refuse();
  if (declared.startsWith("audio/")) return { ok: true, mimeType };
  // A container that also carries video needs the declared type to say
  // audio; an audio-only container may arrive untyped.
  if (!SOUND_OR_PICTURE.has(container) && declaresNothing(declared)) {
    return { ok: true, mimeType };
  }
  return refuse();
}
