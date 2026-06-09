/**
 * AU property enrichment provider seam (spec §7, EPIC C).
 *
 * A single canonical shape and interface so capture sources are swappable: the
 * RIA demo runs on the existing Apify/OnTheHouse scraper (see
 * `providers/onthehouse.ts`); the official Domain API can implement the same
 * `PropertyEnrichmentProvider` later without touching callers (spec: "metadata
 * over images, always").
 */

import type { ScrapedPropertyData } from "../property-data-parser";

export interface PropertyQuery {
  address: string;
  country?: "AU" | "NZ";
}

export interface PropertyEnrichment {
  address: string;
  beds: number | null;
  baths: number | null;
  carSpaces: number | null;
  landSizeM2: number | null;
  floorAreaM2: number | null;
  propertyType: string | null;
  floorPlanImages: string[];
  /** Provider id that produced this record. */
  source: string;
  confidence: "high" | "medium" | "low";
  retrievedAt: string;
}

export interface PropertyEnrichmentProvider {
  readonly id: string;
  lookup(query: PropertyQuery): Promise<PropertyEnrichment | null>;
}

const nn = (v: number | undefined | null): number | null =>
  v === undefined || v === null || Number.isNaN(v) ? null : v;

/** Map the scraper's raw output onto the canonical enrichment shape. */
export function normalizeScrapedProperty(
  raw: ScrapedPropertyData,
  source: string,
): PropertyEnrichment {
  return {
    address: raw.address,
    beds: nn(raw.bedrooms),
    baths: nn(raw.bathrooms),
    carSpaces: nn(raw.carSpaces),
    landSizeM2: nn(raw.landSizeM2),
    floorAreaM2: nn(raw.floorAreaM2),
    propertyType: raw.propertyType ?? null,
    floorPlanImages: raw.floorPlanImages ?? [],
    source,
    confidence: raw.confidence,
    retrievedAt: new Date().toISOString(),
  };
}
