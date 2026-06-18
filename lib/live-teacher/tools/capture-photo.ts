import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/cloudinary";

// InspectionPhoto schema fields (per prisma/schema.prisma):
//   url (String), location (String?), description (String?)
// Note: caption → description, contextTag → stored in description as prefix.
//       sourceUri is routed through Cloudinary (RA-6795) so the persisted url
//       is durable; if the upload fails we degrade gracefully to the raw uri.

export const capturePhotoSchema = z.object({
  inspectionId: z.string(),
  caption: z.string(),
  location: z.string().optional(),
  contextTag: z.string().optional(),
  sourceUri: z.string(),
});

export type CapturePhotoArgs = z.infer<typeof capturePhotoSchema>;

/**
 * Cloudinary's uploader fetches a server-reachable source: an `https:` URL or a
 * base64 `data:` URI. Plain `http:` is rejected (no server-side fetch of
 * untrusted cleartext URLs), as are ephemeral client handles (`blob:`, `file:`)
 * which can't be fetched server-side at all. Non-hostable sources are persisted
 * as-is rather than failing the capture (see toDurableUrl).
 */
function isUploadable(uri: string): boolean {
  return /^(https:|data:)/i.test(uri);
}

/**
 * Route the captured sourceUri through Cloudinary for durable hosting (RA-6795).
 * Returns the secure Cloudinary url, or falls back to the original uri if the
 * upload is skipped or fails — capturing the photo record must never be blocked
 * by hosting.
 *
 * NOTE: a non-hostable sourceUri (blob:/file:/http:) is stored verbatim, which
 * yields a URL that won't resolve later. The client must send a fetchable
 * `https:` URL or a base64 `data:` URI for the photo to be durably hosted; we
 * log a warning so this shows up in ops rather than silently producing a dead
 * link. (Tracked in RA-6798 alongside the tool-dispatch wiring.)
 */
async function toDurableUrl(sourceUri: string): Promise<string> {
  if (!isUploadable(sourceUri)) {
    console.warn(
      "[capturePhoto] sourceUri is not server-hostable (expected https:/data:); storing as-is — the stored url will not be durable",
      { scheme: sourceUri.split(":", 1)[0] },
    );
    return sourceUri;
  }
  try {
    const { secure_url } = await uploadImage(sourceUri, "inspection-photos");
    return secure_url;
  } catch (error) {
    // Internal-only log; never surface raw error detail to the caller.
    console.error(
      "[capturePhoto] Cloudinary upload failed; storing source uri",
      {
        message: error instanceof Error ? error.message : String(error),
      },
    );
    return sourceUri;
  }
}

export async function capturePhoto(
  args: CapturePhotoArgs,
  ctx: { userId: string },
) {
  const { inspectionId, caption, location, contextTag, sourceUri } =
    capturePhotoSchema.parse(args);

  // RA-6798: Verify the inspection belongs to the authenticated user before
  // writing. A model-supplied inspectionId with no ownership check is IDOR.
  const owned = await prisma.inspection.findFirst({
    where: { id: inspectionId, userId: ctx.userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error(
      `Forbidden: inspection ${inspectionId} does not belong to user ${ctx.userId}`,
    );
  }

  const url = await toDurableUrl(sourceUri);
  const description = contextTag ? `[${contextTag}] ${caption}` : caption;

  const photo = await prisma.inspectionPhoto.create({
    data: {
      inspectionId,
      url,
      location,
      description,
    },
    select: {
      id: true,
      url: true,
      location: true,
      description: true,
    },
  });

  return {
    id: photo.id,
    url: photo.url,
    location: photo.location,
    description: photo.description,
  };
}

export const capturePhotoDefinition = {
  name: "capture_photo",
  description:
    "Log a photo for the current inspection. Use when the tech takes a photo or when one is uploaded from the camera.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      caption: { type: "string", description: "Short caption for the photo" },
      location: { type: "string", description: "Where the photo was taken" },
      contextTag: {
        type: "string",
        description: "Damage type, room, or stage tag",
      },
      sourceUri: {
        type: "string",
        description:
          "A server-fetchable image source: an https URL or a base64 data: URI. Do not pass ephemeral blob:/file: handles — they cannot be hosted and the stored photo URL would not resolve.",
      },
    },
    required: ["inspectionId", "caption", "sourceUri"],
  },
};
