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
 * Cloudinary's uploader accepts a remote/HTTPS url or a data: URI. Ephemeral
 * client handles (blob:, file:) can't be fetched server-side, so we skip the
 * upload for those and persist the original uri rather than failing the capture.
 */
function isUploadable(uri: string): boolean {
  return /^(https?:|data:)/i.test(uri);
}

/**
 * Route the captured sourceUri through Cloudinary for durable hosting (RA-6795).
 * Returns the secure Cloudinary url, or falls back to the original uri if the
 * upload is skipped or fails — capturing the photo record must never be blocked
 * by hosting.
 */
async function toDurableUrl(sourceUri: string): Promise<string> {
  if (!isUploadable(sourceUri)) return sourceUri;
  try {
    const { secure_url } = await uploadImage(sourceUri, "inspection-photos");
    return secure_url;
  } catch (error) {
    // Internal-only log; never surface raw error detail to the caller.
    console.error("[capturePhoto] Cloudinary upload failed; storing source uri", {
      message: error instanceof Error ? error.message : String(error),
    });
    return sourceUri;
  }
}

export async function capturePhoto(args: CapturePhotoArgs) {
  const { inspectionId, caption, location, contextTag, sourceUri } =
    capturePhotoSchema.parse(args);

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
        description: "Temp blob URL or camera URI from the mobile client",
      },
    },
    required: ["inspectionId", "caption", "sourceUri"],
  },
};
