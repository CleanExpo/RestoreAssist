/**
 * Shared types + pure helpers for the standards-retrieval subsystem.
 *
 * Extracted from lib/standards-retrieval.ts to break the import cycle between
 * the composer (lib/standards-retrieval.ts) and the per-call service modules
 * under lib/services/ai/standards/**.
 */

export interface StandardsContext {
  documents: Array<{
    name: string;
    fileId: string;
    relevantSections: string[];
    standardType: string; // e.g., 'S500', 'S520', 'S400'
    extractedContent?: string;
  }>;
  summary: string;
}

export interface RetrievalQuery {
  reportType: "water" | "mould" | "fire" | "commercial" | "general";
  waterCategory?: "1" | "2" | "3";
  materials?: string[];
  affectedAreas?: string[];
  keywords?: string[];
  technicianNotes?: string;
}

/**
 * Determine which standards are relevant based on report context.
 * Pure function — used by both the composer's file scoring and the per-doc
 * AI section extractor.
 */
export function determineRelevantStandards(query: RetrievalQuery): string[] {
  const standards: string[] = [];

  // Always include S500 for water damage
  if (query.reportType === "water") {
    standards.push("S500");
    standards.push("ANSI/IICRC S500");
    standards.push("IICRC S500");
    standards.push("Water Damage Restoration");
  }

  // Include S520 for mould
  if (query.reportType === "mould") {
    standards.push("S520");
    standards.push("ANSI/IICRC S520");
    standards.push("IICRC S520");
    standards.push("Mould Remediation");
    standards.push("Mold Remediation");
  }

  // Include S400 for commercial
  if (query.reportType === "commercial") {
    standards.push("S400");
    standards.push("IICRC S400");
    standards.push("Commercial");
  }

  // Always include general Australian standards
  standards.push("AS/NZS 3000"); // Electrical
  standards.push("AS 1668"); // HVAC
  standards.push("AS/NZS 3666"); // Air systems
  standards.push("NCC"); // National Construction Code
  standards.push("WHS"); // Work Health and Safety
  standards.push("OH&S"); // Occupational Health and Safety

  return standards;
}
