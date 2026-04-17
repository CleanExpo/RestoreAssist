/**
 * Weather auto-tagging helper for RestoreAssist inspections.
 *
 * Fetches a BOM/NIWA weather snapshot for the inspection's property location
 * and inspection date. Consumers (report generator, AI classifier) call this
 * on demand to enrich water-damage classification with meteorological context.
 *
 * TODO: RA-XXXX follow-up: add `weatherSnapshot Json?` column to Inspection
 * schema for persistence, so the snapshot is stored at inspection creation
 * time rather than re-fetched on every read.
 */

import { prisma } from "@/lib/prisma";
import { fetchWeatherSnapshot, WeatherSnapshot } from "./weather-provider";

/**
 * Returns a WeatherSnapshot for the given inspection.
 *
 * Uses the inspection's `propertyPostcode` and `inspectionDate` from the DB.
 * Country defaults to "AU" (RestoreAssist is an Australian compliance platform).
 * NZ heuristic: postcodes matching /^0\d{3}$/ are treated as NZ.
 *
 * Returns { source: "UNAVAILABLE" } if:
 * - Inspection not found
 * - propertyPostcode is missing
 * - BOM/NIWA is unreachable or the postcode is unmapped
 */
export async function getWeatherContextForInspection(
  inspectionId: string,
): Promise<WeatherSnapshot> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      propertyPostcode: true,
      inspectionDate: true,
      report: {
        select: {
          propertyAddress: true,
        },
      },
    },
  });

  if (!inspection) {
    console.warn(`[weather] Inspection ${inspectionId} not found`);
    return { source: "UNAVAILABLE" };
  }

  const postcode = inspection.propertyPostcode;
  const lossDate = inspection.inspectionDate;

  if (!postcode) {
    console.warn(`[weather] No postcode for inspection ${inspectionId}`);
    return { source: "UNAVAILABLE" };
  }

  // RestoreAssist is an AU platform. NZ postcode heuristic: 4-digit codes
  // starting with 0 (e.g. 0110 Whangarei) never appear in AU ranges (2xxx–8xxx).
  const country: "AU" | "NZ" = /^0\d{3}$/.test(postcode.trim()) ? "NZ" : "AU";

  return fetchWeatherSnapshot({ country, postcode, date: lossDate });
}
