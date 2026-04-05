/**
 * RA-416: EXIF Metadata Extraction
 *
 * Extracts EXIF/metadata from inspection photo uploads using `exifr`.
 * Results are stored in the MediaAsset table for location intelligence,
 * device auditing, and future AI feature use.
 *
 * Design:
 * - Always succeeds — missing EXIF is normal (stripped by some apps/phones)
 * - Fire-and-forget: caller does not await this
 * - Handles JPEG, PNG, HEIC/HEIF, WebP
 * - GPS coordinates are stored as decimal degrees (WGS84)
 */

import { prisma } from "../prisma";

export interface ExifExtractionInput {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  inspectionId: string;
  workspaceId: string;
  evidenceId?: string;
}

export interface ExtractedExif {
  // GPS
  latitude?: number;
  longitude?: number;
  altitude?: number;
  // Timestamps
  capturedAt?: Date;
  timezone?: string;
  // Device
  deviceMake?: string;
  deviceModel?: string;
  software?: string;
  lensModel?: string;
  // Image
  width?: number;
  height?: number;
  orientation?: number;
  colorSpace?: string;
  dpiX?: number;
  dpiY?: number;
  // Camera settings
  focalLength?: number;
  aperture?: number;
  exposureTime?: string;
  iso?: number;
  flash?: boolean;
  // Raw dump
  raw?: Record<string, unknown>;
}

/**
 * Extract EXIF data from a buffer using exifr.
 * Returns an empty object if extraction fails or EXIF is absent.
 */
export async function extractExif(buffer: Buffer): Promise<ExtractedExif> {
  try {
    // Dynamic import — exifr is optional; gracefully skip if not installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const exifr = await import("exifr").catch(() => null) as any;
    if (!exifr) return {};

    const data = await exifr.parse(buffer, {
      gps: true,
      tiff: true,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: true,
      ihdr: true,
      pick: [
        "Make", "Model", "Software", "LensModel",
        "DateTimeOriginal", "CreateDate", "TimeZoneOffset",
        "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
        "Orientation", "ColorSpace",
        "XResolution", "YResolution",
        "FocalLength", "FNumber", "ExposureTime", "ISO", "Flash",
        "GPSLatitude", "GPSLongitude", "GPSAltitude", "GPSTimeStamp",
        "latitude", "longitude", "altitude",
      ],
    });

    if (!data) return {};

    const exif: ExtractedExif = {};

    // GPS — exifr normalises to decimal degrees automatically
    if (typeof data.latitude === "number") exif.latitude = data.latitude;
    if (typeof data.longitude === "number") exif.longitude = data.longitude;
    if (typeof data.altitude === "number") exif.altitude = data.altitude;

    // Timestamps
    if (data.DateTimeOriginal instanceof Date) exif.capturedAt = data.DateTimeOriginal;
    else if (data.CreateDate instanceof Date) exif.capturedAt = data.CreateDate;
    if (data.TimeZoneOffset) exif.timezone = String(data.TimeZoneOffset);

    // Device
    if (data.Make) exif.deviceMake = String(data.Make).trim();
    if (data.Model) exif.deviceModel = String(data.Model).trim();
    if (data.Software) exif.software = String(data.Software).trim();
    if (data.LensModel) exif.lensModel = String(data.LensModel).trim();

    // Image dimensions
    const width = data.ExifImageWidth ?? data.ImageWidth;
    const height = data.ExifImageHeight ?? data.ImageHeight;
    if (typeof width === "number") exif.width = width;
    if (typeof height === "number") exif.height = height;
    if (typeof data.Orientation === "number") exif.orientation = data.Orientation;
    if (data.ColorSpace) exif.colorSpace = String(data.ColorSpace);
    if (typeof data.XResolution === "number") exif.dpiX = data.XResolution;
    if (typeof data.YResolution === "number") exif.dpiY = data.YResolution;

    // Camera settings
    if (typeof data.FocalLength === "number") exif.focalLength = data.FocalLength;
    if (typeof data.FNumber === "number") exif.aperture = data.FNumber;
    if (data.ExposureTime != null) {
      const et = data.ExposureTime;
      exif.exposureTime = typeof et === "number" ? (et < 1 ? `1/${Math.round(1 / et)}` : String(et)) : String(et);
    }
    if (typeof data.ISO === "number") exif.iso = data.ISO;
    if (data.Flash != null) exif.flash = Boolean(data.Flash);

    exif.raw = data as Record<string, unknown>;
    return exif;
  } catch {
    // Extraction failed — not fatal, EXIF is optional
    return {};
  }
}

/**
 * Extract EXIF and persist a MediaAsset record.
 * Fire-and-forget: call without await from upload handlers.
 */
export function extractAndSaveMediaAsset(input: ExifExtractionInput): void {
  setImmediate(async () => {
    try {
      const exif = await extractExif(input.buffer);

      await prisma.mediaAsset.create({
        data: {
          workspaceId: input.workspaceId,
          inspectionId: input.inspectionId,
          evidenceId: input.evidenceId ?? null,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          storagePath: input.storagePath,
          latitude: exif.latitude ?? null,
          longitude: exif.longitude ?? null,
          altitude: exif.altitude ?? null,
          capturedAt: exif.capturedAt ?? null,
          timezone: exif.timezone ?? null,
          deviceMake: exif.deviceMake ?? null,
          deviceModel: exif.deviceModel ?? null,
          software: exif.software ?? null,
          lensModel: exif.lensModel ?? null,
          width: exif.width ?? null,
          height: exif.height ?? null,
          orientation: exif.orientation ?? null,
          colorSpace: exif.colorSpace ?? null,
          dpiX: exif.dpiX ?? null,
          dpiY: exif.dpiY ?? null,
          focalLength: exif.focalLength ?? null,
          aperture: exif.aperture ?? null,
          exposureTime: exif.exposureTime ?? null,
          iso: exif.iso ?? null,
          flash: exif.flash ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawExifData: exif.raw ? (exif.raw as any) : undefined,
        },
      });
    } catch (err) {
      // Intentionally swallowed — EXIF logging must never fail uploads
      console.error("[extractAndSaveMediaAsset] Failed to save MediaAsset:", err);
    }
  });
}
