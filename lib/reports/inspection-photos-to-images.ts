import {
  parseSupabaseStorageUrl,
  signStoredMediaUrl,
} from "@/lib/storage/sign-stored-url";
import { cloudName } from "@/lib/media/cloudinary-asset-url";

/**
 * The subset of an `InspectionPhoto` row needed to embed it in a report.
 */
export interface InspectionPhotoRow {
  id?: string;
  /** The inspection that owns the row. Storage objects are only signed when
   *  their path sits under this inspection (`<org>/<inspection>/…`). */
  inspectionId?: string;
  url: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  location?: string | null;
  roomType?: string | null;
  mimeType?: string | null;
}

/** A fetched, ready-to-embed report photo. */
export interface ReportPhoto {
  bytes: Uint8Array;
  /** true → embed with embedPng; false → embedJpg. Sniffed from the bytes. */
  isPng: boolean;
  /** Caption text (may be ""). */
  caption: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function looksLikePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function captionOf(p: InspectionPhotoRow): string {
  return (
    p.description?.trim() ||
    p.location?.trim() ||
    p.roomType?.trim() ||
    ""
  );
}

/** Why a photo could not be included in a report. */
export type PhotoOmissionReason =
  | "no_url"
  | "not_storage"
  | "foreign_path"
  | "sign_failed"
  | "fetch_failed"
  | "timeout"
  | "empty"
  | "over_limit";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 6;

/**
 * A storage object may only be signed for the inspection that owns it. The
 * report route signs with the service role, so a row pointing at another
 * tenant's object would otherwise embed that tenant's bytes. The path must be
 * clean (no empty, `.`, `..` or still-encoded segments) and sit under the
 * inspection's own folder: `<owner folder>/<inspection>/…` in the evidence
 * buckets, as the upload paths build it, or `inspections/<inspection>/…` in
 * sketch-media. Both folders are compared, so a URL whose dot segments
 * collapse onto another organisation's folder is refused.
 */
function storagePathBelongsTo(
  stored: string,
  inspectionId: string | undefined,
  ownerFolders: readonly string[],
): boolean {
  let ref: ReturnType<typeof parseSupabaseStorageUrl>;
  try {
    ref = parseSupabaseStorageUrl(stored);
  } catch {
    return false; // a path that cannot be decoded cannot be shown to belong
  }
  if (!ref) return false; // not a storage object: never fetched (RA-7879)
  if (!inspectionId) return false;
  const segments = ref.path.split("/");
  const unclean = (s: string) =>
    s === "" || s === "." || s === ".." || s.includes("%") || s.includes("\\");
  if (segments.length < 3 || segments.some(unclean)) return false;
  if (ref.bucket === "sketch-media") {
    return segments[0] === "inspections" && segments[1] === inspectionId;
  }
  return ownerFolders.includes(segments[0]) && segments[1] === inspectionId;
}

/**
 * The first folder genuine uploads write for an inspection's evidence: the
 * uploader's organisation (`no-org` when they have none) from the inspection
 * routes, and the inspection's workspace or owner from the client portal.
 */
export function photoOwnerFolders(inspection: {
  userId: string;
  workspaceId: string | null;
  user: { organizationId: string | null } | null;
}): string[] {
  const folders = [
    inspection.user?.organizationId,
    inspection.workspaceId,
    inspection.userId,
    "no-org",
  ];
  return [...new Set(folders.filter((f): f is string => Boolean(f)))];
}

/**
 * Whether a stored URL names one of our storage objects. Anything else (a
 * legacy host, an internal address, a data URI), apart from our own Cloudinary
 * photos ({@link isOurCloudinaryUrl}), is never fetched: the report
 * route fetches from the server, so fetching a row's URL as given would let a
 * stored address reach internal services (RA-7879). A storage URL whose path
 * cannot be decoded counts as storage here and is refused by
 * {@link storagePathBelongsTo}.
 */
function isStorageObject(stored: string): boolean {
  try {
    return parseSupabaseStorageUrl(stored) !== null;
  } catch {
    return true;
  }
}

/**
 * Whether a stored URL is a photo on our own Cloudinary account: https, host
 * exactly `res.cloudinary.com`, no userinfo or port, first path segment our
 * configured cloud name. Older photos and live-teacher captures live there.
 * No configured cloud name allows no Cloudinary URL.
 */
function isOurCloudinaryUrl(stored: string): boolean {
  const cloud = cloudName();
  if (!cloud) return false;
  let parsed: URL;
  try {
    parsed = new URL(stored);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "res.cloudinary.com" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.pathname.split("/")[1] === cloud
  );
}

class PhotoTimeout extends Error {}

async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PhotoTimeout());
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert persisted `InspectionPhoto` rows into ready-to-embed report photos
 * (RA-120 / PR3). Each photo is fetched (preferring `thumbnailUrl` so the
 * embedded bytes stay bounded — avoids report bloat) and its format is sniffed
 * from the bytes so the embed path picks embedPng vs embedJpg correctly,
 * regardless of a stale `mimeType`.
 *
 * A photo that cannot be included never blocks the report download, and is
 * never dropped silently either: it is counted in `missing` with a reason,
 * logged with the report and inspection, and the caller prints the count in
 * the PDF. Each photo has a time limit and at most `concurrency` run at once,
 * so one stalled object cannot hang the download. Rows the caller's query did
 * not fetch (`totalCount` above `photos.length`) are counted as missing too.
 */
export async function prepareReportPhotos(
  photos: InspectionPhotoRow[],
  options: {
    /** The report's inspection; storage paths must sit under it. */
    inspectionId?: string;
    /** Allowed first folders ({@link photoOwnerFolders}). None: no storage
     *  object is signed. */
    ownerFolders?: readonly string[];
    reportId?: string;
    /** How many photos the inspection has, when the query was limited. */
    totalCount?: number;
    fetchImpl?: typeof fetch;
    evidenceLabelsByPhotoId?: ReadonlyMap<string, string[]>;
    timeoutMs?: number;
    concurrency?: number;
  } = {},
): Promise<{
  photos: ReportPhoto[];
  missing: number;
  reasons: Partial<Record<PhotoOmissionReason, number>>;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const evidenceLabelsByPhotoId = options.evidenceLabelsByPhotoId ?? new Map();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const context = {
    reportId: options.reportId,
    inspectionId: options.inspectionId,
  };

  const prepare = async (
    p: InspectionPhotoRow,
  ): Promise<ReportPhoto | PhotoOmissionReason> => {
    const stored = p.thumbnailUrl?.trim() || p.url?.trim();
    if (!stored) return "no_url";
    const cloudinaryHosted = isOurCloudinaryUrl(stored);
    if (!cloudinaryHosted && !isStorageObject(stored)) {
      // Never routine: genuine uploads are always storage objects.
      console.error(
        "[report-photos] refused a photo URL that is not a storage object",
        { ...context, photoId: p.id ?? null },
      );
      return "not_storage";
    }
    const rowElsewhere =
      Boolean(options.inspectionId) &&
      Boolean(p.inspectionId) &&
      p.inspectionId !== options.inspectionId;
    if (
      rowElsewhere ||
      (!cloudinaryHosted &&
        !storagePathBelongsTo(
          stored,
          options.inspectionId ?? p.inspectionId,
          options.ownerFolders ?? [],
        ))
    ) {
      // Never routine: a row points at an object outside its inspection.
      console.error("[report-photos] refused a photo outside its inspection", {
        ...context,
        photoId: p.id ?? null,
      });
      return "foreign_path";
    }
    try {
      return await withTimeout(timeoutMs, async (signal) => {
        // The photo bucket is private: a stored URL is either a bare object
        // URL or an expired signature, and fetching it unsigned fails. Same
        // re-sign as GET /api/inspections/[id]/photos. Our Cloudinary
        // photos are public and fetched as stored.
        let src: string = stored;
        if (!cloudinaryHosted) {
          try {
            src = (await signStoredMediaUrl(stored)) ?? stored;
          } catch {
            return "sign_failed" as const;
          }
        }
        const res = await fetchImpl(src, { signal });
        if (!res.ok) return "fetch_failed" as const;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length === 0) return "empty" as const;
        const caption = captionOf(p);
        const evidenceLabels = p.id
          ? (evidenceLabelsByPhotoId.get(p.id) ?? [])
          : [];
        return {
          bytes,
          isPng: looksLikePng(bytes),
          caption:
            evidenceLabels.length > 0
              ? `${evidenceLabels.join(", ")} · ${caption || "Inspection evidence"}`
              : caption,
        };
      });
    } catch (err) {
      return err instanceof PhotoTimeout ? "timeout" : "fetch_failed";
    }
  };

  // A fixed pool keeps order and bounds parallel signing and downloads.
  const results: (ReportPhoto | PhotoOmissionReason)[] = new Array(
    photos.length,
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, photos.length) }, async () => {
      while (next < photos.length) {
        const i = next++;
        try {
          results[i] = await prepare(photos[i]);
        } catch {
          // One row must never reject the batch and fail the whole report.
          results[i] = "fetch_failed";
        }
      }
    }),
  );

  const included: ReportPhoto[] = [];
  const reasons: Partial<Record<PhotoOmissionReason, number>> = {};
  const missingPhotoIds: (string | null)[] = [];
  results.forEach((r, i) => {
    if (typeof r === "string") {
      reasons[r] = (reasons[r] ?? 0) + 1;
      missingPhotoIds.push(photos[i].id ?? null);
    } else {
      included.push(r);
    }
  });
  const overLimit = Math.max(
    0,
    (options.totalCount ?? photos.length) - photos.length,
  );
  if (overLimit > 0) reasons.over_limit = overLimit;

  const missing = photos.length - included.length + overLimit;
  if (missing > 0) {
    console.error("[report-photos] photos could not be included", {
      ...context,
      total: photos.length + overLimit,
      missing,
      reasons,
      missingPhotoIds,
    });
  }
  return { photos: included, missing, reasons };
}
