import { z } from "zod";
import { prisma } from "@/lib/prisma";

// MoistureReading schema fields (per prisma/schema.prisma):
//   location, surfaceType, moistureLevel (Float), depth (String)
// Note: unit, deviceVendor, deviceModel, source are NOT in the Prisma model —
// they are stored as notes JSON or ignored; moistureLevel stored directly.

export const takeReadingSchema = z.object({
  inspectionId: z.string(),
  location: z.string(),
  surfaceType: z.string(),
  moistureLevel: z.number().min(0).max(100),
  unit: z.enum(["PERCENT_MC", "WME", "RH"]),
  depth: z.enum(["surface", "5cm", "10cm"]).default("surface"),
  deviceVendor: z.string().optional(),
  deviceModel: z.string().optional(),
  source: z.enum(["ble", "cloud", "ocr", "manual"]).default("manual"),
});

export type TakeReadingArgs = z.infer<typeof takeReadingSchema>;

export async function takeReading(args: TakeReadingArgs) {
  const {
    inspectionId,
    location,
    surfaceType,
    moistureLevel,
    unit,
    depth,
    deviceVendor,
    deviceModel,
    source,
  } = takeReadingSchema.parse(args);

  // Persist extra metadata (unit, device, source) in the notes field as JSON
  const notes = JSON.stringify({ unit, deviceVendor, deviceModel, source });

  const reading = await prisma.moistureReading.create({
    data: {
      inspectionId,
      location,
      surfaceType,
      moistureLevel,
      depth,
      notes,
    },
    select: {
      id: true,
      location: true,
      moistureLevel: true,
    },
  });

  return {
    id: reading.id,
    location: reading.location,
    value: reading.moistureLevel,
    unit,
  };
}

export const takeReadingDefinition = {
  name: "take_reading",
  description:
    "Log a moisture reading for the current inspection. Use when the tech verbally reports a meter reading or when a Bluetooth meter sends one.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      location: { type: "string", description: "Room or zone identifier" },
      surfaceType: {
        type: "string",
        description: "e.g. drywall, wood, carpet, concrete",
      },
      moistureLevel: { type: "number", description: "Reading value 0–100" },
      unit: {
        type: "string",
        enum: ["PERCENT_MC", "WME", "RH"],
        description: "Unit of measure",
      },
      depth: {
        type: "string",
        enum: ["surface", "5cm", "10cm"],
        description: "Probe depth",
      },
      deviceVendor: {
        type: "string",
        description: "Meter vendor, e.g. Tramex",
      },
      deviceModel: { type: "string", description: "Meter model, e.g. CME5" },
      source: {
        type: "string",
        enum: ["ble", "cloud", "ocr", "manual"],
        description: "Data entry source",
      },
    },
    required: [
      "inspectionId",
      "location",
      "surfaceType",
      "moistureLevel",
      "unit",
    ],
  },
};
