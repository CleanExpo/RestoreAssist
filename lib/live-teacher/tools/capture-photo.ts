import { z } from "zod";
import { prisma } from "@/lib/prisma";

// InspectionPhoto schema fields (per prisma/schema.prisma):
//   url (String), location (String?), description (String?)
// Note: caption → description, contextTag → stored in description as prefix,
//       sourceUri → stored as url directly (Cloudinary upload is a follow-up)

export const capturePhotoSchema = z.object({
  inspectionId: z.string(),
  caption: z.string(),
  location: z.string().optional(),
  contextTag: z.string().optional(),
  sourceUri: z.string(),
});

export type CapturePhotoArgs = z.infer<typeof capturePhotoSchema>;

export async function capturePhoto(args: CapturePhotoArgs) {
  const { inspectionId, caption, location, contextTag, sourceUri } =
    capturePhotoSchema.parse(args);

  // TODO: Cloudinary upload — wire sourceUri through uploadImage() in a follow-up (RA-1133+)
  const description = contextTag ? `[${contextTag}] ${caption}` : caption;

  const photo = await prisma.inspectionPhoto.create({
    data: {
      inspectionId,
      url: sourceUri, // stored as-is until Cloudinary upload is wired
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
