/**
 * OnTheHouse property enrichment provider (spec §6.4, §7).
 *
 * Wraps the existing `parseOnTheHouseHTML` scraper behind the
 * `PropertyEnrichmentProvider` interface. HTML fetching is injected so the
 * provider is unit-testable with fixtures and, in production, backed by the
 * client's own Apify run (BYOK) — keeping scraping compute off Unite-Group.
 */

import { parseOnTheHouseHTML } from "../../property-data-parser";
import {
  normalizeScrapedProperty,
  type PropertyEnrichment,
  type PropertyEnrichmentProvider,
  type PropertyQuery,
} from "../provider";

/** Resolves a query to raw page HTML (Apify run in prod; fixture in tests). */
export type HtmlFetcher = (
  query: PropertyQuery,
) => Promise<{ html: string; url: string } | null>;

export class OnTheHouseProvider implements PropertyEnrichmentProvider {
  readonly id = "apify-onthehouse";

  constructor(private readonly fetchHtml: HtmlFetcher) {}

  async lookup(query: PropertyQuery): Promise<PropertyEnrichment | null> {
    const res = await this.fetchHtml(query);
    if (!res) return null;
    const scraped = parseOnTheHouseHTML(res.html, res.url);
    return normalizeScrapedProperty(scraped, this.id);
  }
}
